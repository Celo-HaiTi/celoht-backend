# CeloHT Backend OpenAPI Contract

The deployed API is rooted at `/api/v1`. The route handlers under
`app/api/v1` are the executable implementation of this contract. The backend
does not expose service-role credentials, private keys, or write endpoints for
indexer-owned blockchain projections.

```yaml
openapi: 3.0.3
info:
  title: CeloHT Backend API
  version: 0.1.0
servers:
  - url: /api/v1
tags:
  - name: Auth
  - name: Profile
  - name: Agents
  - name: Education
  - name: Reforestation
  - name: Blockchain
  - name: Admin
paths:
  /auth/nonce:
    post:
      tags: [Auth]
      security: []
      requestBody:
        required: true
        content: { application/json: { schema: { $ref: '#/components/schemas/NonceRequest' } } }
      responses: { '200': { $ref: '#/components/responses/Success' }, '422': { $ref: '#/components/responses/ValidationError' }, '429': { $ref: '#/components/responses/RateLimited' } }
  /auth/verify:
    post:
      tags: [Auth]
      security: []
      requestBody:
        required: true
        content: { application/json: { schema: { $ref: '#/components/schemas/VerifyRequest' } } }
      responses: { '200': { $ref: '#/components/responses/Success' }, '401': { $ref: '#/components/responses/Unauthorized' }, '422': { $ref: '#/components/responses/ValidationError' }, '429': { $ref: '#/components/responses/RateLimited' } }
  /auth/session:
    get:
      tags: [Auth]
      security: [{ session: [] }]
      responses: { '200': { $ref: '#/components/responses/Success' }, '401': { $ref: '#/components/responses/Unauthorized' }, '429': { $ref: '#/components/responses/RateLimited' } }
  /auth/logout:
    post:
      tags: [Auth]
      responses: { '200': { $ref: '#/components/responses/Success' } }
  /profile:
    get: { tags: [Profile], security: [{ session: [] }], responses: { '200': { $ref: '#/components/responses/Success' } } }
    patch:
      tags: [Profile]
      security: [{ session: [] }]
      requestBody:
        required: true
        content: { application/json: { schema: { $ref: '#/components/schemas/ProfileUpdate' } } }
      responses: { '200': { $ref: '#/components/responses/Success' }, '422': { $ref: '#/components/responses/ValidationError' } }
  /agents:
    get: { tags: [Agents], security: [{ session: [] }], responses: { '200': { $ref: '#/components/responses/Success' } } }
    post:
      tags: [Agents]
      security: [{ session: [] }]
      requestBody:
        required: true
        content: { application/json: { schema: { $ref: '#/components/schemas/AgentApplication' } } }
      responses: { '201': { $ref: '#/components/responses/Success' }, '409': { $ref: '#/components/responses/Conflict' } }
    patch:
      tags: [Agents]
      security: [{ session: [] }]
      requestBody:
        required: true
        content: { application/json: { schema: { $ref: '#/components/schemas/AgentProfileUpdate' } } }
      responses: { '200': { $ref: '#/components/responses/Success' }, '409': { $ref: '#/components/responses/Conflict' } }
  /agents/directory:
    get:
      tags: [Agents]
      security: []
      parameters:
        - { in: query, name: search, schema: { type: string, maxLength: 80 } }
        - { in: query, name: countryCode, schema: { type: string, pattern: '^[A-Z]{2}$' } }
        - { in: query, name: region, schema: { type: string, maxLength: 100 } }
        - { in: query, name: locality, schema: { type: string, maxLength: 100 } }
        - { in: query, name: serviceCategory, schema: { type: string, pattern: '^[a-z0-9][a-z0-9_-]{0,49}$' } }
        - { $ref: '#/components/parameters/Limit' }
        - { $ref: '#/components/parameters/Offset' }
      responses: { '200': { $ref: '#/components/responses/Success' } }
  /agents/directory/{agentId}:
    get:
      tags: [Agents]
      security: []
      parameters: [{ in: path, name: agentId, required: true, schema: { type: string, format: uuid } }]
      responses: { '200': { $ref: '#/components/responses/Success' }, '404': { $ref: '#/components/responses/NotFound' } }
  /agents/services:
    get: { tags: [Agents], security: [{ session: [] }], responses: { '200': { $ref: '#/components/responses/Success' } } }
    post:
      tags: [Agents]
      security: [{ session: [] }]
      requestBody:
        required: true
        content: { application/json: { schema: { $ref: '#/components/schemas/AgentService' } } }
      responses: { '201': { $ref: '#/components/responses/Success' }, '409': { $ref: '#/components/responses/Conflict' } }
  /agents/services/{serviceId}:
    patch:
      tags: [Agents]
      security: [{ session: [] }]
      parameters: [{ in: path, name: serviceId, required: true, schema: { type: string, format: uuid } }]
      requestBody:
        required: true
        content: { application/json: { schema: { $ref: '#/components/schemas/AgentServiceUpdate' } } }
      responses: { '200': { $ref: '#/components/responses/Success' }, '404': { $ref: '#/components/responses/NotFound' } }
  /agents/activity:
    get: { tags: [Agents], security: [{ session: [] }], responses: { '200': { $ref: '#/components/responses/Success' } } }
  /agents/kyc:
    get: { tags: [Agents], security: [{ session: [] }], responses: { '200': { $ref: '#/components/responses/Success' } } }
    post:
      tags: [Agents]
      security: [{ session: [] }]
      requestBody:
        required: true
        content:
          multipart/form-data:
            schema:
              type: object
              required: [documentType, file]
              properties:
                documentType: { type: string, minLength: 1, maxLength: 60 }
                file: { type: string, format: binary, description: PDF, JPEG, or PNG up to 10 MB }
          application/json: { schema: { $ref: '#/components/schemas/KycSubmission' } }
      responses: { '201': { $ref: '#/components/responses/Success' } }
  /courses:
    get:
      tags: [Education]
      parameters: [{ $ref: '#/components/parameters/Limit' }, { $ref: '#/components/parameters/Offset' }, { in: query, name: locale, schema: { type: string, enum: [ht, en, fr, es], default: ht } }]
      responses: { '200': { $ref: '#/components/responses/Success' } }
  /courses/{courseId}:
    get:
      tags: [Education]
      parameters: [{ in: path, name: courseId, required: true, schema: { type: string, format: uuid } }, { in: query, name: locale, schema: { type: string, enum: [ht, en, fr, es], default: ht } }]
      responses: { '200': { $ref: '#/components/responses/Success' }, '404': { $ref: '#/components/responses/NotFound' } }
  /courses/{courseId}/enrollments:
    post:
      tags: [Education]
      security: [{ session: [] }]
      parameters: [{ in: path, name: courseId, required: true, schema: { type: string, format: uuid } }]
      responses: { '201': { $ref: '#/components/responses/Success' }, '401': { $ref: '#/components/responses/Unauthorized' } }
  /courses/{courseId}/quizzes/{quizId}:
    get:
      tags: [Education]
      security: [{ session: [] }]
      parameters: [{ in: path, name: courseId, required: true, schema: { type: string, format: uuid } }, { in: path, name: quizId, required: true, schema: { type: string, format: uuid } }, { in: query, name: locale, schema: { type: string, enum: [ht, en, fr, es], default: ht } }]
      responses: { '200': { $ref: '#/components/responses/Success' }, '404': { $ref: '#/components/responses/NotFound' } }
  /courses/{courseId}/quizzes/{quizId}/submit:
    post:
      tags: [Education]
      security: [{ session: [] }]
      parameters: [{ in: path, name: courseId, required: true, schema: { type: string, format: uuid } }, { in: path, name: quizId, required: true, schema: { type: string, format: uuid } }]
      requestBody:
        required: true
        content: { application/json: { schema: { $ref: '#/components/schemas/QuizSubmission' } } }
      responses: { '200': { $ref: '#/components/responses/Success' }, '422': { $ref: '#/components/responses/ValidationError' } }
  /courses/{courseId}/results:
    get:
      tags: [Education]
      security: [{ session: [] }]
      parameters: [{ in: path, name: courseId, required: true, schema: { type: string, format: uuid } }, { in: query, name: locale, schema: { type: string, enum: [ht, en, fr, es], default: ht } }]
      responses: { '200': { $ref: '#/components/responses/Success' }, '404': { $ref: '#/components/responses/NotFound' } }
  /progress:
    get: { tags: [Education], security: [{ session: [] }], responses: { '200': { $ref: '#/components/responses/Success' } } }
    post:
      tags: [Education]
      security: [{ session: [] }]
      requestBody:
        required: true
        content: { application/json: { schema: { $ref: '#/components/schemas/ProgressUpdate' } } }
      responses: { '200': { $ref: '#/components/responses/Success' } }
  /certificates:
    get: { tags: [Education], security: [{ session: [] }], responses: { '200': { $ref: '#/components/responses/Success' } } }
  /transactions:
    get:
      tags: [Blockchain]
      parameters: [{ $ref: '#/components/parameters/Limit' }, { $ref: '#/components/parameters/Offset' }, { in: query, name: wallet, schema: { type: string, pattern: '^0x[0-9a-fA-F]{40}$' } }]
      responses: { '200': { $ref: '#/components/responses/Success' } }
  /reforestation:
    get:
      tags: [Reforestation]
      parameters: [{ $ref: '#/components/parameters/Limit' }, { $ref: '#/components/parameters/Offset' }]
      responses: { '200': { $ref: '#/components/responses/Success' } }
  /reforestation/evidence:
    get: { tags: [Reforestation], responses: { '200': { $ref: '#/components/responses/Success' } } }
  /governance:
    get: { tags: [Blockchain], responses: { '200': { $ref: '#/components/responses/Success' } } }
  /admin/kyc:
    get: { tags: [Admin], security: [{ session: [] }], responses: { '200': { $ref: '#/components/responses/Success' }, '403': { $ref: '#/components/responses/Forbidden' } } }
    post: { tags: [Admin], security: [{ session: [] }], responses: { '200': { $ref: '#/components/responses/Success' }, '403': { $ref: '#/components/responses/Forbidden' } } }
  /admin/agents:
    get: { tags: [Admin], security: [{ session: [] }], responses: { '200': { $ref: '#/components/responses/Success' }, '403': { $ref: '#/components/responses/Forbidden' } } }
    post:
      tags: [Admin]
      security: [{ session: [] }]
      requestBody:
        required: true
        content: { application/json: { schema: { $ref: '#/components/schemas/AgentDecision' } } }
      responses: { '200': { $ref: '#/components/responses/Success' }, '403': { $ref: '#/components/responses/Forbidden' }, '409': { $ref: '#/components/responses/Conflict' } }
  /admin/courses:
    get:
      tags: [Admin]
      security: [{ session: [] }]
      parameters: [{ $ref: '#/components/parameters/Limit' }, { $ref: '#/components/parameters/Offset' }, { in: query, name: locale, schema: { type: string, enum: [ht, en, fr, es], default: ht } }]
      responses: { '200': { $ref: '#/components/responses/Success' }, '403': { $ref: '#/components/responses/Forbidden' } }
    post:
      tags: [Admin]
      security: [{ session: [] }]
      requestBody:
        required: true
        content: { application/json: { schema: { type: object, required: [status, titleTranslations, descriptionTranslations, learningObjectives, modules], additionalProperties: false } } }
      responses: { '200': { $ref: '#/components/responses/Success' }, '201': { $ref: '#/components/responses/Success' }, '403': { $ref: '#/components/responses/Forbidden' }, '422': { $ref: '#/components/responses/ValidationError' } }
  /admin/evidence:
    post: { tags: [Admin], security: [{ session: [] }], responses: { '200': { $ref: '#/components/responses/Success' }, '403': { $ref: '#/components/responses/Forbidden' } } }
  /admin/audit-logs:
    get: { tags: [Admin], security: [{ session: [] }], responses: { '200': { $ref: '#/components/responses/Success' }, '403': { $ref: '#/components/responses/Forbidden' } } }
  /health:
    get: { tags: [Operations], security: [], responses: { '200': { $ref: '#/components/responses/Success' }, '503': { $ref: '#/components/responses/Unavailable' } } }
components:
  securitySchemes:
    session: { type: apiKey, in: cookie, name: celoht_session }
  parameters:
    Limit: { in: query, name: limit, schema: { type: integer, minimum: 1, maximum: 100, default: 20 } }
    Offset: { in: query, name: offset, schema: { type: integer, minimum: 0, default: 0 } }
  schemas:
    NonceRequest: { type: object, required: [walletAddress], properties: { walletAddress: { type: string, pattern: '^0x[0-9a-fA-F]{40}$' } }, additionalProperties: false }
    VerifyRequest: { type: object, required: [walletAddress, nonce, signature], properties: { walletAddress: { type: string, pattern: '^0x[0-9a-fA-F]{40}$' }, nonce: { type: string, pattern: '^[0-9a-f]{64}$' }, signature: { type: string, pattern: '^0x[0-9a-fA-F]{130}$' } }, additionalProperties: false }
    ProfileUpdate: { type: object, properties: { displayName: { type: string, maxLength: 120 }, avatarUrl: { type: string, maxLength: 2048 } }, additionalProperties: false }
    KycSubmission: { type: object, required: [documentType, storagePath], properties: { documentType: { type: string, maxLength: 60 }, storagePath: { type: string } }, additionalProperties: false }
    AgentApplication: { type: object, required: [publicProfile, applicationData], properties: { publicProfile: { type: object, required: [displayName, countryCode], properties: { displayName: { type: string, minLength: 1, maxLength: 100 }, bio: { type: string, maxLength: 2000 }, countryCode: { type: string, pattern: '^[A-Z]{2}$' }, region: { type: string, maxLength: 100 }, locality: { type: string, maxLength: 100 } }, additionalProperties: false }, applicationData: { type: object, required: [motivation], properties: { motivation: { type: string, minLength: 20, maxLength: 3000 }, experience: { type: string, maxLength: 3000 } }, additionalProperties: false } }, additionalProperties: false }
    AgentProfileUpdate: { type: object, properties: { displayName: { type: string, minLength: 1, maxLength: 100 }, bio: { type: string, maxLength: 2000 }, countryCode: { type: string, pattern: '^[A-Z]{2}$' }, region: { type: string, maxLength: 100 }, locality: { type: string, maxLength: 100 }, directoryPublic: { type: boolean } }, additionalProperties: false }
    AgentService: { type: object, required: [serviceCategory, name], properties: { serviceCategory: { type: string, pattern: '^[a-z0-9][a-z0-9_-]{0,49}$' }, name: { type: string, minLength: 1, maxLength: 120 }, description: { type: string, maxLength: 1000 }, isAvailable: { type: boolean }, availability: { type: object, additionalProperties: { type: string, maxLength: 120 } } }, additionalProperties: false }
    AgentServiceUpdate: { type: object, properties: { serviceCategory: { type: string, pattern: '^[a-z0-9][a-z0-9_-]{0,49}$' }, name: { type: string, minLength: 1, maxLength: 120 }, description: { type: string, maxLength: 1000 }, isAvailable: { type: boolean }, availability: { type: object, additionalProperties: { type: string, maxLength: 120 } } }, additionalProperties: false, minProperties: 1 }
    AgentDecision: { type: object, required: [agentId, decision], properties: { agentId: { type: string, format: uuid }, decision: { type: string, enum: [approved, suspended, rejected] }, reviewerNotes: { type: string, maxLength: 2000 } }, additionalProperties: false }
    ProgressUpdate: { type: object, required: [enrollmentId, lessonId], properties: { enrollmentId: { type: string, format: uuid }, lessonId: { type: string, format: uuid } }, additionalProperties: false }
    QuizSubmission: { type: object, required: [enrollmentId, answers], properties: { enrollmentId: { type: string, format: uuid }, answers: { type: array, minItems: 1, maxItems: 100, items: { type: object, required: [questionId, selectedOptionIndex], properties: { questionId: { type: string, format: uuid }, selectedOptionIndex: { type: integer, minimum: 0, maximum: 7 } }, additionalProperties: false } } }, additionalProperties: false }
    Error: { type: object, required: [error], properties: { error: { type: object, required: [code, message, requestId], properties: { code: { type: string }, message: { type: string }, details: {}, requestId: { type: string, format: uuid } } } } }
  responses:
    Success: { description: Successful response, content: { application/json: { schema: { type: object, required: [data], properties: { data: {} } } } } }
    NotFound: { description: Resource not found, content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
    ValidationError: { description: Invalid request, content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
    Unauthorized: { description: Unauthenticated, content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
    Forbidden: { description: Insufficient role, content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
    Conflict: { description: Duplicate operation, content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
    Unavailable: { description: Dependency unavailable, content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
    RateLimited: { description: Rate limit exceeded, content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
```

All mutating operations are validated with Zod. Paginated reads cap `limit` at
100. Administrative decisions are role checked server-side and append to
`audit_logs`; indexer-owned blockchain records are read-only to this service.