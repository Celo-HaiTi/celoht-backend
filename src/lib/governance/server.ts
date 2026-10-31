import "server-only";
import { createPublicClient, defineChain, http } from "viem";
import { ConfigurationError, getConfig } from "@/lib/config";
import {
  CELOHT_GOVERNANCE_ADDRESS,
  CELO_SEPOLIA_CHAIN_ID,
} from "./contract";

const celoSepolia = defineChain({
  id: CELO_SEPOLIA_CHAIN_ID,
  name: "Celo Sepolia",
  nativeCurrency: { name: "CELO", symbol: "CELO", decimals: 18 },
  rpcUrls: { default: { http: ["https://forno.celo-sepolia.celo-testnet.org"] } },
});

let cachedClient: ReturnType<typeof createPublicClient> | null = null;

export function getGovernancePublicClient() {
  if (cachedClient) return cachedClient;
  const config = getConfig();
  if (config.CELO_CHAIN_ID !== CELO_SEPOLIA_CHAIN_ID) {
    throw new ConfigurationError("Governance is available only on Celo Sepolia.", ["CELO_CHAIN_ID"]);
  }
  cachedClient = createPublicClient({
    chain: celoSepolia,
    transport: http(config.CELO_RPC_URL, {
      timeout: config.CELO_RPC_TIMEOUT_MS,
      retryCount: config.CELO_RPC_RETRIES,
    }),
  });
  return cachedClient;
}

export async function assertOfficialGovernanceDeployment() {
  const client = getGovernancePublicClient();
  const [chainId, bytecode] = await Promise.all([
    client.getChainId(),
    client.getCode({ address: CELOHT_GOVERNANCE_ADDRESS }),
  ]);
  if (chainId !== CELO_SEPOLIA_CHAIN_ID || !bytecode || bytecode === "0x") {
    throw new ConfigurationError(
      "The configured RPC does not serve the verified CeloHT Governance deployment on Celo Sepolia.",
      ["CELO_RPC_URL", "CELO_CHAIN_ID"]
    );
  }
  return client;
}