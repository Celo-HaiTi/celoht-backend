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
      responses: { '200': { $ref: '#/components/responses/Success' }, '422': { $ref: '#/components/responses/ValidationError' } }
  /auth/verify:
    post:
      tags: [Auth]
      security: []
      requestBody:
        required: true
        content: { application/json: { schema: { $ref: '#/components/schemas/VerifyRequest' } } }
      responses: { '200': { $ref: '#/components/responses/Success' }, '401': { $ref: '#/components/responses/Unauthorized' } }
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
        content: { application/json: { schema: { type: object, additionalProperties: true } } }
      responses: { '201': { $ref: '#/components/responses/Success' }, '409': { $ref: '#/components/responses/Conflict' } }
  /agents/kyc:
    get: { tags: [Agents], security: [{ session: [] }], responses: { '200': { $ref: '#/components/responses/Success' } } }
    post:
      tags: [Agents]
      security: [{ session: [] }]
      requestBody:
        required: true
        content: { application/json: { schema: { $ref: '#/components/schemas/KycSubmission' } } }
      responses: { '201': { $ref: '#/components/responses/Success' } }
  /courses:
    get:
      tags: [Education]
      parameters: [{ $ref: '#/components/parameters/Limit' }, { $ref: '#/components/parameters/Offset' }]
      responses: { '200': { $ref: '#/components/responses/Success' } }
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
    post: { tags: [Admin], security: [{ session: [] }], responses: { '200': { $ref: '#/components/responses/Success' }, '403': { $ref: '#/components/responses/Forbidden' } } }
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
    NonceRequest: { type: object, required: [walletAddress], properties: { walletAddress: { type: string, pattern: '^0x[0-9a-fA-F]{40}$' } } }
    VerifyRequest: { type: object, required: [walletAddress, nonce, signature], properties: { walletAddress: { type: string }, nonce: { type: string, minLength: 32 }, signature: { type: string } } }
    ProfileUpdate: { type: object, properties: { displayName: { type: string, maxLength: 120 }, avatarUrl: { type: string, maxLength: 2048 } }, additionalProperties: false }
    KycSubmission: { type: object, required: [documentType, storagePath], properties: { documentType: { type: string, maxLength: 60 }, storagePath: { type: string } }, additionalProperties: false }
    ProgressUpdate: { type: object, required: [lessonId, completed], properties: { lessonId: { type: string, format: uuid }, completed: { type: boolean } }, additionalProperties: false }
    Error: { type: object, required: [error], properties: { error: { type: object, required: [code, message, requestId], properties: { code: { type: string }, message: { type: string }, details: {}, requestId: { type: string, format: uuid } } } } }
  responses:
    Success: { description: Successful response, content: { application/json: { schema: { type: object, required: [data], properties: { data: {} } } } } }
    ValidationError: { description: Invalid request, content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
    Unauthorized: { description: Unauthenticated, content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
    Forbidden: { description: Insufficient role, content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
    Conflict: { description: Duplicate operation, content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
    Unavailable: { description: Dependency unavailable, content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
```

All mutating operations are validated with Zod. Paginated reads cap `limit` at
100. Administrative decisions are role checked server-side and append to
`audit_logs`; indexer-owned blockchain records are read-only to this service.