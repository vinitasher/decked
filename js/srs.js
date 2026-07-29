/* Enhanced Spaced Repetition (FSRS-inspired) with confidence grading */

const SRS = {
  /* Default retention target — can be customized per profile */
  DEFAULT_RETENTION: 0.85,

  /* Grade a card based on confidence (1=difficult, 2=good, 3=easy, 4=perfect) */
  gradeCard(confidence) {
    // confidence 1-4 → score 0-1
    return (confidence - 1) / 3;
  },

  /* Calculate next interval using FSRS-inspired formula:
     Interval = stability × (1 + (retention - 0.5) × 2) × difficulty_factor */
  nextInterval(grade, stability, difficulty) {
    if (grade <= 0) return 0.25; // failed: review again in 6 hours
    const retentionBonus = 1 + (this.DEFAULT_RETENTION - 0.5) * 2;
    const dif = Math.max(0.3, Math.min(1, difficulty));
    const interval = stability * retentionBonus * (0.5 + dif * 0.5);
    return Math.round(interval * 10) / 10;
  },

  /* Update stability and difficulty from grade */
  nextState(grade, prevStability, prevDifficulty) {
    const s = Math.max(0.1, prevStability || 0);
    const d = prevDifficulty || 0.5;

    if (grade <= 0) {
      // failure: stability drops, difficulty increases slightly
      return {
        stability: Math.max(0.1, s * 0.3),
        difficulty: Math.min(1, d + 0.05)
      };
    }

    // success: stability grows, difficulty decreases slightly if easy
    const growth = 1 + grade * 1.5;
    return {
      stability: s * growth,
      difficulty: Math.max(0.2, d - 0.03 * grade)
    };
  },

  /* Determine if a card is due based on stability */
  isDue(state, now = Date.now()) {
    return state.nextReviewAt <= now;
  },

  /* Fresh state for a never-reviewed card */
  freshReview() {
    return {
      stability: 0.25,
      difficulty: 0.5,
      interval: 0,
      nextReviewAt: Date.now(),
      timesReviewed: 0,
      timesCorrect: 0,
      confidenceSum: 0,
      lastConfidence: null
    };
  },

  /* Convert confidence level to display label */
  confidenceLabel(c) {
    return ['', 'Difficult', 'Good', 'Easy', 'Perfect'][c] || 'Unknown';
  }
};
