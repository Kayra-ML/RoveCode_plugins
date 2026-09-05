# RoveCode Plugins

**The adaptive intelligence layer that learns how you work.**

RoveCode Plugins is a token-efficient, domain-aware skill and memory system for AI coding tools. It routes every request to only the knowledge that matters — no noise, no wasted context — and learns your preferences over time.

Built as an MCP server, it works with OpenCode, VS Code extensions (Kilo Code), Hermes Agent, and any MCP-compatible tool.

---

## Why RoveCode Plugins?

Most AI tools inject everything into context hoping something sticks. RoveCode Plugins thinks first.

| Problem | RoveCode Solution |
|---------|------------------|
| AI doesn't know your stack | Domain plugin system — 11 plugins, 72 skills |
| Context window fills with irrelevant knowledge | Token-efficient router — avg 2,698 tokens per request |
| AI forgets your preferences between sessions | Personal Skill file — one evolving profile per user |
| Routing requires expensive LLM calls | Deterministic classifier — 0-4ms, no API cost |
| AI gives generic answers | Learning system — explicit likes, dislikes, verified solutions |

---

## Benchmark Results

Tested against 20 real-world scenarios across 9 domains.

```
Overall Score:    98/100  (A+)
Routing Accuracy: 99/100  — 100% plugin match, 100% skill hit rate
Token Efficiency: 99/100  — avg 2,621 tokens (vs mem0's 6,900 baseline)
Routing Speed:    100/100 — avg 1ms, deterministic
Plugin Isolation: 94/100  — Rust requests never load web-design knowledge
```

Also see [`benchmark/large/`](benchmark/large/) for a 445-scenario stress test built directly from every skill's real activation data — it's what caught and verified the classifier/router fixes behind these numbers.

### Competitor Comparison

| System | Routing | Memory | Skill | Learning | Token | Overall |
|--------|---------|--------|-------|----------|-------|---------|
| **RoveCode Plugins** | **99** | 72 | 78 | **65** | **99** | **83** |
| mem0 | 85 | **95** | 0 | 0 | 95 | 55 |
| Cursor Rules | 45 | 0 | 55 | 0 | 30 | 26 |
| OpenCode Skills | 60 | 0 | 70 | 0 | 75 | 41 |
| Continue.dev | 40 | 0 | 50 | 10 | 35 | 27 |
| LangChain Hub | 10 | 0 | 60 | 0 | 20 | 18 |
| Pieces LTM | 50 | **90** | 0 | 0 | 45 | 37 |

> RoveCode Plugins is the only system that combines routing + memory + skill injection + learning simultaneously.

---

## Plugin Library

11 domain plugins, 72 specialized skills.

| Plugin | Skills | Best For |
|--------|--------|----------|
| **web-design** | creative-direction, typography, layout-composition, responsive-design, interaction-design, motion-engineering, accessibility, web-performance, browser-qa, visual-review, spacing-rhythm, color-system | UI, landing pages, dashboards, design systems |
| **backend** | api-design, authentication, middleware-design, error-handling-http, rate-limiting, express-patterns | REST/GraphQL APIs, Node.js servers, auth |
| **database** | schema-design, query-optimization, migrations, indexing-strategy, transactions, orm-patterns | PostgreSQL, Drizzle, Prisma, slow queries |
| **rust** | rust-core, ownership-borrowing, async-concurrency, performance, error-handling, cli-engineering | Rust code, lifetimes, Tokio, CLI tools |
| **security** | auth-security, input-validation, dependency-audit, xss-csrf-protection, injection-prevention, secrets-hygiene | OWASP, XSS/CSRF, JWT security, audits |
| **devops** | docker-patterns, ci-cd, environment-config, logging-monitoring, deployment-strategies, secrets-management | Docker, GitHub Actions, deployment |
| **testing** | unit-testing, integration-testing, e2e-testing, tdd-patterns, mocking-patterns, performance-testing | Vitest, Playwright, TDD, coverage |
| **ai-engineering** | prompt-engineering, rag-patterns, fine-tuning, agent-design, embedding-strategies, llm-evaluation | LLMs, RAG, embeddings, agents |
| **mobile** | react-native-patterns, mobile-performance, navigation-patterns, offline-storage, push-notifications, app-store | React Native, Expo, iOS/Android |
| **automation** | workflow-design, browser-automation, scheduling, data-transformation, scraping-strategy, reliability-retries | Scraping, ETL, cron, Playwright |
| **game-development** | game-loop, physics-patterns, rendering-pipeline, input-handling, game-state, asset-management | Unity, Godot, 2D/3D games |

---

## Key Features

### Token-Efficient Routing
Every request goes through a 3-step pipeline with no LLM calls:

```
User request
    ↓
Deterministic classifier (0-4ms)
    ↓
Plugin match → Skill metadata scan (no body loading)
    ↓
Score-based selection → Token budget enforcement
    ↓
Only selected skill bodies loaded
    ↓
Personal knowledge retrieved (TF-IDF + entity boost + temporal scoring)
    ↓
Compact context assembled
```

