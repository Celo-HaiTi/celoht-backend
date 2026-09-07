import { z } from "zod";

export const ProgressUpdateSchema = z.object({
  lessonId: z.string().uuid(),
  completed: z.boolean(),
});
