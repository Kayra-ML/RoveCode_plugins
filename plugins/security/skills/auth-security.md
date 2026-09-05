# Authentication Security

## JWT Security: Algorithm Confusion Attacks

JSON Web Tokens are only as secure as their verification. The most critical mistake is not
explicitly specifying the expected algorithm:

```ts
// VULNERABLE — accepts any algorithm the token claims
jwt.verify(token, secret);

// SECURE — reject anything other than HS256
jwt.verify(token, secret, { algorithms: ["HS256"] });
```

**Algorithm confusion attack:** an attacker takes an RS256 token signed with the server's
public key, changes the header to `"alg": "HS256"`, and re-signs it using the public key as
the HMAC secret. If the server does not pin the algorithm, it verifies successfully.

**None algorithm attack:** the attacker sets `"alg": "none"` and removes the signature.
Libraries that allow unsigned tokens will accept this. Always reject the `none` algorithm.

Never trust `alg` from the token header. Pin the algorithm at verification time.

## Token Storage: XSS vs CSRF

There is no perfectly safe place to store tokens in the browser. The choice is between two
attack surfaces:

**localStorage / sessionStorage** — vulnerable to XSS. Any injected script can read `localStorage`
and exfiltrate tokens. If your app has a single XSS vulnerability, all tokens are compromised.

**httpOnly cookies** — not accessible to JavaScript, so XSS cannot steal them. But cookies
are sent automatically, making the app vulnerable to CSRF.

**The correct solution:** httpOnly cookies + `SameSite=Strict` (or `SameSite=Lax` for sites
that need cross-site GET requests) + a CSRF token for state-changing operations.

```ts
res.cookie("token", jwt, {
  httpOnly: true,
  secure: true,           // HTTPS only
  sameSite: "strict",     // prevents CSRF
  maxAge: 15 * 60 * 1000, // 15 minutes
});
```

## Refresh Token Rotation

Short-lived access tokens (15 minutes) with long-lived refresh tokens (7–30 days) reduce
exposure. Implement refresh token rotation: every time a refresh token is used to issue a
new access token, the old refresh token is invalidated and a new one is issued.

If a stolen refresh token is used, the rotation detects it (the legitimate user's token was
already rotated), invalidates the entire family of tokens, and the attacker is locked out.

```ts
async function refreshAccessToken(refreshToken: string) {
  const stored = await db.refreshTokens.findUnique({ where: { token: refreshToken } });
  if (!stored || stored.revoked) {
    // Token reuse detected — revoke entire family
    await db.refreshTokens.revokeFamily(stored?.familyId);
    throw new Error("Token reuse detected");
  }
  await db.refreshTokens.revoke(refreshToken);
  const newRefresh = await db.refreshTokens.create({ familyId: stored.familyId });
  const newAccess = generateAccessToken(stored.userId);
  return { accessToken: newAccess, refreshToken: newRefresh.token };
}
```

## Brute Force Protection

Implement layered protection:

**Rate limiting per IP:** limit login attempts to 5 per minute per IP. Use Redis for distributed
rate limiting across multiple instances.

**Account lockout:** after N failed attempts for a specific account (e.g., 10), lock the account
for 15 minutes. Distinguish between IP-based and account-based limiting — an attacker with
many IPs can bypass IP limits but not account lockout.

**CAPTCHA:** add after 3–5 failed attempts. Use hCaptcha or Cloudflare Turnstile (not
reCAPTCHA, which leaks user data to Google).

**Timing-safe comparison:** always use `crypto.timingSafeEqual()` or bcrypt's constant-time
compare to prevent timing attacks on password comparison.

## Password Requirements: NIST Guidelines

NIST SP 800-63B (2017) reversed decades of bad password advice:

- Minimum 8 characters, allow up to 64+
- Allow all printable Unicode including spaces and emoji
- **Do not** require composition rules (uppercase + number + symbol)
- **Do not** require periodic rotation for non-compromised accounts
- Check against lists of known-compromised passwords (Have I Been Pwned API)
- Do not display password hints or security questions

