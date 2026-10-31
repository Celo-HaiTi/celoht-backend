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

export const PlantingEvidenceSubmissionSchema = z.object({
  projectId: z.string().uuid(),
  plantingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  notes: z.string().max(4000).optional(),
  storagePaths: z.array(z.string().min(1).max(512)).min(1).max(10),
}).superRefine((value, context) => {
  const parsedDate = new Date(`${value.plantingDate}T00:00:00.000Z`);
  if (Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== value.plantingDate) {
    context.addIssue({ code: "custom", path: ["plantingDate"], message: "Planting date must be a valid calendar date." });
  }
  if (value.plantingDate > new Date().toISOString().slice(0, 10)) {
    context.addIssue({ code: "custom", path: ["plantingDate"], message: "Planting date cannot be in the future." });
  }
});

export const ContributionReceiptSchema = z.object({
  projectId: z.string().uuid(),
  transactionHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
});
