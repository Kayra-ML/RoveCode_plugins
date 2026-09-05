# Secrets Management

## Never Store Secrets in Code or Git

The most common security failure: a secret committed to a repository, even briefly, is compromised. Git history is permanent — a force-push doesn't help if the repo was ever public or cloned.

Hard rules:
- No credentials in source code, comments, or config files
- No secrets in Dockerfiles (they end up in image layers)
- No secrets in CI/CD yaml files (use secret variables)
- No secrets in `.env` files committed to version control
- No secrets logged or included in error messages

```bash
# What NOT to do
DATABASE_URL=postgresql://prod-host/myapp   # in config.ts
SECRET_KEY=abc123                            # in Dockerfile ENV
api_key: "sk-live-..."                       # in docker-compose.yml committed to git
```

## Secret Scanning

Scan for accidentally committed secrets before they reach remote:

**Pre-commit hooks (local)**:
```bash
# Install git-secrets
brew install git-secrets
git secrets --install              # installs hooks in current repo
git secrets --register-aws         # add AWS credential patterns
git secrets --add 'sk-[a-zA-Z0-9]{48}'  # custom pattern (OpenAI keys)
```

**CI scanning**:
```yaml
# GitHub Actions — runs on every PR
- name: Scan for secrets
  uses: trufflesecurity/trufflehog@main
  with:
    path: ./
    base: ${{ github.event.repository.default_branch }}
    head: HEAD
    extra_args: --only-verified
```

**GitHub native**: Enable "Secret scanning" and "Push protection" in repository Settings → Security → Code security.

## Secret Management Tools

**HashiCorp Vault** — self-hosted, full-featured, dynamic secrets:
```bash
# Dynamic DB credentials — short-lived, auto-rotated
vault read database/creds/my-role
# Returns: username=v-abc123, password=xyz789, lease_duration=1h
```

**AWS Secrets Manager** — managed, integrates with IAM:
```typescript
import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";

const client = new SecretsManagerClient({ region: "us-east-1" });
const response = await client.send(new GetSecretValueCommand({ SecretId: "myapp/prod/database" }));
const secret = JSON.parse(response.SecretString!);
// { username: "myapp", password: "..." }
```

**Doppler** — developer-friendly SaaS, syncs secrets to any platform:
```bash
doppler setup                          # link project
doppler run -- node dist/server.js     # injects secrets as env vars
doppler secrets set JWT_SECRET $(openssl rand -hex 32)
```

**1Password Secrets Automation** — good for teams already using 1Password.

## Secret Rotation Patterns

Secrets should be rotated regularly and automatically:

```typescript
// Zero-downtime rotation: support two valid values simultaneously
async function getJwtSecret(): Promise<string[]> {
  // Return both current and previous secret
  // JWT verification tries both; signing uses only current
  const [current, previous] = await secretsManager.getSecretVersions("jwt-secret");
  return [current, previous].filter(Boolean);
}

function verifyToken(token: string): JwtPayload {
  const secrets = await getJwtSecret();
  for (const secret of secrets) {
    try { return jwt.verify(token, secret) as JwtPayload; } catch {}
  }
  throw new Error("Invalid token");
}
```

Rotation procedure:
1. Generate new secret, store as "pending" alongside current
2. Update app to accept both (pending and current)
3. Promote pending to current
4. Remove old secret after all tokens signed with it expire

## Least-Privilege Access

Each service should only have access to the secrets it needs:

```
API Server:       DATABASE_URL, JWT_SECRET, REDIS_URL
Email Worker:     SENDGRID_API_KEY, DATABASE_URL (read-only)
Payment Service:  STRIPE_SECRET_KEY, DATABASE_URL
Admin Panel:      DATABASE_URL, ADMIN_JWT_SECRET (different from user JWT)
```

Use separate DB credentials per service with only the permissions that service needs (SELECT only for read services, no DROP TABLE for any service).

## Environment-Specific Secrets

Never share secrets across environments — a staging DB credential should never work in production:

```
myapp/development/database-url   → postgresql://localhost/myapp_dev
myapp/staging/database-url       → postgresql://staging-host/myapp_staging
myapp/production/database-url    → postgresql://prod-host/myapp_prod
```

Use different AWS accounts, Vault namespaces, or Doppler environments to enforce hard separation.

## Secret Injection at Runtime vs Build Time

**Runtime injection** (correct): secrets are environment variables when the process starts. Never baked into the image.

```dockerfile
# WRONG — secret baked into image layer (visible in docker history)
RUN DATABASE_URL=postgres://... npm run migrate

# WRONG — ENV in Dockerfile
ENV API_KEY=sk-live-abc123

# RIGHT — no secrets in Dockerfile, injected at runtime
CMD ["node", "dist/server.js"]
# docker run -e DATABASE_URL=... myapp:latest
```

**Build-time secrets** (when you must): use Docker BuildKit secrets — available during build, not stored in image:
```dockerfile
RUN --mount=type=secret,id=npm_token \
    NPM_TOKEN=$(cat /run/secrets/npm_token) npm install
```

## Audit Logging for Secret Access

Every access to a secret should be logged with: who accessed it, from where, at what time, and which version. This enables:
- Detecting compromised service accounts (unusual access patterns)
- Post-incident forensics (what credential was used)
- Compliance reporting (SOC 2, PCI DSS)

```typescript
// AWS Secrets Manager — access logs in CloudTrail automatically
// HashiCorp Vault — audit log enabled explicitly:
vault audit enable file file_path=/var/log/vault/audit.log

// Application-level audit for sensitive operations
logger.info({
  event:    "secret_accessed",
  secretId: "stripe-api-key",
  service:  "payment-service",
  podId:    process.env.HOSTNAME,
  timestamp: new Date().toISOString(),
});
```