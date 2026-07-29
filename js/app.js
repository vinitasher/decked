/* System Design Flashcards — main application logic */

const APP = {
  profile: null,
  currentCard: null,
  sessionCards: [],
  sessionIndex: 0,
  sessionStart: null,

  init() {
    this.loadProfile();
    this.renderDeckStats();
    this.showScreen('welcome');
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
    return this.profile.topicScores[topic] || 0.5;
  },

  updateTopicScore(topic, correct, weight = 1) {
    const old = this.getTopicScore(topic);
    const delta = (correct ? 1 : 0) - old;
    this.profile.topicScores[topic] = Math.max(0, Math.min(1, old + delta * 0.15 * weight));
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

  startSession(count = 8) {
    this.sessionCards = this.selectCards(count);
    this.sessionIndex = 0;
    this.sessionStart = Date.now();
    if (this.sessionCards.length === 0) {
      alert('No cards due for review! Check back later.');
      return;
    }
    this.showCard();
    this.showScreen('session');
  },

  selectCards(count) {
    const now = Date.now();
    // due cards first (spaced repetition)
    let candidates = SEED_CARDS.filter(c => {
      const r = this.getCardReview(c.id);
      return r.nextReviewAt <= now || r.timesReviewed === 0;
    });

    if (candidates.length < count) {
      candidates = SEED_CARDS.slice(); // fallback: all cards
    }

    // adaptively pick weakest topics first — interleaving
    const scored = candidates.map(c => ({
      card: c,
      score: (1 - this.getTopicScore(c.topic)) + Math.random() * 0.1
    }));
    scored.sort((a, b) => b.score - a.score);

    // enforce topic interleaving: reorder so adjacent cards are different topics
    const topicGroups = {};
    for (const s of scored) {
      (topicGroups[s.card.topic] = topicGroups[s.card.topic] || []).push(s.card);
    }
    const interleaved = [];
    const keys = Object.keys(topicGroups);
    let remaining = count;
    while (remaining > 0) {
      let any = false;
      for (const k of keys) {
        if (topicGroups[k].length > 0) {
          interleaved.push(topicGroups[k].shift());
          remaining--;
          any = true;
        }
      }
      if (!any) break;
    }
    return interleaved.slice(0, count);
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
      btn.innerHTML = `<span class="option-letter">${opt.id}</span><span class="option-text">${opt.label}</span>`;
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
    this.saveCardReview(card.id, review);

    // update topic score
    this.updateTopicScore(card.topic, correct, 1);

    // update global stats
    this.profile.totalAnswered++;
    if (correct) this.profile.totalCorrect++;
    this.saveProfile();

    // disable all option buttons
    document.querySelectorAll('.option-btn').forEach(b => b.disabled = true);

    // highlight correct answer
    document.querySelectorAll('.option-btn').forEach((btn, i) => {
      const opt = card.options[i];
      if (opt.id === card.correct) btn.classList.add('correct');
      else if (opt.id === selectedId && !correct) btn.classList.add('incorrect');
    });

    // show feedback
    const feedbackEl = document.getElementById('feedback');
    feedbackEl.className = correct ? 'feedback correct' : 'feedback incorrect';
    feedbackEl.innerHTML = `<strong>${correct ? '✓ Correct!' : '✗ Incorrect'}</strong><br><br>${card.explanation}`;
    if (!correct) {
      feedbackEl.innerHTML += `<br><br><em>The correct answer was <strong>${card.correct}</strong>.</em>`;
    }

    // highlight diagram path
    Render.diagram(card, 'diagram-container', correct);

    document.getElementById('next-btn').classList.remove('hidden');
    this.renderDeckStats();

    // reveal diagram
    Render.diagram(card, 'diagram-container', true);
  },

  peekDiagram() {
    const card = this.currentCard;
    this._diagramPeeking[card.id] = true;
    Render.diagram(card, 'diagram-container', false);
  },

  nextCard() {
    this.sessionIndex++;
    this._cardStartTime = Date.now();
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
      <p>Current streak: <strong>${this.profile.streaks.current} days</strong></p>
    `;
    this.renderDeckStats();
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
        return `<div class="topic-row"><span>${topicLabels[t] || t}</span><div class="topic-bar"><div class="topic-fill" style="width:${pct}%"></div></div><span class="topic-pct">${pct}%</span></div>`;
      }).join('');
    }
  }
};

// Boot
document.addEventListener('DOMContentLoaded', () => APP.init());
