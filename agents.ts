import { z } from "zod";

const AgentPublicProfileSchema = z.object({
  displayName: z.string().trim().min(1).max(100),
  bio: z.string().trim().max(2000).default(""),
  countryCode: z.string().regex(/^[A-Z]{2}$/),
  region: z.string().trim().max(100).optional(),
  locality: z.string().trim().max(100).optional(),
}).strict();

const ApplicationDetailsSchema = z.object({
  motivation: z.string().trim().min(20).max(3000),
  experience: z.string().trim().max(3000).optional(),
}).strict();

export const AgentApplicationSchema = z.object({
  publicProfile: AgentPublicProfileSchema,
  applicationData: ApplicationDetailsSchema,
}).strict();

export const AgentProfileUpdateSchema = AgentPublicProfileSchema.partial().extend({
  directoryPublic: z.boolean().optional(),
}).strict().refine((value) => Object.keys(value).length > 0);

const ServiceAvailabilitySchema = z.object({
  timezone: z.string().trim().max(80).optional(),
  mon: z.string().trim().max(120).optional(),
  tue: z.string().trim().max(120).optional(),
  wed: z.string().trim().max(120).optional(),
  thu: z.string().trim().max(120).optional(),
  fri: z.string().trim().max(120).optional(),
  sat: z.string().trim().max(120).optional(),
  sun: z.string().trim().max(120).optional(),
}).strict();

const ServiceFieldsSchema = z.object({
  serviceCategory: z.string().trim().regex(/^[a-z0-9][a-z0-9_-]{0,49}$/),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000).default(""),
  isAvailable: z.boolean().default(true),
  availability: ServiceAvailabilitySchema.default({}),
}).strict();

export const AgentServiceSchema = ServiceFieldsSchema;
export const AgentServiceUpdateSchema = ServiceFieldsSchema.partial()
  .strict()
  .refine((value) => Object.keys(value).length > 0);

export const AgentDirectoryQuerySchema = z.object({
  search: z.string().trim().max(80).optional(),
  countryCode: z.string().regex(/^[A-Z]{2}$/).optional(),
  region: z.string().trim().max(100).optional(),
  locality: z.string().trim().max(100).optional(),
  serviceCategory: z.string().trim().regex(/^[a-z0-9][a-z0-9_-]{0,49}$/).optional(),
}).strict();

export const KycDecisionSchema = z.object({
  kycId: z.string().uuid(),
  decision: z.enum(["approved", "rejected"]),
  reviewerNotes: z.string().max(2000).optional(),
}).strict();

export const AgentStatusDecisionSchema = z.object({
  agentId: z.string().uuid(),
  decision: z.enum(["approved", "suspended", "rejected"]),
  reviewerNotes: z.string().max(2000).optional(),
}).strict();
