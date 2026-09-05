# Dependency Audit

## npm / bun audit Workflow

Run `npm audit` or `bun audit` as part of every CI pipeline. A clean audit output is a
baseline requirement before merging any pull request:

```bash
# Exit non-zero if vulnerabilities above a threshold exist
npm audit --audit-level=high

# For bun
bun audit

# JSON output for parsing in CI scripts
npm audit --json | jq '.vulnerabilities | to_entries[] | select(.value.severity == "critical")'
```

Do not ignore audit failures with `--force` or `npm audit fix --force`. The `--force` flag
installs breaking changes blindly and often introduces new problems.

## Understanding CVSS Scores

The Common Vulnerability Scoring System (CVSS) rates vulnerabilities from 0.0 to 10.0:

- **Critical (9.0–10.0):** exploit requires no authentication, network-accessible, full impact.
  Patch immediately or disable the feature.
- **High (7.0–8.9):** significant impact, limited access required. Patch within days.
- **Medium (4.0–6.9):** meaningful risk. Patch within weeks.
- **Low (0.1–3.9):** limited impact. Patch in regular maintenance cycle.

CVSS scores are context-dependent. A "Critical" vulnerability in a package used only for
build tooling (not in production code) has zero runtime impact. A "Medium" vulnerability in
your authentication library can be catastrophic. Assess exploitability in your deployment
context, not just the score.

## Dependency Update Strategy

**Dependabot** (GitHub-native) and **Renovate** (more configurable, self-hosted option) automate
dependency update pull requests:

```yaml
# .github/dependabot.yml
version: 2
updates:
  - package-ecosystem: "npm"
    directory: "/"
    schedule:
      interval: "weekly"
    groups:
      dev-deps:
        patterns: ["eslint*", "typescript", "vitest"]
    ignore:
      - dependency-name: "some-package"
        versions: ["2.x"]  # stay on v1 until migration is complete
```

Strategy: group non-breaking minor/patch updates into a single weekly PR. Keep major version
updates as individual PRs with a migration checklist.

## Lockfile Importance

The lockfile (`package-lock.json`, `bun.lockb`, `yarn.lock`) pins exact versions of every
transitive dependency. Never skip it:

- Without a lockfile, `npm install` resolves different versions in CI vs development vs production.
- A dependency may be `^1.2.3` in `package.json` but a malicious `1.2.4` could be published.
- The lockfile is evidence of exactly what code ran in production.

Commit lockfiles to source control. Review lockfile changes in PRs — a PR that touches only
`package.json` but shows 50 lockfile changes deserves scrutiny.

## Transitive Dependency Risks

Your `package.json` might have 30 direct dependencies, but `node_modules` may contain 600+
packages. Every transitive dependency is attack surface:

```bash
# See the full dependency tree
npm ls --all

# Find who depends on a specific package
npm why package-name

# Check for duplicate package versions (bloat + inconsistency risk)
npx find-duplicate-packages
```

When a transitive dependency has a vulnerability that your direct dependency hasn't patched,
use overrides (npm/bun) or resolutions (yarn) to force a specific version:

```json
{
  "overrides": {
    "vulnerable-transitive-pkg": ">=2.0.0"
  }
}
```

## Supply Chain Attacks

Real attacks that have occurred:
- **Typosquatting:** `crossenv` (malicious) vs `cross-env` (legitimate). 3,000+ weekly downloads.
- **Compromised maintainer:** `event-stream` had a malicious dependency injected by a new maintainer.
- **Dependency confusion:** internal package names published to the public registry.

Defenses:
- `npm install --ignore-scripts` in CI (prevents postinstall scripts from executing)
- Review packages before installing: `npm info package-name`, check download counts, GitHub
  stars, and last publish date
- Use a private registry (Verdaccio, npm Enterprise) to control which packages are available
- Verify package integrity hashes with `npm audit signatures`

## Minimal Dependency Principle

Every dependency is a liability. Before adding a new package, ask:

1. Can this be implemented in 10–20 lines without a dependency?
2. Is this package actively maintained?
3. How large is the package? Does it have unnecessary transitive deps?
4. Is the package's license compatible with your project?

```bash
# Check bundle size impact
npx bundlephobia package-name

# Check package quality score
npx package-quality package-name
```

Remove unused dependencies regularly:
```bash
npx depcheck
```

## Software Bill of Materials (SBOM)

An SBOM is a formal inventory of all components in your software. Required for government
contracts (US Executive Order 14028) and increasingly expected in enterprise procurement:

```bash
# Generate SBOM in CycloneDX format
npx @cyclonedx/cyclonedx-npm --output-file sbom.json

# Generate in SPDX format
npx spdx-sbom-generator
```

Store SBOMs alongside releases. They enable rapid response when a new CVE is published —
instead of manually checking every project, query the SBOM: "which of our applications
include log4j version < 2.15.0?"

## node_modules Inspection

When a package behaves unexpectedly or a new package looks suspicious:

```bash
# Read the installed source directly
cat node_modules/suspicious-package/index.js

# Check what files a package installed
ls -la node_modules/package-name/

# Look for postinstall scripts that run on install
cat node_modules/package-name/package.json | jq '.scripts'
```

Never blindly run packages with elevated permissions. Audit any package that requests
`preinstall`, `install`, or `postinstall` scripts.