import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import {
  GETAdminAgentApplications,
  GETAgentActivity,
  GETAgentDirectory,
  GETAgentDirectoryProfile,
  PATCHAgentDirectoryProfile,
  PATCHAgentService,
  POSTAgentService,
  POSTAdminAgentDecision,
} from "./agentNetworkRoutes";
import { POST as submitApplication, GET as getMyApplication } from "./route (5)";
import { POST as submitKyc } from "./route (6)";
import { GET as getAdminKyc } from "./route (3)";

const ids = {
  agent: "11111111-1111-4111-8111-111111111111",
  service: "22222222-2222-4222-8222-222222222222",
  agentProfile: "33333333-3333-4333-8333-333333333333",
};

const mocks = vi.hoisted(() => {
  class AuthError extends Error {
    constructor(public code: "unauthenticated" | "unauthorized", message: string) {
      super(message);
    }
  }

  return {
    AuthError,
    requireActor: vi.fn(),
    requireRole: vi.fn(),
    checkRateLimit: vi.fn(),
    writeAuditLog: vi.fn(),
    from: vi.fn(),
    responses: {} as Record<string, Array<{ data: unknown; error: { code?: string } | null }>>,
    writes: [] as Array<{ table: string; kind: string; value: unknown }>,
    filters: [] as string[],
    storageUpload: vi.fn(),
    storageRemove: vi.fn(),
    storageSignedUrl: vi.fn(),
    storageBucket: vi.fn(),
  };
});

vi.mock("@/lib/auth/authorization", () => ({
  AuthError: mocks.AuthError,
  requireActor: mocks.requireActor,
  requireRole: mocks.requireRole,
}));
vi.mock("@/lib/audit", () => ({ writeAuditLog: mocks.writeAuditLog }));
vi.mock("@/lib/rateLimit", () => ({ checkRateLimit: mocks.checkRateLimit }));
vi.mock("@/lib/supabase/server", () => ({
  getServiceRoleClient: () => ({
    from: mocks.from,
    storage: {
      from: (bucket: string) => {
        mocks.storageBucket(bucket);
        return {
          upload: mocks.storageUpload,
          remove: mocks.storageRemove,
          createSignedUrl: mocks.storageSignedUrl,
        };
      },
    },
  }),
}));

function queryFor(table: string) {
  const response = mocks.responses[table]?.shift() ?? { data: null, error: null };
  const query = {
    select: vi.fn(() => query),
    insert: vi.fn((value: unknown) => {
      mocks.writes.push({ table, kind: "insert", value });
      return query;
    }),
    update: vi.fn((value: unknown) => {
      mocks.writes.push({ table, kind: "update", value });
      return query;
    }),
    eq: vi.fn((column: string, value: unknown) => {
      mocks.filters.push(`${table}.${column}=${String(value)}`);
      return query;
    }),
    in: vi.fn((column: string, value: unknown[]) => {
      mocks.filters.push(`${table}.${column} in ${value.join(",")}`);
      return query;
    }),
    ilike: vi.fn((column: string, value: string) => {
      mocks.filters.push(`${table}.${column} ilike ${value}`);
      return query;
    }),
    not: vi.fn(() => query),
    order: vi.fn(() => query),
    range: vi.fn(async () => response),
    limit: vi.fn(() => query),
    maybeSingle: vi.fn(async () => response),
    single: vi.fn(async () => response),
    then: (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) =>
      Promise.resolve(response).then(resolve, reject),
  };
  return query;
}