Users pick stronger passwords when they are not constrained by arbitrary rules.

## bcrypt vs argon2

**bcrypt** — battle-tested, widely supported, 20+ years without cryptographic breaks. Work
factor is logarithmic; each increment doubles the time. Recommended cost factor: 12.
Maximum password length: 72 bytes (longer passwords are silently truncated).

**argon2id** — winner of the Password Hashing Competition (2015). Memory-hard (resists GPU
attacks), configurable time and memory parameters. Use when bcrypt's 72-byte limit or
GPU-resistance matters. Recommended: 64MB memory, 3 iterations, parallelism 4.

Use bcrypt for most web applications. Use argon2id when defending against well-resourced
attackers with GPU clusters.

## Multi-Factor Authentication Patterns

**TOTP (Time-based One-Time Password):** RFC 6238 standard, compatible with Google Authenticator,
Authy, 1Password. Generate a secret per user, store encrypted. Verify with 30-second window
and ±1 step tolerance for clock skew.

**WebAuthn / Passkeys:** phishing-resistant, hardware-bound. The authenticator signs a
challenge with a private key that never leaves the device. No shared secret to steal.
Use the `@simplewebauthn/server` library for Node.js.

**SMS OTP:** weakest MFA option. Vulnerable to SIM swapping and SS7 attacks. Acceptable for
low-risk applications; unacceptable for financial or high-security contexts.

## Session Fixation Prevention

Session fixation: an attacker sets a known session ID before login. After the user authenticates,
the attacker uses the same ID.

Prevention: **always regenerate the session ID on authentication**:

```ts
app.post("/login", async (req, res) => {
  const user = await authenticate(req.body);
  // Regenerate session ID before setting authenticated state
  await new Promise((resolve, reject) =>
    req.session.regenerate((err) => (err ? reject(err) : resolve(undefined)))
  );
  req.session.userId = user.id;
  req.session.role = user.role;
  res.json({ success: true });
});
```

Never reuse a pre-authentication session ID for an authenticated session.

## Account Enumeration Prevention

Login and password-reset endpoints leak whether an account exists if they return different
messages for "wrong email" vs "wrong password":

```
// Leaks account existence:
"No account found for that email"   ← tells attacker email is wrong
"Incorrect password"                ← tells attacker email is correct
```

**Prevention:** always return the same message and the same response time regardless of
whether the account exists:

```ts
app.post("/login", async (req, res) => {
  const { email, password } = req.body;
  // Always fetch — do not short-circuit on missing account
  const user = await db.users.findByEmail(email);

  // Always run bcrypt even when user is null (prevents timing difference)
  const DUMMY_HASH = "$2b$12$invalidhashpadding000000000000000000000000000000000000";
  const hash = user?.passwordHash ?? DUMMY_HASH;
  const match = await bcrypt.compare(password, hash);

  if (!user || !match) {
    return res.status(401).json({ error: "Invalid email or password" });
  }
  // proceed with session
});
```

Apply the same pattern to password-reset: always return "If that email exists, you will
receive a link" regardless of outcome.

## Credential Stuffing Mitigation

Credential stuffing uses breached username/password pairs from other sites. Users reuse
passwords; attackers exploit it at scale.

**Mitigation layers:**

1. **Check against breach databases at registration and login** using the HaveIBeenPwned
   k-Anonymity API (send only the first 5 chars of the SHA-1 hash):

