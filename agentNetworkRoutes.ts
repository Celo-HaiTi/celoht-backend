import { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk, withApiErrorHandling } from "@/lib/errors";
import { requireActor, requireRole } from "@/lib/auth/authorization";
import { getServiceRoleClient } from "@/lib/supabase/server";
import { writeAuditLog, type AuditAction } from "@/lib/audit";
import { PaginationSchema } from "@/schemas/pagination";
import {
  AgentDirectoryQuerySchema,
  AgentServiceSchema,
  AgentServiceUpdateSchema,
  AgentStatusDecisionSchema,
  AgentProfileUpdateSchema,
} from "@/schemas/agents";

type AgentDirectoryContext = { params: Promise<{ agentId: string }> };
type AgentServiceContext = { params: Promise<{ serviceId: string }> };

const UuidSchema = z.string().uuid();
const ACTION_BY_DECISION: Record<"approved" | "suspended" | "rejected", AuditAction> = {
  approved: "agent_approval",
  suspended: "agent_suspension",
  rejected: "agent_rejection",
};

type AgentRow = {
  id: string;
  public_name: string | null;
  bio: string | null;
  country_code: string | null;
  region: string | null;
  locality: string | null;
  application_status: string;
  on_chain_registry_status: string | null;
};

type AgentServiceRow = {
  id: string;
  agent_id: string;
  service_category: string;
  name: string;
  description: string;
  is_available: boolean;
  availability: Record<string, string>;
};

