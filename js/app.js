/* System Design Flashcards — main application logic */

const SERVER_BASE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? 'http://localhost:3456' : '';

function normalizeProfileData(profile) {
  const normalized = profile && typeof profile === 'object' ? profile : {};
  normalized.topicScores = normalized.topicScores && typeof normalized.topicScores === 'object'
    ? normalized.topicScores : {};
  normalized.cardHistory = normalized.cardHistory && typeof normalized.cardHistory === 'object'
    ? normalized.cardHistory : {};
  normalized.streaks = normalized.streaks && typeof normalized.streaks === 'object'
    ? normalized.streaks : { current: 0, best: 0, lastDate: null };
  normalized.streaks.current = Number.isFinite(normalized.streaks.current)
    ? normalized.streaks.current : 0;
  normalized.streaks.best = Number.isFinite(normalized.streaks.best)
    ? normalized.streaks.best : 0;
  normalized.streaks.lastDate = normalized.streaks.lastDate || null;
  normalized.totalSessions = Number.isFinite(normalized.totalSessions)
    ? normalized.totalSessions : 0;
  normalized.totalAnswered = Number.isFinite(normalized.totalAnswered)
    ? normalized.totalAnswered : 0;
  normalized.totalCorrect = Number.isFinite(normalized.totalCorrect)
    ? normalized.totalCorrect : 0;
  normalized._topicCardSeen = normalized._topicCardSeen && typeof normalized._topicCardSeen === 'object'
    ? normalized._topicCardSeen : {};
  normalized.seenScenarioFingerprints = Array.isArray(normalized.seenScenarioFingerprints)
    ? [...new Set(normalized.seenScenarioFingerprints.filter(value => typeof value === 'string' && value))]
    : [];

  for (const score of Object.values(normalized.topicScores)) {
    score.daysSpanned = Array.isArray(score.daysSpanned) ? [...new Set(score.daysSpanned)] : [];
  }
  for (const [topic, cardIds] of Object.entries(normalized._topicCardSeen)) {
    normalized._topicCardSeen[topic] = Array.isArray(cardIds) ? [...new Set(cardIds)] : [];
  }
  for (const record of Object.values(normalized.cardHistory)) {
    if (!record || typeof record !== 'object') continue;
    if (!record.card || typeof record.card !== 'object') continue;
    record.card.options = Array.isArray(record.card.options) ? record.card.options : [];
    record.card.prerequisiteTopics = Array.isArray(record.card.prerequisiteTopics)
      ? record.card.prerequisiteTopics : [];
    if (record.card.nodes !== undefined && !Array.isArray(record.card.nodes)) {
      record.card.nodes = [];
    }
  }
  return normalized;
}