```ts
import crypto from "crypto";

async function isPasswordBreached(password: string): Promise<boolean> {
  const sha1 = crypto.createHash("sha1").update(password).digest("hex").toUpperCase();
  const prefix = sha1.slice(0, 5);
  const suffix = sha1.slice(5);
  const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`);
  const text = await res.text();
  return text.split("\n").some((line) => line.startsWith(suffix));
}
```

2. **Device fingerprinting:** flag logins from new devices/countries. Send an email alert
   and require step-up authentication.

3. **IP reputation:** integrate with services like IPQualityScore or Cloudflare WAF rules
   to block known proxy/VPN exit nodes that attackers use.

4. **Slow down valid-but-suspicious logins** with a progressive delay (1s, 2s, 4s) rather
   than hard lockout, reducing DoS risk on the lockout path.

## Session Management Checklist

Complete session lifecycle requirements:

**Issuance:**
- [ ] Generate with `crypto.randomBytes(32)` or equivalent (256-bit entropy minimum)
- [ ] Regenerate on every privilege change (login, role change, password change)
- [ ] Set `httpOnly`, `Secure`, `SameSite=Strict` on the cookie

**Lifetime:**
- [ ] Idle timeout: invalidate after N minutes of inactivity (e.g., 30 min)
- [ ] Absolute timeout: force re-authentication after N hours regardless of activity (e.g., 8h)
- [ ] Refresh token sliding window: extend on each use up to the absolute max

**Invalidation:**
- [ ] Logout: delete session from store server-side, clear cookie client-side
- [ ] Password change: invalidate all other sessions for the user
- [ ] Account compromise signal: invalidate all sessions and send notification
- [ ] Server-side session store (Redis/DB): never rely on client-side state alone

**Storage:**
- [ ] Store session IDs hashed (SHA-256) in the database — raw IDs in the DB are a breach risk
- [ ] Index by user ID to support "logout all devices"

## TOTP Implementation (Node.js)

Complete TOTP setup with `otplib`:

```ts
import { authenticator } from "otplib";
import qrcode from "qrcode";

// Enrollment: generate a secret for the user
async function enrollTotp(userId: string) {
  const secret = authenticator.generateSecret(); // 20-byte base32 secret
  const uri = authenticator.keyuri(userId, "MyApp", secret);
  const qrDataUrl = await qrcode.toDataURL(uri);

  // Store the secret encrypted at rest; mark as unverified until first use
  await db.users.update(userId, {
    totpSecret: encrypt(secret),
    totpEnabled: false,
  });

  return { qrDataUrl, secret }; // show QR to user
}

// Verification: check the 6-digit code
async function verifyTotp(userId: string, code: string): Promise<boolean> {
  const user = await db.users.findById(userId);
  const secret = decrypt(user.totpSecret);

  // ±1 window tolerates 30-second clock skew
  authenticator.options = { window: 1 };
  const isValid = authenticator.verify({ token: code, secret });

  if (isValid) {
    // Prevent replay: store the used token with expiry = 90 seconds
    const already = await redis.get(`totp:used:${userId}:${code}`);
    if (already) return false;
    await redis.setex(`totp:used:${userId}:${code}`, 90, "1");
    if (!user.totpEnabled) {
      await db.users.update(userId, { totpEnabled: true });
    }
  }
  return isValid;
}
```

**Recovery codes:** generate 8–10 single-use codes at enrollment. Hash them before storage.
Let the user download or print them. Treat each as a one-time password.

## WebAuthn / Passkeys (Basics)

WebAuthn replaces passwords with public-key cryptography. The private key never leaves the
authenticator (hardware key, Face ID, Touch ID):

```ts
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from "@simplewebauthn/server";

// Registration: generate challenge for the browser
const options = await generateRegistrationOptions({
  rpName: "MyApp",
  rpID: "myapp.com",
  userID: user.id,
  userName: user.email,
  attestationType: "none",
  authenticatorSelection: {
    residentKey: "preferred",  // enables passkey (synced credential)
    userVerification: "preferred",
  },
});

// Store options.challenge in session, send options to browser
// Browser calls navigator.credentials.create(options) and posts the result back

// Verification: validate the attestation
const verification = await verifyRegistrationResponse({
  response: req.body,
  expectedChallenge: session.challenge,
  expectedOrigin: "https://myapp.com",
  expectedRPID: "myapp.com",
});

if (verification.verified) {
  await db.credentials.save({
    userId: user.id,
    credentialID: verification.registrationInfo.credentialID,
    publicKey: verification.registrationInfo.credentialPublicKey,
    counter: verification.registrationInfo.counter,
  });
}
```

WebAuthn is phishing-resistant because the origin is cryptographically bound — a fake site
cannot collect and replay the assertion.