async function findOwnedAgent(profileId: string) {
  const supabase = getServiceRoleClient();
  const { data, error } = await supabase
    .from("agents")
    .select("id, profile_id, application_status, off_chain_kyc_status, on_chain_registry_status, directory_public")
    .eq("profile_id", profileId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function getVerifiedAt(agentIds: string[]) {
  const result = new Map<string, string>();
  if (agentIds.length === 0) return result;

  const supabase = getServiceRoleClient();
  const { data, error } = await supabase
    .from("agent_kyc")
    .select("agent_id, status, reviewer_id, reviewed_at")
    .in("agent_id", agentIds)
    .order("submitted_at", { ascending: false });
  if (error) throw error;

  for (const verification of data ?? []) {
    if (!result.has(verification.agent_id)) {
      result.set(
        verification.agent_id,
        verification.status === "approved" && verification.reviewer_id && verification.reviewed_at
          ? verification.reviewed_at
          : "",
      );
    }
  }
  return result;
}

async function getAvailableServices(agentIds: string[]) {
  const result = new Map<string, AgentServiceRow[]>();
  if (agentIds.length === 0) return result;

  const supabase = getServiceRoleClient();
  const { data, error } = await supabase
    .from("agent_services")
    .select("id, agent_id, service_category, name, description, is_available, availability")
    .in("agent_id", agentIds)
    .eq("is_available", true)
    .order("name");
  if (error) throw error;

  for (const service of (data ?? []) as AgentServiceRow[]) {
    const current = result.get(service.agent_id) ?? [];
    current.push(service);
    result.set(service.agent_id, current);
  }
  return result;
}

async function mayOfferAvailableServices(agent: { id: string; application_status: string; on_chain_registry_status: string | null }) {
  if (agent.application_status !== "approved" || agent.on_chain_registry_status !== "registered") return false;
  const verifiedAt = await getVerifiedAt([agent.id]);
  return Boolean(verifiedAt.get(agent.id));
}

function publicAgentResponse(
  agent: AgentRow,
  services: AgentServiceRow[],
  verifiedAt: string | undefined,
) {
  return {
    id: agent.id,
    displayName: agent.public_name,
    bio: agent.bio,
    location: {
      countryCode: agent.country_code,
      region: agent.region,
      locality: agent.locality,
    },
    registrationStatus: agent.on_chain_registry_status,
    verificationStatus: verifiedAt ? "verified" : "unverified",
    verifiedAt: verifiedAt || null,
    services: verifiedAt ? services.map((service) => ({
      id: service.id,
      category: service.service_category,
      name: service.name,
      description: service.description,
      availability: service.availability,
    })) : [],
  };
}

export async function GETAgentDirectory(req: NextRequest) {
  return withApiErrorHandling(async () => {
    const params = req.nextUrl.searchParams;
    const filters = AgentDirectoryQuerySchema.parse({
      search: params.get("search") ?? undefined,
      countryCode: params.get("countryCode") ?? undefined,
      region: params.get("region") ?? undefined,
      locality: params.get("locality") ?? undefined,
      serviceCategory: params.get("serviceCategory") ?? undefined,
    });
    const { limit, offset } = PaginationSchema.parse(Object.fromEntries(params));
    const supabase = getServiceRoleClient();

    let categoryAgentIds: string[] | null = null;
    if (filters.serviceCategory) {
      const { data, error } = await supabase
        .from("agent_services")
        .select("agent_id")
        .eq("service_category", filters.serviceCategory)
        .eq("is_available", true);
      if (error) throw error;
      categoryAgentIds = [...new Set((data ?? []).map((row) => row.agent_id))];
      if (categoryAgentIds.length === 0) return apiOk([]);
    }

    let query = supabase
      .from("agents")
      .select("id, public_name, bio, country_code, region, locality, application_status, on_chain_registry_status")
      .eq("directory_public", true)
      .eq("application_status", "approved")
      .eq("on_chain_registry_status", "registered");

    if (categoryAgentIds) query = query.in("id", categoryAgentIds);
    if (filters.countryCode) query = query.eq("country_code", filters.countryCode);
    if (filters.region) query = query.ilike("region", filters.region);
    if (filters.locality) query = query.ilike("locality", filters.locality);
    if (filters.search) {
      const safeSearch = filters.search.replace(/[%_*\\]/g, "");
      if (safeSearch) query = query.ilike("public_name", `%${safeSearch}%`);
    }

    const { data: agents, error: agentsError } = await query
      .order("public_name", { ascending: true })
      .range(offset, offset + limit - 1);
    if (agentsError) throw agentsError;

    const rows = (agents ?? []) as AgentRow[];
    const agentIds = rows.map((agent) => agent.id);
    const [verifiedAt, services] = await Promise.all([
      getVerifiedAt(agentIds),
      getAvailableServices(agentIds),
    ]);

    return apiOk(rows.map((agent) => publicAgentResponse(
      agent,
      services.get(agent.id) ?? [],
      verifiedAt.get(agent.id),
    )));
  });
}

export async function GETAgentDirectoryProfile(_req: NextRequest, context: AgentDirectoryContext) {
  return withApiErrorHandling(async () => {
    const { agentId } = await context.params;
    const id = UuidSchema.parse(agentId);
    const supabase = getServiceRoleClient();
    const { data: agent, error } = await supabase
      .from("agents")
      .select("id, public_name, bio, country_code, region, locality, application_status, on_chain_registry_status")
      .eq("id", id)
      .eq("directory_public", true)
      .eq("application_status", "approved")
      .eq("on_chain_registry_status", "registered")
      .maybeSingle();
    if (error) throw error;
    if (!agent) return apiError("not_found", "Registered agent not found.");

    const [verifiedAt, services] = await Promise.all([
      getVerifiedAt([id]),
      getAvailableServices([id]),
    ]);
    return apiOk(publicAgentResponse(
      agent as AgentRow,
      services.get(id) ?? [],
      verifiedAt.get(id),
    ));
  });
}

export async function PATCHAgentDirectoryProfile(req: NextRequest) {
  return withApiErrorHandling(async () => {
    const actor = await requireActor(req);
    const body = AgentProfileUpdateSchema.parse(await req.json());
    const agent = await findOwnedAgent(actor.profileId);
    if (!agent) return apiError("not_found", "No agent application on file.");

    if (body.directoryPublic === true) {
      if (agent.application_status !== "approved" || agent.on_chain_registry_status !== "registered") {
        return apiError("conflict", "An approved application and indexed on-chain registration are required before listing.");
      }
      const verifiedAt = await getVerifiedAt([agent.id]);
      if (!verifiedAt.get(agent.id)) {
        return apiError("conflict", "An approved reviewer verification record is required before listing.");
      }
    }

    const update: Record<string, string | boolean | null> = {};
    if (body.displayName !== undefined) update.public_name = body.displayName;
    if (body.bio !== undefined) update.bio = body.bio;
    if (body.countryCode !== undefined) update.country_code = body.countryCode;
    if (body.region !== undefined) update.region = body.region;
    if (body.locality !== undefined) update.locality = body.locality;
    if (body.directoryPublic !== undefined) update.directory_public = body.directoryPublic;

    const supabase = getServiceRoleClient();
    const { data, error } = await supabase
      .from("agents")
      .update(update)
      .eq("id", agent.id)
      .eq("profile_id", actor.profileId)
      .select("id, public_name, bio, country_code, region, locality, directory_public")
      .single();
    if (error) throw error;

    return apiOk({
      id: data.id,
      displayName: data.public_name,
      bio: data.bio,
      countryCode: data.country_code,
      region: data.region,
      locality: data.locality,
      directoryPublic: data.directory_public,
    });
  });
}

export async function GETAgentServices(req: NextRequest) {
  return withApiErrorHandling(async () => {
    const actor = await requireActor(req);
    const agent = await findOwnedAgent(actor.profileId);
    if (!agent) return apiError("not_found", "No agent application on file.");
    const supabase = getServiceRoleClient();
    const { data, error } = await supabase
      .from("agent_services")
      .select("id, service_category, name, description, is_available, availability, created_at, updated_at")
      .eq("agent_id", agent.id)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return apiOk(data);
  });
}

export async function POSTAgentService(req: NextRequest) {
  return withApiErrorHandling(async () => {
    const actor = await requireActor(req);
    const body = AgentServiceSchema.parse(await req.json());
    const agent = await findOwnedAgent(actor.profileId);
    if (!agent) return apiError("not_found", "No agent application on file.");
    if (body.isAvailable && !await mayOfferAvailableServices(agent)) {
      return apiError("conflict", "An approved application, reviewed verification, and indexed registration are required to offer available services.");
    }
    const supabase = getServiceRoleClient();
    const { data, error } = await supabase
      .from("agent_services")
      .insert({
        agent_id: agent.id,
        service_category: body.serviceCategory,
        name: body.name,
        description: body.description,
        is_available: body.isAvailable,
        availability: body.availability,
      })
      .select("id, service_category, name, description, is_available, availability, created_at, updated_at")
      .single();
    if (error) {
      if (error.code === "23505") return apiError("conflict", "A service with this name already exists.");
      throw error;
    }
    return apiOk(data, 201);
  });
}

export async function PATCHAgentService(req: NextRequest, context: AgentServiceContext) {
  return withApiErrorHandling(async () => {
    const actor = await requireActor(req);
    const { serviceId } = await context.params;
    const id = UuidSchema.parse(serviceId);
    const body = AgentServiceUpdateSchema.parse(await req.json());
    const agent = await findOwnedAgent(actor.profileId);
    if (!agent) return apiError("not_found", "No agent application on file.");
    if (body.isAvailable === true && !await mayOfferAvailableServices(agent)) {
      return apiError("conflict", "An approved application, reviewed verification, and indexed registration are required to offer available services.");
    }

    const update: Record<string, unknown> = {};
    if (body.serviceCategory !== undefined) update.service_category = body.serviceCategory;
    if (body.name !== undefined) update.name = body.name;
    if (body.description !== undefined) update.description = body.description;
    if (body.isAvailable !== undefined) update.is_available = body.isAvailable;
    if (body.availability !== undefined) update.availability = body.availability;

    const supabase = getServiceRoleClient();
    const { data, error } = await supabase
      .from("agent_services")
      .update(update)
      .eq("id", id)
      .eq("agent_id", agent.id)
      .select("id, service_category, name, description, is_available, availability, updated_at")
      .maybeSingle();
    if (error) {
      if (error.code === "23505") return apiError("conflict", "A service with this name already exists.");
      throw error;
    }
    if (!data) return apiError("not_found", "Service not found.");
    return apiOk(data);
  });
}

export async function GETAgentActivity(req: NextRequest) {
  return withApiErrorHandling(async () => {
    const actor = await requireActor(req);
    const agent = await findOwnedAgent(actor.profileId);
    if (!agent) return apiError("not_found", "No agent application on file.");
    const supabase = getServiceRoleClient();
    const { data: agentProfile, error: profileError } = await supabase
      .from("agent_profiles")
      .select("id")
      .eq("legacy_agent_id", agent.id)
      .eq("profile_id", actor.profileId)
      .maybeSingle();
    if (profileError) throw profileError;
    if (!agentProfile) return apiOk([]);

    const { data, error } = await supabase
      .from("agent_activity")
      .select("id, activity_type, occurred_at, source_event_id, metadata")
      .eq("agent_profile_id", agentProfile.id)
      .order("occurred_at", { ascending: false });
    if (error) throw error;
    return apiOk(data);
  });
}

export async function GETAdminAgentApplications(req: NextRequest) {
  return withApiErrorHandling(async () => {
    const actor = await requireActor(req);
    requireRole(actor, ["reviewer", "admin"]);
    const { limit, offset } = PaginationSchema.parse(Object.fromEntries(req.nextUrl.searchParams));
    const supabase = getServiceRoleClient();
    const { data, error } = await supabase
      .from("agents")
      .select("id, profile_id, wallet_address, application_data, public_name, bio, country_code, region, locality, application_status, off_chain_kyc_status, on_chain_registry_status, created_at")
      .in("application_status", ["pending", "under_review"])
      .order("created_at", { ascending: true })
      .range(offset, offset + limit - 1);
    if (error) throw error;

    const agentIds = (data ?? []).map((agent) => agent.id);
    const { data: verifications, error: verificationsError } = agentIds.length
      ? await supabase
        .from("agent_kyc")
        .select("agent_id, status, reviewer_id, reviewed_at, submitted_at")
        .in("agent_id", agentIds)
        .order("submitted_at", { ascending: false })
      : { data: [], error: null };
    if (verificationsError) throw verificationsError;

    const latestVerification = new Map<string, { status: string; reviewedAt: string | null; verified: boolean }>();
    for (const verification of verifications ?? []) {
      if (!latestVerification.has(verification.agent_id)) {
        latestVerification.set(verification.agent_id, {
          status: verification.status,
          reviewedAt: verification.reviewed_at,
          verified: verification.status === "approved" && Boolean(verification.reviewer_id && verification.reviewed_at),
        });
      }
    }

    return apiOk((data ?? []).map((agent) => ({
      ...agent,
      latestVerification: latestVerification.get(agent.id) ?? null,
    })));
  });
}

export async function POSTAdminAgentDecision(req: NextRequest) {
  return withApiErrorHandling(async () => {
    const actor = await requireActor(req);
    requireRole(actor, ["reviewer", "admin"]);
    const body = AgentStatusDecisionSchema.parse(await req.json());
    const supabase = getServiceRoleClient();

    if (body.decision === "approved") {
      const { data: verification, error: verificationError } = await supabase
        .from("agent_kyc")
        .select("id, status, reviewer_id, reviewed_at")
        .eq("agent_id", body.agentId)
        .order("submitted_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (verificationError) throw verificationError;
      if (!verification || verification.status !== "approved" || !verification.reviewer_id || !verification.reviewed_at) {
        return apiError("conflict", "The latest verification submission must have a reviewer-approved record before agent approval.");
      }
    }

    const { data, error } = await supabase
      .from("agents")
      .update({
        application_status: body.decision,
        reviewed_by: actor.profileId,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", body.agentId)
      .select("id, application_status, reviewed_by, reviewed_at")
      .maybeSingle();
    if (error) throw error;
    if (!data) return apiError("not_found", "Agent application not found.");

    await writeAuditLog({
      actorId: actor.profileId,
      action: ACTION_BY_DECISION[body.decision],
      targetTable: "agents",
      targetId: data.id,
      metadata: { reviewerNotes: body.reviewerNotes ?? null },
    });
    return apiOk(data);
  });
}