function request(path: string, method = "GET", body?: unknown): NextRequest {
  return new NextRequest(`https://backend.example/api/v1${path}`, {
    method,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function agentRow(overrides: Record<string, unknown> = {}) {
  return {
    id: ids.agent,
    public_name: "Ajan Solèy",
    bio: "Community support",
    country_code: "HT",
    region: "Nord",
    locality: "Cap-Haitien",
    application_status: "approved",
    off_chain_kyc_status: "approved",
    on_chain_registry_status: "registered",
    directory_public: true,
    ...overrides,
  };
}

describe("agent network APIs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.responses = {};
    mocks.writes = [];
    mocks.filters = [];
    mocks.storageUpload.mockResolvedValue({ data: { path: "stored" }, error: null });
    mocks.storageRemove.mockResolvedValue({ data: [], error: null });
    mocks.storageSignedUrl.mockResolvedValue({ data: { signedUrl: "https://storage.example/private-document?signature=temporary" }, error: null });
    mocks.storageBucket.mockClear();
    mocks.requireActor.mockResolvedValue({
      profileId: "profile-id",
      walletAddress: `0x${"a".repeat(40)}`,
      role: "reviewer",
    });
    mocks.checkRateLimit.mockResolvedValue(false);
    mocks.writeAuditLog.mockResolvedValue(undefined);
    mocks.from.mockImplementation((table: string) => queryFor(table));
  });

  it("submits an off-chain application using the authenticated wallet", async () => {
    mocks.responses.agents = [{
      data: { id: ids.agent, application_status: "pending", off_chain_kyc_status: "pending", on_chain_registry_status: null },
      error: null,
    }];

    const response = await submitApplication(request("/agents", "POST", {
      publicProfile: {
        displayName: "Ajan Solèy",
        bio: "Community support",
        countryCode: "HT",
        region: "Nord",
        locality: "Cap-Haitien",
      },
      applicationData: { motivation: "I want to support my local community." },
    }));

    expect(response.status).toBe(201);
    const inserted = mocks.writes.find((write) => write.table === "agents")?.value as Record<string, unknown>;
    expect(inserted).toMatchObject({
      profile_id: "profile-id",
      wallet_address: `0x${"a".repeat(40)}`,
      public_name: "Ajan Solèy",
      country_code: "HT",
    });
    expect(inserted).not.toHaveProperty("on_chain_registry_status");
  });

  it("rejects client attempts to claim wallet or on-chain registration state", async () => {
    const response = await submitApplication(request("/agents", "POST", {
      publicProfile: {
        displayName: "Ajan Solèy",
        bio: "Community support",
        countryCode: "HT",
      },
      applicationData: { motivation: "I want to support my local community." },
      onChainRegistrationStatus: "registered",
    }));

    expect(response.status).toBe(422);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("returns only the caller's application status and profile", async () => {
    mocks.responses.agents = [{
      data: {
        id: ids.agent,
        application_data: { motivation: "Private application" },
        public_name: "Ajan Solèy",
        bio: "Community support",
        country_code: "HT",
        region: "Nord",
        locality: "Cap-Haitien",
        directory_public: false,
        application_status: "pending",
        off_chain_kyc_status: "pending",
        on_chain_registry_status: null,
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-01T00:00:00.000Z",
      },
      error: null,
    }];

    const response = await getMyApplication(request("/agents"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.applicationStatus).toBe("pending");
    expect(body.data.verificationStatus).toBe("not_submitted");
    expect(body.data.onChainRegistrationStatus).toBeNull();
    expect(mocks.filters).toContain("agents.profile_id=profile-id");
  });

  it("does not report approved KYC as verified without reviewer and timestamp", async () => {
    mocks.responses.agents = [{ data: {
      id: ids.agent,
      application_data: { motivation: "Private application" },
      public_name: "Ajan Solèy",
      application_status: "pending",
      off_chain_kyc_status: "approved",
      on_chain_registry_status: null,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    }, error: null }];
    mocks.responses.agent_kyc = [{ data: { status: "approved", reviewer_id: null, reviewed_at: null }, error: null }];

    const response = await getMyApplication(request("/agents"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.applicationStatus).toBe("pending");
    expect(body.data.verificationStatus).toBe("under_review");
  });

  it("updates only the caller's permitted directory profile fields", async () => {
    mocks.responses.agents = [
      { data: { id: ids.agent, application_status: "pending", off_chain_kyc_status: "pending", on_chain_registry_status: null }, error: null },
      { data: {
        id: ids.agent,
        public_name: "New name",
        bio: "New bio",
        country_code: "HT",
        region: "Nord",
        locality: "Cap-Haitien",
        directory_public: false,
      }, error: null },
    ];

    const response = await PATCHAgentDirectoryProfile(request("/agents", "PATCH", {
      displayName: "New name",
      bio: "New bio",
    }));
    const body = await response.json();
    const update = mocks.writes.find((write) => write.kind === "update")?.value as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(body.data.displayName).toBe("New name");
    expect(mocks.filters).toContain("agents.profile_id=profile-id");
    expect(update).toMatchObject({ public_name: "New name", bio: "New bio" });
    expect(update).not.toHaveProperty("on_chain_registry_status");
  });

  it("searches only published registered agents and labels verification from reviewed KYC", async () => {
    mocks.responses.agents = [{ data: [agentRow()], error: null }];
    mocks.responses.agent_kyc = [{
      data: [{ agent_id: ids.agent, status: "approved", reviewer_id: "reviewer-id", reviewed_at: "2026-01-02T00:00:00.000Z" }],
      error: null,
    }];
    mocks.responses.agent_services = [{
      data: [{
        id: ids.service,
        agent_id: ids.agent,
        service_category: "translation",
        name: "Kreyol support",
        description: "",
        is_available: true,
        availability: {},
      }],
      error: null,
    }];

    const response = await GETAgentDirectory(request("/agents/directory?search=Solèy&countryCode=HT"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data[0]).toMatchObject({
      id: ids.agent,
      verificationStatus: "verified",
      registrationStatus: "registered",
      services: [{ category: "translation", name: "Kreyol support" }],
    });
    expect(body.data[0]).not.toHaveProperty("applicationData");
    expect(mocks.filters).toContain("agents.application_status=approved");
    expect(mocks.filters).toContain("agents.on_chain_registry_status=registered");
    expect(mocks.filters).toContain("agents.country_code=HT");
  });

  it("filters the public directory by available service category", async () => {
    mocks.responses.agent_services = [
      { data: [{ agent_id: ids.agent }], error: null },
      { data: [{ id: ids.service, agent_id: ids.agent, service_category: "translation", name: "Kreyol support", description: "", is_available: true, availability: {} }], error: null },
    ];
    mocks.responses.agents = [{ data: [agentRow()], error: null }];
    mocks.responses.agent_kyc = [{ data: [], error: null }];

    const response = await GETAgentDirectory(request("/agents/directory?serviceCategory=translation"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toHaveLength(1);
    expect(mocks.filters).toContain("agent_services.service_category=translation");
    expect(mocks.filters).toContain("agent_services.is_available=true");
  });

  it("serves a public profile without exposing application or KYC records", async () => {
    mocks.responses.agents = [{ data: agentRow({ application_data: { motivation: "private" }, wallet_address: "0xprivate" }), error: null }];
    mocks.responses.agent_kyc = [{ data: [], error: null }];
    mocks.responses.agent_services = [{ data: [], error: null }];

    const response = await GETAgentDirectoryProfile(request(`/agents/directory/${ids.agent}`), {
      params: Promise.resolve({ agentId: ids.agent }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.verificationStatus).toBe("unverified");
    expect(body.data).not.toHaveProperty("applicationData");
    expect(body.data).not.toHaveProperty("walletAddress");
  });

  it("never labels an agent verified without an approved reviewer record", async () => {
    mocks.responses.agents = [{ data: [agentRow()], error: null }];
    mocks.responses.agent_kyc = [{ data: [], error: null }];
    mocks.responses.agent_services = [{ data: [{
      id: ids.service,
      agent_id: ids.agent,
      service_category: "translation",
      name: "Private until verified",
      description: "",
      is_available: true,
      availability: {},
    }], error: null }];

    const response = await GETAgentDirectory(request("/agents/directory"));
    const body = await response.json();

    expect(body.data[0].verificationStatus).toBe("unverified");
    expect(body.data[0].verifiedAt).toBeNull();
    expect(body.data[0].services).toEqual([]);
  });

  it("does not let an older approval override a newer KYC rejection", async () => {
    mocks.responses.agents = [{ data: [agentRow()], error: null }];
    mocks.responses.agent_kyc = [{ data: [
      { agent_id: ids.agent, status: "rejected", reviewed_at: "2026-02-01T00:00:00.000Z" },
      { agent_id: ids.agent, status: "approved", reviewed_at: "2026-01-01T00:00:00.000Z" },
    ], error: null }];
    mocks.responses.agent_services = [{ data: [], error: null }];

    const response = await GETAgentDirectory(request("/agents/directory"));
    const body = await response.json();

    expect(body.data[0].verificationStatus).toBe("unverified");
    expect(body.data[0].verifiedAt).toBeNull();
  });

  it("does not leave an agent verified while a newer KYC submission is pending", async () => {
    mocks.responses.agents = [{ data: [agentRow()], error: null }];
    mocks.responses.agent_kyc = [{ data: [
      { agent_id: ids.agent, status: "under_review", reviewer_id: null, reviewed_at: null },
      { agent_id: ids.agent, status: "approved", reviewer_id: "reviewer-id", reviewed_at: "2026-01-01T00:00:00.000Z" },
    ], error: null }];
    mocks.responses.agent_services = [{ data: [], error: null }];

    const response = await GETAgentDirectory(request("/agents/directory"));
    const body = await response.json();

    expect(body.data[0].verificationStatus).toBe("unverified");
    expect(body.data[0].verifiedAt).toBeNull();
  });

  it("blocks profile publication until verified and indexed as registered", async () => {
    mocks.responses.agents = [{ data: { id: ids.agent, application_status: "approved", off_chain_kyc_status: "approved", on_chain_registry_status: "registered" }, error: null }];
    mocks.responses.agent_kyc = [{ data: [], error: null }];

    const response = await PATCHAgentDirectoryProfile(request("/agents", "PATCH", { directoryPublic: true }));

    expect(response.status).toBe(409);
    expect(mocks.writes).toHaveLength(0);
  });

  it("requires reviewer-approved KYC before an application can be approved", async () => {
    mocks.responses.agent_kyc = [{ data: null, error: null }];

    const response = await POSTAdminAgentDecision(request("/admin/agents", "POST", {
      agentId: ids.agent,
      decision: "approved",
    }));

    expect(response.status).toBe(409);
    expect(mocks.requireRole).toHaveBeenCalledWith(expect.objectContaining({ role: "reviewer" }), ["reviewer", "admin"]);
    expect(mocks.writes).toHaveLength(0);
    expect(mocks.writeAuditLog).not.toHaveBeenCalled();
  });

  it("approves an application only after a real reviewer-approved KYC record", async () => {
    mocks.responses.agent_kyc = [{ data: { id: "kyc-id", status: "approved", reviewer_id: "reviewer-id", reviewed_at: "2026-03-01T00:00:00.000Z" }, error: null }];
    mocks.responses.agents = [{ data: {
      id: ids.agent,
      application_status: "approved",
      reviewed_by: "profile-id",
      reviewed_at: "2026-01-02T00:00:00.000Z",
    }, error: null }];

    const response = await POSTAdminAgentDecision(request("/admin/agents", "POST", {
      agentId: ids.agent,
      decision: "approved",
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.application_status).toBe("approved");
    expect(mocks.writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: "agent_approval" }));
  });

  it("lists only pending applications for reviewers", async () => {
    mocks.responses.agents = [{ data: [{ id: ids.agent, application_status: "pending", application_data: { motivation: "private" } }], error: null }];

    const response = await GETAdminAgentApplications(request("/admin/agents"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data[0].application_data.motivation).toBe("private");
    expect(mocks.filters).toContain("agents.application_status in pending,under_review");
    expect(mocks.requireRole).toHaveBeenCalledWith(expect.objectContaining({ role: "reviewer" }), ["reviewer", "admin"]);
  });

  it("returns short-lived KYC URLs only through the reviewer queue", async () => {
    mocks.responses.agent_kyc = [{ data: [{
      id: "kyc-id",
      agent_id: ids.agent,
      document_type: "identity",
      storage_path: `${ids.agent}/proof.pdf`,
      status: "submitted",
      submitted_at: "2026-03-01T00:00:00.000Z",
    }], error: null }];

    const response = await getAdminKyc(request("/admin/kyc"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.requireRole).toHaveBeenCalledWith(expect.objectContaining({ role: "reviewer" }), ["reviewer", "admin"]);
    expect(mocks.storageBucket).toHaveBeenCalledWith("agent-kyc");
    expect(mocks.storageSignedUrl).toHaveBeenCalledWith(`${ids.agent}/proof.pdf`, 300);
    expect(body.data[0]).toMatchObject({
      documentUrl: "https://storage.example/private-document?signature=temporary",
      documentUrlExpiresInSeconds: 300,
    });
    expect(body.data[0]).not.toHaveProperty("storage_path");
  });

  it("accepts KYC paths only inside the applicant's private storage folder", async () => {
    mocks.responses.agents = [{ data: { id: ids.agent }, error: null }];

    const response = await submitKyc(request("/agents/kyc", "POST", {
      documentType: "identity",
      storagePath: "another-agent/document.pdf",
    }));

    expect(response.status).toBe(422);
    expect(mocks.writes).toHaveLength(0);
  });

  it("registers a KYC document from the applicant's own storage folder", async () => {
    mocks.responses.agents = [
      { data: { id: ids.agent }, error: null },
      { data: null, error: null },
    ];
    mocks.responses.agent_kyc = [{ data: { id: "kyc-id", status: "submitted" }, error: null }];

    const response = await submitKyc(request("/agents/kyc", "POST", {
      documentType: "identity",
      storagePath: `${ids.agent}/identity.pdf`,
    }));

    expect(response.status).toBe(201);
    expect(mocks.writes.find((write) => write.table === "agent_kyc")?.value).toMatchObject({
      agent_id: ids.agent,
      storage_path: `${ids.agent}/identity.pdf`,
    });
    expect(mocks.writes.find((write) => write.table === "agents" && write.kind === "update")?.value)
      .toMatchObject({ off_chain_kyc_status: "kyc_review" });
  });

  it("uploads multipart KYC through the private backend storage path", async () => {
    mocks.responses.agents = [
      { data: { id: ids.agent }, error: null },
      { data: null, error: null },
    ];
    mocks.responses.agent_kyc = [{ data: { id: "kyc-upload-id", status: "submitted" }, error: null }];
    const form = new FormData();
    form.set("documentType", "identity");
    form.set("file", new File(["private test document"], "proof.pdf", { type: "application/pdf" }));
    const multipartRequest = new NextRequest("https://backend.example/api/v1/agents/kyc", { method: "POST", body: form });

    const response = await submitKyc(multipartRequest);
    const inserted = mocks.writes.find((write) => write.table === "agent_kyc")?.value as Record<string, unknown>;

    expect(response.status).toBe(201);
    expect(mocks.storageBucket).toHaveBeenCalledWith("agent-kyc");
    expect(mocks.storageUpload).toHaveBeenCalledWith(expect.stringMatching(new RegExp(`^${ids.agent}/`)), expect.any(File), expect.objectContaining({ contentType: "application/pdf", upsert: false }));
    expect(inserted.storage_path).toMatch(new RegExp(`^${ids.agent}/`));
  });

  it("rate-limits KYC uploads before querying or writing storage", async () => {
    mocks.checkRateLimit.mockResolvedValue(true);
    const form = new FormData();
    form.set("documentType", "identity");
    form.set("file", new File(["private test document"], "proof.pdf", { type: "application/pdf" }));

    const response = await submitKyc(new NextRequest("https://backend.example/api/v1/agents/kyc", {
      method: "POST",
      body: form,
    }));
    const body = await response.json();

    expect(response.status).toBe(429);
    expect(body.error.code).toBe("rate_limited");
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.storageUpload).not.toHaveBeenCalled();
  });

  it("records reviewer, timestamp, and audit event on rejection", async () => {
    mocks.responses.agents = [{
      data: {
        id: ids.agent,
        application_status: "rejected",
        reviewed_by: "profile-id",
        reviewed_at: "2026-01-02T00:00:00.000Z",
      },
      error: null,
    }];

    const response = await POSTAdminAgentDecision(request("/admin/agents", "POST", {
      agentId: ids.agent,
      decision: "rejected",
      reviewerNotes: "Unable to verify application.",
    }));
    const body = await response.json();
    const update = mocks.writes.find((write) => write.kind === "update")?.value as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(body.data.reviewed_by).toBe("profile-id");
    expect(update.application_status).toBe("rejected");
    expect(update.reviewed_by).toBe("profile-id");
    expect(update.reviewed_at).toBeTypeOf("string");
    expect(mocks.writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: "agent_rejection",
      targetTable: "agents",
      targetId: ids.agent,
    }));
  });

  it("scopes service availability updates to the authenticated agent", async () => {
    mocks.responses.agents = [{ data: { id: ids.agent }, error: null }];
    mocks.responses.agent_services = [{
      data: { id: ids.service, service_category: "translation", is_available: false },
      error: null,
    }];

    const response = await PATCHAgentService(request(`/agents/services/${ids.service}`, "PATCH", { isAvailable: false }), {
      params: Promise.resolve({ serviceId: ids.service }),
    });

    expect(response.status).toBe(200);
    expect(mocks.filters).toContain(`agent_services.agent_id=${ids.agent}`);
    expect(mocks.filters).toContain(`agent_services.id=${ids.service}`);
    expect(mocks.writes[0]?.value).toMatchObject({ is_available: false });
  });

  it("does not create available service before a reviewer verification exists", async () => {
    mocks.responses.agents = [{ data: { id: ids.agent, application_status: "approved", off_chain_kyc_status: "approved", on_chain_registry_status: "registered" }, error: null }];
    mocks.responses.agent_kyc = [{ data: [], error: null }];

    const response = await POSTAgentService(request("/agents/services", "POST", {
      serviceCategory: "translation",
      name: "Community translation",
      isAvailable: true,
    }));

    expect(response.status).toBe(409);
    expect(mocks.writes).toHaveLength(0);
  });

  it("creates an available service only after approved KYC and indexed registration", async () => {
    mocks.responses.agents = [{ data: { id: ids.agent, application_status: "approved", off_chain_kyc_status: "approved", on_chain_registry_status: "registered" }, error: null }];
    mocks.responses.agent_kyc = [{ data: [{ agent_id: ids.agent, status: "approved", reviewer_id: "reviewer-id", reviewed_at: "2026-03-01T00:00:00.000Z" }], error: null }];
    mocks.responses.agent_services = [{ data: { id: ids.service, agent_id: ids.agent, is_available: true }, error: null }];

    const response = await POSTAgentService(request("/agents/services", "POST", {
      serviceCategory: "translation",
      name: "Community translation",
      isAvailable: true,
    }));

    expect(response.status).toBe(201);
    expect(mocks.writes.find((write) => write.table === "agent_services")?.value)
      .toMatchObject({ agent_id: ids.agent, is_available: true });
  });

  it("returns only activity connected to the caller's normalized agent profile", async () => {
    mocks.responses.agents = [{ data: { id: ids.agent }, error: null }];
    mocks.responses.agent_profiles = [{ data: { id: ids.agentProfile }, error: null }];
    mocks.responses.agent_activity = [{
      data: [{ id: "activity-id", activity_type: "service_completed", metadata: { source: "indexer" } }],
      error: null,
    }];

    const response = await GETAgentActivity(request("/agents/activity"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toHaveLength(1);
    expect(mocks.filters).toContain(`agent_profiles.profile_id=profile-id`);
    expect(mocks.filters).toContain(`agent_activity.agent_profile_id=${ids.agentProfile}`);
  });
});