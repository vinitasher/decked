/* System Design Flashcards — main application logic */

const SERVER_BASE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? 'http://localhost:3456' : '';

/* Screens that are URL-addressable via hash routes (#/welcome, #/search, ...).
   Wiki topics are addressable per-entry: #/wiki/<topic>. */
const SCREEN_ROUTES = ['welcome', 'create', 'session', 'session-end', 'history', 'search', 'bookmarks', 'learning-path', 'wiki', 'stats'];

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

  normalized.topicAccuracy = normalized.topicAccuracy && typeof normalized.topicAccuracy === 'object'
    ? normalized.topicAccuracy : {};
  for (const [topic, entries] of Object.entries(normalized.topicAccuracy)) {
    normalized.topicAccuracy[topic] = Array.isArray(entries)
      ? entries.filter(entry => entry && typeof entry === 'object' && typeof entry.correct === 'boolean').slice(-10)
      : [];
  }

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

/* Cheap concept-name matching: fold any casing/separator variant
   ("Eventual Consistency", "eventual-consistency", "Eventual_Consistency")
   onto the canonical kebab-case topic key, plus a naive singular/plural
   fallback ("database" -> "databases", "load-balancing" -> "loadbalancing"
   is handled when the normalized form collides via the existing key set). */
function normalizeConceptName(name) {
  return String(name ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function matchWikiTopic(name, knownKeys = Object.keys(WIKI || {})) {
  const known = new Set(knownKeys);
  const normalized = normalizeConceptName(name);
  if (!normalized) return null;
  if (known.has(normalized)) return normalized;
  if (normalized.endsWith('s') && normalized.length > 1 && known.has(normalized.slice(0, -1))) {
    return normalized.slice(0, -1);
  }
  if (known.has(`${normalized}s`)) return `${normalized}s`;
  return null;
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

/* ——— Feedback helpers (filed as GitHub issues, mirrors the system-design
       playground feedback flow: Turnstile + device id + runtime config) ——— */

let feedbackSiteKey = '';
let turnstileToken = '';
let turnstileWidgetId = null;

function getOrCreateDeviceId() {
  let id = localStorage.getItem('sdf_device_id');
  if (!id) {
    id = (crypto.randomUUID && crypto.randomUUID()) || `dev-${Math.random().toString(36).slice(2, 14)}`;
    localStorage.setItem('sdf_device_id', id);
  }
  return id;
}

async function loadFeedbackConfig() {
  try {
    const response = await fetch(`${SERVER_BASE}/api/feedback/config`);
    const body = await response.json().catch(() => ({}));
    feedbackSiteKey = body.turnstileSiteKey || '';
  } catch (_) {
    feedbackSiteKey = '';
  }
}

function renderTurnstile() {
  const container = document.getElementById('feedback-turnstile');
  if (!container || !feedbackSiteKey || turnstileWidgetId) return;
  const loadWidget = () => {
    if (!container || typeof window === 'undefined' || !window.turnstile || turnstileWidgetId) return;
    if (turnstileWidgetId) window.turnstile.remove(turnstileWidgetId);
    turnstileWidgetId = window.turnstile.render(container, {
      sitekey: feedbackSiteKey,
      theme: 'light',
      callback: token => { turnstileToken = token; },
      'expired-callback': () => { turnstileToken = ''; },
      'error-callback': () => { turnstileToken = ''; }
    });
  };
  const scriptId = 'feedback-turnstile-script';
  let script = document.getElementById(scriptId);
  if (!script) {
    script = document.createElement('script');
    script.id = scriptId;
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.defer = true;
    script.addEventListener('load', loadWidget, { once: true });
    document.head.appendChild(script);
  } else if (window.turnstile) {
    loadWidget();
  }
}

function resetTurnstile(remove) {
  turnstileToken = '';
  if (turnstileWidgetId && typeof window !== 'undefined' && window.turnstile) {
    if (remove) {
      window.turnstile.remove(turnstileWidgetId);
      turnstileWidgetId = null;
    } else {
      window.turnstile.reset(turnstileWidgetId);
    }
  }
}

/* ——— Accounts, free-tier quotas, and Pro billing ——— */

let appConfig = { supabaseUrl: '', supabaseAnonKey: '', stripePriceId: '', freeDailyCardLimit: 10, freeDailyWikiLimit: 10 };
let supabaseClient = null;
let currentSession = null;
let currentPlan = 'free';
const PROFILE_SYNC_DELAY_MS = 250;

function getOAuthRedirectUrl() {
  return 'https://decked.pages.dev';
}

function isOAuthCallbackHash(hash = window.location.hash) {
  return /^#(?:access_token|refresh_token|expires_at|error|error_description)=/.test(String(hash || ''));
}

function getOAuthCallbackError(hash = window.location.hash) {
  const params = new URLSearchParams(String(hash || '').replace(/^#/, ''));
  if (!params.get('error')) return '';
  return params.get('error_description') || params.get('error') || 'OAuth sign-in failed.';
}

function escHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
}

async function loadAppConfig() {
  try {
    const response = await fetch(`${SERVER_BASE}/api/config`);
    const body = await response.json().catch(() => ({}));
    appConfig = { ...appConfig, ...body };
  } catch (_) { /* config unavailable — anonymous local mode continues */ }
}

function apiHeaders() {
  const headers = {};
  try {
    headers['X-Device-Id'] = getOrCreateDeviceId();
  } catch (_) { /* storage unavailable — omit the device id */ }
  if (currentSession?.access_token) headers.Authorization = `Bearer ${currentSession.access_token}`;
  return headers;
}

async function initAccount() {
  const callbackError = getOAuthCallbackError();
  await loadAppConfig();
  if (!appConfig.supabaseUrl || !appConfig.supabaseAnonKey) {
    if (callbackError) renderAccountError(callbackError);
    renderQuotaBar();
    if (typeof APP !== 'undefined') APP._onAccountIdentityReady().catch(() => {});
    return;
  }
  try {
    supabaseClient = window.supabase.createClient(appConfig.supabaseUrl, appConfig.supabaseAnonKey);
  } catch (_) {
    renderAccountError('Could not initialize sign-in. Check the Supabase client configuration.');
    renderQuotaBar();
    return;
  }
  let sessionData;
  try {
    sessionData = await supabaseClient.auth.getSession();
  } catch (_) {
    renderAccountError('Could not complete sign-in. Please try again.');
    renderQuotaBar();
    return;
  }
  const { data, error } = sessionData;
  const authError = callbackError || error?.message || '';
  currentSession = data?.session || null;
  supabaseClient.auth.onAuthStateChange((_event, session) => {
    currentSession = session;
    renderAccountBar();
    renderQuotaBar();
    if (typeof APP !== 'undefined') APP._onAccountIdentityReady().catch(() => {});
  });
  if (authError) renderAccountError(authError);
  else renderAccountBar();
  renderQuotaBar();
  handleUpgradeReturn();
  if (typeof APP !== 'undefined') await APP._onAccountIdentityReady();
}

function renderAccountError(message) {
  const bar = document.getElementById('account-bar');
  if (!bar) return;
  bar.classList.remove('hidden');
  bar.innerHTML = `<span class="account-error">GitHub sign-in failed: ${escHtml(message)}</span> <button class="btn btn-sm btn-outline" onclick="APP.signInGithub()">Try again</button>`;
}

function renderAccountBar() {
  const bar = document.getElementById('account-bar');
  if (!bar) return;
  const signedIn = Boolean(currentSession?.user);
  const email = currentSession?.user?.email || '';
  bar.classList.remove('hidden');
  bar.innerHTML = signedIn
    ? `<span class="account-chip">👤 <span class="account-email">${escHtml(email)}</span>${currentPlan === 'pro' ? ' <span class="plan-badge plan-pro">PRO</span>' : ' <span class="plan-badge">Free</span>'}</span> <button class="btn btn-sm btn-outline" onclick="APP.signOut()">Sign out</button>`
    : `<span class="account-chip">Free tier: ${appConfig.freeDailyCardLimit} cards &amp; ${appConfig.freeDailyWikiLimit} wiki entries per day</span> <button class="btn btn-sm btn-outline" onclick="APP.signInGithub()">🐙 Sign in with GitHub</button>`;
}

async function renderQuotaBar() {
  const bar = document.getElementById('quota-bar');
  if (!bar) return;
  try {
    const response = await fetch(`${SERVER_BASE}/api/quota`, { headers: apiHeaders() });
    if (!response.ok) return;
    const data = await response.json();
    currentPlan = data.plan || 'free';
    bar.classList.remove('hidden');
    if (data.plan === 'pro') {
      bar.innerHTML = '<span class="quota-text">♾️ Unlimited cards &amp; wiki — Pro</span>';
    } else {
      bar.innerHTML = `<span class="quota-text">Today: <strong>${data.cards.used}/${data.cards.limit}</strong> cards · <strong>${data.wiki.used}/${data.wiki.limit}</strong> wiki</span> <button class="btn btn-sm btn-outline" onclick="APP.upgradeToPro()">Upgrade</button>`;
    }
  } catch (_) { /* offline — keep the bar hidden */ }
}

function handleUpgradeReturn() {
  const params = new URLSearchParams(window.location.search);
  const banner = document.getElementById('upgrade-banner');
  if (!banner) return;
  if (params.get('upgrade') === 'success') {
    banner.classList.remove('hidden');
    banner.innerHTML = '✅ Upgrade complete — you are on Pro. Thanks for supporting the app!';
    window.history.replaceState({}, '', window.location.pathname);
    renderQuotaBar();
  } else if (params.get('upgrade') === 'cancelled') {
    banner.classList.remove('hidden');
    banner.innerHTML = 'Upgrade cancelled — the free tier is always available.';
    window.history.replaceState({}, '', window.location.pathname);
  }
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
  _retriedCardIds: new Set(),
  _sessionResults: {},
  _compareMode: false,
  _profileSyncReady: false,
  _profileSyncInFlight: false,
  _profileSyncTimer: null,
  _profileSyncIdentity: null,
  _profileLocalUpdatedAt: 0,
  _profileLastSyncedClientUpdatedAt: 0,
  _profileChangeVersion: 0,
  _profilePendingMigration: null,

  init() {
    this.loadProfile();
    this._loadCustomCards();
    this.renderPrerequisiteOptions();
    this.renderDeckStats();
    window.addEventListener('hashchange', () => this._handleHashChange());
    this._handleHashChange();
    this._setupKeyboard();
    this._setupConfidenceButtons();
    this._setupSessionControls();
    this._checkServerHealth();
    this._initTheme();
    this._initSwipe();
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) this._onAccountIdentityReady().catch(() => {});
    });
    initAccount();
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
      const normalized = normalizeCardPrerequisites(candidate);
      if (!hasUsableCorrectOptionWiring(normalized)
          || hasDegenerateLinearOptionTopology(normalized)) continue;
      byFingerprint.delete(fingerprint);
      byFingerprint.set(fingerprint, normalized);
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

  async fetchCard(topic, difficulty, avoidList = [], options = {}) {
    const key = this._cacheKey(topic, difficulty);
    const excludedFingerprints = new Set(this._excludedScenarioFingerprints(avoidList));
    const localPool = this._readCardPool(key);
    const memoryPool = this._normalizeCardPool(this._cardCache[key] || { cards: [] });
    const available = this._normalizeCardPool({ cards: [...localPool.cards, ...memoryPool.cards] });
    if (!options.force) {
      const unseen = available.cards.find(card => !excludedFingerprints.has(this._scenarioFingerprint(card.scenario)));
      if (unseen) {
        this._writeCardPool(key, available.cards);
        return unseen;
      }
    }

    try {
      const params = new URLSearchParams({ topic, difficulty: String(difficulty) });
      if (options.force) params.set('force', '1');
      for (const fingerprint of excludedFingerprints) params.append('exclude', fingerprint);
      const res = await fetch(`${SERVER_BASE}/api/generate?${params}`, { headers: apiHeaders() });
      if (res.status === 429) {
        const quotaBody = await res.json().catch(() => ({}));
        if (quotaBody.code === 'quota_exceeded') this.showQuotaNotice('cards');
        throw new Error(`server returned ${res.status}`);
      }
      if (!res.ok) throw new Error(`server returned ${res.status}`);
      const data = await res.json();
      const card = normalizeCardPrerequisites(data?.card);
      const fingerprint = this._scenarioFingerprint(card?.scenario);
      if (!card || !fingerprint || excludedFingerprints.has(fingerprint)
          || !hasUsableCorrectOptionWiring(card)
          || hasDegenerateLinearOptionTopology(card)) {
        throw new Error('server returned an invalid or excluded card');
      }
      this._writeCardPool(key, [...available.cards, card]);
      return card;
    } catch (err) {
      // server unavailable — continue to the existing offline fallback
      if (options.force) throw err;
    }

    // seed fallback: only a topic-matched, unseen seed card may substitute so
    // offline sessions never pad a slot with cross-topic content.
    if (!options.force) {
      const topicCards = SEED_CARDS.filter(c =>
        c.topic === topic && !excludedFingerprints.has(this._scenarioFingerprint(c.scenario))
          && hasUsableCorrectOptionWiring(c)
          && !hasDegenerateLinearOptionTopology(c)
      );
      if (topicCards.length > 0) {
        return normalizeCardPrerequisites(topicCards[Math.floor(Math.random() * topicCards.length)]);
      }
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
      if (!hasUsableCorrectOptionWiring(card) || hasDegenerateLinearOptionTopology(card)) continue;
      if (!SEED_CARDS.some(existing => existing.id === card.id)) SEED_CARDS.unshift(card);
    }
  },

  _profileIdentity() {
    if (currentSession?.user?.id) return `user:${currentSession.user.id}`;
    try {
      const deviceId = getOrCreateDeviceId();
      return deviceId ? `dev:${deviceId}` : null;
    } catch (_) {
      return null;
    }
  },

  _profileStorageKey(identity = this._profileSyncIdentity || this._profileIdentity()) {
    if (identity?.startsWith('user:')) {
      return `sdf_profile_user_${encodeURIComponent(identity.slice(5))}`;
    }
    return 'sdf_profile';
  },

  _profileMetaKey(identity = this._profileSyncIdentity || this._profileIdentity()) {
    return `${this._profileStorageKey(identity)}:meta`;
  },

  _emptyProfile(identity) {
    return normalizeProfileData({
      userId: identity?.startsWith('user:')
        ? identity.slice(5)
        : (localStorage.getItem('sdf_profile_id') || 'local-' + Date.now().toString(36)),
      topicScores: {},
      cardHistory: {},
      streaks: { current: 0, best: 0, lastDate: null },
      totalSessions: 0,
      totalAnswered: 0,
      totalCorrect: 0
    });
  },

  _profileHasData(profile = this.profile) {
    if (!profile || typeof profile !== 'object') return false;
    return Object.keys(profile.cardHistory || {}).length > 0
      || Object.keys(profile.topicScores || {}).length > 0
      || Object.keys(profile.topicAccuracy || {}).length > 0
      || Object.keys(profile._topicCardSeen || {}).length > 0
      || (profile.seenScenarioFingerprints || []).length > 0
      || Number(profile.totalSessions) > 0
      || Number(profile.totalAnswered) > 0
      || Number(profile.totalCorrect) > 0;
  },

  _persistLocalProfile(identity, updatedAt = 0) {
    const profileKey = this._profileStorageKey(identity);
    try {
      localStorage.setItem(profileKey, JSON.stringify(this.profile));
      localStorage.setItem(this._profileMetaKey(identity), JSON.stringify({ clientUpdatedAt: updatedAt }));
    } catch (_) { /* local storage is an optional offline cache */ }
  },

  loadProfile(identity = this._profileIdentity()) {
    this._profileSyncIdentity = identity || null;
    this._profileSyncReady = false;
    const profileKey = this._profileStorageKey(identity);
    const raw = localStorage.getItem(profileKey);
    if (raw) {
      try {
        this.profile = normalizeProfileData(JSON.parse(raw));
      } catch (_) {
        localStorage.removeItem(profileKey);
        this.profile = this._emptyProfile(identity);
      }
    } else {
      this.profile = this._emptyProfile(identity);
    }
    let updatedAt = 0;
    try {
      const metadata = JSON.parse(localStorage.getItem(this._profileMetaKey(identity)) || '{}');
      updatedAt = Number(metadata.clientUpdatedAt);
    } catch (_) {}
    this._profileLocalUpdatedAt = Number.isFinite(updatedAt) && updatedAt > 0
      ? updatedAt
      : (this._profileHasData() ? Date.now() : 0);
    this._profileLastSyncedClientUpdatedAt = 0;
    this._persistLocalProfile(identity, this._profileLocalUpdatedAt);
  },

  saveProfile() {
    const identity = this._profileSyncIdentity || this._profileIdentity();
    this._profileChangeVersion++;
    this._profileLocalUpdatedAt = Date.now();
    this._persistLocalProfile(identity, this._profileLocalUpdatedAt);
    if (this._profileSyncReady) this._scheduleProfileSync();
  },

  _cancelProfileSync() {
    if (this._profileSyncTimer) clearTimeout(this._profileSyncTimer);
    this._profileSyncTimer = null;
  },

  _scheduleProfileSync(delay = PROFILE_SYNC_DELAY_MS) {
    if (!this._profileSyncReady || !this._profileSyncIdentity) return;
    this._cancelProfileSync();
    this._profileSyncTimer = setTimeout(() => {
      this._profileSyncTimer = null;
      this._flushProfileSync();
    }, delay);
  },

  async _flushProfileSync() {
    if (this._profileSyncInFlight || !this._profileSyncReady || !this._profileSyncIdentity) return;
    const identity = this._profileSyncIdentity;
    const clientUpdatedAt = this._profileLocalUpdatedAt || Date.now();
    const profileChangeVersion = this._profileChangeVersion;
    this._profileSyncInFlight = true;
    try {
      const response = await fetch(`${SERVER_BASE}/api/profile`, {
        method: 'PUT',
        headers: { ...apiHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile: this.profile, clientUpdatedAt })
      });
      const body = await response.json().catch(() => ({}));
      if (response.status === 409 && body.profile && identity === this._profileSyncIdentity
          && profileChangeVersion === this._profileChangeVersion) {
        this.profile = normalizeProfileData(body.profile);
        this._profileLocalUpdatedAt = Number(body.clientUpdatedAt) || Date.now();
        this._profileLastSyncedClientUpdatedAt = this._profileLocalUpdatedAt;
        this._persistLocalProfile(identity, this._profileLocalUpdatedAt);
      } else if (!response.ok) {
        throw new Error(body.error || `profile sync failed: ${response.status}`);
      } else if (identity === this._profileSyncIdentity) {
        this._profileLastSyncedClientUpdatedAt = Number(body.clientUpdatedAt) || clientUpdatedAt;
        this._profilePendingMigration = null;
        this._persistLocalProfile(identity, this._profileLocalUpdatedAt);
      }
    } catch (_) {
      // Local state remains authoritative until a later visibility/auth sync.
    } finally {
      this._profileSyncInFlight = false;
      if (identity === this._profileSyncIdentity && this._profileChangeVersion > profileChangeVersion) {
        this._scheduleProfileSync(0);
      }
    }
  },

  async _pullRemoteProfile(identity) {
    this._profileSyncReady = false;
    try {
      const response = await fetch(`${SERVER_BASE}/api/profile`, { headers: apiHeaders() });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || `profile load failed: ${response.status}`);
      if (identity !== this._profileSyncIdentity) return false;

      const remoteUpdatedAt = Number(body.clientUpdatedAt) || 0;
      const pending = this._profilePendingMigration;
      const localProfile = pending?.profile || this.profile;
      const localUpdatedAt = pending?.updatedAt || this._profileLocalUpdatedAt;
      if (body.profile && localUpdatedAt > remoteUpdatedAt && this._profileHasData(localProfile)) {
        this.profile = normalizeProfileData(localProfile);
        this.profile.userId = identity;
        this._profileLocalUpdatedAt = localUpdatedAt;
        this._profilePendingMigration = null;
        this._profileSyncReady = true;
        this._scheduleProfileSync(0);
      } else if (body.profile) {
        this.profile = normalizeProfileData(body.profile);
        this._profileLocalUpdatedAt = remoteUpdatedAt;
        this._profileLastSyncedClientUpdatedAt = remoteUpdatedAt;
        this._profilePendingMigration = null;
        this._profilePersistAfterRemote(identity);
      } else {
        this.profile = normalizeProfileData(localProfile);
        this.profile.userId = identity;
        this._profileLocalUpdatedAt = localUpdatedAt || Date.now();
        this._profilePendingMigration = null;
        this._profileSyncReady = true;
        this._scheduleProfileSync(0);
      }
      this.renderDeckStats();
      return true;
    } catch (_) {
      this._profileSyncReady = true;
      if (this._profileHasData()) this._scheduleProfileSync();
      return false;
    }
  },

  _profilePersistAfterRemote(identity) {
    this._profileSyncReady = true;
    this._persistLocalProfile(identity, this._profileLocalUpdatedAt);
  },

  async _onAccountIdentityReady() {
    const identity = this._profileIdentity();
    if (!identity) return false;
    const previousIdentity = this._profileSyncIdentity;
    if (previousIdentity && previousIdentity !== identity) {
      const previousProfile = this.profile;
      const previousUpdatedAt = this._profileLocalUpdatedAt || (this._profileHasData() ? Date.now() : 0);
      this._profileSyncReady = false;
      this._cancelProfileSync();
      this._persistLocalProfile(previousIdentity, previousUpdatedAt);
      this._profilePendingMigration = previousIdentity.startsWith('dev:') && identity.startsWith('user:')
        && this._profileHasData(previousProfile)
        ? { profile: JSON.parse(JSON.stringify(previousProfile)), updatedAt: previousUpdatedAt }
        : null;
      this.loadProfile(identity);
      if (this._profilePendingMigration && this._profileHasData()
          && this._profileLocalUpdatedAt >= this._profilePendingMigration.updatedAt) {
        this._profilePendingMigration = null;
      }
    } else if (!previousIdentity) {
      this.loadProfile(identity);
    }
    this._profileSyncIdentity = identity;
    return this._pullRemoteProfile(identity);
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
      flows: Array.isArray(card.flows) ? card.flows.map(flow => ({ ...flow })) : [],
      options: (Array.isArray(card.options) ? card.options : []).map(option => ({
        id: option?.id,
        label: option?.label,
        prerequisiteTopics: Array.isArray(option?.prerequisiteTopics)
          ? [...option.prerequisiteTopics] : [],
        flows: Array.isArray(option?.flows) ? option.flows.map(flow => ({ ...flow })) : []
      })),
      correct: card.correct,
      explanation: card.explanation
    };
    if (Array.isArray(card.nodes)) snapshot.nodes = [...card.nodes];
    return snapshot;
  },

  /* Resolve a reviewed card's content by id: prefer the persisted snapshot,
     else the matching seed card, else null (unresolvable). */
  _resolveCardContent(id) {
    const record = this.profile?.cardHistory?.[id];
    if (record && typeof record === 'object' && record.card && typeof record.card === 'object') {
      const card = normalizeCardPrerequisites({ ...record.card, id });
      if (hasUsableCorrectOptionWiring(card) && !hasDegenerateLinearOptionTopology(card)) {
        return card;
      }
    }
    const seed = SEED_CARDS.find(card => card.id === id);
    if (!seed) return null;
    const normalizedSeed = normalizeCardPrerequisites(seed);
    return hasUsableCorrectOptionWiring(normalizedSeed)
      && !hasDegenerateLinearOptionTopology(normalizedSeed)
      ? normalizedSeed : null;
  },

  /* Cards whose scheduled review has arrived, ordered by predicted-recall
     risk (most likely to be forgotten first), capped at cap. The SRS ledger
     entry is the trigger for re-service — never the seen fingerprint ledger. */
  _dueReviewCards(cap) {
    const limit = Number.isFinite(cap) ? Math.max(0, Math.floor(cap)) : 0;
    const now = Date.now();
    const due = [];
    for (const [id, record] of Object.entries(this.profile?.cardHistory || {})) {
      if (!record || typeof record !== 'object') continue;
      if (typeof record.nextReviewAt !== 'number' || record.nextReviewAt > now) continue;
      const card = this._resolveCardContent(id);
      if (!card) continue;
      due.push({ card, recall: this._predictedRecall(record, now) });
    }
    due.sort((a, b) => a.recall - b.recall);
    return due.slice(0, limit).map(entry => ({ ...entry.card, review: true }));
  },

  /* Approximate the FSRS recall probability R = e^(-t/S) from the stored
     stability and the time elapsed since the last review. */
  _predictedRecall(record, now = Date.now()) {
    const stability = Math.max(0.1, record.stability || 0.1);
    const lastReviewedAt = (record.nextReviewAt || now) - (record.interval || 0) * 86400000;
    const elapsedDays = Math.max(0, (now - lastReviewedAt) / 86400000);
    return Math.exp(-elapsedDays / stability);
  },

  /* Distinct card ids in the studied set: every seed card plus every card the
     user has ever reviewed (generated and seed alike). */
  _studiedCardIds() {
    const ids = new Set(SEED_CARDS.map(card => card.id));
    for (const id of Object.keys(this.profile?.cardHistory || {})) ids.add(id);
    return ids;
  },

  /* Distinct topics in the studied set: seed-card topics plus topics seen in
     reviewed-card snapshots or the topic-review ledger. */
  _studiedTopics() {
    const topics = new Set(SEED_CARDS.map(card => card.topic));
    for (const record of Object.values(this.profile?.cardHistory || {})) {
      if (record && typeof record === 'object' && record.card && typeof record.card === 'object'
          && typeof record.card.topic === 'string') {
        topics.add(record.card.topic);
      }
    }
    for (const topic of Object.keys(this.profile?._topicCardSeen || {})) topics.add(topic);
    return topics;
  },

  /* Count of reviewed cards whose scheduled review has arrived. Only
     actually-reviewed cards count; unreviewed seed cards are never "due". */
  _dueReviewCount() {
    const now = Date.now();
    let due = 0;
    for (const record of Object.values(this.profile?.cardHistory || {})) {
      if (record && typeof record === 'object' && typeof record.nextReviewAt === 'number'
          && record.nextReviewAt <= now) {
        due++;
      }
    }
    return due;
  },

  /* ——— Session management ——— */

  async startSession(count = 8) {
    const startButton = document.getElementById('start-session-btn')
      || document.querySelector('button[onclick="APP.startSession()"]');
    startButton.disabled = true;
    startButton.textContent = 'Preparing session...';
    try {
      const { cards, requested, mixShortfall } = await this._generateSessionCards(count);
      if (cards.length === 0) {
        alert('No cards available! Check back later.');
        return;
      }
      // A mix-ratio shortfall is expected (fresh capped when reviews are
      // scarce); only a generation failure needs confirmation.
      if (cards.length < requested && !mixShortfall && !this._confirmShortSession(requested, cards.length)) {
        return;
      }
      this.sessionCards = cards;
      this.sessionIndex = 0;
      this.sessionStart = Date.now();
      this._nextCard = null;
      this._retriedCardIds = new Set();
      this._sessionResults = {};
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
    this._retriedCardIds = new Set();
    this._sessionResults = {};
    this.profile.totalSessions++;
    this._startTimer();
    this.saveProfile();
    this.showCard();
    this.showScreen('session');
  },

  /* Full-catalog session planning: every topic at its mastery-derived target
     difficulty, ranked by adaptive weight with the existing random tie-break.
     Never-studied topics start at the easiest level, so new users ramp from
     lower difficulty up as mastery grows; recent answers steer difficulty
     toward the 60-80% accuracy band. */
  _rankedSessionTopics() {
    const topics = Object.keys(TOPIC_CATALOG || {});
    return topics.map(topic => {
      const mastery = this.profile.topicScores[topic]?.raw ?? 0;
      let difficulty = Math.min(5, 1 + Math.round(mastery * 4));
      // Desirable-difficulty pacing: with enough recent answers, difficulty
      // adjusts so accuracy stays in the 60-80% band (below → easier).
      const recent = this._topicRecentAccuracy(topic);
      if (recent !== null) {
        if (recent > 0.8) difficulty = Math.min(5, difficulty + 1);
        else if (recent < 0.6) difficulty = Math.max(1, difficulty - 1);
      }
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

  /* Deterministic topological ordering of catalog topics (prerequisite topics
     before dependents), so within a difficulty tier sessions serve
     foundational cards first. */
  _topicTopoOrder() {
    let pool = Object.keys(TOPIC_CATALOG || {});
    const placed = new Set();
    const order = [];
    while (pool.length) {
      const ready = pool.filter(topic =>
        (TOPIC_CATALOG[topic]?.prerequisites || []).every(pre => placed.has(pre))
      );
      const batch = ready.length ? ready : pool;
      for (const topic of batch) {
        order.push(topic);
        placed.add(topic);
      }
      pool = pool.filter(topic => !placed.has(topic));
    }
    return order;
  },

  async _generateSessionCards(count) {
    const requested = Number.isFinite(count) ? Math.max(1, Math.floor(count)) : 8;
    const session = [];
    // Due reviews are served first, resolved from their stored content directly
    // (bypassing the seen-fingerprint ledger). Within a single session, cards
    // must still be fingerprint-distinct.
    for (const card of this._dueReviewCards(requested)) {
      if (session.length >= requested) break;
      if (this._isDuplicateScenario(card.scenario, session)) continue;
      session.push(card);
    }
    const dueCount = session.length;
    // Anki-style mix ratio: fresh cards are capped at half the session so
    // scheduled reviews keep their slots and new content never dominates.
    const freshCap = Math.max(2, Math.ceil(requested / 2));
    const freshBudget = Math.max(0, Math.min(requested - dueCount, freshCap));
    const mixShortfall = dueCount + freshBudget < requested;
    const plan = this._buildSessionPlan(freshBudget);
    // Generate one card at a time, in up to 3 refill rounds, so an
    // unavailable generator cannot loop forever (bounded at freshBudget*3
    // fetches) but every slot still gets retries with the accumulated
    // session exclusions. Never fires concurrent generation requests.
    const maxRounds = 3;
    const maxFetches = Math.max(1, freshBudget * 3);
    let fetches = 0;
    for (let round = 0; round < maxRounds && session.length < dueCount + freshBudget && fetches < maxFetches; round++) {
      for (const item of plan) {
        if (session.length >= dueCount + freshBudget || fetches >= maxFetches) break;
        fetches++;
        let card = null;
        try {
          card = await this.fetchCard(item.topic, item.difficulty, session);
        } catch (error) {
          card = null;
        }
        if (!card) continue;
        if (this._isDuplicateScenario(card.scenario, session)) continue;
        if (card.topic !== item.topic) continue;
        session.push(card);
      }
    }
    // Progressive difficulty ramp with prerequisite-first ordering: fresh
    // cards play easy → hard, and within a difficulty tier foundational topics
    // come before the topics that build on them. Due reviews (already-learned
    // cards) keep their first position; the adaptive plan order remains the
    // stable tie-break within each difficulty.
    const topo = this._topicTopoOrder();
    const topoRank = new Map(topo.map((topic, index) => [topic, index]));
    const fresh = session.slice(dueCount).sort((a, b) =>
      a.difficulty - b.difficulty ||
      (topoRank.get(a.topic) ?? 0) - (topoRank.get(b.topic) ?? 0)
    );
    return { cards: [...session.slice(0, dueCount), ...fresh], requested, mixShortfall };
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

  /* Rolling recent-answer window per topic (last 10 answers, newest last),
     used to pace difficulty toward the 60-80% accuracy band. */
  _recordTopicAnswer(topic, correct) {
    if (!topic) return;
    const windows = this.profile.topicAccuracy || (this.profile.topicAccuracy = {});
    const list = windows[topic] || (windows[topic] = []);
    list.push({ correct: !!correct, ts: Date.now() });
    if (list.length > 10) list.splice(0, list.length - 10);
    this.saveProfile();
  },

  /* Recent accuracy for a topic, or null when there is not enough data yet. */
  _topicRecentAccuracy(topic) {
    const list = this.profile?.topicAccuracy?.[topic] || [];
    if (list.length < 3) return null;
    return list.filter(entry => entry.correct).length / list.length;
  },

  /* Delayed repetition: a card answered wrong returns at the end of the
     session so the learner gets a second chance while the mistake is fresh
     (once per card per session). */
  _maybeScheduleRetry(card) {
    if (card?.id && !this._retriedCardIds.has(card.id) && Array.isArray(this.sessionCards)) {
      this._retriedCardIds.add(card.id);
      this.sessionCards.push({ ...card, review: true, retry: true });
    }
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
    this._compareMode = false;

    document.getElementById('card-counter').textContent =
      `${this.sessionIndex + 1} / ${this.sessionCards.length}${card.retry ? ' · retry' : ''}`;

    document.getElementById('card-topic').textContent =
      TOPIC_CATALOG[card.topic]?.label || card.topic;

    const difficulty = difficultyFromScenario(card.scenario);
    const diffStars = '★'.repeat(difficulty) + '☆'.repeat(5 - difficulty);
    document.getElementById('card-difficulty').textContent = diffStars;
    const requirementInfo = countScenarioRequirements(card.scenario);
    const requirementsEl = document.getElementById('card-requirements');
    if (requirementsEl) {
      requirementsEl.textContent = requirementInfo.count > 0
        ? `${requirementInfo.count} requirement${requirementInfo.count === 1 ? '' : 's'}: ${requirementInfo.requirements.map(item => item.value).join(' · ')}`
        : '';
    }

    document.getElementById('scenario').textContent = card.scenario;
    const prerequisites = normalizeCardPrerequisites(card).prerequisiteTopics;
    const prerequisiteEl = document.getElementById('card-prerequisites');
    prerequisiteEl.innerHTML = prerequisites.length
      ? `Know first: ${prerequisites.map(topic => this._wikiLink(topic)).join(', ')}`
      : 'Foundational topic';

    // retrieval practice: hide diagram until answered (user can toggle to peek)
    if (!this._diagramPeeking) this._diagramPeeking = {};
    const canPeek = this._diagramPeeking[card.id] || false;
    document.getElementById('diagram-container').innerHTML = '<p style="text-align:center;color:#999;padding:40px 0;font-size:0.85rem">📐 Diagram hidden for retrieval practice<br>Answer first, then the diagram reveals</p>';
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
        .map(topic => this._wikiLink(topic))
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
    document.getElementById('compare-btn').classList.add('hidden');
    document.getElementById('quality-rating').classList.add('hidden');
  },

  answer(selectedId) {
    this.closeWikiModal();
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
    document.getElementById('compare-btn').classList.remove('hidden');
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
    if (typeof review._createdAt !== 'number') review._createdAt = Date.now();
    this.saveCardReview(card.id, review);

    // update topic score + mastery tracking
    this.updateTopicScore(card.topic, correct, 1);
    this._recordTopicReview(card.topic, card.id, correct);
    this._recordTopicAnswer(card.topic, correct);

    // track per-card outcomes for this session (mistake review + retries)
    this._sessionResults = this._sessionResults || {};
    this._sessionResults[card.id] = correct;
    if (!correct) this._maybeScheduleRetry(card);

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

    Render.diagram(card, 'diagram-container', {
      reveal: true,
      option: (card.options || []).find(option => option.id === this._selectedId)
    });
    this.renderDeckStats();
    this.prefetchNext();
  },

  async regenerateCard() {
    if (this._regenerating) return;
    this._regenerating = true;
    const button = document.getElementById('regenerate-btn');
    const snapshotCard = this.currentCard;
    const snapshotIndex = this.sessionIndex;
    if (button) {
      button.disabled = true;
      button.textContent = '⏳ Generating...';
    }
    let newCard = null;
    try {
      const avoidList = this.sessionCards.filter(c => c && c.id !== snapshotCard?.id);
      newCard = await this.fetchCard(snapshotCard.topic, snapshotCard.difficulty,
        [snapshotCard, ...avoidList], { force: true });
      if (!newCard) throw new Error('fresh generation returned no card');
    } catch (error) {
      if (this.currentCard === snapshotCard && this.sessionCards[snapshotIndex] !== snapshotCard) {
        this.sessionCards[snapshotIndex] = snapshotCard;
      }
      this._announceRegenerate('Fresh generation is unavailable right now — please try again.', true);
      return;
    } finally {
      this._regenerating = false;
      if (button) {
        button.disabled = false;
        button.textContent = '🔄 Regenerate';
      }
    }
    if (this.sessionIndex < this.sessionCards.length) this.sessionCards[this.sessionIndex] = newCard;
    this.currentCard = newCard;
    this.showCard();
    this._regenerated = true;
    this._announceRegenerate('');
  },

  _announceRegenerate(message, isError = false) {
    try {
      let el = document.getElementById('regenerate-status');
      if (!el) {
        el = document.createElement('span');
        el.id = 'regenerate-status';
        el.setAttribute('role', 'status');
        const button = document.getElementById('regenerate-btn');
        if (button && button.parentNode) {
          button.parentNode.insertBefore(el, button.nextSibling);
        } else if (document.body) {
          document.body.appendChild(el);
        }
      }
      el.textContent = message;
      el.style.color = isError ? '#e53935' : '';
    } catch (_) {
      // announcement is best-effort; never break regeneration over DOM issues
    }
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
    Render.diagram(card, 'diagram-container', { reveal: false });
  },

  /* Toggle the compare view: all four options' wirings overlaid, color-coded
     with a legend. Off again → back to the chosen-vs-correct highlight. */
  showCompareDiagram() {
    this._compareMode = !this._compareMode;
    const card = this.currentCard;
    if (!card) return;
    if (this._compareMode) {
      Render.diagram(card, 'diagram-container', { reveal: true, compare: true });
    } else {
      Render.diagram(card, 'diagram-container', {
        reveal: true,
        option: (card.options || []).find(option => option.id === this._selectedId)
      });
    }
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

    // try to use the prefetched card for next session slot, unless that slot is
    // a due review or retry (their SRS ledger entry / failure is what triggers
    // their re-service)
    if (this._nextCard) {
      const nextIdx = this.sessionIndex;
      if (nextIdx < this.sessionCards.length && !this.sessionCards[nextIdx]?.review && !this.sessionCards[nextIdx]?.retry) {
        this.sessionCards[nextIdx] = this._nextCard;
      } else if (nextIdx >= this.sessionCards.length) {
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
    const total = this._studiedCardIds().size;
    const mastered = Object.keys(this.profile.topicScores).filter(t => this.isTopicMastered(t)).length;
    const totalTopics = this._studiedTopics().size;
    const statsEl = document.getElementById('stats-global');
    if (statsEl) {
      statsEl.innerHTML = `
        <strong>Overall Progress</strong><br>
        Cards: ${total} studied, ${this.profile.totalAnswered} answered, ${Math.round(100 * this.profile.totalCorrect / Math.max(1, this.profile.totalAnswered))}% correct<br>
        Topics: ${mastered} / ${totalTopics} mastered (${Math.round(100 * mastered / totalTopics)}%)<br>
        Sessions: ${this.profile.totalSessions}<br>
        Best streak: ${this.profile.streaks.best} days
      `;
    }
    this.showScreen('stats');
    this.drawRadarChart();
  },

  renderStudyCalendar() {
    const el = document.getElementById('study-calendar');
    if (!el) return;
    if (typeof el.replaceChildren === 'function') el.replaceChildren();
    else el.innerHTML = '';
    const today = new Date();
    const dayMs = 86400000;
    // count reviews on each calendar day from the persisted review timestamps,
    // covering every reviewed card (generated and seed alike)
    const reviewsByDay = {};
    for (const review of Object.values(this.profile.cardHistory)) {
      if (!review || typeof review !== 'object') continue;
      const key = new Date(review._createdAt || Date.now()).toISOString().split('T')[0];
      reviewsByDay[key] = (reviewsByDay[key] || 0) + 1;
    }

    const makeElement = (className, text = '') => {
      const node = document.createElement('span');
      node.className = className;
      node.textContent = text;
      return node;
    };
    const weekCount = 53;
    const end = new Date(today.getFullYear(), today.getMonth(), today.getDate() + (6 - today.getDay()));
    const start = new Date(end.getTime() - (weekCount * 7 - 1) * dayMs);
    const shell = document.createElement('div');
    shell.className = 'study-calendar-shell';

    const weekdays = document.createElement('div');
    weekdays.className = 'study-calendar-weekdays';
    ['', 'Mon', '', 'Wed', '', 'Fri', ''].forEach(label => weekdays.appendChild(makeElement('', label)));
    shell.appendChild(weekdays);

    const main = document.createElement('div');
    main.className = 'study-calendar-main';
    const months = document.createElement('div');
    months.className = 'study-calendar-months';
    const days = document.createElement('div');
    days.className = 'study-calendar-days';
    days.setAttribute('role', 'grid');

    for (let week = 0; week < weekCount; week++) {
      const weekStart = new Date(start.getTime() + week * 7 * dayMs);
      const previousWeekStart = new Date(start.getTime() + (week - 1) * 7 * dayMs);
      const monthLabel = weekStart.toLocaleDateString(undefined, { month: 'short' });
      const month = makeElement('', week === 0 || weekStart.getMonth() !== previousWeekStart.getMonth() ? monthLabel : '');
      month.style.gridColumn = String(week + 1);
      months.appendChild(month);

      for (let day = 0; day < 7; day++) {
        const date = new Date(weekStart.getTime() + day * dayMs);
        const key = date.toISOString().split('T')[0];
        const reviewsOnDay = reviewsByDay[key] || 0;
        const level = date > today ? 'is-future' : reviewsOnDay === 0 ? 'level-0' : reviewsOnDay === 1 ? 'level-1' : reviewsOnDay <= 2 ? 'level-2' : reviewsOnDay <= 4 ? 'level-3' : 'level-4';
        const cell = makeElement(`study-calendar-cell ${level}`);
        cell.title = `${key}: ${reviewsOnDay} review${reviewsOnDay === 1 ? '' : 's'}`;
        cell.setAttribute('role', 'gridcell');
        cell.setAttribute('aria-label', cell.title);
        days.appendChild(cell);
      }
    }

    main.appendChild(months);
    main.appendChild(days);
    shell.appendChild(main);
    el.appendChild(shell);
  },

  renderMasteryChart() {
    const el = document.getElementById('mastery-chart');
    if (!el) return;
    const topics = [...this._studiedTopics()];
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

    // topic coverage heatmap over the studied set (seed + reviewed cards)
    const heatEl = document.getElementById('coverage-heatmap');
    if (!heatEl) return;
    heatEl.innerHTML = '<h2>Coverage Heatmap</h2><div class="heatmap">';
    for (const t of topics) {
      const cardsInTopic = [...this._studiedCardIds()].filter(id => {
        const card = this._resolveCardContent(id);
        return card && card.topic === t;
      }).length;
      const level = cardsInTopic <= 2 ? 'low' : cardsInTopic <= 4 ? 'med' : 'high';
      const colors = { low: '#ffcdd2', med: '#fff9c4', high: '#c8e6c9', mastered: '#a5d6a7' };
      const mastered = this.isTopicMastered(t);
      const color = mastered ? colors.mastered : colors[level];
      const label = topicLabels[t] || t;
      heatEl.innerHTML += `<div class="heatmap-cell" style="background:${color}" title="${label}: ${cardsInTopic} cards${mastered ? ' ✓mastered' : ''}">${label}</div>`;
    }
    heatEl.innerHTML += '<div class="heatmap-label">Topic coverage by studied card count & mastery</div></div>';
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
    { id: 'deck-explorer', label: 'Card Explorer', desc: 'Review 25 distinct cards', check: () => Object.keys(this.profile.cardHistory).length >= 25 }
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

  /* URL routing: every screen has its own address (#/search, #/wiki, ...).
     The hash is the source of truth for navigation; direct links, refresh,
     and the browser back/forward buttons all restore the right screen. */

  _currentRoute() {
    const match = String(window.location.hash || '').match(/^#\/([\w-]+)/);
    return match && SCREEN_ROUTES.includes(match[1]) ? match[1] : null;
  },

  _navigate(path) {
    const target = '#/' + path;
    if ((window.location.hash || '') !== target) {
      window.location.hash = target;
    }
  },

  _syncScreen(route) {
    if (this._currentRoute() !== route) this._navigate(route);
  },

  _handleHashChange() {
    let route = this._currentRoute() || 'welcome';
    if ((route === 'session' || route === 'session-end') && this.sessionCards.length === 0) {
      route = 'welcome';
    }
    this.showScreen(route);
    if (route === 'wiki') {
      const topicMatch = String(window.location.hash || '').match(/^#\/wiki\/([\w-]+)/);
      const topic = topicMatch ? decodeURIComponent(topicMatch[1]) : Object.keys(WIKI || {})[0];
      this.showWiki(topic);
    } else if (route === 'welcome') {
      this.renderDeckStats();
    } else if (route === 'create') {
      this.showCreateCard();
    } else if (route === 'search') {
      this.filterCards();
    } else if (route === 'bookmarks') {
      this.renderBookmarks();
    } else if (route === 'learning-path') {
      this.showLearningPath();
    } else if (route === 'stats') {
      this.showStats();
    } else if (route === 'history') {
      this.showHistory();
    }
  },

  showScreen(id) {
    document.querySelectorAll('.screen').forEach(el => el.classList.add('hidden'));
    const el = document.getElementById('screen-' + id);
    if (el) el.classList.remove('hidden');
    // Supabase's implicit OAuth response lives in the hash. Keep it intact
    // until the Supabase client has consumed it instead of replacing it with
    // the app's normal #/welcome route.
    if (SCREEN_ROUTES.includes(id) && !isOAuthCallbackHash()) this._syncScreen(id);
    window.scrollTo?.(0, 0);
  },

  renderDeckStats() {
    const total = this._studiedCardIds().size;
    const reviewed = Object.keys(this.profile.cardHistory).length;
    const due = this._dueReviewCount();

    const statTotal = document.getElementById('stat-total');
    if (statTotal) statTotal.textContent = total;
    const statReviewed = document.getElementById('stat-reviewed');
    if (statReviewed) statReviewed.textContent = reviewed;
    const statDue = document.getElementById('stat-due');
    if (statDue) statDue.textContent = due;
    const statStreak = document.getElementById('stat-streak');
    if (statStreak) statStreak.textContent = this.profile.streaks.current;
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
    const topics = [...this._studiedTopics()];
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

  /* Session-end mistake review: cards answered wrong in this session, with
     the correct answer and explanation. Retried cards that were answered
     correctly on the retry are excluded. */
  _mistakesHtml() {
    const mistakes = this.sessionCards.filter(card => this._sessionResults?.[card.id] === false);
    if (!mistakes.length) return '';
    return '<h2>Review your mistakes</h2>' + mistakes.map(card => `
      <details class="mistake-item" style="background:var(--card-bg);border-radius:6px;margin:4px 0;border-left:3px solid var(--danger);padding:8px;">
        <summary style="font-size:0.8rem;"><strong>${this._escapeHtml(card.topic)}</strong>: ${this._escapeHtml(String(card.scenario || '').substring(0, 90))}…</summary>
        <p style="font-size:0.8rem;margin:6px 0 0;">The answer was <strong>${this._escapeHtml(card.correct)}</strong> — ${this._escapeHtml(card.explanation)}</p>
      </details>`).join('');
  },

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
    html += this._mistakesHtml();
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

  /* ——— Concept Wiki ——— */

  _escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  },

  showWiki(topic) {
    this.renderWikiSidebar();
    this.openWiki(topic || Object.keys(WIKI || {})[0] || '');
    this.showScreen('wiki');
  },

  renderWikiSidebar() {
    const sidebar = document.getElementById('wiki-sidebar');
    if (!sidebar) return;
    const active = this._activeWikiTopic || '';
    const entries = Object.values(WIKI || {}).sort((a, b) => a.title.localeCompare(b.title));
    sidebar.innerHTML = entries.map(entry =>
      `<button class="wiki-topic${entry.topic === active ? ' active' : ''}" data-topic="${this._escapeHtml(entry.topic)}" onclick="APP.openWiki('${this._escapeHtml(entry.topic)}')">${this._escapeHtml(entry.title)}</button>`
    ).join('');
  },

  /* Lazy wiki: fetch a missing entry from /api/wiki, merge it into WIKI so
     the sidebar and links pick it up, and return it. */
  async _ensureWiki(topic) {
    if ((WIKI || {})[topic]) return WIKI[topic];
    const response = await fetch(`${SERVER_BASE}/api/wiki?topic=${encodeURIComponent(topic)}`, { headers: apiHeaders() });
    if (response.status === 429) {
      const quotaBody = await response.json().catch(() => ({}));
      if (quotaBody.code === 'quota_exceeded') this.showQuotaNotice('wiki');
      throw new Error(`wiki fetch failed with ${response.status}`);
    }
    if (!response.ok) throw new Error(`wiki fetch failed with ${response.status}`);
    const entry = await response.json();
    if (!entry || !entry.topic || entry.topic !== topic) throw new Error('wiki server returned an invalid entry');
    WIKI[topic] = entry;
    return entry;
  },

  openWiki(topic) {
    const el = document.getElementById('wiki-content');
    if (!el) return;
    this._activeWikiTopic = topic;
    this._navigate('wiki/' + encodeURIComponent(topic));
    document.querySelectorAll('.wiki-topic').forEach(button =>
      button.classList.toggle('active', button.dataset.topic === topic)
    );
    el.innerHTML = '<p>Loading wiki entry…</p>';
    this._ensureWiki(topic)
      .then(entry => {
        el.innerHTML = this._wikiEntryHtml(entry);
        this.renderWikiSidebar();
      })
      .catch(error => {
        console.error('Wiki render failed for', topic, error);
        el.innerHTML = `<p>No wiki entry yet for ${this._escapeHtml(formatPrerequisiteLabel(topic))}.</p>`;
      });
  },

  async openWikiModal(topic) {
    const modal = document.getElementById('wiki-modal');
    const body = document.getElementById('wiki-modal-body');
    if (!modal || !body) return;
    body.innerHTML = '<p>Loading wiki entry…</p>';
    modal.classList.remove('hidden');
    try {
      const entry = await this._ensureWiki(topic);
      body.innerHTML = this._wikiEntryHtml(entry);
      this.renderWikiSidebar();
    } catch (error) {
      console.error('Wiki render failed for', topic, error);
      body.innerHTML = `<p>Wiki entry not available yet for ${this._escapeHtml(formatPrerequisiteLabel(topic))}.</p>`;
    }
  },

  closeWikiModal() {
    const modal = document.getElementById('wiki-modal');
    if (modal) modal.classList.add('hidden');
  },

  /* Inline know-first link: opens the wiki modal. The name is first resolved
     against existing concepts via cheap matching so "Database" / "Databases"
     land on the same entry; unresolved concepts are still clickable — the
     entry is generated lazily (or shown as unavailable if the server cannot
     produce it). */
  _wikiLink(topic) {
    const canonical = matchWikiTopic(topic) || normalizeConceptName(topic);
    const entry = (WIKI || {})[canonical];
    const open = `event.stopPropagation();APP.openWikiModal('${this._escapeHtml(canonical)}')`;
    const label = this._escapeHtml(entry ? entry.title : formatPrerequisiteLabel(canonical));
    return `<span class="wiki-link${entry ? '' : ' wiki-link-pending'}" role="link" tabindex="0" data-topic="${this._escapeHtml(canonical)}" onclick="${open}" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();${open}}">${label}</span>`;
  },

  _wikiEntryHtml(entry) {
    const related = (entry.related_topics || [])
      .map(t => this._wikiLink(t))
      .join('');
    return `
      <h2>${this._escapeHtml(entry.title)}</h2>
      <p class="wiki-summary">${this._escapeHtml(entry.summary)}</p>
      <h3>Why it matters</h3>
      <p>${this._escapeHtml(entry.why_it_matters)}</p>
      <h3>Key points</h3>
      <ul>${(entry.key_points || []).map(point => `<li>${this._escapeHtml(point)}</li>`).join('')}</ul>
      <h3>Common pitfalls</h3>
      <ul>${(entry.common_pitfalls || []).map(pitfall => `<li>${this._escapeHtml(pitfall)}</li>`).join('')}</ul>
      ${related ? `<h3>Related concepts</h3><div class="wiki-related">${related}</div>` : ''}`;
  },

  /* ——— Radar Chart (Canvas) ——— */

  drawRadarChart() {
    const canvas = document.getElementById('radar-canvas');
    if (!canvas) return;
    const ctx = typeof canvas.getContext === 'function' ? canvas.getContext('2d') : null;
    if (!ctx) return;
    const availableWidth = canvas.parentElement?.clientWidth || 300;
    const size = Math.max(220, Math.min(360, availableWidth - 24));
    canvas.width = size;
    canvas.height = size;
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
      const score = Math.max(0, Math.min(1, Number(this.getTopicScore(t)) || 0));
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
      const savedCards = Array.isArray(state.cards) ? state.cards : [];
      const savedIndex = Number.isInteger(state.index) ? state.index : 0;
      let resumeIndex = 0;
      const cards = [];
      savedCards.forEach((candidate, index) => {
        const card = normalizeCardPrerequisites(candidate);
        if (!hasUsableCorrectOptionWiring(card)
            || hasDegenerateLinearOptionTopology(card)) return;
        if (index < savedIndex) resumeIndex++;
        cards.push(card);
      });
      if (!cards.length || resumeIndex >= cards.length) {
        localStorage.removeItem('sdf_resume');
        return false;
      }
      this.sessionCards = cards;
      this.sessionIndex = resumeIndex;
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
  },

  /* ——— Feedback ——— */

  openFeedbackModal() {
    const modal = document.getElementById('feedback-modal');
    if (!modal) return;
    modal.classList.remove('hidden');
    const titleEl = document.getElementById('feedback-title');
    if (titleEl) titleEl.focus();
    loadFeedbackConfig().then(() => renderTurnstile());
  },

  closeFeedbackModal() {
    const modal = document.getElementById('feedback-modal');
    if (!modal) return;
    modal.classList.add('hidden');
    const status = document.getElementById('feedback-status');
    if (status) status.textContent = '';
    resetTurnstile(true);
  },

  async submitFeedback(event) {
    if (event?.preventDefault) event.preventDefault();
    const titleEl = document.getElementById('feedback-title');
    const textEl = document.getElementById('feedback-text');
    const statusEl = document.getElementById('feedback-status');
    const submitEl = document.getElementById('feedback-submit');
    if (!titleEl || !textEl || !statusEl) return false;
    const title = (titleEl.value || '').trim();
    const details = (textEl.value || '').trim();
    if (!title || !details) {
      statusEl.textContent = 'Please fill in both a title and details.';
      statusEl.style.color = 'var(--danger)';
      return false;
    }
    if (feedbackSiteKey && !turnstileToken) {
      statusEl.textContent = 'Complete the verification challenge before submitting.';
      statusEl.style.color = 'var(--danger)';
      return false;
    }
    if (submitEl) {
      submitEl.disabled = true;
      submitEl.textContent = 'Submitting...';
    }
    statusEl.textContent = '';
    try {
      const category = document.getElementById('feedback-category')?.value || 'other';
      const contact = document.getElementById('feedback-contact')?.value || '';
      const response = await fetch(`${SERVER_BASE}/api/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category,
          title,
          details,
          contact,
          pagePath: window.location.pathname || '/',
          userId: getOrCreateDeviceId(),
          turnstileToken
        })
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        statusEl.textContent = body.error || 'Could not submit feedback. Please try again.';
        statusEl.style.color = 'var(--danger)';
        return false;
      }
      statusEl.textContent = body.issueUrl
        ? 'Thanks — your feedback was filed as an issue in the project repo.'
        : 'Thanks — your feedback was recorded and will be reviewed.';
      statusEl.style.color = 'var(--success)';
      titleEl.value = '';
      textEl.value = '';
      resetTurnstile(false);
      return true;
    } catch (_) {
      statusEl.textContent = 'Network error — check your connection and try again.';
      statusEl.style.color = 'var(--danger)';
      return false;
    } finally {
      if (submitEl) {
        submitEl.disabled = false;
        submitEl.textContent = 'Submit';
      }
    }
  },

  /* ——— Accounts & Pro ——— */

  signInGithub() {
    if (!supabaseClient) return;
    supabaseClient.auth.signInWithOAuth({ provider: 'github', redirectTo: getOAuthRedirectUrl() });
  },

  signOut() {
    if (supabaseClient) supabaseClient.auth.signOut();
  },

  async upgradeToPro() {
    const banner = document.getElementById('upgrade-banner');
    if (!currentSession?.access_token) {
      if (banner) {
        banner.classList.remove('hidden');
        banner.innerHTML = '🔑 Sign in first, then upgrade.';
      }
      return;
    }
    try {
      const response = await fetch(`${SERVER_BASE}/api/billing/checkout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${currentSession.access_token}` }
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'checkout failed');
      window.location.href = body.url;
    } catch (_) {
      if (banner) {
        banner.classList.remove('hidden');
        banner.innerHTML = 'Could not start checkout. Please try again.';
      }
    }
  },

  showQuotaNotice(kind) {
    const banner = document.getElementById('upgrade-banner');
    if (!banner) return;
    banner.classList.remove('hidden');
    banner.innerHTML = kind === 'cards'
      ? '📊 Daily card limit reached — <button class="btn btn-sm btn-primary" onclick="APP.upgradeToPro()">Upgrade to Pro</button> for unlimited cards.'
      : '📖 Daily wiki limit reached — <button class="btn btn-sm btn-primary" onclick="APP.upgradeToPro()">Upgrade to Pro</button> for unlimited entries.';
  }
};

// Boot
document.addEventListener('DOMContentLoaded', () => APP.init());
