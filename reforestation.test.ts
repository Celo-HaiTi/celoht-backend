import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ContributionReceiptSchema,
  EvidenceDecisionSchema,
  PlantingEvidenceSubmissionSchema,
} from "./reforestation";
import { verifySepoliaReceipt } from "./reforestationContributions";
import { POST as submitEvidence } from "./route (15)";
import { GET as getReviewQueue } from "./route (4)";

const configMock = vi.hoisted(() => {
  class ConfigurationError extends Error {}
  return { ConfigurationError, getConfig: vi.fn() };
});
const routeMocks = vi.hoisted(() => {
  class AuthError extends Error {
    constructor(public code: "unauthenticated" | "unauthorized", message: string) {
      super(message);
    }
  }
  return {
    AuthError,
    requireActor: vi.fn(),
    requireRole: vi.fn(),
    getServiceRoleClient: vi.fn(),
    writeAuditLog: vi.fn(),
  };
});

vi.mock("@/lib/config", () => ({
  ConfigurationError: configMock.ConfigurationError,
  getConfig: configMock.getConfig,
}));
vi.mock("@/lib/auth/authorization", () => ({
  AuthError: routeMocks.AuthError,
  requireActor: routeMocks.requireActor,
  requireRole: routeMocks.requireRole,
}));
vi.mock("@/lib/supabase/server", () => ({ getServiceRoleClient: routeMocks.getServiceRoleClient }));
vi.mock("@/lib/audit", () => ({ writeAuditLog: routeMocks.writeAuditLog }));

function rpcResult(result: unknown): Response {
  return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result }), { status: 200 });
}

describe("reforestation schemas", () => {
  it("requires a positive tree count before planting evidence can be verified", () => {
    expect(EvidenceDecisionSchema.safeParse({
      evidenceId: "2a2a2a2a-2a2a-42a2-82a2-2a2a2a2a2a2a",
      decision: "verified",
    }).success).toBe(false);
    expect(EvidenceDecisionSchema.safeParse({
      evidenceId: "2a2a2a2a-2a2a-42a2-82a2-2a2a2a2a2a2a",
      decision: "verified",
      treesVerified: 1,
    }).success).toBe(true);
  });

  it("rejects invalid coordinates, future planting dates, and malformed transaction references", () => {
    expect(PlantingEvidenceSubmissionSchema.safeParse({
      projectId: "2a2a2a2a-2a2a-42a2-82a2-2a2a2a2a2a2a",
      plantingDate: "2099-01-01",
      latitude: 91,
      longitude: -72,
      storagePaths: ["agent/file.jpg"],
    }).success).toBe(false);
    expect(ContributionReceiptSchema.safeParse({
      projectId: "2a2a2a2a-2a2a-42a2-82a2-2a2a2a2a2a2a",
      transactionHash: "0x1234",
    }).success).toBe(false);
  });
});

describe("reforestation access control", () => {
  beforeEach(() => {
    routeMocks.requireActor.mockResolvedValue({
      profileId: "profile-1",
      walletAddress: `0x${"a".repeat(40)}`,
      role: "user",
    });
    routeMocks.requireRole.mockImplementation((actor, roles) => {
      if (!roles.includes(actor.role)) {
        throw new routeMocks.AuthError("unauthorized", "Insufficient role.");
      }
    });
  });

  afterEach(() => vi.clearAllMocks());

  it("prevents a regular user from submitting planting evidence", async () => {
    const request = new Request("https://backend.example/api/v1/reforestation/evidence", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });

    const response = await submitEvidence(request as never);

    expect(response.status).toBe(403);
    expect(routeMocks.getServiceRoleClient).not.toHaveBeenCalled();
  });

  it("prevents a regular user from accessing the private review queue", async () => {
    const response = await getReviewQueue(new Request("https://backend.example/api/v1/admin/evidence") as never);

    expect(response.status).toBe(403);
    expect(routeMocks.getServiceRoleClient).not.toHaveBeenCalled();
  });
});

describe("Celo Sepolia receipt verification", () => {
  beforeEach(() => {
    configMock.getConfig.mockReturnValue({
      CELO_RPC_URL: "https://rpc.example",
      CELO_RPC_TIMEOUT_MS: 1000,
      CELO_CONFIRMATIONS: 3,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("confirms only a successful receipt with the configured confirmation depth", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(rpcResult("0xaa044c"))
      .mockResolvedValueOnce(rpcResult({
        transactionHash: `0x${"a".repeat(64)}`,
        status: "0x1",
        blockNumber: "0x10",
      }))
      .mockResolvedValueOnce(rpcResult("0x12"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(verifySepoliaReceipt(`0x${"a".repeat(64)}`)).resolves.toBe("confirmed");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("rejects a receipt obtained from a network other than Celo Sepolia", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(rpcResult("0x1"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(verifySepoliaReceipt(`0x${"a".repeat(64)}`)).resolves.toBe("wrong_chain");
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("does not confirm a missing receipt", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(rpcResult("0xaa044c"))
      .mockResolvedValueOnce(rpcResult(null));
    vi.stubGlobal("fetch", fetchMock);

    await expect(verifySepoliaReceipt(`0x${"a".repeat(64)}`)).resolves.toBe("pending");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("marks reverted transactions as failed", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(rpcResult("0xaa044c"))
      .mockResolvedValueOnce(rpcResult({
        transactionHash: `0x${"a".repeat(64)}`,
        status: "0x0",
        blockNumber: "0x10",
      }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(verifySepoliaReceipt(`0x${"a".repeat(64)}`)).resolves.toBe("reverted");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});