/* System Design Flashcards — main application logic */

const SERVER_BASE = 'http://localhost:3456';

const APP = {
  profile: null,
  currentCard: null,
  sessionCards: [],
  sessionIndex: 0,
  sessionStart: null,
  _cardCache: {},
  _nextCard: null,
  _isGenerating: false,

  init() {
    this.loadProfile();
    this.renderDeckStats();
    this.showScreen('welcome');
    this._setupKeyboard();
    this._checkServerHealth();
  },

  async _checkServerHealth() {
    const el = document.getElementById('server-status');
    if (!el) return;
    try {
      const res = await fetch(`${SERVER_BASE}/api/cache-stats`);
      if (res.ok) {
        const stats = await res.json();
        el.innerHTML = `🟢 Server online (${stats.total} cached cards)`;
        el.style.color = '#43a047';
      } else throw new Error();
    } catch {
      el.innerHTML = '🔴 Server offline — using seed cards';
      el.style.color = '#e53935';
    }
  },

  /* ——— AI Card Generation (with localStorage cache & seed fallback) ——— */

  _cacheKey(topic, difficulty) { return `${topic}:${difficulty}`; },

  _scenarioFingerprint(scenario) {
    return scenario.replace(/\s+/g, ' ').substring(0, 60).toLowerCase();
  },

  _isDuplicateScenario(scenario, excludeList) {
    const fp = this._scenarioFingerprint(scenario);
    for (const card of excludeList) {
      if (this._scenarioFingerprint(card.scenario) === fp) return true;
    }
    return false;
  },

  _loadCachedKeys() {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k.startsWith('sdf_gen_')) {
        try { keys.push(JSON.parse(localStorage.getItem(k))); } catch (_) {}
      }
    }
    return keys;
  },

  async fetchCard(topic, difficulty, avoidList = []) {
    const key = this._cacheKey(topic, difficulty);
    const allCached = [...this._loadCachedKeys(), ...Object.values(this._cardCache)];

    // try server, checking diversity against avoidList + cached cards
    for (let attempt = 0; attempt < 5; attempt++) {
      // check localStorage cache first
      const stored = localStorage.getItem('sdf_gen_' + key);
      if (stored) {
        try {
          const card = JSON.parse(stored);
          const dup = this._isDuplicateScenario(card.scenario, [...avoidList, ...allCached, ...this.sessionCards]);
          if (!dup) return card;
        } catch (_) {}
      }
      // check in-memory cache
      if (this._cardCache[key]) {
        const dup = this._isDuplicateScenario(this._cardCache[key].scenario, [...avoidList, ...allCached, ...this.sessionCards]);
        if (!dup) return this._cardCache[key];
      }
      // try server
      try {
        const res = await fetch(`${SERVER_BASE}/api/generate?topic=${encodeURIComponent(topic)}&difficulty=${difficulty}`);
        if (!res.ok) throw new Error(`server returned ${res.status}`);
        const data = await res.json();
        const dup = this._isDuplicateScenario(data.card.scenario, [...avoidList, ...allCached, ...this.sessionCards]);
        if (!dup) {
          this._cardCache[key] = data.card;
          localStorage.setItem('sdf_gen_' + key, JSON.stringify(data.card));
          return data.card;
        }
      } catch (err) {
        // server unavailable — continue to fallback
      }
    }

    // seed fallback
    const topicCards = SEED_CARDS.filter(c => c.topic === topic);
    if (topicCards.length > 0) return topicCards[Math.floor(Math.random() * topicCards.length)];
    return SEED_CARDS[Math.floor(Math.random() * SEED_CARDS.length)];
  },

  async prefetchNext() {
    if (this._isGenerating) return;
    this._isGenerating = true;
    try {
      const topics = [...new Set(SEED_CARDS.map(c => c.topic))];
      const scored = topics.map(t => ({
        topic: t,
        score: this._difficultyWeight({ topic: t, difficulty: 3 }) + Math.random() * 0.1
      }));
      scored.sort((a, b) => b.score - a.score);
      const nextTopic = scored[0].topic;
      const avoidList = this.sessionCards.filter(c => c && c.id !== this.currentCard?.id);
      this._nextCard = await this.fetchCard(nextTopic, 3, avoidList);
    } finally {
      this._isGenerating = false;
    }
  },

  /* ——— Profile persistence ——— */

  loadProfile() {
    const raw = localStorage.getItem('sdf_profile');
    if (raw) {
      this.profile = JSON.parse(raw);
    } else {
      this.profile = {
        userId: 'local-' + Date.now().toString(36),
        topicScores: {},
        cardHistory: {},
        streaks: { current: 0, best: 0, lastDate: null },
        totalSessions: 0,
        totalAnswered: 0,
        totalCorrect: 0
      };
      this.saveProfile();
    }
  },

  saveProfile() {
    localStorage.setItem('sdf_profile', JSON.stringify(this.profile));
  },

  /* ——— Topic scores ——— */

  getTopicScore(topic) {
    return this.profile.topicScores[topic]?.raw ?? 0.5;
  },

  isTopicMastered(topic) {
    const t = this.profile.topicScores[topic];
    if (!t) return false;
    if (t.raw < 0.7) return false;
    if (t.cardsReviewed < 3) return false;
    if (t.daysSpanned < 2) return false;
    return true;
  },

  updateTopicScore(topic, correct, weight = 1) {
    const old = this.getTopicScore(topic);
    const delta = (correct ? 1 : 0) - old;
    const raw = Math.max(0, Math.min(1, old + delta * 0.15 * weight));
    const t = this.profile.topicScores[topic] || { raw: 0.5, cardsReviewed: 0, daysSpanned: new Set() };
    t.raw = raw;
    if (!correct) t.raw = Math.max(0, t.raw - 0.08); // harder penalty for wrong answers
    this.profile.topicScores[topic] = t;
    this.saveProfile();
  },

  _recordTopicReview(topic, cardId, correct) {
    const t = this.profile.topicScores[topic] || { raw: 0.5, cardsReviewed: 0, daysSpanned: new Set() };
    const today = new Date().toISOString().split('T')[0];
    t.daysSpanned = t.daysSpanned || new Set();
    t.daysSpanned.add(today);
    // count unique cards within this topic (not total reviews)
    const seen = this.profile._topicCardSeen || {};
    if (!seen[topic]) seen[topic] = new Set();
    if (!seen[topic].has(cardId)) {
      seen[topic].add(cardId);
      t.cardsReviewed = seen[topic].size;
    }
    this.profile._topicCardSeen = seen;
    this.profile.topicScores[topic] = t;
    this.saveProfile();
  },

  /* ——— Card history ——— */

  getCardReview(id) {
    return this.profile.cardHistory[id] || SRS.freshReview();
  },

  saveCardReview(id, review) {
    this.profile.cardHistory[id] = review;
    this.saveProfile();
  },

  /* ——— Session management ——— */

  async startSession(count = 8) {
    this.sessionCards = await this._generateSessionCards(count);
    this.sessionIndex = 0;
    this.sessionStart = Date.now();
    this._nextCard = null;
    this.profile.totalSessions++;
    this.saveProfile();
    if (this.sessionCards.length === 0) {
      alert('No cards available! Check back later.');
      return;
    }
    // pre-generate the next card + pre-warm cache for other likely topics
    this.prefetchNext();
    this._warmCache();
    this.showCard();
    this.showScreen('session');
  },

  async _generateSessionCards(count) {
    const topics = [...new Set(SEED_CARDS.map(c => c.topic))];
    const scored = topics.map(t => {
      const mastery = this.getTopicScore(t);
      const targetDifficulty = Math.min(5, 1 + Math.round(mastery * 4)); // higher mastery → harder cards
      return { topic: t, difficulty: targetDifficulty, score: this._difficultyWeight({ topic: t, difficulty: targetDifficulty }) + Math.random() * 0.1 };
    });
    scored.sort((a, b) => b.score - a.score);

    const cards = [];
    let idx = 0;
    while (cards.length < count) {
      const t = scored[idx % scored.length];
      if (t) {
        const card = await this.fetchCard(t.topic, t.difficulty, cards);
        if (card) {
          // approximate dedup by checking first 40 chars of scenario
          const dup = cards.find(c => c.scenario.substring(0, 40) === card.scenario.substring(0, 40));
          if (!dup) cards.push(card);
        }
      }
      idx++;
      if (idx > count * 5) break;
    }
    return cards.slice(0, count);
  },

  _yesterday() {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().split('T')[0];
  },

  /* Desirable difficulty: weight cards by (1 - mastery) × challenge score */
  _difficultyWeight(card) {
    const mastery = this.getTopicScore(card.topic);
    const challenge = card.difficulty / 5;
    // adaptive difficulty: lower mastery → higher weight, but also prefer harder cards for strong topics
    return (1 - mastery) * (0.3 + challenge * 0.7);
  },

  /* Cache warming: pre-generate cards for likely next topics in background */
  async _warmCache() {
    const topics = [...new Set(SEED_CARDS.map(c => c.topic))];
    const scored = topics.map(t => ({
      topic: t,
      score: this._difficultyWeight({ topic: t, difficulty: 3 })
    }));
    scored.sort((a, b) => b.score - a.score);
    // pre-warm the top 3 likely topics
    for (const s of scored.slice(0, 3)) {
      const key = this._cacheKey(s.topic, 3);
      if (!localStorage.getItem('sdf_gen_' + key)) {
        this.fetchCard(s.topic, 3, this.sessionCards).catch(() => {});
      }
    }
  },

  showCard() {
    if (this.sessionIndex >= this.sessionCards.length) {
      this.endSession();
      return;
    }
    this.currentCard = this.sessionCards[this.sessionIndex];
    const card = this.currentCard;

    document.getElementById('card-counter').textContent =
      `${this.sessionIndex + 1} / ${this.sessionCards.length}`;

    const topicLabels = {
      caching: 'Caching', queues: 'Queues & Async', databases: 'Databases',
      consensus: 'Consensus', 'api-design': 'API Design', loadbalancing: 'Load Balancing',
      storage: 'Storage', observability: 'Observability', security: 'Security',
      'real-time': 'Real-Time'
    };
    document.getElementById('card-topic').textContent = topicLabels[card.topic] || card.topic;

    const diffStars = '★'.repeat(card.difficulty) + '☆'.repeat(5 - card.difficulty);
    document.getElementById('card-difficulty').textContent = diffStars;

    document.getElementById('scenario').textContent = card.scenario;

    // retrieval practice: hide diagram until answered (user can toggle to peek)
    if (!this._diagramPeeking) this._diagramPeeking = {};
    const canPeek = this._diagramPeeking[card.id] || false;
    document.getElementById('diagram-container').innerHTML = '<p style="text-align:center;color:#999;padding:40px 0;font-size:0.85rem">📐 Diagram hidden for retrieval practice<br>Answer first, then the diagram reveals<br><button class="btn btn-sm btn-outline" onclick="APP.peekDiagram()">Peek at Diagram</button></p>';
    if (canPeek) {
      this.peekDiagram();
    }

    // render options
    const optionsEl = document.getElementById('options');
    optionsEl.innerHTML = '';
    card.options.forEach((opt, idx) => {
      const btn = document.createElement('button');
      btn.className = 'option-btn';
      const keyNum = idx + 1;
      btn.innerHTML = `<span class="option-letter">${opt.id}<span style="display:block;font-size:0.55rem;opacity:0.5;">[${keyNum}]</span></span><span class="option-text">${opt.label}</span>`;
      btn.onclick = () => this.answer(opt.id, idx);
      optionsEl.appendChild(btn);
    });

    document.getElementById('feedback').classList.add('hidden');
    document.getElementById('next-btn').classList.add('hidden');
  },

  answer(selectedId, idx) {
    const card = this.currentCard;
    const correct = selectedId === card.correct;
    const startTime = this.sessionStart;
    const responseTime = Date.now() - (this._cardStartTime || Date.now());

    // update SRS
    const review = this.getCardReview(card.id);
    review.timesReviewed++;
    if (correct) review.timesCorrect++;
    review.lastResponseTime = responseTime;
    const grade = SRS.gradeCard(correct, responseTime);
    review.ease = SRS.nextEase(correct, review.ease);
    review.interval = SRS.nextInterval(correct, review.ease, review.interval);
    review.nextReviewAt = Date.now() + review.interval * 86400000;
    review.lastReviewAt = Date.now();
    if (!review._createdAt) review._createdAt = Date.now();
    this.saveCardReview(card.id, review);

    // update topic score + mastery tracking
    this.updateTopicScore(card.topic, correct, 1);
    this._recordTopicReview(card.topic, card.id, correct);

    // update global stats + streak
    this.profile.totalAnswered++;
    if (correct) this.profile.totalCorrect++;
    const today = new Date().toISOString().split('T')[0];
    if (this.profile.streaks.lastDate === today) {
      // already counted today
    } else if (this.profile.streaks.lastDate === this._yesterday()) {
      this.profile.streaks.current++;
      this.profile.streaks.lastDate = today;
    } else {
      this.profile.streaks.current = 1;
      this.profile.streaks.lastDate = today;
    }
    this.profile.streaks.best = Math.max(this.profile.streaks.best, this.profile.streaks.current);
    localStorage.setItem('sdf_last_study_date', today);
    // track consecutive correct for achievements
    if (correct) {
      this._consecutiveCorrect = (this._consecutiveCorrect || 0) + 1;
    } else {
      this._consecutiveCorrect = 0;
    }
    this._checkAchievements();
    this.saveProfile();

    // disable all option buttons
    document.querySelectorAll('.option-btn').forEach(b => b.disabled = true);

    // highlight correct answer
    document.querySelectorAll('.option-btn').forEach((btn, i) => {
      const opt = card.options[i];
      if (opt.id === card.correct) btn.classList.add('correct');
      else if (opt.id === selectedId && !correct) btn.classList.add('incorrect');
    });

    // show feedback with elaborative interrogation
    const feedbackEl = document.getElementById('feedback');
    feedbackEl.className = correct ? 'feedback correct' : 'feedback incorrect';
    feedbackEl.innerHTML = `<strong>${correct ? '✓ Correct!' : '✗ Incorrect'}</strong><br><br>${card.explanation}`;
    if (!correct) {
      feedbackEl.innerHTML += `<br><br><em>The correct answer was <strong>${card.correct}</strong>.</em>`;
    }

    // reset quality rating for new card
  document.getElementById('quality-rating').querySelectorAll('button').forEach(b => b.disabled = false);

  // elaborative interrogation: force reflection
    const whyWrong = card.options.map(o => {
      if (o.id === card.correct) return '';
      const flaws = {
        'A': ' fails because it cannot handle the dynamic, per-user nature of this request pattern.',
        'B': ' seems plausible but introduces unnecessary complexity or cost for this specific bottleneck.',
        'C': ' addresses the wrong layer — it solves a scaling problem that isn't the actual constraint.',
        'D': ' is an anti-pattern that creates more problems (coupling, latency, single points of failure) than it solves.'
      };
      return o.id !== card.correct ? `<br><br><em>Why not ${o.id}:</em> ${flaws[o.id] || ' this option creates trade-offs that conflict with the requirements.'}` : '';
    }).join('');

    // dual coding: diagram highlights correct path
    Render.diagram(card, 'diagram-container', correct);

    document.getElementById('next-btn').classList.remove('hidden');
    document.getElementById('regenerate-btn').classList.remove('hidden');
    document.getElementById('quality-rating').classList.remove('hidden');
    this.renderDeckStats();

    // reveal diagram
    Render.diagram(card, 'diagram-container', true);

    // start pre-generating the next card for zero-latency transitions
    this.prefetchNext();
  },

  async regenerateCard() {
    document.getElementById('regenerate-btn').disabled = true;
    document.getElementById('regenerate-btn').textContent = '⏳ Generating...';
    const avoidList = this.sessionCards.filter(c => c && c.id !== this.currentCard?.id);
    for (let attempt = 0; attempt < 5; attempt++) {
      const newCard = await this.fetchCard(this.currentCard.topic, this.currentCard.difficulty, [this.currentCard, ...avoidList]);
        // replace current card in session
        if (this.sessionIndex < this.sessionCards.length) {
          this.sessionCards[this.sessionIndex] = newCard;
        }
        this.currentCard = newCard;
        this.showCard();
        this._regenerated = true;
        break;
      }
    }
    document.getElementById('regenerate-btn').disabled = false;
    document.getElementById('regenerate-btn').textContent = '🔄 Regenerate';
  },

  _setupKeyboard() {
    document.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      const key = e.key;
      // 1-4 for option selection
      if (['1','2','3','4'].includes(key) && !document.getElementById('next-btn').classList.contains('hidden')) {
        const btns = document.querySelectorAll('.option-btn:not(:disabled)');
        const idx = parseInt(key) - 1;
        if (btns[idx]) btns[idx].click();
      }
      // N for next card
      if (key.toLowerCase() === 'n' && !document.getElementById('next-btn').classList.contains('hidden')) {
        this.nextCard();
      }
      // R for regenerate
      if (key.toLowerCase() === 'r' && !document.getElementById('regenerate-btn').classList.contains('hidden')) {
        this.regenerateCard();
      }
    });
  },

  rateCard(quality) {
    // quality: 'good' or 'bad' — adjusts topic score accordingly
    const card = this.currentCard;
    if (quality === 'good') {
      this.updateTopicScore(card.topic, true, 0.3);
    } else {
      this.updateTopicScore(card.topic, false, 0.3);
    }
    document.getElementById('quality-rating').querySelectorAll('button').forEach(b => b.disabled = true);
  },

  peekDiagram() {
    const card = this.currentCard;
    this._diagramPeeking[card.id] = true;
    Render.diagram(card, 'diagram-container', false);
  },

  nextCard() {
    this.sessionIndex++;
    this._cardStartTime = Date.now();

    // try to use the prefetched card for next session slot
    if (this._nextCard) {
      const nextIdx = this.sessionIndex;
      if (nextIdx < this.sessionCards.length) {
        this.sessionCards[nextIdx] = this._nextCard;
      } else {
        this.sessionCards.push(this._nextCard);
      }
      this._nextCard = null;
    }

    // immediately start prefetching the one after that
    this.prefetchNext();

    this.showCard();
  },

  endSession() {
    this.showScreen('session-end');
    const correct = this.profile.totalAnswered > 0
      ? Math.round(100 * this.profile.totalCorrect / this.profile.totalAnswered) : 0;
    document.getElementById('session-summary').innerHTML = `
      <p>Cards reviewed: <strong>${this.sessionCards.length}</strong></p>
      <p>Lifetime correct: <strong>${this.profile.totalCorrect} / ${this.profile.totalAnswered}</strong> (${correct}%)</p>
      <p>Topics covered: <strong>${new Set(this.sessionCards.map(c => c.topic)).size}</strong></p>
      <p>Current streak: <strong>${this.profile.streaks.current} days</strong> (best: ${this.profile.streaks.best})</p>
      <p>Average difficulty of session: <strong>${(this.sessionCards.reduce((s,c) => s + c.difficulty, 0) / this.sessionCards.length).toFixed(1)} / 5</strong> — ${this.sessionCards.length > 5 ? 'desirable difficulty in effect' : 'more data after a few sessions'}</p>
    `;
    this.renderDeckStats();
  },

  /* ——— Statistics Dashboard ——— */

  showStats() {
    this.renderStudyCalendar();
    this.renderMasteryChart();
    const total = SEED_CARDS.length;
    const mastered = Object.keys(this.profile.topicScores).filter(t => this.isTopicMastered(t)).length;
    const totalTopics = [...new Set(SEED_CARDS.map(c => c.topic))].length;
    document.getElementById('stats-global').innerHTML = `
      <strong>Overall Progress</strong><br>
      Cards: ${this.profile.totalAnswered} answered, ${Math.round(100 * this.profile.totalCorrect / Math.max(1, this.profile.totalAnswered))}% correct<br>
      Topics: ${mastered} / ${totalTopics} mastered (${Math.round(100 * mastered / totalTopics)}%)<br>
      Sessions: ${this.profile.totalSessions}<br>
      Best streak: ${this.profile.streaks.best} days
    `;
    this.showScreen('stats');
  },

  renderStudyCalendar() {
    const el = document.getElementById('study-calendar');
    el.innerHTML = '';
    const today = new Date();
    const dayMs = 86400000;
    // show last 49 days
    for (let i = 48; i >= 0; i--) {
      const d = new Date(today.getTime() - i * dayMs);
      const key = d.toISOString().split('T')[0];
      const day = d.getDate();
      const weekday = d.getDay();
      // only show weekdays-ish (Mon-Fri) to keep it compact
      const intensity = [...Array(250)].map((_, j) => {
        const check = new Date(today.getTime() - (i + j) * dayMs);
        const ck = check.toISOString().split('T')[0];
      });
      // simpler: count reviews on that day from card history
      let reviewsOnDay = 0;
      for (const cid of Object.keys(this.profile.cardHistory)) {
        const card = SEED_CARDS.find(c => c.id === cid);
        if (!card) continue;
        const review = this.profile.cardHistory[cid];
        // approximate: check when the review occurred (we only store the last review time as nextReviewAt)
        // use the nextReviewAt as a proxy for when it was done
        const reviewDate = new Date(review._createdAt || Date.now()).toISOString().split('T')[0];
        if (reviewDate === key) reviewsOnDay++;
      }
      // fallback: use session-based tracking
      const color = reviewsOnDay === 0 ? '#f0f0f0' :
        reviewsOnDay <= 1 ? '#c8e6c9' :
        reviewsOnDay <= 3 ? '#81c784' :
        reviewsOnDay <= 6 ? '#43a047' : '#1b5e20';
      const dot = document.createElement('div');
      dot.style.cssText = `width:14px;height:14px;border-radius:3px;background:${color};position:relative;`;
      dot.title = `${key}: ${reviewsOnDay} reviews`;
      el.appendChild(dot);
    }
  },

  renderMasteryChart() {
    const el = document.getElementById('mastery-chart');
    const topics = [...new Set(SEED_CARDS.map(c => c.topic))];
    const topicLabels = {
      caching: 'Caching', queues: 'Queues', databases: 'DB', consensus: 'Consensus',
      'api-design': 'API', loadbalancing: 'LB', storage: 'Storage',
      observability: 'Observe', security: 'Security', 'real-time': 'RT',
      'rate-limiting': 'Rate Lim', dns: 'DNS', 'messaging': 'Msg'
    };
    el.innerHTML = topics.map(t => {
      const score = this.getTopicScore(t);
      const pct = Math.round(score * 100);
      const mastered = this.isTopicMastered(t);
      const label = topicLabels[t] || t;
      return `<div class="topic-row"><span>${label}</span><div class="topic-bar"><div class="topic-fill${mastered ? ' mastered-fill' : ''}" style="width:${pct}%"></div></div><span class="topic-pct">${pct}%${mastered ? ' ✓' : ''}</span></div>`;
    }).join('');
  },

  /* ——— Card Authoring ——— */

  showCreateCard() {
    document.getElementById('create-result').innerHTML = '';
    this.showScreen('create');
  },

  saveCreatedCard() {
    const topic = document.getElementById('create-topic').value.trim().toLowerCase().replace(/\s+/g, '-');
    const difficulty = parseInt(document.getElementById('create-difficulty').value) || 2;
    const scenario = document.getElementById('create-scenario').value.trim();
    const nodes = document.getElementById('create-nodes').value.split(',').map(s => s.trim()).filter(Boolean);
    const options = [
      { id: 'A', label: document.getElementById('create-optionA').value.trim() },
      { id: 'B', label: document.getElementById('create-optionB').value.trim() },
      { id: 'C', label: document.getElementById('create-optionC').value.trim() }
    ];
    const optD = document.getElementById('create-optionD').value.trim();
    if (optD) options.push({ id: 'D', label: optD });
    const explanation = document.getElementById('create-explanation').value.trim();

    if (!topic || !scenario || nodes.length < 2 || !options[0].label || !options[1].label || !explanation) {
      document.getElementById('create-result').innerHTML = '<p style="color:#e53935">Please fill in all required fields (topic, scenario, nodes, options A, B, C, explanation).</p>';
      return;
    }

    const card = {
      id: 'custom-' + Date.now().toString(36),
      topic,
      difficulty: Math.max(1, Math.min(5, difficulty)),
      scenario,
      nodes,
      options,
      correct: 'B',
      explanation
    };

    // store custom cards in localStorage
    const stored = JSON.parse(localStorage.getItem('sdf_custom_cards') || '[]');
    stored.push(card);
    localStorage.setItem('sdf_custom_cards', JSON.stringify(stored));

    // merge into the working deck
    const allCards = [...stored.reverse(), ...SEED_CARDS];
    // rebuild SEED_CARDS reference — replace the const
    // (we use the SEED_CARDS variable in the app, so we need to push them)
    SEED_CARDS.unshift(card);

    document.getElementById('create-result').innerHTML = `<p style="color:#43a047">✓ Card added to deck! (${stored.length} custom card${stored.length > 1 ? 's' : ''})</p>`;
    document.getElementById('create-topic').value = '';
    document.getElementById('create-difficulty').value = '';
    document.getElementById('create-scenario').value = '';
    document.getElementById('create-nodes').value = '';
    document.getElementById('create-optionA').value = '';
    document.getElementById('create-optionB').value = '';
    document.getElementById('create-optionC').value = '';
    document.getElementById('create-optionD').value = '';
    document.getElementById('create-explanation').value = '';
    this.renderDeckStats();
  },

  /* ——— Achievements ——— */

  _achievementDefs: [
    { id: 'first-card', label: 'First Card', desc: 'Answer your first card', check: () => this.profile.totalAnswered >= 1 },
    { id: 'quick-learner', label: 'Quick Learner', desc: '3 correct in a row', check: () => (this._consecutiveCorrect || 0) >= 3 },
    { id: 'streak-7', label: 'Hot Streak', desc: '7-day study streak', check: () => this.profile.streaks.current >= 7 },
    { id: 'scholar', label: 'Scholar', desc: 'Master 1 topic', check: () => Object.keys(this.profile.topicScores).filter(t => this.isTopicMastered(t)).length >= 1 },
    { id: 'master', label: 'Master', desc: 'Master 3 topics', check: () => Object.keys(this.profile.topicScores).filter(t => this.isTopicMastered(t)).length >= 3 },
    { id: 'dedicated', label: 'Dedicated', desc: 'Answer 50 cards', check: () => this.profile.totalAnswered >= 50 },
    { id: 'architect', label: 'Architect', desc: 'Answer 100 cards', check: () => this.profile.totalAnswered >= 100 },
    { id: 'deck-explorer', label: 'Deck Explorer', desc: 'Review every card once', check: () => Object.keys(this.profile.cardHistory).length >= SEED_CARDS.length }
  ],

  _checkAchievements() {
    const earned = new Set(this.profile.achievements || []);
    const today = new Date().toISOString().split('T')[0];
    for (const def of this._achievementDefs) {
      if (!earned.has(def.id) && def.check()) {
        earned.add(def.id);
        console.log(`🏆 Achievement unlocked: ${def.label}`);
        // show inline toast
        const toast = document.getElementById('achievement-toast');
        if (toast) {
          toast.innerHTML = `🏆 ${def.label}: ${def.desc}`;
          toast.className = 'toast show';
          setTimeout(() => toast.className = 'toast', 4000);
        }
      }
    }
    this.profile.achievements = [...earned];
    this.saveProfile();
  },

  getAchievedCount() {
    return (this.profile.achievements || []).length;
  },

  /* ——— UI ——— */

  showScreen(id) {
    document.querySelectorAll('.screen').forEach(el => el.classList.add('hidden'));
    const el = document.getElementById('screen-' + id);
    if (el) el.classList.remove('hidden');
  },

  renderDeckStats() {
    const total = SEED_CARDS.length;
    const reviewed = Object.keys(this.profile.cardHistory).length;
    const due = SEED_CARDS.filter(c => {
      const r = this.getCardReview(c.id);
      return r.nextReviewAt <= Date.now();
    }).length;

    document.getElementById('stat-total').textContent = total;
    document.getElementById('stat-reviewed').textContent = reviewed;
    document.getElementById('stat-due').textContent = due;
    document.getElementById('stat-streak').textContent = this.profile.streaks.current;

    // achievements display
    const aEl = document.getElementById('achievement-list');
    if (aEl) {
      const earned = new Set(this.profile.achievements || []);
      aEl.innerHTML = this._achievementDefs.map(d => {
        const has = earned.has(d.id);
        return `<span style="display:inline-flex;align-items:center;gap:4px;padding:4px 10px;background:${has ? '#e8f5e9' : '#f5f5f5'};border-radius:20px;font-size:0.75rem;border:1px solid ${has ? '#81c784' : '#e0e0e0'};color:${has ? '#2e7d32' : '#bbb'}">${has ? '✓' : '○'} ${d.label}</span>`;
      }).join('');
    }

    // topic breakdown
    const topics = [...new Set(SEED_CARDS.map(c => c.topic))];
    const topicEl = document.getElementById('topic-breakdown');
    if (topicEl) {
      topicEl.innerHTML = topics.map(t => {
        const score = this.getTopicScore(t);
        const pct = Math.round(score * 100);
        const topicLabels = {
          caching: 'Caching', queues: 'Queues & Async', databases: 'Databases',
          consensus: 'Consensus', 'api-design': 'API Design', loadbalancing: 'Load Balancing',
          storage: 'Storage', observability: 'Observability', security: 'Security',
          'real-time': 'Real-Time'
        };
        const mastered = this.isTopicMastered(t) ? '★' : '';
      return `<div class="topic-row"><span>${topicLabels[t] || t} ${mastered}</span><div class="topic-bar"><div class="topic-fill" style="width:${pct}%"></div></div><span class="topic-pct">${pct}%${mastered ? ' ✓' : ''}</span></div>`;
      }).join('');
    }
  }
};

// Boot
document.addEventListener('DOMContentLoaded', () => APP.init());
