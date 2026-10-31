import { z } from "zod";

export const EducationLocaleSchema = z.enum(["ht", "en", "fr", "es"]);

const LocalizedTextSchema = z.object({
  ht: z.string().trim().min(1).max(20_000),
  en: z.string().trim().min(1).max(20_000).optional(),
  fr: z.string().trim().min(1).max(20_000).optional(),
  es: z.string().trim().min(1).max(20_000).optional(),
}).strict();

const LocalizedObjectivesSchema = z.object({
  ht: z.array(z.string().trim().min(1).max(500)).min(1).max(30),
  en: z.array(z.string().trim().min(1).max(500)).min(1).max(30).optional(),
  fr: z.array(z.string().trim().min(1).max(500)).min(1).max(30).optional(),
  es: z.array(z.string().trim().min(1).max(500)).min(1).max(30).optional(),
}).strict();

const LocalizedOptionsSchema = z.object({
  ht: z.array(z.string().trim().min(1).max(500)).min(2).max(8),
  en: z.array(z.string().trim().min(1).max(500)).min(2).max(8).optional(),
  fr: z.array(z.string().trim().min(1).max(500)).min(2).max(8).optional(),
  es: z.array(z.string().trim().min(1).max(500)).min(2).max(8).optional(),
}).strict().refine((value) =>
  [value.en, value.fr, value.es].every((options) => !options || options.length === value.ht.length),
  "All translated answer choices must have the same number of options.",
);

const QuizQuestionSchema = z.object({
  promptTranslations: LocalizedTextSchema,
  optionsTranslations: LocalizedOptionsSchema,
  correctOptionIndex: z.number().int().min(0).max(7),
}).strict().refine(
  (question) => question.correctOptionIndex < question.optionsTranslations.ht.length,
  "The correct answer must refer to an existing Creole option.",
);

const LessonQuizSchema = z.object({
  passPercentage: z.number().int().min(1).max(100).default(70),
  questions: z.array(QuizQuestionSchema).max(100),
}).strict();

const CourseLessonSchema = z.object({
  titleTranslations: LocalizedTextSchema,
  contentTranslations: LocalizedTextSchema,
  quiz: LessonQuizSchema.optional(),
}).strict();

const CourseModuleSchema = z.object({
  titleTranslations: LocalizedTextSchema,
  lessons: z.array(CourseLessonSchema).max(100),
}).strict();

export const AdminCourseSaveSchema = z.object({
  courseId: z.string().uuid().optional(),
  status: z.enum(["draft", "published", "archived"]),
  titleTranslations: LocalizedTextSchema,
  descriptionTranslations: LocalizedTextSchema,
  learningObjectives: LocalizedObjectivesSchema,
  modules: z.array(CourseModuleSchema).max(50),
}).strict();

export const QuizSubmissionSchema = z.object({
  enrollmentId: z.string().uuid(),
  answers: z.array(z.object({
    questionId: z.string().uuid(),
    selectedOptionIndex: z.number().int().min(0).max(7),
  }).strict()).min(1).max(100),
}).strict().refine(
  (submission) => new Set(submission.answers.map((answer) => answer.questionId)).size === submission.answers.length,
  "Each quiz question may be answered only once.",
);