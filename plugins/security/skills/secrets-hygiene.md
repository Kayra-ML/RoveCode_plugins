# Secrets Hygiene

## How Secrets Leak

Understanding the attack surface is the first step to protecting secrets:

**Git history:** a secret committed even once is permanently in the repository history, even
after deletion. Anyone who clones or has cloned the repo may have it. GitHub and GitLab
archives mean deleted repos can still be cached.

**Log files:** `console.log(config)` or error reporting that serializes request objects can
expose API keys, database URLs, and tokens in log aggregators accessible to many engineers.

**Error messages:** stack traces that include environment variables, configuration objects,
or request headers sent to users or external error tracking.

**process.env exposure:** a debugging endpoint or health check that returns environment
variables to unauthenticated callers.

**Build artifacts:** environment variables baked into frontend bundles. `REACT_APP_*` and
`VITE_*` variables are intentionally included in the browser bundle — never put private keys
there.

**Third-party integrations:** error monitoring (Sentry), logging (Datadog), APM tools, and
CI/CD platforms can inadvertently capture secrets in breadcrumbs, spans, or build logs.

## Pre-Commit Hooks with git-secrets / detect-secrets

Block secrets before they reach the repository:

```bash
# Install detect-secrets
pip install detect-secrets

# Create a baseline (scan existing code, mark known false positives)
detect-secrets scan > .secrets.baseline

# Install as pre-commit hook
# .pre-commit-config.yaml
repos:
  - repo: https://github.com/Yelp/detect-secrets
    rev: v1.4.0
    hooks:
      - id: detect-secrets
        args: ["--baseline", ".secrets.baseline"]
```

For Node.js projects, use `@secretlint/secretlint` with Husky:

```bash
npx husky add .husky/pre-commit "npx secretlint '**/*'"
```

The hook runs before every commit and fails if a secret pattern is detected.

## GitHub Secret Scanning

GitHub automatically scans repositories for over 200 secret patterns (AWS keys, Stripe keys,
GitHub tokens, etc.) and alerts the owner. Enable it in Settings → Security → Secret scanning.

For organizations: enable push protection to block commits that contain secrets before they
are pushed, not just after.

```bash
# Manually scan a local repository
gh secret scanning list-alerts --repo owner/repo
```

When GitHub alerts you that a secret was pushed:
1. Rotate the credential immediately — assume it is compromised
2. Remove it from history (BFG or git-filter-repo)
3. Review access logs for the credential to assess impact

## Removing Secrets from Git History

If a secret was committed, it must be purged from history using BFG Repo Cleaner (faster
than `git filter-branch`):

```bash
# Install BFG
brew install bfg  # or download bfg.jar

# Remove a file that contained secrets
bfg --delete-files secrets.env

# Replace specific strings (the leaked API key value)
echo "LEAKED_API_KEY_VALUE" > secrets.txt
bfg --replace-text secrets.txt

# After BFG, force push all branches and tags
git reflog expire --expire=now --all
git gc --prune=now --aggressive
git push --force --all
git push --force --tags
```

**Critical:** force-push invalidates existing clones. Notify all collaborators to re-clone.
Consider the secret compromised regardless — someone may have a copy already.

## The .env.example Pattern

Never commit `.env` files. Commit `.env.example` with placeholder values to document
required configuration:

```bash
# .env (in .gitignore — NEVER commit)
DATABASE_URL=postgresql://user:actualpassword@prod-host/mydb
STRIPE_SECRET_KEY=sk_live_actualkey
JWT_SECRET=actual256bitsecret

# .env.example (committed — shows shape without real values)
DATABASE_URL=postgresql://user:password@localhost/mydb
STRIPE_SECRET_KEY=sk_test_replace_me
JWT_SECRET=replace-with-256-bit-secret
```

Add to `.gitignore`:
```
.env
.env.local
.env.*.local
```

Use dotenv-vault or similar tools for team secret sharing rather than passing `.env` files
via Slack or email.

## Secret Rotation Procedures

Every secret should have a documented rotation procedure before it is issued:

1. **Generate new credential** — create the new API key or password without revoking the old one
2. **Deploy new credential** — update the secret in your vault/environment and deploy
3. **Verify** — confirm the new credential works in production via health checks
4. **Revoke old credential** — now that traffic is using the new one, revoke the old one
5. **Confirm revocation** — verify the old credential returns 401/403

Automate rotation for high-value secrets (database passwords, root API keys) using tools
like HashiCorp Vault's dynamic secrets, which issue short-lived credentials automatically.

## Least-Privilege API Keys

Create separate API keys per service with the minimum required permissions:

```
❌ One master API key with full access used everywhere
✓ Read-only key for analytics service
✓ Write-only key for the background job that sends emails
✓ Scoped key for the webhook processor (can only write webhook events)
```

This limits the blast radius of a leak. A stolen read-only key cannot write data. A stolen
webhook key cannot access user records.

## Separating Secrets by Environment

Never share secrets across environments:

```
production:
  DATABASE_URL: postgresql://prod-host/mydb_prod
  STRIPE_SECRET_KEY: sk_live_...

staging:
  DATABASE_URL: postgresql://staging-host/mydb_staging
  STRIPE_SECRET_KEY: sk_test_...  # test keys only

development:
  DATABASE_URL: postgresql://localhost/mydb_dev
  STRIPE_SECRET_KEY: sk_test_...
```

Production credentials should be accessible only to automated deployment pipelines, not
to individual engineers' workstations.

## Audit Logs and Secret Expiry

Enable audit logging for every secret access in your vault or cloud provider:
- AWS: CloudTrail logs all Secrets Manager API calls
- GitHub: audit log records every secret access
- HashiCorp Vault: audit backend logs every request

Set expiry policies: temporary credentials for contractors and third parties should expire
automatically. Review active credentials quarterly and revoke unused ones. An expired but
unrevoked credential is a liability waiting to be exploited.