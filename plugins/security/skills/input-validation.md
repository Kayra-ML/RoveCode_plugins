# Input Validation

## Never Trust User Input

Every value that originates outside your process is untrusted: HTTP request bodies, query
strings, headers, cookies, uploaded files, URL parameters, environment variables read at
runtime, and data read from a database that was originally user-supplied.

Validate at the boundary — at the entry point to your system — not deep inside business logic.
Validating deep in the stack means invalid data may have already caused harm or side effects
before the validation runs.

## Validation at the Boundary

In an HTTP server, validate before the request reaches the handler:

```ts
// Middleware approach with Zod
import { z } from "zod";

const CreateUserSchema = z.object({
  email: z.string().email().max(254),
  name: z.string().min(1).max(100).trim(),
  age: z.number().int().min(13).max(120).optional(),
});

app.post("/users", (req, res, next) => {
  const result = CreateUserSchema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ errors: result.error.flatten() });
  }
  req.validatedBody = result.data; // typed and sanitized
  next();
});
```

Never pass `req.body` directly to database queries or business logic.

## Zod Schema Validation Patterns

Zod provides composable, type-safe validation with TypeScript inference:

```ts
const PaginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.enum(["name", "createdAt", "email"]).default("createdAt"),
  order: z.enum(["asc", "desc"]).default("desc"),
});

const SearchSchema = z.object({
  q: z.string().min(1).max(200).trim().optional(),
  tags: z.array(z.string().max(50)).max(10).optional(),
});

// Infer TypeScript type from schema
type Pagination = z.infer<typeof PaginationSchema>;
```

Use `z.coerce` for query string parameters (all strings by default). Use `.transform()` to
normalize data after validation.

## Allowlist vs Denylist Validation

**Allowlist (whitelist):** explicitly permit known-good values. Everything else is rejected.
This is the correct default for validation.

**Denylist (blacklist):** reject known-bad values. Everything else is permitted. This is
almost always wrong — attackers will find the one bad value you forgot to block.

```ts
// Allowlist — correct
const FileExtensionSchema = z.enum(["jpg", "jpeg", "png", "webp", "gif"]);

// Denylist — fragile
const badExtensions = [".exe", ".php", ".jsp"]; // what about .phtml? .phar?
if (badExtensions.some(ext => filename.endsWith(ext))) reject();
```

## File Upload Validation

Validate file uploads on multiple levels:

```ts
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

function validateUpload(file: { name: string; size: number; buffer: Buffer }) {
  // 1. Size limit
  if (file.size > MAX_FILE_SIZE) throw new Error("File too large");

  // 2. Extension allowlist
  const ext = path.extname(file.name).toLowerCase().slice(1);
  if (!["jpg", "jpeg", "png", "webp"].includes(ext)) throw new Error("Invalid file type");

  // 3. Magic bytes (actual content, not just extension)
  const magic = file.buffer.slice(0, 4).toString("hex");
  const validMagicBytes = ["ffd8ff", "89504e47", "52494646"]; // JPEG, PNG, WEBP
  if (!validMagicBytes.some(m => magic.startsWith(m))) throw new Error("Invalid file content");

  // 4. Generate a safe filename — never use user-supplied filename directly
  const safeFilename = `${crypto.randomUUID()}.${ext}`;
  return safeFilename;
}
```

Never use the user-supplied filename. Never store uploads inside the web root.

## URL Validation and SSRF

Server-Side Request Forgery (SSRF) occurs when user-supplied URLs cause your server to make
requests to internal infrastructure:

```ts
// VULNERABLE
app.post("/fetch", async (req, res) => {
  const data = await fetch(req.body.url); // could be http://169.254.169.254/metadata
});

// SECURE — allowlist domains and block private IP ranges
import { URL } from "url";

function validateExternalUrl(input: string): URL {
  const url = new URL(input); // throws on invalid URL
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("Invalid protocol");

  // Block internal IP ranges
  const hostname = url.hostname;
  if (/^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|127\.|169\.254\.|::1|localhost)/i.test(hostname)) {
    throw new Error("Internal URLs not permitted");
  }
  return url;
}
```

For internal services that need to fetch URLs, use an allowlist of permitted domains.

## ReDoS Prevention

Catastrophic backtracking in regular expressions can freeze your Node.js event loop:

```ts
// VULNERABLE — exponential backtracking on input like "aaaaaaaaaaaaaaaaaaaaaaaaaaaa!"
const emailRegex = /^([a-zA-Z0-9]+(.[a-zA-Z0-9]+)*)+@.+$/;

// SAFE — use a well-tested email validator library instead of custom regex
import { z } from "zod";
const emailSchema = z.string().email(); // Zod uses a safe validation algorithm
```

Rules for safe regex:
- Avoid nested quantifiers: `(a+)+`, `(a*)*`
- Avoid alternation with overlapping options on long inputs
- Use possessive quantifiers or atomic groups when available
- For complex patterns, use a dedicated parsing library instead of regex

## HTML Sanitization with DOMPurify

When you must accept and render HTML from users (rich text editors, comments), sanitize with
DOMPurify before rendering:

```ts
import DOMPurify from "isomorphic-dompurify";

const clean = DOMPurify.sanitize(userHtml, {
  ALLOWED_TAGS: ["b", "i", "em", "strong", "a", "p", "ul", "ol", "li"],
  ALLOWED_ATTR: ["href", "title", "target"],
  FORCE_BODY: true,
});
```

Never use `innerHTML` with unsanitized content. For React, use `dangerouslySetInnerHTML` only
with DOMPurify-sanitized content.

## Path Traversal Prevention

Path traversal attacks use `../` sequences to escape intended directories:

```ts
import path from "path";

const BASE_DIR = "/var/app/uploads";

function safeFilePath(filename: string): string {
  // Resolve the full path
  const resolved = path.resolve(BASE_DIR, filename);

  // Verify it is still under the base directory
  if (!resolved.startsWith(BASE_DIR + path.sep)) {
    throw new Error("Path traversal detected");
  }
  return resolved;
}
```

Always resolve paths before checking them. `path.normalize` alone is not sufficient — it
leaves the final path unchecked relative to the intended root.