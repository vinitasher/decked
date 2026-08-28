/* Schema and prompt for generated Concept Sandbox definitions.
 *
 * Provider output is data only. The browser owns the simulator, equations,
 * limits, and trace renderer; this module intentionally accepts no executable
 * fields or provider-authored formulas.
 */

export const GENERATED_SANDBOX_SCHEMA_VERSION = 1;
export const GENERATED_SANDBOX_MODEL_KIND = 'bounded-pressure';
export const GENERATED_SANDBOX_TOPIC_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const GENERATED_SANDBOX_MAX_TOPIC_LENGTH = 80;

export const GENERATED_SANDBOX_CONTROL_SPECS = Object.freeze({
  arrivalRate: Object.freeze({ min: 1, max: 100000, step: 1, unit: 'req/s', default: 1000 }),
  capacity: Object.freeze({ min: 10, max: 200000, step: 10, unit: 'work/s', default: 10000 }),
  workMultiplier: Object.freeze({ min: 1, max: 10, step: 0.1, unit: 'x', default: 1 }),
  absorptionRate: Object.freeze({ min: 0, max: 100, step: 1, unit: '%', default: 50 }),
  retryRate: Object.freeze({ min: 0, max: 100, step: 1, unit: '%', default: 0 }),
  skew: Object.freeze({ min: 0, max: 100, step: 1, unit: '%', default: 0 })
});

/* The learner questions are application vocabulary. The provider may choose
   which questions fit a concept and write the copy, but it cannot invent a
   new signal or turn a generated definition into a free-form simulator. */
export const GENERATED_SANDBOX_PROBLEM_SPECS = Object.freeze({
  'keep-up': Object.freeze({
    label: 'Keep up with demand',
    evidenceKeys: Object.freeze(['offeredWorkRps', 'effectiveWorkRps', 'effectiveCapacityRps', 'backlogWork'])
  }),
  'protect-latency': Object.freeze({
    label: 'Protect user-visible latency',
    evidenceKeys: Object.freeze(['estimatedP95LatencyMs', 'utilizationPct', 'backlogWork', 'effectiveWorkRps'])
  }),
  'avoid-amplification': Object.freeze({
    label: 'Avoid pressure amplification',
    evidenceKeys: Object.freeze(['retryWorkRps', 'offeredWorkRps', 'effectiveWorkRps', 'backlogWork'])
  }),
  'find-concentration': Object.freeze({
    label: 'Find concentrated pressure',
    evidenceKeys: Object.freeze(['skew', 'effectiveCapacityRps', 'utilizationPct', 'backlogWork'])
  })
});
export const GENERATED_SANDBOX_PROBLEM_IDS = Object.freeze(Object.keys(GENERATED_SANDBOX_PROBLEM_SPECS));

const PREDICTION_IDS = Object.freeze(['healthy', 'watch', 'stress']);
const CONTROL_KEYS = Object.freeze(Object.keys(GENERATED_SANDBOX_CONTROL_SPECS));
const TEXT_RE = /[\u0000-\u001f\u007f]/;
const UNSAFE_TEXT_RE = /<[^>]*>|(?:javascript:|https?:\/\/)|\b(?:function|return|eval)\b|=>/i;
const ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function cleanText(value, field, min, max) {
  if (typeof value !== 'string') throw new Error(`Invalid field: ${field}`);
  const text = value.trim();
  if (text.length < min || text.length > max || TEXT_RE.test(text) || UNSAFE_TEXT_RE.test(text)) {
    throw new Error(`Invalid field: ${field}`);
  }
  return text;
}

function finiteNumber(value, field) {
  if ((typeof value !== 'number' && typeof value !== 'string')
      || (typeof value === 'string' && !value.trim())) {
    throw new Error(`Invalid field: ${field}`);
  }
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`Invalid field: ${field}`);
  return number;
}

function decimalPlaces(step) {
  const text = String(step);
  return text.includes('.') ? text.split('.')[1].length : 0;
}

function normalizeControlValue(value, key, field) {
  const spec = GENERATED_SANDBOX_CONTROL_SPECS[key];
  const number = finiteNumber(value, field);
  if (number < spec.min || number > spec.max) throw new Error(`Invalid field: ${field}`);
  const rounded = Number(number.toFixed(decimalPlaces(spec.step)));
  const steps = Math.round((rounded - spec.min) / spec.step);
  const stepped = Number((spec.min + steps * spec.step).toFixed(decimalPlaces(spec.step)));
  if (Math.abs(rounded - stepped) > 1e-8) throw new Error(`Invalid field: ${field}`);
  return stepped;
}

