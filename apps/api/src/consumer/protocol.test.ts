import assert from 'node:assert/strict';
import test from 'node:test';
import { protocolContracts } from './protocol.js';

const contract = 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAATYON';

test('protocol contracts are selected only for the authenticated network', () => {
  const env = {
    OYNK_VAULT_TESTNET: contract,
    OYNK_POOL_TESTNET: contract,
    OYNK_ORCHESTRATOR_TESTNET: contract,
    OYNK_PROVIDER_REGISTRY_TESTNET: contract,
  };
  assert.deepEqual(protocolContracts('TESTNET', env), { vault: contract, pool: contract, orchestrator: contract, providerRegistry: contract });
  assert.throws(() => protocolContracts('PUBLIC', env), /not configured/);
});
