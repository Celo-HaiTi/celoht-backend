import { NextRequest } from "next/server";
import { apiError, apiOk, withApiErrorHandling } from "@/lib/errors";
import { requireActor } from "@/lib/auth/authorization";
import { getServiceRoleClient } from "@/lib/supabase/server";
import { AgentApplicationSchema } from "@/schemas/agents";

/** Returns the caller's own agent application/status. */
export async function GET(req: NextRequest) {
  return withApiErrorHandling(async () => {
    const actor = await requireActor(req);
    const supabase = getServiceRoleClient();
    const { data, error } = await supabase
      .from("agents")
      .select("id, application_data, public_name, bio, country_code, region, locality, directory_public, application_status, off_chain_kyc_status, on_chain_registry_status, created_at, updated_at")
      .eq("profile_id", actor.profileId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return apiError("not_found", "No agent application on file.");

    const { data: latestKyc, error: kycError } = await supabase
      .from("agent_kyc")
      .select("status, reviewer_id, reviewed_at")
      .eq("agent_id", data.id)
      .order("submitted_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (kycError) throw kycError;

    return apiOk({
      id: data.id,
      applicationData: data.application_data,
      publicProfile: {
        displayName: data.public_name,
        bio: data.bio,
        countryCode: data.country_code,
        region: data.region,
        locality: data.locality,
        directoryPublic: data.directory_public,
      },
      applicationStatus: data.application_status,
      verificationStatus: !latestKyc
        ? "not_submitted"
        : latestKyc.status === "approved" && latestKyc.reviewer_id && latestKyc.reviewed_at
          ? "verified"
          : latestKyc.status === "rejected" && latestKyc.reviewer_id && latestKyc.reviewed_at
            ? "rejected"
            : latestKyc.status === "approved" || latestKyc.status === "rejected"
              ? "under_review"
              : latestKyc.status,
      onChainRegistrationStatus: data.on_chain_registry_status,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    });
  });
}

/** Applies to become an agent. One application per profile. */
export async function POST(req: NextRequest) {
  return withApiErrorHandling(async () => {
    const actor = await requireActor(req);
    const body = AgentApplicationSchema.parse(await req.json());

    const supabase = getServiceRoleClient();
    const { data, error } = await supabase
      .from("agents")
      .insert({
        profile_id: actor.profileId,
        wallet_address: actor.walletAddress,
        application_data: body.applicationData,
        public_name: body.publicProfile.displayName,
        bio: body.publicProfile.bio,
        country_code: body.publicProfile.countryCode,
        region: body.publicProfile.region ?? null,
        locality: body.publicProfile.locality ?? null,
      })
      .select("id, application_status, off_chain_kyc_status, on_chain_registry_status")
      .single();

    if (error) {
      if (error.code === "23505") return apiError("conflict", "An agent application already exists for this profile.");
      throw error;
    }
    return apiOk({
      id: data.id,
      applicationStatus: data.application_status,
      verificationStatus: data.off_chain_kyc_status,
      onChainRegistrationStatus: data.on_chain_registry_status,
    }, 201);
  });
}

export { PATCHAgentDirectoryProfile as PATCH } from "./agentNetworkRoutes";