### Personal Skill System
Each user gets one evolving `skill.md` file. It learns from:

- **Explicit likes** — "I like this approach, keep it"
- **Explicit dislikes** — "Don't use rounded cards"
- **Remember signals** — "Remember that I prefer compact layouts"
- **Verified solutions** — When a fix passes tests, it's recorded

Personal knowledge uses TF-IDF cosine similarity + named entity boosting + temporal scoring for retrieval. Domain-aware: Rust preferences never appear in web-design requests.

### Automatic Learning
After each response, the `analyze_and_learn` tool detects signals automatically:

```
User: "Perfect, keep sidebars like this"
→ record: design-preference, explicit-like, domain: web-design
→ personal skill updated

Next request about dashboards:
→ "prefers narrow sidebar" retrieved automatically
```

### Skill Composition
Skills declare relationships. Selecting `creative-direction` auto-suggests `typography`, `layout-composition`, and `color-system`. No manual configuration needed.

---

## Installation

### Requirements
- [Bun](https://bun.sh) v1.0+

Clone the repository:

```bash
git clone https://github.com/Kayra-ML/RoveCode_plugins
cd RoveCode_plugins
bun install
```

---

### OpenCode

Add to `~/.config/opencode/opencode.jsonc`:

```jsonc
{
  "mcp": {
    "rovecode-plugins": {
      "type": "local",
      "enabled": true,
      "command": [
        "bun",
        "run",
        "/path/to/RoveCode_plugins/src/mcp/index.ts"
      ]
    }
  }
}
```

Replace `/path/to/RoveCode_plugins` with your actual clone path.

Verify connection:

```bash
opencode mcp list
# rovecode-plugins  ✓ connected
```

The system prompt in `AGENTS.md` automatically instructs the model to call `route_request` and `get_context` before every response.

---

### VS Code (Kilo Code)

Open Kilo Code settings (`Ctrl+Shift+P` → "Kilo Code: Open MCP Settings") and add:

```json
{
  "mcpServers": {
    "rovecode-plugins": {
      "command": "bun",
      "args": ["run", "/path/to/RoveCode_plugins/src/mcp/index.ts"]
    }
  }
}
```

---

### Hermes Agent

Add to your Hermes agent configuration:

```json
{
  "mcp_servers": {
    "rovecode-plugins": {
      "transport": "stdio",
      "command": "bun",
      "args": ["run", "/path/to/RoveCode_plugins/src/mcp/index.ts"]
    }
  }
}
```

---

### Any MCP-Compatible Tool

The server exposes 4 tools over stdio MCP:

| Tool | Description |
|------|-------------|
| `route_request` | Route a request → returns selected plugins, skills, personal entries |
| `get_context` | Assemble full context → returns ready-to-inject system prompt section |
| `record_learning` | Record explicit preference or verified solution |
| `analyze_and_learn` | Analyze a conversation turn → auto-detect and apply learning signals |

Test the server directly:

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | bun run src/mcp/index.ts
```

---

## How It Works

### Request Flow

```
"Build a responsive SaaS dashboard"
         ↓
[classifier] web-design (100% confidence, 1ms)
         ↓
[plugins] web-design selected / rust, backend, game-dev rejected
         ↓
[skills] layout-composition, responsive-design, spacing-rhythm selected
         [skills] typography, visual-review, motion-engineering — score below threshold, rejected
         ↓
[personal] "prefers narrow sidebar" retrieved (TF-IDF cosine: 0.87)
         ↓
[budget] 2,650 tokens / 6,000 budget (44%)
         ↓
[context] assembled → injected into model
```

### Personal Skill Updates

The updater uses 6 operations: ADD, MERGE, STRENGTHEN, WEAKEN, REPLACE, IGNORE.

Similar entries are detected via TF-IDF cosine similarity and merged instead of duplicated. Contradictions are detected automatically ("light mode" preference weakens existing "dark mode" entry). Entries decay over time (6+ months → ×0.95 strength per cycle). Solved-problems never decay.

---

## Debug Mode

Inspect routing decisions:

```bash
bun run src/cli/index.ts route "Build a SaaS dashboard" default --debug
```

Output:

```
[classifier] domains: web-design
[classifier] keywords: saas dashboard, responsive design
[plugins] ✓ selected: web-design
[plugins] ✗ rejected: rust (no domain/hint match)
[skills] ✓ selected: web-design/layout-composition (~750 tokens)
[skills] ✓ selected: web-design/responsive-design (~700 tokens)
[skills] ✗ rejected: web-design/typography — score 0.18 below threshold 0.3
[budget] estimated total: 2,650 / 6,000
```

---

## License

© 2026 Kayra-ML / RoveCode. All rights reserved.

This software is provided for use only. Modification, redistribution, sublicensing, or derivative works are not permitted without explicit written permission from the author.