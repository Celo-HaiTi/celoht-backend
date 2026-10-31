import { NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { apiError, apiOk, withApiErrorHandling } from "@/lib/errors";
import { requireActor } from "@/lib/auth/authorization";
import { getServiceRoleClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rateLimit";
import { z } from "zod";

const SubmitKycSchema = z.object({
  documentType: z.string().min(1).max(60),
  storagePath: z.string().min(1).max(1024),
}).strict();

export async function GET(req: NextRequest) {
  return withApiErrorHandling(async () => {
    const actor = await requireActor(req);
    const supabase = getServiceRoleClient();

    const { data: agent, error: agentError } = await supabase
      .from("agents")
      .select("id")
      .eq("profile_id", actor.profileId)
      .maybeSingle();
    if (agentError) throw agentError;
    if (!agent) return apiError("not_found", "No agent application on file.");

    const { data, error } = await supabase
      .from("agent_kyc")
      .select("id, document_type, status, submitted_at, reviewed_at")
      .eq("agent_id", agent.id)
      .order("submitted_at", { ascending: false });
    if (error) throw error;

    return apiOk(data);
  });
}

export async function POST(req: NextRequest) {
  return withApiErrorHandling(async () => {
    const actor = await requireActor(req);
    if (await checkRateLimit(`agent-kyc-upload:${actor.profileId}`, 5, 60_000)) {
      return apiError("rate_limited", "Too many verification uploads.");
    }

    let documentType: string;
    let storagePath: string;
    let uploadedPath: string | undefined;
    let uploadFile: File | undefined;

    if (req.headers.get("content-type")?.includes("multipart/form-data")) {
      const contentLength = Number(req.headers.get("content-length"));
      if (contentLength > 10 * 1024 * 1024 + 64 * 1024) {
        return apiError("validation_error", "The verification upload exceeds the 10 MB limit.");
      }
      const form = await req.formData();
      const parsed = SubmitKycSchema.pick({ documentType: true }).parse({
        documentType: form.get("documentType"),
      });
      const file = form.get("file");
      if (!(file instanceof File)) return apiError("validation_error", "A KYC document file is required.");
      const allowedTypes = new Set(["application/pdf", "image/jpeg", "image/png"]);
      if (!allowedTypes.has(file.type) || file.size === 0 || file.size > 10 * 1024 * 1024) {
        return apiError("validation_error", "KYC documents must be a non-empty PDF, JPEG, or PNG up to 10 MB.");
      }
      documentType = parsed.documentType;
      storagePath = "";
      uploadFile = file;
    } else {
      const body = SubmitKycSchema.parse(await req.json());
      documentType = body.documentType;
      storagePath = body.storagePath;
    }
    const supabase = getServiceRoleClient();

    const { data: agent, error: agentError } = await supabase
      .from("agents")
      .select("id")
      .eq("profile_id", actor.profileId)
      .maybeSingle();
    if (agentError) throw agentError;
    if (!agent) return apiError("not_found", "No agent application on file.");

    if (uploadFile) {
      const filename = uploadFile.name.replace(/[^A-Za-z0-9._-]/g, "_").slice(-100) || "document";
      storagePath = `${agent.id}/${randomUUID()}-${filename}`;
      const { error: uploadError } = await supabase.storage
        .from("agent-kyc")
        .upload(storagePath, uploadFile, { contentType: uploadFile.type, upsert: false });
      if (uploadError) throw uploadError;
      uploadedPath = storagePath;
    } else {
      const pathParts = storagePath.split("/");
      if (pathParts[0] !== agent.id || pathParts.length < 2 || pathParts.some((part) => part === "" || part === "." || part === "..")) {
        return apiError("validation_error", "The KYC object path must be inside this agent's private folder.");
      }
    }

    const { data, error } = await supabase
      .from("agent_kyc")
      .insert({
        agent_id: agent.id,
        document_type: documentType,
        storage_path: storagePath,
      })
      .select("id, status")
      .single();
    if (error) {
      if (uploadedPath) await supabase.storage.from("agent-kyc").remove([uploadedPath]);
      throw error;
    }

    // Move the agent into kyc_review if this is the first submission in that state.
    const { error: statusError } = await supabase
      .from("agents")
      .update({ off_chain_kyc_status: "kyc_review" })
      .eq("id", agent.id)
      .in("off_chain_kyc_status", ["pending", "rejected"]);
    if (statusError) throw statusError;

    return apiOk(data, 201);
  });
}
