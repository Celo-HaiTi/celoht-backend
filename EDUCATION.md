# CeloHT Education

Education data is read from the canonical Supabase schema. The backend does
not seed or invent courses, learner records, statistics, quiz scores, or
certificates. An empty published-course table therefore returns an empty list.

## Learner flow
1. Authenticate with the wallet session.
2. Browse `GET /api/v1/courses`; request `locale=ht`, `en`, `fr`, or `es`.
3. Read `GET /api/v1/courses/{courseId}` for objectives, modules, lessons,
   localized lesson content, and quiz IDs.
4. Enroll with `POST /api/v1/courses/{courseId}/enrollments`.
5. Record a lesson start with `POST /api/v1/progress`, using the enrollment
   and lesson IDs. This does not mark the lesson complete.
6. Load questions from `GET /api/v1/courses/{courseId}/quizzes/{quizId}` and
   submit question IDs plus selected option indexes to its `/submit` endpoint.
7. Review persisted progress with `GET /api/v1/progress` and attempt history
   with `GET /api/v1/courses/{courseId}/results`.
8. A certificate appears in `GET /api/v1/certificates` only after a passing,
   server-scored attempt for every lesson in the course.

All endpoints resolve translations in this order: requested language, Haitian
Creole (`ht`), then the legacy base field where one exists. Untranslated
content remains usable without fabricating a translation.

## Quiz and completion integrity
Quiz choices are stored separately from answer keys. Quiz reads omit
`correct_option_index`; submissions accept answer choices only, and the
canonical `submit_education_quiz` function validates the enrollment, exact
question set, option indexes, answer key, score, and pass threshold in one
transaction. A passing result marks that lesson complete, recalculates the
persisted enrollment percentage, and issues a certificate atomically when
every lesson is complete. Failed attempts are retained; retakes are allowed.

The legacy `course_progress` table remains readable for compatibility but is
not used as proof of completion. Client roles cannot write education state,
read quiz tables, or execute the scoring function. Certificate history omits
legacy records that cannot be linked to a verified completed enrollment.

## Course administration
Admins use `GET /api/v1/admin/courses` to review draft, published, and archived
content, and `POST /api/v1/admin/courses` to create or replace a draft with a
complete nested document containing translated course metadata, modules,
lessons, and quiz questions. Set `status` to `draft` while authoring and to
`published` to request publication. The database function validates the
Creole-first content and requires every lesson to have at least one quiz
question before publication. Admin edits are audited. Courses with enrollment
or certificate history cannot be rewritten; they may be archived.

Course content is backend-owned. Do not insert sample or placeholder course
rows into production migrations or seed files; only publish real, approved
educational material through the admin workflow.