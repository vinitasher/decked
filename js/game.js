/* Game rules: turn recorded learner events into XP, stars, quests, and the
   recommended next concept. Everything here is pure and DOM-free so the rules
   can be tested in Node. APP calls these functions at the points where it
   already records answers, sandbox runs, and concept opens.

   See PRDs/gamified-learning-loop.md for the product contract. */

const GAME_VERSION = 1;
const GAME_RETENTION_DAYS = 14;

const GAME_XP = Object.freeze({
  correctAnswerPerDifficulty: 10,
  incorrectAnswer: 2,
  correctPrediction: 15,
  situationPerLevel: 10,
  quest: 50,
  boss: 250
});

/* Quest pool. Each quest advances on one event type. `short` quests can be
   finished in under three minutes; every day includes at least one. */
const GAME_QUESTS = Object.freeze([
  { id: 'finish-session', label: 'Finish a practice session', event: 'session', target: 1, short: false, action: 'session' },
  { id: 'correct-5', label: 'Answer 5 cards correctly', event: 'correct', target: 5, short: false, action: 'session' },
  { id: 'combo-3', label: 'Get 3 correct answers in a row', event: 'combo3', target: 1, short: true, action: 'session' },
  { id: 'clear-situation', label: 'Clear a sandbox situation with a correct prediction', event: 'situation', target: 1, short: true, action: 'concept' },
  { id: 'predict-3', label: 'Make 3 correct sandbox predictions', event: 'prediction', target: 3, short: false, action: 'concept' },
  { id: 'new-star', label: 'Earn a star on a new concept', event: 'newStar', target: 1, short: true, action: 'concept' }
]);

function gameToday(now = Date.now()) {
  return new Date(now).toISOString().slice(0, 10);
}

function _gameDayOffset(date, days) {
  const parsed = Date.parse(`${date}T00:00:00Z`);
  if (!Number.isFinite(parsed)) return date;
  return new Date(parsed + days * 86400000).toISOString().slice(0, 10);
}

