import { StrKey } from '@stellar/stellar-sdk';
import type { Identity } from './auth.js';

export type ProtocolContracts = {
  vault: string;
  pool: string;
  orchestrator: string;
  providerRegistry: string;
};

const fields = {
  TESTNET: ['OYNK_VAULT_TESTNET', 'OYNK_POOL_TESTNET', 'OYNK_ORCHESTRATOR_TESTNET', 'OYNK_PROVIDER_REGISTRY_TESTNET'],
  PUBLIC: ['OYNK_VAULT_PUBLIC', 'OYNK_POOL_PUBLIC', 'OYNK_ORCHESTRATOR_PUBLIC', 'OYNK_PROVIDER_REGISTRY_PUBLIC'],
} as const;

/**
 * Read the configured Soroban deployment for the authenticated account's
 * network. Empty configuration fails closed; it must never route a consumer
 * request to a different network or to an EVM contract.
 */
export function protocolContracts(network: Identity['network'], env: NodeJS.ProcessEnv = process.env): ProtocolContracts {
  const [vaultKey, poolKey, orchestratorKey, registryKey] = fields[network];
  const values = [env[vaultKey], env[poolKey], env[orchestratorKey], env[registryKey]];
  if (values.some(value => !value)) throw new Error(`Soroban ${network} protocol contracts are not configured.`);
  if (values.some(value => !StrKey.isValidContract(value!))) throw new Error(`Soroban ${network} protocol contract configuration is invalid.`);
  return { vault: values[0]!, pool: values[1]!, orchestrator: values[2]!, providerRegistry: values[3]! };
}
