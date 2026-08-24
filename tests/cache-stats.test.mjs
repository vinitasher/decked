import assert from 'node:assert/strict';
import test from 'node:test';

import { onRequest } from '../functions/api/cache-stats.js';

test('cache stats exclude identity-scoped profile keys', async () => {
  const response = await onRequest({
    env: {
      CARD_CACHE: {
        async list() {
          return { keys: [
            { name: 'caching:3' },
            { name: 'queues:2' },
            { name: 'profile:v1:dev:device-1' }
          ] };
        }
      }
    }
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    total: 2,
    byTopic: { caching: 1, queues: 1 }
  });
});
