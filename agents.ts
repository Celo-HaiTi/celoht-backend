import { z } from "zod";

export const AgentApplicationSchema = z.object({
  applicationData: z.record(z.string(), z.unknown()).default({}),
});

export const KycDecisionSchema = z.object({
  kycId: z.string().uuid(),
  decision: z.enum(["approved", "rejected"]),
  reviewerNotes: z.string().max(2000).optional(),
});

export const AgentStatusDecisionSchema = z.object({
  agentId: z.string().uuid(),
  decision: z.enum(["approved", "suspended", "rejected"]),
  reviewerNotes: z.string().max(2000).optional(),
});
