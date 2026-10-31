import { NextRequest } from "next/server";
import { apiError, apiOk, withApiErrorHandling } from "@/lib/errors";
import { requireActor, requireRole } from "@/lib/auth/authorization";
import { checkRateLimit } from "@/lib/rateLimit";
import { writeAuditLog } from "@/lib/audit";
import { getServiceRoleClient } from "@/lib/supabase/server";
import { PaginationSchema } from "@/schemas/pagination";
import { z } from "zod";
import {
  AdminCourseSaveSchema,
  EducationLocaleSchema,
  QuizSubmissionSchema,
} from "@/schemas/education";

type CourseContext = { params: Promise<{ courseId: string }> };
type QuizContext = { params: Promise<{ courseId: string; quizId: string }> };
type UnknownRecord = Record<string, unknown>;

function localizedText(translations: unknown, locale: string, fallback: unknown): string | null {
  const values = translations && typeof translations === "object" ? translations as UnknownRecord : {};
  const localized = values[locale] ?? values.ht ?? fallback;
  return typeof localized === "string" ? localized : null;
}

function localizedList(translations: unknown, locale: string): string[] {
  const values = translations && typeof translations === "object" ? translations as UnknownRecord : {};
  const localized = values[locale] ?? values.ht;
  return Array.isArray(localized) ? localized.filter((item): item is string => typeof item === "string") : [];
}

function localizedOptions(translations: unknown, locale: string): string[] {
  return localizedList(translations, locale);
}

function localeFor(req: NextRequest): string {
  return EducationLocaleSchema.parse(req.nextUrl.searchParams.get("locale") ?? "ht");
}

function parseId(value: string): string {
  return zUuid.parse(value);
}

const zUuid = z.string().uuid();

