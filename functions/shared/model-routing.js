/* Reviewed model routing for generated flashcard content. */

export const PRIMARY_MODEL = 'gpt-5.6-luna';
export const FALLBACK_MODEL = 'deepseek-v4-flash';
export const API_MODEL_SEQUENCE = [PRIMARY_MODEL, FALLBACK_MODEL];
export const CARD_MODEL_SEQUENCE = [
  PRIMARY_MODEL,
  FALLBACK_MODEL,
  FALLBACK_MODEL,
  FALLBACK_MODEL
];
export const CLI_MODEL_SEQUENCE = [
  PRIMARY_MODEL,
  `opencode-go/${FALLBACK_MODEL}`
];