function shuffledOptions(options, rng = Math.random) {
  const shuffled = [...options];
  for (let index = shuffled.length - 1; index > 0; index--) {
    const randomValue = Number(rng());
    const boundedValue = Number.isFinite(randomValue)
      ? Math.min(Math.max(randomValue, 0), 1 - Number.EPSILON)
      : 0;
    const swapIndex = Math.floor(boundedValue * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

const APP = {
  profile: null,
  currentCard: null,
  sessionCards: [],
  sessionIndex: 0,
  sessionStart: null,
  _cardCache: {},
  _nextCard: null,
  _isGenerating: false,
  _optionRng: Math.random,
  _displayedOptions: [],

  init() {
    this.loadProfile();
    this._loadCustomCards();
    this.renderPrerequisiteOptions();
    this.renderDeckStats();
    this.showScreen('welcome');
    this._setupKeyboard();
    this._setupConfidenceButtons();
    this._setupSessionControls();
    this._checkServerHealth();
    this._initTheme();
    this._initSwipe();
    this._requestNotificationPermission();
    // auto-resume prompt: show button if session was interrupted
    if (localStorage.getItem('sdf_resume')) {
      const btn = document.getElementById('resume-btn');
      if (btn) btn.classList.remove('hidden');
    }
  },

  _initTheme() {
    const saved = localStorage.getItem('sdf_theme');
    if (saved === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
      document.getElementById('theme-toggle').textContent = '☀️';
    }
  },

  toggleTheme() {
    const el = document.documentElement;
    const isDark = el.getAttribute('data-theme') === 'dark';
    if (isDark) {
      el.removeAttribute('data-theme');
      localStorage.setItem('sdf_theme', 'light');
      document.getElementById('theme-toggle').textContent = '🌙';
    } else {
      el.setAttribute('data-theme', 'dark');
      localStorage.setItem('sdf_theme', 'dark');
      document.getElementById('theme-toggle').textContent = '☀️';
    }
  },

  _initSwipe() {
    let xStart = 0;
    document.addEventListener('touchstart', (e) => { xStart = e.touches[0].clientX; });
    document.addEventListener('touchend', (e) => {
      const dx = e.changedTouches[0].clientX - xStart;
      if (dx < -80 && !document.getElementById('next-btn').classList.contains('hidden')) this.nextCard();
    });
  },

  _setupConfidenceButtons() {
    document.querySelectorAll('[data-confidence]').forEach(button => {
      button.addEventListener('click', () => {
        this.rateConfidence(Number(button.dataset.confidence));
      });
    });
  },

  _setupSessionControls() {
    document.getElementById('session-dashboard-btn')
      ?.addEventListener('click', () => this.exitSession());
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
    return typeof scenario === 'string'
      ? scenario.replace(/\s+/g, ' ').substring(0, 60).toLowerCase()
      : '';
  },

  _isDuplicateScenario(scenario, excludeList) {
    const fp = this._scenarioFingerprint(scenario);
    if (!fp) return true;
    for (const card of excludeList) {
      if (this._scenarioFingerprint(card?.scenario) === fp) return true;
    }
    return false;
  },

  _normalizeCardPool(value) {
    const candidates = Array.isArray(value?.cards) ? value.cards : [value];
    const byFingerprint = new Map();
    for (const candidate of candidates) {
      if (!candidate || typeof candidate !== 'object') continue;
      const fingerprint = this._scenarioFingerprint(candidate.scenario);
      if (!fingerprint) continue;
      byFingerprint.delete(fingerprint);
      byFingerprint.set(fingerprint, normalizeCardPrerequisites(candidate));
    }
    return { cards: [...byFingerprint.values()].slice(-20) };
  },

  _readCardPool(key) {
    const storageKey = 'sdf_gen_' + key;
    const stored = localStorage.getItem(storageKey);
    if (!stored) return { cards: [] };
    try {
      const pool = this._normalizeCardPool(JSON.parse(stored));
      localStorage.setItem(storageKey, JSON.stringify(pool));
      return pool;
    } catch (_) {
      localStorage.removeItem(storageKey);
      return { cards: [] };
    }
  },

  _writeCardPool(key, cards) {
    const pool = this._normalizeCardPool({ cards });
    this._cardCache[key] = pool;
    localStorage.setItem('sdf_gen_' + key, JSON.stringify(pool));
    return pool;
  },

  _excludedScenarioFingerprints(avoidList = []) {
    const fingerprints = new Set(this.profile?.seenScenarioFingerprints || []);
    for (const card of [...avoidList, ...this.sessionCards]) {
      const fingerprint = this._scenarioFingerprint(card?.scenario);
      if (fingerprint) fingerprints.add(fingerprint);
    }
    return [...fingerprints].slice(-100);
  },

  _recordDisplayedScenario(card) {
    const fingerprint = this._scenarioFingerprint(card?.scenario);
    if (!fingerprint || !this.profile) return;
    if (!Array.isArray(this.profile.seenScenarioFingerprints)) {
      this.profile.seenScenarioFingerprints = [];
    }
    if (this.profile.seenScenarioFingerprints.includes(fingerprint)) return;
    this.profile.seenScenarioFingerprints.push(fingerprint);
    this.saveProfile();
  },

  _loadCachedKeys() {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k.startsWith('sdf_gen_')) {
        keys.push(...this._readCardPool(k.substring('sdf_gen_'.length)).cards);
      }
    }
    return keys;
  },

  async fetchCard(topic, difficulty, avoidList = []) {
    const key = this._cacheKey(topic, difficulty);
    const excludedFingerprints = new Set(this._excludedScenarioFingerprints(avoidList));
    const localPool = this._readCardPool(key);
    const memoryPool = this._normalizeCardPool(this._cardCache[key] || { cards: [] });
    const available = this._normalizeCardPool({ cards: [...localPool.cards, ...memoryPool.cards] });
    const unseen = available.cards.find(card => !excludedFingerprints.has(this._scenarioFingerprint(card.scenario)));
    if (unseen) {
      this._writeCardPool(key, available.cards);
      return unseen;
    }

    try {
      const params = new URLSearchParams({ topic, difficulty: String(difficulty) });
      for (const fingerprint of excludedFingerprints) params.append('exclude', fingerprint);
      const res = await fetch(`${SERVER_BASE}/api/generate?${params}`);
      if (!res.ok) throw new Error(`server returned ${res.status}`);
      const data = await res.json();
      const card = normalizeCardPrerequisites(data?.card);
      const fingerprint = this._scenarioFingerprint(card?.scenario);
      if (!card || !fingerprint || excludedFingerprints.has(fingerprint)) {
        throw new Error('server returned an invalid or excluded card');
      }
      this._writeCardPool(key, [...available.cards, card]);
      return card;
    } catch (err) {
      // server unavailable — continue to the existing offline fallback
    }

    // seed fallback: only a topic-matched, unseen seed card may substitute so
    // offline sessions never pad a slot with cross-topic content.
    const topicCards = SEED_CARDS.filter(c =>
      c.topic === topic && !excludedFingerprints.has(this._scenarioFingerprint(c.scenario))
    );
    if (topicCards.length > 0) {
      return normalizeCardPrerequisites(topicCards[Math.floor(Math.random() * topicCards.length)]);
    }
    return null;
  },

  async prefetchNext() {
    if (this._isGenerating) return;
    this._isGenerating = true;
    try {
      const scored = this._rankedSessionTopics();
      const nextTopic = scored[0].topic;
      const avoidList = this.sessionCards.filter(c => c && c.id !== this.currentCard?.id);
      this._nextCard = await this.fetchCard(nextTopic, 3, avoidList);
    } catch (error) {
      this._nextCard = null;
    } finally {
      this._isGenerating = false;
    }
  },

  /* ——— Multi-profile ——— */

  switchProfile(profileId) {
    this.profile.userId = profileId;
    this.loadProfile();
    this.renderDeckStats();
  },

  /* ——— Study Goals ——— */

  setGoal(count) {
    const n = parseInt(count) || 10;
    localStorage.setItem('sdf_goal', n);
    this.renderGoal();
  },

  getGoal() { return parseInt(localStorage.getItem('sdf_goal')) || 10; },

  renderGoal() {
    const el = document.getElementById('goal-fill');
    const target = document.getElementById('goal-target');
    if (!el || !target) return;
    const goal = this.getGoal();
    target.value = goal;
    const done = Math.min(goal, this.profile.totalAnswered);
    const pct = Math.round(100 * done / goal);
    el.style.width = pct + '%';
  },

  /* —── Quick Review ——— */

  async startQuickReview() {
    const { cards, requested } = await this._generateSessionCards(15);
    if (cards.length === 0) return alert('No cards available!');
    if (cards.length < requested && !this._confirmShortSession(requested, cards.length)) return;
    this.sessionCards = cards;
    this.sessionIndex = 0;
    this._quickReview = true;
    this._quickTimer = 120; // 2 minutes
    this.profile.totalSessions++;
    this._startTimer();
    this.prefetchNext();
    this.showCard();
    this.showScreen('session');
    this._tickQuickTimer();
  },

  _tickQuickTimer() {
    if (!this._quickReview) return;
    const el = document.getElementById('session-timer');
    if (el) el.textContent = `⏱ ${this._quickTimer}s`;
    if (this._quickTimer <= 0) { this.endSession(); return; }
    this._quickTimer--;
    setTimeout(() => this._tickQuickTimer(), 1000);
  },

  /* ——— Profile persistence ——— */
  _loadCustomCards() {
    let cards = [];
    try { cards = JSON.parse(localStorage.getItem('sdf_custom_cards') || '[]'); } catch (_) {}
    for (const card of cards.reverse()) {
      normalizeCardPrerequisites(card);
      if (!SEED_CARDS.some(existing => existing.id === card.id)) SEED_CARDS.unshift(card);
    }
  },

  loadProfile() {
    const raw = localStorage.getItem('sdf_profile');
    if (raw) {
      try {
        this.profile = normalizeProfileData(JSON.parse(raw));
        this.saveProfile();
      } catch (_) {
        localStorage.removeItem('sdf_profile');
        this.profile = normalizeProfileData({});
      }
    } else {
      this.profile = normalizeProfileData({
        userId: localStorage.getItem('sdf_profile_id') || 'local-' + Date.now().toString(36),
        topicScores: {},
        cardHistory: {},
        streaks: { current: 0, best: 0, lastDate: null },
        totalSessions: 0,
        totalAnswered: 0,
        totalCorrect: 0
      });
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
    if ((t.daysSpanned || []).length < 2) return false;
    return true;
  },

  updateTopicScore(topic, correct, weight = 1) {
    const old = this.getTopicScore(topic);
    const delta = (correct ? 1 : 0) - old;
    const raw = Math.max(0, Math.min(1, old + delta * 0.15 * weight));
    const t = this.profile.topicScores[topic] || { raw: 0.5, cardsReviewed: 0, daysSpanned: [] };
    t.raw = raw;
    if (!correct) t.raw = Math.max(0, t.raw - 0.08); // harder penalty for wrong answers
    this.profile.topicScores[topic] = t;
    this.saveProfile();
  },

  _recordTopicReview(topic, cardId, correct) {
    const t = this.profile.topicScores[topic] || { raw: 0.5, cardsReviewed: 0, daysSpanned: [] };
    const today = new Date().toISOString().split('T')[0];
    t.daysSpanned = Array.isArray(t.daysSpanned) ? t.daysSpanned : [];
    if (!t.daysSpanned.includes(today)) t.daysSpanned.push(today);
    // count unique cards within this topic (not total reviews)
    const seen = this.profile._topicCardSeen || {};
    if (!Array.isArray(seen[topic])) seen[topic] = [];
    if (!seen[topic].includes(cardId)) {
      seen[topic].push(cardId);
      t.cardsReviewed = seen[topic].length;
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

  /* Minimal card content snapshot, persisted beside the SRS state so a reviewed
     generated card can be re-served later without re-fetching. Only fields the
     renderer needs; no transient or derived fields. */
  _cardSnapshot(card) {
    if (!card || typeof card !== 'object') return undefined;
    const snapshot = {
      scenario: card.scenario,
      topic: card.topic,
      difficulty: card.difficulty,
      prerequisiteTopics: Array.isArray(card.prerequisiteTopics)
        ? [...card.prerequisiteTopics] : [],
      options: (Array.isArray(card.options) ? card.options : []).map(option => ({
        id: option?.id,
        label: option?.label,
        prerequisiteTopics: Array.isArray(option?.prerequisiteTopics)
          ? [...option.prerequisiteTopics] : []
      })),
      correct: card.correct,
      explanation: card.explanation
    };
    if (Array.isArray(card.nodes)) snapshot.nodes = [...card.nodes];
    return snapshot;
  },

  /* ——— Session management ——— */

  async startSession(count = 8) {
    const startButton = document.getElementById('start-session-btn')
      || document.querySelector('button[onclick="APP.startSession()"]');
    startButton.disabled = true;
    startButton.textContent = 'Preparing session...';
    try {
      const { cards, requested } = await this._generateSessionCards(count);
      if (cards.length === 0) {
        alert('No cards available! Check back later.');
        return;
      }
      if (cards.length < requested && !this._confirmShortSession(requested, cards.length)) {
        return;
      }
      this.sessionCards = cards;
      this.sessionIndex = 0;
      this.sessionStart = Date.now();
      this._nextCard = null;
      this.profile.totalSessions++;
      this._startTimer();
      this.saveProfile();
      // pre-generate the next card + pre-warm cache for other likely topics
      this.prefetchNext();
      this._warmCache();
      this.showCard();
      this.showScreen('session');
    } finally {
      startButton.disabled = false;
      startButton.textContent = 'Start Session';
    }
  },

  async startTopicSession(topic) {
    if (!TOPIC_CATALOG[topic]) return;
    const candidates = await Promise.all(
      [1, 2, 3, 4, 5].map(difficulty => this.fetchCard(topic, difficulty))
    );
    this.sessionCards = candidates.filter((card, index) =>
      card && !this._isDuplicateScenario(card.scenario, candidates.slice(0, index))
    );
    if (this.sessionCards.length === 0) {
      alert('No cards available for this topic.');
      return;
    }
    this.sessionIndex = 0;
    this.sessionStart = Date.now();
    this._nextCard = null;
    this.profile.totalSessions++;
    this._startTimer();
    this.saveProfile();
    this.showCard();
    this.showScreen('session');
  },

  /* Full-catalog session planning: every topic at its mastery-derived target
     difficulty, ranked by adaptive weight with the existing random tie-break. */
  _rankedSessionTopics() {
    const topics = Object.keys(TOPIC_CATALOG || {});
    return topics.map(topic => {
      const mastery = this.getTopicScore(topic);
      const difficulty = Math.min(5, 1 + Math.round(mastery * 4));
      return {
        topic,
        difficulty,
        score: this._difficultyWeight({ topic, difficulty }) + Math.random() * 0.1
      };
    }).sort((a, b) => b.score - a.score);
  },

  /* Deterministic candidate plan: every catalog topic once at its target
     difficulty, then extra unique topic+difficulty pairs for the highest-ranked
     topics until the plan reaches `count`. */
  _buildSessionPlan(count) {
    const requested = Number.isFinite(count) ? Math.max(1, Math.floor(count)) : 8;
    const ranked = this._rankedSessionTopics();
    const plan = [];
    const used = new Set();
    const add = (topic, difficulty) => {
      const key = topic + ':' + difficulty;
      if (used.has(key)) return;
      used.add(key);
      plan.push({ topic, difficulty });
    };
    for (const item of ranked) {
      if (plan.length >= requested) break;
      add(item.topic, item.difficulty);
    }
    for (const item of ranked) {
      for (let difficulty = 1; difficulty <= 5; difficulty++) {
        if (plan.length >= requested) break;
        add(item.topic, difficulty);
      }
    }
    return plan;
  },

  async _generateSessionCards(count) {
    const requested = Number.isFinite(count) ? Math.max(1, Math.floor(count)) : 8;
    const plan = this._buildSessionPlan(requested);
    const session = [];
    // Bound refill attempts so an unavailable generator cannot loop forever.
    const maxAttempts = 3;
    const maxFetches = requested * 3;
    let attempts = 0;
    let fetches = 0;
    while (session.length < requested && attempts < maxAttempts && fetches < maxFetches) {
      attempts++;
      const batch = plan.slice(session.length);
      const results = await Promise.all(batch.map(async item => {
        let card = null;
        try {
          card = await this.fetchCard(item.topic, item.difficulty, session);
        } catch (error) {
          card = null;
        }
        return { card, item };
      }));
      fetches += batch.length;
      for (const { card, item } of results) {
        if (!card) continue;
        if (this._isDuplicateScenario(card.scenario, session)) continue;
        if (card.topic !== item.topic) continue;
        session.push(card);
      }
    }
    return { cards: session, requested };
  },

  /* Surface a real shortfall instead of silently starting an underfilled
     session; the user chooses to proceed smaller or cancel. */
  _confirmShortSession(requested, available) {
    const message = `Fresh card generation is currently unavailable, so this session can only reach ${available} of ${requested} requested cards. Start the ${available}-card session or cancel?`;
    return window.confirm(message);
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
    const scored = this._rankedSessionTopics();
    // pre-warm the top 3 likely topics
    for (const s of scored.slice(0, 3)) {
      const key = this._cacheKey(s.topic, 3);
      if (!localStorage.getItem('sdf_gen_' + key)) {
        this.fetchCard(s.topic, 3, this.sessionCards).catch(() => {});
      }
    }
  },

  showCard() {
    if (this._advanceTimer) {
      clearTimeout(this._advanceTimer);
      this._advanceTimer = null;
    }
    if (this.sessionIndex >= this.sessionCards.length) {
      this.endSession();
      return;
    }
    this.currentCard = this.sessionCards[this.sessionIndex];
    const card = this.currentCard;
    this._recordDisplayedScenario(card);
    this._confidenceSubmitted = false;

    document.getElementById('card-counter').textContent =
      `${this.sessionIndex + 1} / ${this.sessionCards.length}`;

    document.getElementById('card-topic').textContent =
      TOPIC_CATALOG[card.topic]?.label || card.topic;

    const diffStars = '★'.repeat(card.difficulty) + '☆'.repeat(5 - card.difficulty);
    document.getElementById('card-difficulty').textContent = diffStars;

    document.getElementById('scenario').textContent = card.scenario;
    const prerequisites = normalizeCardPrerequisites(card).prerequisiteTopics;
    const prerequisiteEl = document.getElementById('card-prerequisites');
    prerequisiteEl.textContent = prerequisites.length
      ? `Know first: ${prerequisites.map(formatPrerequisiteLabel).join(', ')}`
      : 'Foundational topic';

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
    this._displayedOptions = shuffledOptions(card.options, this._optionRng);
    this._displayedOptions.forEach((opt, idx) => {
      const btn = document.createElement('button');
      btn.className = 'option-btn';
      const keyNum = idx + 1;
      const optionPrerequisites = opt.prerequisiteTopics
        .map(formatPrerequisiteLabel)
        .join(', ');
      btn.innerHTML = `<span class="option-letter">${opt.id}<span style="display:block;font-size:0.55rem;opacity:0.5;">[${keyNum}]</span></span><span class="option-content"><span class="option-text">${opt.label}</span><span class="option-prerequisites">${optionPrerequisites ? `Know first: ${optionPrerequisites}` : 'No additional prerequisites'}</span></span>`;
      btn.setAttribute('role', 'radio');
      btn.setAttribute('aria-label', `Option ${opt.id}: ${opt.label}`);
      btn.onclick = () => this.answer(opt.id);
      optionsEl.appendChild(btn);
    });

    // update bookmark button
    const bm = document.getElementById('bookmark-btn');
    if (bm) bm.textContent = this.isBookmarked(card.id) ? '★' : '☆';

    this._saveSessionState();
    document.getElementById('feedback').classList.add('hidden');
    document.getElementById('post-answer-actions').classList.add('hidden');
    const confidenceButtons = document.getElementById('confidence-buttons');
    confidenceButtons.classList.add('hidden');
    confidenceButtons.querySelectorAll('button').forEach(button => {
      button.disabled = false;
    });
    document.getElementById('next-btn').classList.add('hidden');
    document.getElementById('regenerate-btn').classList.add('hidden');
    document.getElementById('quality-rating').classList.add('hidden');
  },

  answer(selectedId) {
    const card = this.currentCard;
    this._selectedId = selectedId;
    this._cardCorrect = selectedId === card.correct;

    // disable options and show correct/incorrect highlighting
    document.querySelectorAll('.option-btn').forEach(b => b.disabled = true);
    document.querySelectorAll('.option-btn').forEach((btn, i) => {
      const opt = this._displayedOptions[i];
      if (opt.id === card.correct) btn.classList.add('correct');
      else if (opt.id === selectedId && !this._cardCorrect) btn.classList.add('incorrect');
    });

    // show feedback with correct answer, then let user rate confidence
    const feedbackEl = document.getElementById('feedback');
    const isCorrect = this._cardCorrect;
    feedbackEl.className = isCorrect ? 'feedback correct' : 'feedback incorrect';
    feedbackEl.innerHTML = `<strong>${isCorrect ? '✓ Correct!' : '✗ The answer was ' + card.correct}</strong><br><br>${card.explanation}`;
    if (!isCorrect) {
      feedbackEl.innerHTML += `<br><br><em>The correct answer was <strong>${card.correct}</strong>.</em>`;
    }

    // show confidence buttons (hidden until user taps one)
    const actionsEl = document.getElementById('post-answer-actions');
    actionsEl.classList.remove('hidden');
    document.getElementById('confidence-buttons').classList.remove('hidden');
    document.getElementById('next-btn').classList.add('hidden'); // wait for confidence
    document.getElementById('regenerate-btn').classList.add('hidden');
    document.getElementById('quality-rating').classList.add('hidden');
    actionsEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  },

  rateConfidence(confidence) {
    if (this._confidenceSubmitted || !Number.isInteger(confidence) || confidence < 1 || confidence > 4) {
      return;
    }
    this._confidenceSubmitted = true;
    const card = this.currentCard;
    const correct = this._cardCorrect;
    const responseTime = Date.now() - (this._cardStartTime || Date.now());

    // Respond to the tap before storage or rendering work can fail.
    const confidenceButtons = document.getElementById('confidence-buttons');
    confidenceButtons.querySelectorAll('button').forEach(button => {
      button.disabled = true;
    });
    confidenceButtons.classList.add('hidden');
    const nextButton = document.getElementById('next-btn');
    nextButton.textContent = 'Next question...';
    nextButton.disabled = true;
    nextButton.classList.remove('hidden');
    this._advanceTimer = setTimeout(() => this.nextCard(), 3000);

    try {
    // update SRS with confidence-based grading
    const review = this.getCardReview(card.id);
    const grade = correct ? SRS.gradeCard(confidence) : 0;
    review.timesReviewed++;
    if (correct) review.timesCorrect++;
    review.lastConfidence = confidence;
    review.confidenceSum = (review.confidenceSum || 0) + (correct ? confidence : 0);
    review.lastResponseTime = responseTime;

    const newState = SRS.nextState(grade, review.stability, review.difficulty);
    review.stability = newState.stability;
    review.difficulty = newState.difficulty;
    review.interval = SRS.nextInterval(grade, review.stability, review.difficulty);
    review.nextReviewAt = Date.now() + review.interval * 86400000;
    review.card = this._cardSnapshot(card);
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
    // show consecutive correct streak
    const streakEl = document.getElementById('consecutive-correct');
    if (streakEl) streakEl.textContent = this._consecutiveCorrect > 1 ? `🔥×${this._consecutiveCorrect}` : '';

    // track consecutive correct for achievements
    if (correct) {
      this._consecutiveCorrect = (this._consecutiveCorrect || 0) + 1;
    } else {
      this._consecutiveCorrect = 0;
    }
    this._checkAchievements();
    this.saveProfile();
    } catch (error) {
      console.error('Unable to persist confidence feedback', error);
    }

    Render.diagram(card, 'diagram-container', true);
    this.renderDeckStats();
    this.prefetchNext();
  },

  async regenerateCard() {
    document.getElementById('regenerate-btn').disabled = true;
    document.getElementById('regenerate-btn').textContent = '⏳ Generating...';
    const avoidList = this.sessionCards.filter(c => c && c.id !== this.currentCard?.id);
    for (let attempt = 0; attempt < 5; attempt++) {
      const newCard = await this.fetchCard(this.currentCard.topic, this.currentCard.difficulty, [this.currentCard, ...avoidList]);
      if (!newCard) break;
      if (this.sessionIndex < this.sessionCards.length) {
        this.sessionCards[this.sessionIndex] = newCard;
      }
      this.currentCard = newCard;
      this.showCard();
      this._regenerated = true;
      break;
    }
    document.getElementById('regenerate-btn').disabled = false;
    document.getElementById('regenerate-btn').textContent = '🔄 Regenerate';
  },

  _setupKeyboard() {
    document.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      const key = e.key;
      // 1-4 for option selection
      const sessionVisible = !document.getElementById('screen-session').classList.contains('hidden');
      if (sessionVisible && ['1','2','3','4'].includes(key)) {
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
    if (this._advanceTimer) {
      clearTimeout(this._advanceTimer);
      this._advanceTimer = null;
    }
    const nextButton = document.getElementById('next-btn');
    nextButton.disabled = false;
    nextButton.innerHTML = 'Next Card <span class="keyboard-hint">[N]</span> →';
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

  exitSession() {
    if (this._advanceTimer) {
      clearTimeout(this._advanceTimer);
      this._advanceTimer = null;
    }
    this._quickReview = false;
    this._stopTimer();
    this.renderDeckStats();
    this.showScreen('welcome');
  },

  endSession() {
    this._quickReview = false;
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
    this.showSessionReview();
    this._stopTimer();
    this._saveSession(this.sessionCards.length, this.profile.totalCorrect);
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

    // topic coverage heatmap
    const heatEl = document.createElement('div');
    heatEl.innerHTML = '<h2>Coverage Heatmap</h2><div class="heatmap">';
    for (const t of topics) {
      const cardsInTopic = SEED_CARDS.filter(c => c.topic === t).length;
      const level = cardsInTopic <= 2 ? 'low' : cardsInTopic <= 4 ? 'med' : 'high';
      const colors = { low: '#ffcdd2', med: '#fff9c4', high: '#c8e6c9', mastered: '#a5d6a7' };
      const mastered = this.isTopicMastered(t);
      const color = mastered ? colors.mastered : colors[level];
      heatEl.innerHTML += `<div class="heatmap-cell" style="background:${color}" title="${t}: ${cardsInTopic} cards${mastered ? ' ✓mastered' : ''}">${t.substring(0, 3)}</div>`;
    }
    heatEl.innerHTML += '<div class="heatmap-label">Topic coverage by seed card count & mastery</div></div>';
    el.parentNode.insertBefore(heatEl, el.nextSibling);
  },

  /* ——— Card Authoring ——— */

  showCreateCard() {
    document.getElementById('create-result').innerHTML = '';
    this.showScreen('create');
  },

  renderPrerequisiteOptions() {
    const el = document.getElementById('create-prerequisites');
    if (!el) return;
    el.innerHTML = Object.entries(TOPIC_CATALOG).map(([topic, details]) =>
      `<label class="prerequisite-option"><input type="checkbox" value="${topic}"> <span>${details.label}</span></label>`
    ).join('');
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
    const prerequisiteTopics = [...document.querySelectorAll('#create-prerequisites input:checked')]
      .map(input => input.value)
      .filter(prerequisite => prerequisite !== topic);

    if (!topic || !scenario || nodes.length < 2 || !options[0].label || !options[1].label || !explanation) {
      document.getElementById('create-result').innerHTML = '<p style="color:#e53935">Please fill in all required fields (topic, scenario, nodes, options A, B, C, explanation).</p>';
      return;
    }

    const card = {
      id: 'custom-' + Date.now().toString(36),
      topic,
      difficulty: Math.max(1, Math.min(5, difficulty)),
      prerequisiteTopics,
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
    document.querySelectorAll('#create-prerequisites input').forEach(input => { input.checked = false; });
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

  /* ——— Notifications ——— */

  _requestNotificationPermission() {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  },

  sendNudge() {
    if ('Notification' in window && Notification.permission === 'granted') {
      const due = SEED_CARDS.filter(c => {
        const r = this.getCardReview(c.id);
        return r.nextReviewAt <= Date.now();
      }).length;
      if (due > 0) {
        new Notification('📚 System Design Flashcards', {
          body: `${due} card${due > 1 ? 's' : ''} due for review! A quick session?`,
          icon: '/icon-192.png'
        });
      }
    }
  },

  enableNudges() {
    if ('Notification' in window) {
      Notification.requestPermission();
    }
    localStorage.setItem('sdf_nudges', 'true');
    this.sendNudge();
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
    this.renderGoal();
    // show resume button if session state exists
    const resumeBtn = document.getElementById('resume-btn');
    if (resumeBtn) resumeBtn.classList.toggle('hidden', !localStorage.getItem('sdf_resume'));

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
  },

  /* ——— Session Timer ——— */

  _sessionTimer: false,

  _startTimer() {
    this._sessionStartMs = Date.now();
    this._sessionTimer = true;
    this._tickTimer();
  },

  _tickTimer() {
    if (!this._sessionTimer) return;
    const elapsed = Math.floor((Date.now() - this._sessionStartMs) / 1000);
    const m = Math.floor(elapsed / 60);
    const s = elapsed % 60;
    const el = document.getElementById('session-timer');
    if (el) el.textContent = `${m}:${s.toString().padStart(2, '0')}`;
    setTimeout(() => this._tickTimer(), 1000);
  },

  _stopTimer() { this._sessionTimer = false; },

  /* ——— Session History ——— */

  _saveSession(cardCount, correct) {
    const sessions = JSON.parse(localStorage.getItem('sdf_sessions') || '[]');
    sessions.unshift({ date: new Date().toISOString(), cards: cardCount, correct, topics: [...new Set(this.sessionCards.map(c => c.topic))] });
    if (sessions.length > 50) sessions.length = 50;
    localStorage.setItem('sdf_sessions', JSON.stringify(sessions));
  },

  showHistory() {
    const sessions = JSON.parse(localStorage.getItem('sdf_sessions') || '[]');
    const el = document.getElementById('history-list');
    if (sessions.length === 0) {
      el.innerHTML = '<p style="color:var(--muted)">No sessions yet.</p>';
    } else {
      el.innerHTML = sessions.map((s, i) => {
        const d = new Date(s.date);
        const pct = s.cards > 0 ? Math.round(100 * s.correct / s.cards) : 0;
        return `<div style="background:var(--card-bg);border-radius:8px;padding:10px 14px;margin:6px 0;box-shadow:0 1px 3px var(--stat-shadow);display:flex;justify-content:space-between;"><span>${d.toLocaleDateString()} ${d.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</span><span>${s.cards} cards · ${pct}% · ${s.topics.length} topics</span></div>`;
      }).join('');
    }
    this.showScreen('history');
  },

  exportSession() {
    const cards = this.sessionCards.length;
    const correct = this.profile.totalCorrect;
    const topics = [...new Set(this.sessionCards.map(c => c.topic))];
    const lines = [
      `System Design Flashcards — Session Results`,
      `Date: ${new Date().toLocaleString()}`,
      `Cards: ${cards}`,
      `Correct: ${correct} (${cards > 0 ? Math.round(100 * correct / cards) : 0}%)`,
      `Topics: ${topics.join(', ')}`,
      `Streak: ${this.profile.streaks.current} days`,
      ``,
      `Cards in this session:`,
      ...this.sessionCards.map(c => `  • ${c.topic}: ${c.scenario.substring(0, 60)}... [${c.correct}]`)
    ].join('\n');
    navigator.clipboard.writeText(lines).then(() => {
      const toast = document.getElementById('achievement-toast');
      if (toast) { toast.textContent = '📋 Results copied to clipboard!'; toast.className = 'toast show'; setTimeout(() => toast.className = 'toast', 3000); }
    }).catch(() => alert('Could not copy to clipboard.\n\n' + lines));
  },

  /* ——— Session Review ——— */

  showSessionReview() {
    const el = document.getElementById('session-summary');
    const correct = this.profile.totalCorrect;
    const total = this.profile.totalAnswered;
    const pct = total > 0 ? Math.round(100 * correct / total) : 0;
    let html = `<p>Session complete — <strong>${this.sessionCards.length}</strong> cards, <strong>${pct}%</strong> correct</p><div style="margin:12px 0;">`;
    for (let i = 0; i < this.sessionCards.length; i++) {
      const card = this.sessionCards[i];
      const review = this.getCardReview(card.id);
      const wasCorrect = review.lastConfidence && review.lastConfidence > 0;
      html += `<div style="display:flex;gap:8px;align-items:start;padding:8px;background:var(--card-bg);border-radius:6px;margin:4px 0;border-left:3px solid ${wasCorrect ? 'var(--success)' : 'var(--danger)'}">
        <span style="font-size:0.8rem;font-weight:600;min-width:24px;">${i+1}.</span>
        <div style="flex:1;font-size:0.8rem;">
          <strong>${card.topic}</strong>: ${card.scenario.substring(0, 70)}…<br>
          <span style="color:var(--muted)">→ ${card.correct} · ${SRS.confidenceLabel(review.lastConfidence)}</span>
        </div>
      </div>`;
    }
    html += '</div>';
    el.innerHTML = html;
  },

  /* ——— Learning Path ——— */

  showLearningPath() {
    const depthCache = {};
    const depthOf = (topic, visiting = new Set()) => {
      if (depthCache[topic] !== undefined) return depthCache[topic];
      if (visiting.has(topic)) return 0;
      const prerequisites = TOPIC_CATALOG[topic].prerequisites;
      if (!prerequisites.length) return (depthCache[topic] = 0);
      const nextVisiting = new Set(visiting).add(topic);
      return (depthCache[topic] = 1 + Math.max(...prerequisites.map(item => depthOf(item, nextVisiting))));
    };
    const dependents = {};
    for (const topic of Object.keys(TOPIC_CATALOG)) dependents[topic] = [];
    for (const [topic, details] of Object.entries(TOPIC_CATALOG)) {
      for (const prerequisite of details.prerequisites) dependents[prerequisite].push(topic);
    }
    const levels = {};
    for (const topic of Object.keys(TOPIC_CATALOG)) {
      const depth = depthOf(topic);
      (levels[depth] ||= []).push(topic);
    }
    const el = document.getElementById('topic-hierarchy');
    el.innerHTML = Object.entries(levels).map(([depth, topics]) => `
      <section class="topic-level">
        <h2>${Number(depth) === 0 ? 'Foundations' : `Level ${Number(depth) + 1}`}</h2>
        <div class="topic-grid">${topics.map(topic => {
          const details = TOPIC_CATALOG[topic];
          const prerequisites = details.prerequisites.map(item => TOPIC_CATALOG[item].label);
          const unlocks = dependents[topic].map(item => TOPIC_CATALOG[item].label);
          const mastery = Math.round(this.getTopicScore(topic) * 100);
          return `<article class="topic-node">
            <div class="topic-node-heading"><strong>${details.label}</strong><span>${mastery}%</span></div>
            <div class="topic-node-progress"><span style="width:${mastery}%"></span></div>
            <p>${prerequisites.length ? `Know first: ${prerequisites.join(', ')}` : 'Start here'}</p>
            <p>${unlocks.length ? `Leads to: ${unlocks.join(', ')}` : 'Advanced endpoint'}</p>
            <button class="btn btn-sm btn-outline" onclick="APP.startTopicSession('${topic}')">Practice ${details.label}</button>
          </article>`;
        }).join('')}</div>
      </section>
    `).join('');
    this.showScreen('learning-path');
  },

  /* ——— Radar Chart (Canvas) ——— */

  drawRadarChart() {
    const canvas = document.getElementById('radar-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const size = canvas.width = Math.min(300, canvas.parentElement.clientWidth - 20);
    const cx = size / 2, cy = size / 2, r = size * 0.35;
    const topics = ['caching', 'queues', 'databases', 'consensus', 'api-design', 'loadbalancing'];
    const labels = { caching: 'Cache', queues: 'Queue', databases: 'DB', consensus: 'Consensus', 'api-design': 'API', loadbalancing: 'LB' };
    const n = topics.length;
    ctx.clearRect(0, 0, size, size);

    // background grid
    for (let ring = 1; ring <= 5; ring++) {
      ctx.beginPath();
      for (let i = 0; i <= n; i++) {
        const angle = (Math.PI * 2 * i / n) - Math.PI / 2;
        const x = cx + Math.cos(angle) * r * ring / 5;
        const y = cy + Math.sin(angle) * r * ring / 5;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.strokeStyle = '#ddd'; ctx.lineWidth = 0.5; ctx.stroke();
    }

    // data polygon
    ctx.beginPath();
    for (let i = 0; i <= n; i++) {
      const t = topics[i % n];
      const score = this.getTopicScore(t);
      const angle = (Math.PI * 2 * i / n) - Math.PI / 2;
      const x = cx + Math.cos(angle) * r * score;
      const y = cy + Math.sin(angle) * r * score;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.fillStyle = 'rgba(57, 73, 171, 0.15)'; ctx.fill();
    ctx.strokeStyle = '#3949ab'; ctx.lineWidth = 2; ctx.stroke();

    // labels
    for (let i = 0; i < n; i++) {
      const angle = (Math.PI * 2 * i / n) - Math.PI / 2;
      const lx = cx + Math.cos(angle) * (r + 20);
      const ly = cy + Math.sin(angle) * (r + 20);
      ctx.fillStyle = '#666'; ctx.font = '11px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(labels[topics[i]], lx, ly);
    }
  },

  /* ——— Bookmarks ——— */

  toggleBookmark(cardId) {
    const bm = JSON.parse(localStorage.getItem('sdf_bookmarks') || '[]');
    const idx = bm.indexOf(cardId);
    if (idx >= 0) bm.splice(idx, 1); else bm.push(cardId);
    localStorage.setItem('sdf_bookmarks', JSON.stringify(bm));
    this.renderBookmarks();
  },

  isBookmarked(cardId) { return JSON.parse(localStorage.getItem('sdf_bookmarks') || '[]').includes(cardId); },

  renderBookmarks() {
    const el = document.getElementById('bookmark-list');
    if (!el) return;
    const bm = JSON.parse(localStorage.getItem('sdf_bookmarks') || '[]');
    if (bm.length === 0) { el.innerHTML = '<p style="color:var(--muted);font-size:0.85rem;">No bookmarked cards yet. Use the ★ button during a session to save one.</p>'; return; }
    const cards = SEED_CARDS.filter(c => bm.includes(c.id));
    el.innerHTML = cards.map(c => `<div style="padding:8px;background:var(--card-bg);border-radius:6px;margin:4px 0;font-size:0.85rem;"><strong>${c.topic}</strong>: ${c.scenario.substring(0, 60)}… <span style="color:var(--muted)">[${c.correct}]</span></div>`).join('');
  },

  /* ——— Search / Filter ——— */

  filterCards() {
    const query = document.getElementById('search-input')?.value?.toLowerCase().trim() || '';
    const diffFilter = parseInt(document.getElementById('diff-filter')?.value) || 0;
    const topicFilter = document.getElementById('topic-filter')?.value || '';
    let results = [...SEED_CARDS];
    if (query) results = results.filter(c => c.scenario.toLowerCase().includes(query) || c.topic.includes(query));
    if (diffFilter) results = results.filter(c => c.difficulty === diffFilter);
    if (topicFilter) results = results.filter(c => c.topic === topicFilter);
    document.getElementById('search-results').innerHTML = results.length === 0
      ? '<p style="color:var(--muted);font-size:0.85rem;">No matching cards.</p>'
      : results.slice(0, 20).map(c => `<div style="padding:8px;background:var(--card-bg);border-radius:6px;margin:4px 0;font-size:0.8rem;"><strong>${c.topic}</strong> ★${c.difficulty}: ${c.scenario.substring(0, 80)}… <span style="color:var(--muted)">[${c.correct}]</span></div>`).join('');
  },

  /* ——— Export / Import Profile ——— */

  exportProfile() {
    const data = { profile: this.profile, customCards: JSON.parse(localStorage.getItem('sdf_custom_cards') || '[]'), bookmarks: JSON.parse(localStorage.getItem('sdf_bookmarks') || '[]') };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'sdf-profile.json'; a.click();
  },

  importProfile(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        if (data.profile) {
          this.profile = data.profile;
          this.saveProfile();
        }
        if (data.customCards) localStorage.setItem('sdf_custom_cards', JSON.stringify(data.customCards));
        if (data.bookmarks) localStorage.setItem('sdf_bookmarks', JSON.stringify(data.bookmarks));
        this.renderDeckStats();
        alert('Profile imported successfully!');
      } catch { alert('Invalid profile file.'); }
    };
    reader.readAsText(file);
  },

  /* ——— Session Resume ——— */

  _saveSessionState() {
    if (this.sessionCards.length > 0 && this.sessionIndex < this.sessionCards.length) {
      localStorage.setItem('sdf_resume', JSON.stringify({ cards: this.sessionCards, index: this.sessionIndex, start: this.sessionStart }));
    } else {
      localStorage.removeItem('sdf_resume');
    }
  },

  resumeSession() {
    const raw = localStorage.getItem('sdf_resume');
    if (!raw) return false;
    try {
      const state = JSON.parse(raw);
      this.sessionCards = state.cards;
      this.sessionIndex = state.index;
      this.sessionStart = state.start || Date.now();
      this._startTimer();
      this.showCard();
      this.showScreen('session');
      return true;
    } catch { return false; }
  },

  /* ——— Auto-Calibrate Difficulty ——— */

  autoCalibrate() {
    const cards = SEED_CARDS;
    for (const card of cards) {
      const review = this.getCardReview(card.id);
      if (review.timesReviewed >= 3) {
        const accuracy = review.timesCorrect / review.timesReviewed;
        // If accuracy > 80% and difficulty < 5, increase difficulty
        if (accuracy > 0.8 && card.difficulty < 5) card.difficulty = Math.min(5, card.difficulty + 1);
        if (accuracy < 0.4 && card.difficulty > 1) card.difficulty = Math.max(1, card.difficulty - 1);
      }
    }
    this.renderDeckStats();
  },

  /* ——— High Contrast Mode ——— */

  toggleContrast() {
    const el = document.documentElement;
    const isHigh = el.getAttribute('data-theme') === 'high-contrast';
    if (isHigh) {
      el.setAttribute('data-theme', localStorage.getItem('sdf_theme') === 'dark' ? 'dark' : '');
      localStorage.setItem('sdf_contrast', 'normal');
    } else {
      el.setAttribute('data-theme', 'high-contrast');
      localStorage.setItem('sdf_contrast', 'high');
    }
  }
};

// Boot
document.addEventListener('DOMContentLoaded', () => APP.init());