function _isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function _nonNegative(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

const _DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const _TOPIC_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function emptyGameState() {
  return {
    version: GAME_VERSION,
    xp: { total: 0, byDay: {} },
    awarded: {},
    stars: {},
    readTopics: [],
    clearedSituations: {},
    correctByTopic: {},
    quests: { date: null, items: [] },
    bosses: {},
    customConcepts: [],
    rematches: [],
    backfilled: false
  };
}

/* Coerce any stored value into a valid, bounded game state. Unknown keys are
   dropped and malformed values reset, so a corrupt profile can never break the
   dashboard. */
function normalizeGameState(value) {
  const base = emptyGameState();
  if (!_isPlainObject(value)) return base;
  const xp = _isPlainObject(value.xp) ? value.xp : {};
  base.xp.total = _nonNegative(xp.total);
  if (_isPlainObject(xp.byDay)) {
    for (const [date, amount] of Object.entries(xp.byDay)) {
      if (_DATE_RE.test(date) && _nonNegative(amount)) base.xp.byDay[date] = _nonNegative(amount);
    }
  }
  if (_isPlainObject(value.awarded)) {
    for (const [key, date] of Object.entries(value.awarded)) {
      if (typeof key === 'string' && key.length <= 200 && _DATE_RE.test(date)) base.awarded[key] = date;
    }
  }
  if (_isPlainObject(value.stars)) {
    for (const [topic, stars] of Object.entries(value.stars)) {
      const count = Math.min(3, Math.floor(_nonNegative(stars)));
      if (_TOPIC_RE.test(topic) && count > 0) base.stars[topic] = count;
    }
  }
  if (Array.isArray(value.readTopics)) {
    base.readTopics = [...new Set(value.readTopics.filter(topic => typeof topic === 'string' && _TOPIC_RE.test(topic)))];
  }
  if (_isPlainObject(value.clearedSituations)) {
    for (const [modelId, levels] of Object.entries(value.clearedSituations)) {
      if (typeof modelId !== 'string' || !Array.isArray(levels)) continue;
      const clean = [...new Set(levels.filter(level => Number.isInteger(level) && level >= 1 && level <= 5))].sort();
      if (clean.length) base.clearedSituations[modelId] = clean;
    }
  }
  if (_isPlainObject(value.correctByTopic)) {
    for (const [topic, count] of Object.entries(value.correctByTopic)) {
      if (_TOPIC_RE.test(topic) && _nonNegative(count)) base.correctByTopic[topic] = Math.floor(_nonNegative(count));
    }
  }
  if (_isPlainObject(value.quests) && _DATE_RE.test(value.quests.date) && Array.isArray(value.quests.items)) {
    const known = new Map(GAME_QUESTS.map(quest => [quest.id, quest]));
    base.quests = {
      date: value.quests.date,
      items: value.quests.items
        .filter(item => _isPlainObject(item) && known.has(item.id))
        .slice(0, 3)
        .map(item => {
          const quest = known.get(item.id);
          const progress = Math.min(quest.target, Math.floor(_nonNegative(item.progress)));
          return { id: quest.id, progress, target: quest.target, done: progress >= quest.target };
        })
    };
  }
  if (_isPlainObject(value.bosses)) base.bosses = JSON.parse(JSON.stringify(value.bosses));
  if (Array.isArray(value.customConcepts)) {
    base.customConcepts = value.customConcepts
      .filter(item => _isPlainObject(item) && _TOPIC_RE.test(item.topic))
      .slice(0, 200)
      .map(item => ({ topic: item.topic, addedAt: typeof item.addedAt === 'string' ? item.addedAt : null }));
  }
  if (Array.isArray(value.rematches)) base.rematches = value.rematches.slice(0, 50);
  base.backfilled = value.backfilled === true;
  return base;
}

/* Drop daily XP and award keys older than the retention window. Lifetime XP
   is stored, never recomputed, so pruning cannot lower it. */
function pruneGameState(game, today = gameToday()) {
  const cutoff = _gameDayOffset(today, -(GAME_RETENTION_DAYS - 1));
  for (const date of Object.keys(game.xp.byDay)) {
    if (date < cutoff) delete game.xp.byDay[date];
  }
  for (const [key, date] of Object.entries(game.awarded)) {
    if (date < cutoff) delete game.awarded[key];
  }
  return game;
}

function comboMultiplier(consecutiveCorrect) {
  const streak = Number(consecutiveCorrect) || 0;
  if (streak >= 5) return 2;
  if (streak >= 3) return 1.5;
  return 1;
}

/* XP for one recorded event, before any once-per-event check. */
function xpForEvent(event = {}) {
  switch (event.type) {
    case 'answer': {
      if (!event.correct) return GAME_XP.incorrectAnswer;
      const difficulty = Math.min(5, Math.max(1, Math.round(Number(event.difficulty) || 1)));
      return Math.round(GAME_XP.correctAnswerPerDifficulty * difficulty * comboMultiplier(event.consecutiveCorrect));
    }
    case 'prediction':
      return event.correct ? Math.round(GAME_XP.correctPrediction * comboMultiplier(event.consecutiveCorrect)) : 0;
    case 'situation': {
      const level = Math.min(5, Math.max(1, Math.round(Number(event.level) || 1)));
      return GAME_XP.situationPerLevel * level;
    }
    case 'quest':
      return GAME_XP.quest;
    case 'boss':
      return GAME_XP.boss;
    default:
      return 0;
  }
}

/* Award XP once per stable event key. Returns the XP actually added (0 when
   the key was already awarded inside the retention window). */
function awardGameXp(game, key, amount, today = gameToday()) {
  const xp = Math.max(0, Math.round(Number(amount) || 0));
  if (!key || xp <= 0 || game.awarded[key]) return 0;
  game.awarded[key] = today;
  game.xp.total += xp;
  game.xp.byDay[today] = (game.xp.byDay[today] || 0) + xp;
  pruneGameState(game, today);
  return xp;
}

function xpToday(game, today = gameToday()) {
  return game.xp.byDay[today] || 0;
}

function xpThisWeek(game, today = gameToday()) {
  let total = 0;
  for (let offset = 0; offset < 7; offset++) {
    total += game.xp.byDay[_gameDayOffset(today, -offset)] || 0;
  }
  return total;
}

/* Stars for a concept from what the learner has done with it:
   1 = explanation opened, 2 = sandbox situations 1-3 cleared with a correct
   prediction on any model for the concept, 3 = all five cleared and at least
   two correct drill answers on the topic. */
function deriveConceptStars({ read = false, clearedLevelSets = [], correctDrills = 0 } = {}) {
  const hasLevels = levels => clearedLevelSets.some(set => levels.every(level => set.includes(level)));
  const tested = hasLevels([1, 2, 3]);
  const allCleared = hasLevels([1, 2, 3, 4, 5]);
  if (allCleared && correctDrills >= 2) return 3;
  if (tested) return 2;
  if (read || correctDrills > 0) return 1;
  return 0;
}

/* Stars never go down: store the best of stored and derived. Returns the
   previous and new values so the caller can detect a newly earned star. */
function updateConceptStars(game, topic, derived) {
  if (!_TOPIC_RE.test(topic)) return { previous: 0, stars: 0 };
  const previous = game.stars[topic] || 0;
  const stars = Math.max(previous, Math.min(3, Math.max(0, derived | 0)));
  if (stars > 0) game.stars[topic] = stars;
  return { previous, stars };
}

function _hashString(value) {
  let hash = 2166136261;
  for (const char of String(value)) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/* Three quests for a UTC day, chosen only from the date and the learner's
   identity so they match across reloads and devices. At least one is short. */
function dailyQuestIds(date, seed = '') {
  const ranked = GAME_QUESTS
    .map(quest => ({ quest, rank: _hashString(`${date}|${seed}|${quest.id}`) }))
    .sort((a, b) => a.rank - b.rank || a.quest.id.localeCompare(b.quest.id))
    .map(item => item.quest);
  const picked = ranked.slice(0, 3);
  if (!picked.some(quest => quest.short)) {
    picked[2] = ranked.find(quest => quest.short);
  }
  return picked.map(quest => quest.id);
}

function ensureDailyQuests(game, today = gameToday(), seed = '') {
  if (game.quests.date === today && game.quests.items.length === 3) return game.quests;
  game.quests = {
    date: today,
    items: dailyQuestIds(today, seed).map(id => {
      const quest = GAME_QUESTS.find(item => item.id === id);
      return { id, progress: 0, target: quest.target, done: false };
    })
  };
  return game.quests;
}

function questDefinition(id) {
  return GAME_QUESTS.find(quest => quest.id === id) || null;
}

/* Advance today's quests for one event. Completed quests award quest XP once.
   Returns the quests completed by this event. */
function advanceQuests(game, eventType, amount = 1, today = gameToday(), seed = '') {
  ensureDailyQuests(game, today, seed);
  const completed = [];
  for (const item of game.quests.items) {
    const quest = questDefinition(item.id);
    if (!quest || item.done || quest.event !== eventType) continue;
    item.progress = Math.min(item.target, item.progress + Math.max(0, amount | 0));
    if (item.progress >= item.target) {
      item.done = true;
      const xp = awardGameXp(game, `quest:${today}:${item.id}`, xpForEvent({ type: 'quest' }), today);
      completed.push({ ...quest, xp });
    }
  }
  return completed;
}

/* Pick the concept to play next: prefer a concept already in progress, then a
   new concept whose prerequisites all have a star (or that has none), in the
   map's display order. Nothing is ever locked; this is only a highlight. */
function recommendNextConcept(orderedTopics = [], stars = {}, prerequisitesFor = () => []) {
  const starsOf = topic => stars[topic] || 0;
  const inProgress = orderedTopics.find(topic => starsOf(topic) > 0 && starsOf(topic) < 3);
  if (inProgress) return inProgress;
  const ready = orderedTopics.find(topic => starsOf(topic) === 0
    && (prerequisitesFor(topic) || []).every(prerequisite => starsOf(prerequisite) > 0 || !orderedTopics.includes(prerequisite)));
  return ready || orderedTopics.find(topic => starsOf(topic) < 3) || null;
}

/* One-time back-fill for profiles that predate the game: every topic with
   drill answers gets one star and its correct count, and existing correct
   answers become starting XP. Explanation opens and sandbox clears were never
   recorded per concept, so they cannot be back-filled. */
function backfillGameState(game, profile = {}, today = gameToday()) {
  if (game.backfilled) return game;
  const scores = _isPlainObject(profile.topicScores) ? profile.topicScores : {};
  const accuracy = _isPlainObject(profile.topicAccuracy) ? profile.topicAccuracy : {};
  for (const [topic, score] of Object.entries(scores)) {
    if (!_TOPIC_RE.test(topic) || !score || !(Number(score.cardsReviewed) > 0)) continue;
    updateConceptStars(game, topic, 1);
    const recentCorrect = Array.isArray(accuracy[topic])
      ? accuracy[topic].filter(entry => entry && entry.correct === true).length : 0;
    game.correctByTopic[topic] = Math.max(game.correctByTopic[topic] || 0, recentCorrect);
  }
  const startingXp = Math.floor(_nonNegative(profile.totalCorrect)) * GAME_XP.correctAnswerPerDifficulty;
  game.xp.total += startingXp;
  game.backfilled = true;
  pruneGameState(game, today);
  return game;
}
