import { z } from "zod";

export const EvidenceDecisionSchema = z.object({
  evidenceId: z.string().uuid(),
  decision: z.enum(["verified", "rejected"]),
  treesVerified: z.number().int().positive().optional(),
  reviewerNotes: z.string().max(2000).optional(),
}).superRefine((value, context) => {
  if (value.decision === "verified" && value.treesVerified === undefined) {
    context.addIssue({
      code: "custom",
      path: ["treesVerified"],
      message: "A verified planting report must include a positive verified tree count.",
    });
  }
});

export const ContributionReceiptSchema = z.object({
  projectId: z.string().uuid(),
  transactionHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
});
