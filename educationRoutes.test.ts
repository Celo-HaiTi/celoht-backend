import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GETAdminCourses, GETCourses, GETCourseQuiz, POSTCourseQuizSubmission } from "./educationRoutes";

const ids = {
  course: "11111111-1111-4111-8111-111111111111",
  enrollment: "22222222-2222-4222-8222-222222222222",
  quiz: "33333333-3333-4333-8333-333333333333",
  lesson: "44444444-4444-4444-8444-444444444444",
  module: "55555555-5555-4555-8555-555555555555",
  question: "66666666-6666-4666-8666-666666666666",
};

const mocks = vi.hoisted(() => {
  class AuthError extends Error {
    constructor(public code: "unauthenticated" | "unauthorized", message: string) {
      super(message);
    }
  }

  return {
    AuthError,
    requireActor: vi.fn(),
    requireRole: vi.fn(),
    checkRateLimit: vi.fn(),
    writeAuditLog: vi.fn(),
    from: vi.fn(),
    rpc: vi.fn(),
    rows: {} as Record<string, unknown>,
    selectedColumns: [] as string[],
  };
});

vi.mock("@/lib/auth/authorization", () => ({
  AuthError: mocks.AuthError,
  requireActor: mocks.requireActor,
  requireRole: mocks.requireRole,
}));
vi.mock("@/lib/rateLimit", () => ({ checkRateLimit: mocks.checkRateLimit }));
vi.mock("@/lib/audit", () => ({ writeAuditLog: mocks.writeAuditLog }));
vi.mock("@/lib/supabase/server", () => ({
  getServiceRoleClient: () => ({ from: mocks.from, rpc: mocks.rpc }),
}));

function queryFor(table: string) {
  const query = {
    select: vi.fn((columns: string) => {
      mocks.selectedColumns.push(`${table}:${columns}`);
      return query;
    }),
    eq: vi.fn(() => query),
    in: vi.fn(() => query),
    order: vi.fn(() => query),
    range: vi.fn(async () => ({ data: mocks.rows[table] ?? [], error: null })),
    maybeSingle: vi.fn(async () => ({ data: mocks.rows[table] ?? null, error: null })),
    then: (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) =>
      Promise.resolve({ data: mocks.rows[table] ?? [], error: null }).then(resolve, reject),
  };
  return query;
}

function getRequest(path: string): NextRequest {
  return new NextRequest(`https://backend.example/api/v1${path}`);
}

function postRequest(path: string, body: unknown): NextRequest {
  return new NextRequest(`https://backend.example/api/v1${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const quizContext = {
  params: Promise.resolve({ courseId: ids.course, quizId: ids.quiz }),
};

describe("education API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rows = {};
    mocks.selectedColumns = [];
    mocks.requireActor.mockResolvedValue({ profileId: "profile-id", role: "user" });
    mocks.checkRateLimit.mockResolvedValue(false);
    mocks.writeAuditLog.mockResolvedValue(undefined);
    mocks.from.mockImplementation((table: string) => queryFor(table));
    mocks.rpc.mockResolvedValue({
      data: { attemptId: "attempt-id", scorePercent: 100, passed: true },
      error: null,
    });
  });

  it("returns localized published course descriptions and objectives", async () => {
    mocks.rows.courses = [{
      id: ids.course,
      title: "Tit kou",
      description: "Deskripsyon an Kreyòl",
      title_translations: { ht: "Tit kou", en: "Course title" },
      description_translations: { ht: "Deskripsyon an Kreyòl", en: "English description" },
      learning_objectives: { ht: ["Aprann sa"], en: ["Learn this"] },
      created_at: "2026-01-01T00:00:00.000Z",
    }];

    const response = await GETCourses(getRequest("/courses?locale=en"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data[0]).toMatchObject({
      title: "Course title",
      description: "English description",
      learningObjectives: ["Learn this"],
    });
  });

  it("restricts the course administration catalog to admins", async () => {
    mocks.rows.courses = [{
      id: ids.course,
      title: "Kou an",
      description: "Deskripsyon an",
      title_translations: { ht: "Kou an" },
      description_translations: { ht: "Deskripsyon an" },
      learning_objectives: { ht: ["Aprann"] },
      status: "draft",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-02T00:00:00.000Z",
    }];

    const response = await GETAdminCourses(getRequest("/admin/courses"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.requireRole).toHaveBeenCalledWith({ profileId: "profile-id", role: "user" }, ["admin"]);
    expect(body.data[0]).toMatchObject({ id: ids.course, status: "draft", title: "Kou an" });
  });

  it("rejects client-submitted quiz scores before enrollment lookup", async () => {
    const response = await POSTCourseQuizSubmission(postRequest(`/courses/${ids.course}/quizzes/${ids.quiz}/submit`, {
      enrollmentId: ids.enrollment,
      answers: [{ questionId: ids.question, selectedOptionIndex: 0 }],
      scorePercent: 100,
      passed: true,
    }), quizContext);

    expect(response.status).toBe(422);
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("sends only answer choices to server-side scoring", async () => {
    mocks.rows.enrollments = { id: ids.enrollment, course_id: ids.course, completed_at: null };
    mocks.rows.lesson_quizzes = { id: ids.quiz, lesson_id: ids.lesson, pass_percentage: 70 };
    mocks.rows.lessons = { id: ids.lesson, module_id: ids.module };
    mocks.rows.course_modules = { id: ids.module };

    const response = await POSTCourseQuizSubmission(postRequest(`/courses/${ids.course}/quizzes/${ids.quiz}/submit`, {
      enrollmentId: ids.enrollment,
      answers: [{ questionId: ids.question, selectedOptionIndex: 1 }],
    }), quizContext);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.scorePercent).toBe(100);
    expect(mocks.rpc).toHaveBeenCalledWith("submit_education_quiz", {
      p_profile_id: "profile-id",
      p_enrollment_id: ids.enrollment,
      p_quiz_id: ids.quiz,
      p_answers: { [ids.question]: 1 },
    });
  });

  it("never returns quiz answer keys", async () => {
    mocks.rows.enrollments = { id: ids.enrollment, course_id: ids.course, completed_at: null };
    mocks.rows.lesson_quizzes = { id: ids.quiz, lesson_id: ids.lesson, pass_percentage: 70 };
    mocks.rows.lessons = { id: ids.lesson, module_id: ids.module };
    mocks.rows.course_modules = { id: ids.module };
    mocks.rows.quiz_questions = [{
      id: ids.question,
      position: 0,
      prompt_translations: { ht: "Ki repons ki bon?", en: "Which answer is right?" },
      options_translations: { ht: ["Premye", "Dezyèm"], en: ["First", "Second"] },
      correct_option_index: 0,
    }];

    const response = await GETCourseQuiz(getRequest(`/courses/${ids.course}/quizzes/${ids.quiz}?locale=en`), quizContext);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.questions[0]).toEqual({
      id: ids.question,
      prompt: "Which answer is right?",
      options: ["First", "Second"],
    });
    expect(mocks.selectedColumns.join(" ")).not.toContain("correct_option_index");
  });
});