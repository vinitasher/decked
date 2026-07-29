/* Spaced Repetition Engine (SM-2 variant for multi-option decisions) */

const SRS = {
  /* Calculate next interval in days based on correctness and ease */
  nextInterval(correct, ease, prevInterval) {
    if (!correct) return 0.5; // review again in 12 hours
    if (prevInterval === 0) return 1;
    if (prevInterval === 1) return 3;
    return Math.round(prevInterval * ease);
  },

  /* Update ease factor (min 1.3) */
  nextEase(correct, ease) {
    if (!correct) return Math.max(1.3, ease - 0.2);
    return Math.min(3.0, ease + 0.15);
  },

  /* Score from 0-1 to rate this card review */
  gradeCard(correct, responseTimeMs) {
    let base = correct ? 1.0 : 0.0;
    // bonus for fast correct answers
    if (correct && responseTimeMs < 5000) base += 0.1;
    if (correct && responseTimeMs < 15000) base += 0.05;
    return Math.min(1.0, base);
  },

  /* Determine if a card is due for review now */
  isDue(review, now = Date.now()) {
    return review.nextReviewAt <= now;
  },

  /* Compute the default review state for a fresh card */
  freshReview() {
    return {
      ease: 2.5,
      interval: 0,
      nextReviewAt: Date.now(),
      timesReviewed: 0,
      timesCorrect: 0,
      lastResponseTime: null
    };
  }
};
