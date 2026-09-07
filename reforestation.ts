import { z } from "zod";

export const EvidenceDecisionSchema = z.object({
  evidenceId: z.string().uuid(),
  decision: z.enum(["verified", "rejected"]),
  treesVerified: z.number().int().min(0).optional(),
});