function normalizeControls(rawControls) {
  if (!Array.isArray(rawControls) || rawControls.length < 3 || rawControls.length > 5) {
    throw new Error('Invalid field: controls');
  }
  const keys = new Set();
  const controls = rawControls.map((raw, index) => {
    if (!raw || typeof raw !== 'object' || !CONTROL_KEYS.includes(raw.key) || keys.has(raw.key)) {
      throw new Error(`Invalid field: controls[${index}]`);
    }
    keys.add(raw.key);
    const spec = GENERATED_SANDBOX_CONTROL_SPECS[raw.key];
    return {
      key: raw.key,
      label: cleanText(raw.label, `controls[${index}].label`, 2, 60),
      unit: spec.unit,
      advanced: Boolean(raw.advanced)
    };
  });
  if (!keys.has('arrivalRate') || !keys.has('capacity')) {
    throw new Error('Controls must include arrivalRate and capacity');
  }
  return controls;
}

function normalizeSituations(rawSituations, controls) {
  if (!Array.isArray(rawSituations) || rawSituations.length !== 5) {
    throw new Error('Invalid field: situations');
  }
  const controlKeys = controls.map(control => control.key);
  const ids = new Set();
  return rawSituations.map((raw, index) => {
    if (!raw || typeof raw !== 'object' || raw.level !== index + 1
        || typeof raw.id !== 'string' || !ID_RE.test(raw.id) || ids.has(raw.id)) {
      throw new Error(`Invalid field: situations[${index}]`);
    }
    ids.add(raw.id);
    if (!raw.values || typeof raw.values !== 'object' || Array.isArray(raw.values)) {
      throw new Error(`Invalid field: situations[${index}].values`);
    }
    const values = {};
    const valueKeys = Object.keys(raw.values);
    if (valueKeys.length !== controlKeys.length || valueKeys.some(key => !controlKeys.includes(key))) {
      throw new Error(`Invalid field: situations[${index}].values`);
    }
    for (const key of controlKeys) {
      values[key] = normalizeControlValue(raw.values[key], key, `situations[${index}].values.${key}`);
    }
    return {
      id: raw.id,
      label: cleanText(raw.label, `situations[${index}].label`, 2, 60),
      level: index + 1,
      description: cleanText(raw.description, `situations[${index}].description`, 20, 220),
      objective: cleanText(raw.objective, `situations[${index}].objective`, 20, 220),
      focusProblemId: raw.focusProblemId,
      values
    };
  });
}

function normalizeLearnerProblems(rawProblems, controls) {
  if (!Array.isArray(rawProblems) || rawProblems.length < 3 || rawProblems.length > GENERATED_SANDBOX_PROBLEM_IDS.length) {
    throw new Error('Invalid field: learnerProblems');
  }
  const ids = new Set();
  return rawProblems.map((raw, index) => {
    if (!raw || typeof raw !== 'object' || !GENERATED_SANDBOX_PROBLEM_IDS.includes(raw.id) || ids.has(raw.id)) {
      throw new Error(`Invalid field: learnerProblems[${index}]`);
    }
    ids.add(raw.id);
    const allowedEvidence = GENERATED_SANDBOX_PROBLEM_SPECS[raw.id].evidenceKeys;
    if (!Array.isArray(raw.evidenceKeys) || raw.evidenceKeys.length < 2 || raw.evidenceKeys.length > 3) {
      throw new Error(`Invalid field: learnerProblems[${index}].evidenceKeys`);
    }
    const evidenceKeys = [...new Set(raw.evidenceKeys)];
    if (evidenceKeys.length !== raw.evidenceKeys.length
        || evidenceKeys.some(key => !allowedEvidence.includes(key))) {
      throw new Error(`Invalid field: learnerProblems[${index}].evidenceKeys`);
    }
    if (evidenceKeys.includes('skew') && !controls.some(control => control.key === 'skew')) {
      throw new Error(`Invalid field: learnerProblems[${index}].evidenceKeys`);
    }
    return {
      id: raw.id,
      question: cleanText(raw.question, `learnerProblems[${index}].question`, 25, 180),
      explanation: cleanText(raw.explanation, `learnerProblems[${index}].explanation`, 30, 220),
      evidenceKeys
    };
  });
}

function normalizeSituationFocus(rawSituations, learnerProblems) {
  const problemIds = new Set(learnerProblems.map(problem => problem.id));
  return rawSituations.map((situation, index) => {
    if (!problemIds.has(situation.focusProblemId)) {
      throw new Error(`Invalid field: situations[${index}].focusProblemId`);
    }
    return { ...situation, focusProblemId: situation.focusProblemId };
  });
}

function normalizePredictionOptions(rawOptions) {
  if (!Array.isArray(rawOptions) || rawOptions.length !== PREDICTION_IDS.length) {
    throw new Error('Invalid field: predictionOptions');
  }
  return PREDICTION_IDS.map(id => {
    const raw = rawOptions.find(option => option?.id === id);
    if (!raw) throw new Error(`Missing prediction option: ${id}`);
    return { id, label: cleanText(raw.label, `predictionOptions.${id}.label`, 8, 120) };
  });
}

