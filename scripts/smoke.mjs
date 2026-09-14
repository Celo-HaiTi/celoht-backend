const required = [
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "AUTH_SESSION_SECRET",
  "CELO_NETWORK",
  "CELO_CHAIN_ID",
  "CELO_RPC_URL",
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN",
];

const missing = required.filter((name) => !process.env[name]);
if (missing.length > 0) {
  console.error(`BLOCKED: missing required smoke configuration: ${missing.join(", ")}`);
  process.exit(2);
}

const timeoutMs = Number(process.env.CELO_RPC_TIMEOUT_MS ?? 5000);
const backendUrl = (process.env.BACKEND_URL ?? "http://localhost:3000").replace(/\/$/, "");
const checks = [];

function record(name, passed, detail = "") {
  checks.push({ name, passed, detail });
  console.log(`${passed ? "PASS" : "FAIL"} ${name}${detail ? `: ${detail}` : ""}`);
}

async function request(url, init = {}, requestTimeoutMs = timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), requestTimeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function rpc(method, params = []) {
  const response = await request(process.env.CELO_RPC_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method, params }),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const body = await response.json();
  if (body.error) throw new Error(body.error.message ?? "JSON-RPC error");
  return body.result;
}

async function run() {
  record("Celo network configuration", process.env.CELO_NETWORK === "celoSepolia", process.env.CELO_NETWORK);

  try {
    const chainId = await rpc("eth_chainId");
    const expected = `0x${Number(process.env.CELO_CHAIN_ID).toString(16)}`;
    record("Celo Sepolia chain ID", chainId === expected, `${chainId} (expected ${expected})`);
  } catch (error) {
    record("Celo Sepolia RPC connectivity", false, error.message);
  }

  try {
    const block = await rpc("eth_blockNumber");
    record("Celo latest block", /^0x[0-9a-f]+$/i.test(block), block);
  } catch (error) {
    record("Celo latest block", false, error.message);
  }

  const serviceHeaders = {
    apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
  };
  try {
    const response = await request(`${process.env.SUPABASE_URL}/rest/v1/system_health?select=id&limit=1`, {
      headers: serviceHeaders,
    });
    record("Supabase service-role database access", response.ok, `HTTP ${response.status}`);
  } catch (error) {
    record("Supabase service-role database access", false, error.message);
  }

  try {
    const response = await request(`${process.env.SUPABASE_URL}/rest/v1/system_health?select=id&limit=1`, {
      headers: {
        apikey: process.env.SUPABASE_ANON_KEY,
        Authorization: `Bearer ${process.env.SUPABASE_ANON_KEY}`,
      },
    });
    record("Supabase RLS denies anonymous health-table access", response.status === 401 || response.status === 403, `HTTP ${response.status}`);
  } catch (error) {
    record("Supabase RLS denies anonymous health-table access", false, error.message);
  }

  try {
    const response = await request(process.env.UPSTASH_REDIS_REST_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(["EVAL", "local count = redis.call('INCR', KEYS[1]); redis.call('PEXPIRE', KEYS[1], ARGV[1]); return count", 1, `celoht:smoke:${Date.now()}`, 10000]),
    });
    record("Shared rate-limit store", response.ok, `HTTP ${response.status}`);
  } catch (error) {
    record("Shared rate-limit store", false, error.message);
  }

  try {
    const response = await request(`${backendUrl}/api/v1/health`);
    record("Backend readiness", response.status === 200, `HTTP ${response.status}`);
  } catch (error) {
    record("Backend readiness", false, error.message);
  }

  try {
    const response = await request(`${backendUrl}/api/v1/profile`);
    record("Protected endpoint rejects unauthenticated request", response.status === 401 || response.status === 403, `HTTP ${response.status}`);
  } catch (error) {
    record("Protected endpoint rejects unauthenticated request", false, error.message);
  }

  if (process.env.SMOKE_WALLET_ADDRESS) {
    try {
      const response = await request(`${backendUrl}/api/v1/auth/nonce`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ walletAddress: process.env.SMOKE_WALLET_ADDRESS }),
      });
      record("Wallet nonce issuance", response.status === 200, `HTTP ${response.status}`);
    } catch (error) {
      record("Wallet nonce issuance", false, error.message);
    }
  }

  const failures = checks.filter((check) => !check.passed);
  if (failures.length > 0) {
    console.error(`\nNOT READY: ${failures.length} smoke check(s) failed.`);
    process.exitCode = 1;
  } else {
    console.log("\nSmoke checks passed for the configured infrastructure.");
  }
}

run().catch((error) => {
  console.error(`NOT READY: smoke runner failed: ${error.message}`);
  process.exitCode = 1;
});