async function findEnrollment(supabase: ReturnType<typeof getServiceRoleClient>, profileId: string, courseId: string) {
  const { data, error } = await supabase
    .from("enrollments")
    .select("id, course_id, completed_at")
    .eq("profile_id", profileId)
    .eq("course_id", courseId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function findCourseQuiz(
  supabase: ReturnType<typeof getServiceRoleClient>,
  courseId: string,
  quizId: string,
) {
  const { data: quiz, error: quizError } = await supabase
    .from("lesson_quizzes")
    .select("id, lesson_id, pass_percentage")
    .eq("id", quizId)
    .maybeSingle();
  if (quizError) throw quizError;
  if (!quiz) return null;

  const { data: lesson, error: lessonError } = await supabase
    .from("lessons")
    .select("id, module_id")
    .eq("id", quiz.lesson_id)
    .maybeSingle();
  if (lessonError) throw lessonError;
  if (!lesson) return null;

  const { data: module, error: moduleError } = await supabase
    .from("course_modules")
    .select("id")
    .eq("id", lesson.module_id)
    .eq("course_id", courseId)
    .maybeSingle();
  if (moduleError) throw moduleError;
  return module ? { quiz, lesson } : null;
}

function rpcErrorResponse(error: { code?: string; message?: string }) {
  if (error.code === "42501") return apiError("unauthorized", "This action is not permitted.");
  if (error.code === "22023") return apiError("validation_error", "The submitted education data is invalid.");
  if (error.code === "P0001") {
    if (error.message?.includes("not_found")) return apiError("not_found", "The requested education record was not found.");
    if (error.message?.includes("history") || error.message?.includes("requires_quiz")) {
      return apiError("conflict", "The course cannot be changed in its current state.");
    }
    return apiError("conflict", "The education action could not be completed.");
  }
  return null;
}

export async function GETCourses(req: NextRequest) {
  return withApiErrorHandling(async () => {
    const locale = localeFor(req);
    const { limit, offset } = PaginationSchema.parse(Object.fromEntries(req.nextUrl.searchParams));
    const supabase = getServiceRoleClient();
    const { data, error } = await supabase
      .from("courses")
      .select("id, title, description, title_translations, description_translations, learning_objectives, created_at")
      .eq("status", "published")
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);
    if (error) throw error;

    return apiOk((data ?? []).map((course) => ({
      id: course.id,
      title: localizedText(course.title_translations, locale, course.title),
      description: localizedText(course.description_translations, locale, course.description),
      learningObjectives: localizedList(course.learning_objectives, locale),
      createdAt: course.created_at,
    })));
  });
}

export async function GETAdminCourses(req: NextRequest) {
  return withApiErrorHandling(async () => {
    const actor = await requireActor(req);
    requireRole(actor, ["admin"]);
    const locale = localeFor(req);
    const { limit, offset } = PaginationSchema.parse(Object.fromEntries(req.nextUrl.searchParams));
    const supabase = getServiceRoleClient();
    const { data, error } = await supabase
      .from("courses")
      .select("id, title, description, title_translations, description_translations, learning_objectives, status, created_at, updated_at")
      .order("updated_at", { ascending: false })
      .range(offset, offset + limit - 1);
    if (error) throw error;

    return apiOk((data ?? []).map((course) => ({
      id: course.id,
      title: localizedText(course.title_translations, locale, course.title),
      description: localizedText(course.description_translations, locale, course.description),
      learningObjectives: localizedList(course.learning_objectives, locale),
      status: course.status,
      createdAt: course.created_at,
      updatedAt: course.updated_at,
    })));
  });
}

export async function GETCourse(req: NextRequest, context: CourseContext) {
  return withApiErrorHandling(async () => {
    const { courseId: rawCourseId } = await context.params;
    const courseId = parseId(rawCourseId);
    const locale = localeFor(req);
    const supabase = getServiceRoleClient();
    const { data: course, error: courseError } = await supabase
      .from("courses")
      .select("id, title, description, title_translations, description_translations, learning_objectives, created_at")
      .eq("id", courseId)
      .eq("status", "published")
      .maybeSingle();
    if (courseError) throw courseError;
    if (!course) return apiError("not_found", "Course not found.");

    const { data: modules, error: modulesError } = await supabase
      .from("course_modules")
      .select("id, title, title_translations, order_index")
      .eq("course_id", courseId)
      .order("order_index");
    if (modulesError) throw modulesError;

    const moduleIds = (modules ?? []).map((module) => module.id);
    const { data: lessons, error: lessonsError } = moduleIds.length
      ? await supabase.from("lessons")
        .select("id, module_id, title, title_translations, content, content_translations, order_index")
        .in("module_id", moduleIds)
        .order("order_index")
      : { data: [], error: null };
    if (lessonsError) throw lessonsError;

    const lessonIds = (lessons ?? []).map((lesson) => lesson.id);
    const { data: quizzes, error: quizzesError } = lessonIds.length
      ? await supabase.from("lesson_quizzes").select("id, lesson_id").in("lesson_id", lessonIds)
      : { data: [], error: null };
    if (quizzesError) throw quizzesError;

    const quizByLesson = new Map((quizzes ?? []).map((quiz) => [quiz.lesson_id, quiz.id]));
    const lessonsByModule = new Map<string, typeof lessons>();
    for (const lesson of lessons ?? []) {
      const current = lessonsByModule.get(lesson.module_id) ?? [];
      current.push(lesson);
      lessonsByModule.set(lesson.module_id, current);
    }

    return apiOk({
      id: course.id,
      title: localizedText(course.title_translations, locale, course.title),
      description: localizedText(course.description_translations, locale, course.description),
      learningObjectives: localizedList(course.learning_objectives, locale),
      createdAt: course.created_at,
      modules: (modules ?? []).map((module) => ({
        id: module.id,
        title: localizedText(module.title_translations, locale, module.title),
        order: module.order_index,
        lessons: (lessonsByModule.get(module.id) ?? []).map((lesson) => ({
          id: lesson.id,
          title: localizedText(lesson.title_translations, locale, lesson.title),
          content: localizedText(lesson.content_translations, locale, lesson.content),
          order: lesson.order_index,
          quizId: quizByLesson.get(lesson.id) ?? null,
        })),
      })),
    });
  });
}

export async function POSTCourseEnrollment(_req: NextRequest, context: CourseContext) {
  return withApiErrorHandling(async () => {
    const actor = await requireActor(_req);
    const { courseId: rawCourseId } = await context.params;
    const courseId = parseId(rawCourseId);
    const supabase = getServiceRoleClient();
    const { data: course, error: courseError } = await supabase
      .from("courses")
      .select("id")
      .eq("id", courseId)
      .eq("status", "published")
      .maybeSingle();
    if (courseError) throw courseError;
    if (!course) return apiError("not_found", "Course not found.");

    const { data, error } = await supabase
      .from("enrollments")
      .upsert({ profile_id: actor.profileId, course_id: courseId }, { onConflict: "profile_id,course_id" })
      .select("id, course_id, enrolled_at, completed_at, progress_percent")
      .single();
    if (error) throw error;
    return apiOk(data, 201);
  });
}

export async function GETLearningProgress(req: NextRequest) {
  return withApiErrorHandling(async () => {
    const actor = await requireActor(req);
    const locale = localeFor(req);
    const supabase = getServiceRoleClient();
    const { data, error } = await supabase
      .from("enrollments")
      .select("id, course_id, enrolled_at, completed_at, progress_percent, courses(id, title, title_translations), lesson_progress(lesson_id, started_at, completed, completed_at)")
      .eq("profile_id", actor.profileId)
      .order("enrolled_at", { ascending: false });
    if (error) throw error;

    return apiOk((data ?? []).map((enrollment) => {
      const relatedCourse = Array.isArray(enrollment.courses) ? enrollment.courses[0] : enrollment.courses;
      const course = relatedCourse as unknown as UnknownRecord | null;
      return {
        enrollmentId: enrollment.id,
        courseId: enrollment.course_id,
        courseTitle: course ? localizedText(course.title_translations, locale, course.title) : null,
        enrolledAt: enrollment.enrolled_at,
        completedAt: enrollment.completed_at,
        progressPercent: enrollment.progress_percent,
        lessons: enrollment.lesson_progress,
      };
    }));
  });
}

export async function GETCourseQuiz(req: NextRequest, context: QuizContext) {
  return withApiErrorHandling(async () => {
    const actor = await requireActor(req);
    const { courseId: rawCourseId, quizId: rawQuizId } = await context.params;
    const courseId = parseId(rawCourseId);
    const quizId = parseId(rawQuizId);
    const locale = localeFor(req);
    const supabase = getServiceRoleClient();
    const enrollment = await findEnrollment(supabase, actor.profileId, courseId);
    if (!enrollment) return apiError("conflict", "Enroll in this course before taking its quizzes.");

    const quizContext = await findCourseQuiz(supabase, courseId, quizId);
    if (!quizContext) return apiError("not_found", "Quiz not found.");
    const { data: questions, error } = await supabase
      .from("quiz_questions")
      .select("id, position, prompt_translations, options_translations")
      .eq("quiz_id", quizId)
      .order("position");
    if (error) throw error;

    return apiOk({
      quizId,
      passPercentage: quizContext.quiz.pass_percentage,
      questions: (questions ?? []).map((question) => ({
        id: question.id,
        prompt: localizedText(question.prompt_translations, locale, null),
        options: localizedOptions(question.options_translations, locale),
      })),
    });
  });
}

export async function POSTCourseQuizSubmission(req: NextRequest, context: QuizContext) {
  return withApiErrorHandling(async () => {
    const actor = await requireActor(req);
    const { courseId: rawCourseId, quizId: rawQuizId } = await context.params;
    const courseId = parseId(rawCourseId);
    const quizId = parseId(rawQuizId);
    const body = QuizSubmissionSchema.parse(await req.json());
    if (await checkRateLimit(`education-quiz:${actor.profileId}:${quizId}`, 30, 60_000)) {
      return apiError("rate_limited", "Too many quiz submissions.");
    }

    const supabase = getServiceRoleClient();
    const enrollment = await findEnrollment(supabase, actor.profileId, courseId);
    if (!enrollment || enrollment.id !== body.enrollmentId) {
      return apiError("unauthorized", "The enrollment does not belong to this account and course.");
    }
    const quizContext = await findCourseQuiz(supabase, courseId, quizId);
    if (!quizContext) return apiError("not_found", "Quiz not found.");

    const answers = Object.fromEntries(body.answers.map((answer) => [answer.questionId, answer.selectedOptionIndex]));
    const { data, error } = await supabase.rpc("submit_education_quiz", {
      p_profile_id: actor.profileId,
      p_enrollment_id: enrollment.id,
      p_quiz_id: quizId,
      p_answers: answers,
    });
    if (error) return rpcErrorResponse(error) ?? (() => { throw error; })();
    return apiOk(data);
  });
}

export async function GETCourseResults(req: NextRequest, context: CourseContext) {
  return withApiErrorHandling(async () => {
    const actor = await requireActor(req);
    const { courseId: rawCourseId } = await context.params;
    const courseId = parseId(rawCourseId);
    const locale = localeFor(req);
    const supabase = getServiceRoleClient();
    const enrollment = await findEnrollment(supabase, actor.profileId, courseId);
    if (!enrollment) return apiError("not_found", "Course enrollment not found.");

    const { data: attempts, error: attemptsError } = await supabase
      .from("quiz_attempts")
      .select("id, quiz_id, score_percent, passed, correct_answers, question_count, submitted_at")
      .eq("enrollment_id", enrollment.id)
      .order("submitted_at", { ascending: false });
    if (attemptsError) throw attemptsError;

    const quizIds = [...new Set((attempts ?? []).map((attempt) => attempt.quiz_id))];
    const { data: quizzes, error: quizzesError } = quizIds.length
      ? await supabase.from("lesson_quizzes").select("id, lesson_id").in("id", quizIds)
      : { data: [], error: null };
    if (quizzesError) throw quizzesError;
    const lessonIds = [...new Set((quizzes ?? []).map((quiz) => quiz.lesson_id))];
    const { data: lessons, error: lessonsError } = lessonIds.length
      ? await supabase.from("lessons").select("id, module_id, title, title_translations").in("id", lessonIds)
      : { data: [], error: null };
    if (lessonsError) throw lessonsError;
    const moduleIds = [...new Set((lessons ?? []).map((lesson) => lesson.module_id))];
    const { data: modules, error: modulesError } = moduleIds.length
      ? await supabase.from("course_modules").select("id, title, title_translations").in("id", moduleIds)
      : { data: [], error: null };
    if (modulesError) throw modulesError;

    const quizById = new Map((quizzes ?? []).map((quiz) => [quiz.id, quiz]));
    const lessonById = new Map((lessons ?? []).map((lesson) => [lesson.id, lesson]));
    const moduleById = new Map((modules ?? []).map((module) => [module.id, module]));
    return apiOk((attempts ?? []).map((attempt) => {
      const quiz = quizById.get(attempt.quiz_id);
      const lesson = quiz ? lessonById.get(quiz.lesson_id) : null;
      const courseModule = lesson ? moduleById.get(lesson.module_id) : null;
      return {
        id: attempt.id,
        quizId: attempt.quiz_id,
        moduleTitle: courseModule ? localizedText(courseModule.title_translations, locale, courseModule.title) : null,
        lessonTitle: lesson ? localizedText(lesson.title_translations, locale, lesson.title) : null,
        scorePercent: attempt.score_percent,
        passed: attempt.passed,
        correctAnswers: attempt.correct_answers,
        questionCount: attempt.question_count,
        submittedAt: attempt.submitted_at,
      };
    }));
  });
}

export async function POSTAdminCourse(req: NextRequest) {
  return withApiErrorHandling(async () => {
    const actor = await requireActor(req);
    requireRole(actor, ["admin"]);
    const body = AdminCourseSaveSchema.parse(await req.json());
    const { courseId, ...content } = body;
    const supabase = getServiceRoleClient();
    const { data, error } = await supabase.rpc("save_education_course", {
      p_actor_id: actor.profileId,
      p_course_id: courseId ?? null,
      p_content: content,
    });
    if (error) return rpcErrorResponse(error) ?? (() => { throw error; })();

    await writeAuditLog({
      actorId: actor.profileId,
      action: body.status === "published" ? "course_publication" : "admin_configuration_change",
      targetTable: "courses",
      targetId: data,
      metadata: { status: body.status },
    });
    return apiOk({ courseId: data, status: body.status }, courseId ? 200 : 201);
  });
}