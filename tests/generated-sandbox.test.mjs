import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';

const source = await readFile(new URL('../js/sandbox.js', import.meta.url), 'utf8');

function validDefinition() {
  return {
    schemaVersion: 1,
    modelKind: 'bounded-pressure',
    generated: true,
    id: 'generated-database-indexing',
    topic: 'database-indexing',
    label: 'Index pressure',
    description: 'Indexes trade write work and storage for faster lookups under a bounded request workload.',
    predictionQuestion: 'When does lookup demand outrun the modeled index-serving capacity?',
    controls: [
      { key: 'skew', label: 'Key-range skew', advanced: true },
      { key: 'arrivalRate', label: 'Lookup arrival rate', advanced: false },
      { key: 'capacity', label: 'Index-serving capacity', advanced: false },
      { key: 'retryRate', label: 'Retry rate', advanced: true }
    ],
    situations: [
      { id: 'steady-lookups', label: 'Steady lookups', level: 1, description: 'A stable lookup stream stays below the modeled index capacity.', objective: 'Find the headroom before pressure appears.', values: { skew: 0, arrivalRate: 1000, capacity: 10000, retryRate: 0 } },
      { id: 'busy-lookups', label: 'Busy lookups', level: 2, description: 'More clients arrive while the index capacity stays fixed.', objective: 'Connect arrival rate to utilization.', values: { skew: 0, arrivalRate: 5000, capacity: 10000, retryRate: 0 } },
      { id: 'retrying-lookups', label: 'Retrying lookups', level: 3, description: 'A transient failure causes a portion of lookup work to retry.', objective: 'Notice that retries add work to the same path.', values: { skew: 0, arrivalRate: 5000, capacity: 10000, retryRate: 20 } },
      { id: 'skewed-range', label: 'Skewed range', level: 4, description: 'A concentrated key range sends more work to one representative partition.', objective: 'Compare aggregate capacity with concentrated pressure.', values: { skew: 60, arrivalRate: 5000, capacity: 10000, retryRate: 0 } },
      { id: 'saturated-index', label: 'Saturated index', level: 5, description: 'A high lookup rate and retries push effective demand beyond capacity.', objective: 'Predict the backlog before running the model.', values: { skew: 60, arrivalRate: 20000, capacity: 10000, retryRate: 20 } }
    ],
    predictionOptions: [
      { id: 'healthy', label: 'The modeled path keeps comfortable headroom' },
      { id: 'watch', label: 'The modeled path is nearing a pressure boundary' },
      { id: 'stress', label: 'The modeled path develops backlog and stress' }
    ],
    assumptions: [
      'The request rate is a bounded teaching input, not a production capacity claim.',
      'Capacity is represented by one effective work budget for the modeled path.',
      'Retries are additional work and do not include a vendor-specific backoff policy.'
    ]
  };
}

function createContext() {
  const context = {};
  vm.createContext(context);
  vm.runInContext(`${source}
globalThis.validateGeneratedSandboxDefinitionForTest = validateGeneratedSandboxDefinition;
globalThis.createGeneratedSandboxModelForTest = createGeneratedSandboxModel;
globalThis.registerGeneratedSandboxModelForTest = registerGeneratedSandboxModel;
globalThis.getSandboxNodeForTest = getSandboxNode;
globalThis.simulateSandboxNodeForTest = simulateSandboxNode;
globalThis.modelsForTest = SANDBOX_NODE_MODELS;`, context);
  return context;
}

test('generated sandbox validation canonicalizes the fixed data contract', () => {
  const context = createContext();
  const input = validDefinition();
  input.controls[1].unit = 'provider-claimed-unit';
  input.extraFormula = 'arrivalRate * capacity';
  const normalized = context.validateGeneratedSandboxDefinitionForTest(input, 'database-indexing');
  const expected = { ...input };
  delete expected.extraFormula;
  expected.controls = input.controls.map(control => ({
    key: control.key,
    label: control.label,
    unit: { skew: '%', arrivalRate: 'req/s', capacity: 'work/s', retryRate: '%' }[control.key],
    advanced: Boolean(control.advanced)
  }));

  assert.deepEqual(JSON.parse(JSON.stringify(normalized)), expected);
  assert.equal(normalized.extraFormula, undefined);
});

test('generated sandbox validation rejects executable fields, unknown controls, and malformed values', () => {
  const context = createContext();
  const cases = [
    definition => { definition.controls[0].key = 'formula'; },
    definition => { definition.situations[0].values.extra = 1; },
    definition => { definition.situations[0].values.capacity = 10.5; },
    definition => { definition.situations[0].values.capacity = true; },
    definition => { definition.situations[4].level = 4; },
    definition => { definition.assumptions = ['short']; },
    definition => { definition.simulator = 'return input'; }
  ];
  for (const mutate of cases) {
    const definition = validDefinition();
    mutate(definition);
    if (definition.simulator) {
      delete definition.simulator;
      definition.controls[0].key = 'formula';
    }
    assert.throws(
      () => context.validateGeneratedSandboxDefinitionForTest(definition, 'database-indexing'),
      /Invalid generated sandbox|Invalid field|needs arrivalRate|Missing generated sandbox/
    );
  }
});

test('generated model uses the app-owned deterministic pressure simulator', () => {
  const context = createContext();
  const model = context.createGeneratedSandboxModelForTest(validDefinition());
  const baseline = model.simulate(model.situations[0].values);
  const baselineAgain = model.simulate(model.situations[0].values);
  const pressure = model.simulate(model.situations[4].values);

  assert.equal(model.generated, true);
  assert.equal(model.id, 'generated-database-indexing');
  assert.equal(model.metrics[0].key, 'arrivalRate', 'mandatory input metrics stay visible even if AI changes control order');
  assert.equal(model.metrics[1].key, 'capacity');
  assert.equal(JSON.stringify(baseline), JSON.stringify(baselineAgain));
  assert.equal(baseline.status, 'healthy');
  assert.equal(pressure.status, 'stress');
  assert.equal(pressure.primaryRisk, 'capacity');
  assert.equal(pressure.simulation, undefined);
  assert.equal(model.diagram(pressure).stages.length, 3);
  assert.equal(model.diagram(pressure).outcomes.length, 3);
  assert.equal(model.predictionBucket(model.situations[4].values), 'stress');
  assert.equal(model.normalize({ arrivalRate: -1, capacity: 999999, skew: 140, retryRate: 'bad' }).arrivalRate, 1);
  assert.equal(model.normalize({ arrivalRate: -1, capacity: 999999, skew: 140, retryRate: 'bad' }).capacity, 200000);
});

test('generated model registration replaces the same topic and never collides with reviewed models', () => {
  const context = createContext();
  const first = context.registerGeneratedSandboxModelForTest(validDefinition());
  const replacementDefinition = validDefinition();
  replacementDefinition.label = 'Replacement pressure';
  const replacement = context.registerGeneratedSandboxModelForTest(replacementDefinition);

  assert.equal(first.id, replacement.id);
  assert.equal(context.modelsForTest.filter(model => model.id === first.id).length, 1);
  assert.equal(context.getSandboxNodeForTest(first.id).label, 'Generated · Replacement pressure');
});