function normalizeAssumptions(rawAssumptions) {
  if (!Array.isArray(rawAssumptions) || rawAssumptions.length < 3 || rawAssumptions.length > 6) {
    throw new Error('Invalid field: assumptions');
  }
  return rawAssumptions.map((assumption, index) =>
    cleanText(assumption, `assumptions[${index}]`, 20, 240)
  );
}

/* Validate and canonicalize a provider response. Only the returned fields are
   allowed into KV or the browser; unknown provider fields are discarded. */
export function normalizeGeneratedSandboxDefinition(raw, topic) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('Generated sandbox must be an object');
  }
  if (typeof topic !== 'string' || !GENERATED_SANDBOX_TOPIC_RE.test(topic)
      || topic.length > GENERATED_SANDBOX_MAX_TOPIC_LENGTH) {
    throw new Error('Invalid topic');
  }
  if (raw.topic !== topic) throw new Error(`Invalid field: topic must be ${topic}`);

  const controls = normalizeControls(raw.controls);
  const learnerProblems = normalizeLearnerProblems(raw.learnerProblems, controls);
  const situations = normalizeSituationFocus(normalizeSituations(raw.situations, controls), learnerProblems);
  return {
    schemaVersion: GENERATED_SANDBOX_SCHEMA_VERSION,
    modelKind: GENERATED_SANDBOX_MODEL_KIND,
    generated: true,
    id: `generated-${topic}`,
    topic,
    label: cleanText(raw.label, 'label', 2, 60),
    description: cleanText(raw.description, 'description', 30, 260),
    predictionQuestion: cleanText(raw.predictionQuestion, 'predictionQuestion', 20, 180),
    controls,
    learnerProblems,
    situations,
    predictionOptions: normalizePredictionOptions(raw.predictionOptions),
    assumptions: normalizeAssumptions(raw.assumptions)
  };
}

export function buildGeneratedSandboxPrompt(topic) {
  return `Create a bounded educational system-design experiment for the concept "${topic}". Return ONLY JSON. Do not return JavaScript, formulas, code, HTML, URLs, vendor capacity claims, or arbitrary fields. The application owns the simulator and will use your response only as labels, explanations, and bounded numeric examples.

Return exactly this shape:
{
  "topic": "${topic}",
  "label": "short display label",
  "description": "30-260 character explanation of the pressure relationship",
  "predictionQuestion": "the question the learner should answer before running",
  "learnerProblems": [{"id":"keep-up|protect-latency|avoid-amplification|find-concentration","question":"the learner-facing question","explanation":"why this question matters","evidenceKeys":["allowed signal key"]}],
  "controls": [{"key":"arrivalRate|capacity|workMultiplier|absorptionRate|retryRate|skew","label":"concept-specific label","advanced":false}],
  "situations": [{"id":"level-one","label":"short name","level":1,"description":"what changed","objective":"what the learner should notice","focusProblemId":"keep-up","values":{"arrivalRate":1000,"capacity":10000}}],
  "predictionOptions": [{"id":"healthy","label":"..."},{"id":"watch","label":"..."},{"id":"stress","label":"..."}],
  "assumptions": ["plain-text assumption"]
}

Rules:
- Include exactly 3-5 controls, including arrivalRate and capacity. You may add workMultiplier, absorptionRate, retryRate, and/or skew. Use each key at most once.
- Include exactly 3 or 4 learnerProblems. Choose only these IDs: keep-up, protect-latency, avoid-amplification, find-concentration. Every problem needs a 2-3 sentence question/explanation and 2-3 evidenceKeys chosen only from its fixed allowlist: keep-up=[offeredWorkRps,effectiveWorkRps,effectiveCapacityRps,backlogWork]; protect-latency=[estimatedP95LatencyMs,utilizationPct,backlogWork,effectiveWorkRps]; avoid-amplification=[retryWorkRps,offeredWorkRps,effectiveWorkRps,backlogWork]; find-concentration=[skew,effectiveCapacityRps,utilizationPct,backlogWork].
- Use exactly five situations with levels 1, 2, 3, 4, and 5. Every situation must provide values for every selected control. Keep values within these fixed ranges: arrivalRate 1-100000 req/s; capacity 10-200000 work/s; workMultiplier 1-10; absorptionRate 0-100%; retryRate 0-100%; skew 0-100%.
- Every situation must set focusProblemId to one of the selected learnerProblems. Use the focus to make the situation answer one concrete design question.
- The three prediction IDs must be exactly healthy, watch, and stress. Make their labels describe increasing modeled pressure, not a guaranteed production outcome.
- Explain the concept in system-design terms and use honest educational assumptions. Do not claim that the output is a benchmark or capacity recommendation.
- Keep all text plain, concise, and safe to display. Do not include markup or control characters.`;
}
