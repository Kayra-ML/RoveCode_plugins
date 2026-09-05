# API Design

## HTTP Method Semantics

Use the correct HTTP verb — it communicates intent to clients and intermediaries:

- **GET** — read, safe, idempotent. Never mutate state on a GET.
- **POST** — create a new resource or trigger an action. Not idempotent.
- **PUT** — full replace of a resource. Must be idempotent.
- **PATCH** — partial update. Send only fields being changed.
- **DELETE** — remove a resource. Idempotent (second call returns 404, not an error).

```
POST   /users          → create user, returns 201 + Location header
GET    /users/:id      → fetch user, returns 200 or 404
PUT    /users/:id      → replace user entirely, returns 200
PATCH  /users/:id      → partial update, returns 200
DELETE /users/:id      → delete, returns 204 (no body)
```

## Status Code Selection

Pick the most specific code, not just 200/400/500:

| Scenario | Code |
|----------|------|
| Created resource | 201 Created |
| Accepted async work | 202 Accepted |
| Success, no body | 204 No Content |
| Redirect permanent | 301 Moved Permanently |
| Redirect temporary | 307 Temporary Redirect |
| Bad request (malformed) | 400 Bad Request |
| Missing/invalid auth | 401 Unauthorized |
| Valid auth, no permission | 403 Forbidden |
| Resource not found | 404 Not Found |
| Method not allowed | 405 Method Not Allowed |
| Conflict (duplicate) | 409 Conflict |
| Validation failure | 422 Unprocessable Entity |
| Rate limited | 429 Too Many Requests |
| Server error | 500 Internal Server Error |
| Upstream failed | 502 Bad Gateway |
| Unavailable | 503 Service Unavailable |

**422 vs 400**: Use 400 for malformed JSON or missing required fields that can't be parsed. Use 422 when the structure is valid but the data fails business validation (email already taken, date in past).

## URL Design Patterns

- Use nouns for resources, verbs for actions: `/users`, `/orders`, not `/getUsers`
- Plural resource names: `/users/:id`, not `/user/:id`
- Nested resources only one level deep: `/users/:id/posts`, not `/users/:id/posts/:postId/comments/:id`
- Actions that don't map to CRUD: use a verb sub-resource: `POST /users/:id/activate`
- Keep URLs lowercase, hyphen-separated: `/payment-methods`, not `/paymentMethods`
- Never use trailing slashes — be consistent

## API Versioning Strategies

**URL prefix** (`/v1/users`) — most common, explicit, easy to test in browser. Downside: two URLs for the same resource.

**Header versioning** (`Accept: application/vnd.api+json; version=2`) — cleaner URLs, harder to test, requires docs.

**Query param** (`/users?version=2`) — avoid, pollutes query string.

Recommendation: use URL prefix `/v1/` for public APIs. Reserve header versioning for internal service-to-service.

Breaking changes require a new version. Non-breaking changes (adding fields, new endpoints) do not.

## Pagination

**Offset pagination** (`?page=2&limit=20`) — simple, supports random access, breaks under concurrent writes (rows shift). Fine for admin UIs.

**Cursor pagination** (`?cursor=eyJpZCI6MTIzfQ&limit=20`) — stable under writes, no random access. Use for feeds and large datasets.

Always return pagination metadata:
```json
{
  "data": [...],
  "pagination": {
    "cursor": "eyJpZCI6MTIzfQ==",
    "hasMore": true,
    "total": 4821
  }
}
```

## Request/Response Envelope

Wrap responses for consistency:
```json
{
  "data": { "id": "123", "name": "Alice" },
  "meta": { "requestId": "req_abc123", "timestamp": "2024-01-01T00:00:00Z" }
}
```

For errors:
```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "Email is already in use",
    "details": [{ "field": "email", "message": "already taken" }],
    "requestId": "req_abc123"
  }
}
```

## OpenAPI Tips

- Define schemas in `components/schemas` and `$ref` them — don't repeat inline
- Mark all fields as `required` explicitly or `nullable: true`
- Use `example` values on every field for usable docs
- Generate client SDKs from the spec (`openapi-typescript`, `orval`)
- Validate requests against the spec in CI (`spectral lint`)