import { z } from "zod";

export const ProgressUpdateSchema = z.object({
  enrollmentId: z.string().uuid(),
  lessonId: z.string().uuid(),
}).strict();
