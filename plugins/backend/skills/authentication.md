# Authentication

## JWT Structure

A JWT is three base64url-encoded segments separated by dots: `header.payload.signature`

```
header:    { "alg": "HS256", "typ": "JWT" }
payload:   { "sub": "user_123", "role": "admin", "iat": 1700000000, "exp": 1700003600 }
signature: HMACSHA256(base64(header) + "." + base64(payload), secret)
```

Standard claims to always include: `sub` (subject/user ID), `iat` (issued at), `exp` (expiry). Never put sensitive data (passwords, PII) in the payload — it is only base64-encoded, not encrypted.

## Signing Algorithms

**HS256 (HMAC-SHA256)** — single shared secret, fast. Use for single-service auth where only one server signs and verifies. If the secret leaks, all tokens are compromised.

**RS256 (RSA-SHA256)** — private key signs, public key verifies. Use when multiple services need to verify tokens without access to the signing secret (microservices, third-party verification). More CPU-intensive. Rotate keys via JWKS endpoint.

**ES256 (ECDSA)** — same asymmetric benefits as RS256, shorter keys, faster. Preferred over RS256 for new systems.

## Token Storage: Security Tradeoffs

| Location | XSS Risk | CSRF Risk | Notes |
|----------|----------|-----------|-------|
| `localStorage` | High | None | JS can read it — avoid for sensitive apps |
| Memory (JS var) | Low | None | Lost on refresh — combine with silent refresh |
| `httpOnly` cookie | None | High | Mitigate CSRF with SameSite=Strict or CSRF token |
| `Secure; HttpOnly; SameSite=Strict` cookie | None | Low | Best default for web apps |

**Recommendation**: store access tokens in memory, store refresh tokens in `httpOnly; Secure; SameSite=Strict` cookies.

## Refresh Token Rotation

Every time a refresh token is used, issue a new refresh token and invalidate the old one. If a leaked refresh token is used after rotation, detect reuse and revoke the entire family.

```
1. Client sends refresh token → server validates
2. Server issues new access token + new refresh token
3. Server marks old refresh token as used/invalid
4. If old token is ever presented again → revoke all tokens for that user session
```

## Session vs JWT

| | Sessions | JWT |
|--|---------|-----|
| Storage | Server (Redis/DB) | Client |
| Revocation | Instant | Wait for expiry (or maintain denylist) |
| Scalability | Requires shared store | Stateless, scales horizontally |
| Size | Small cookie | Larger token |

Use sessions when instant revocation is critical (banking, admin panels). Use JWTs for stateless microservices where immediate revocation isn't required.

## Password Hashing

Always use bcrypt, scrypt, or Argon2 — never MD5, SHA-1, or plain SHA-256.

```typescript
import bcrypt from "bcrypt";

const SALT_ROUNDS = 12; // 10 = ~100ms, 12 = ~400ms on modern hardware

async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
```

12 rounds is the current recommended minimum. Increase as hardware gets faster.

## OAuth2 Flows

**Authorization Code + PKCE** — for web apps and mobile. User redirects to provider, gets code, server exchanges for tokens. PKCE prevents code interception.

```
1. Generate code_verifier (random 43-128 char string)
2. code_challenge = base64url(SHA256(code_verifier))
3. Redirect user to: /authorize?response_type=code&code_challenge=...&code_challenge_method=S256
4. Receive code, POST to /token with code + code_verifier
5. Get access_token + refresh_token
```

**Client Credentials** — for machine-to-machine (no user). Service sends client_id + client_secret directly.

**Implicit flow** — deprecated. Do not use.

## Middleware Auth Pattern

```typescript
function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies.accessToken ?? req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: { code: "UNAUTHORIZED" } });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET!) as JwtPayload;
    next();
  } catch {
    res.status(401).json({ error: { code: "TOKEN_INVALID" } });
  }
}
```

## Common Auth Vulnerabilities

- **Weak JWT secrets** — use at least 256-bit random secret; generate with `openssl rand -hex 32`
- **Missing expiry** — always set `exp`; short-lived access tokens (15 min)
- **Algorithm confusion** — pin the expected algorithm; reject `none` algorithm
- **Timing attacks on comparison** — use `crypto.timingSafeEqual` for token/secret comparisons
- **Mass assignment** — never trust `role` or `isAdmin` from user-supplied input
- **Password enumeration** — return same message for "wrong email" and "wrong password"