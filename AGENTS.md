# Skill System Agent Instructions

## Automatic Context Loading

At the start of EVERY task, before writing any code or answering:

1. Call `skill-system` → `route_request` with:
   - `userRequest`: the user's message
   - `userId`: "default"

2. Read the returned `selectedSkills` and `selectedPersonalEntries`.

3. Then call `skill-system` → `get_context` to load the full skill content.

4. Use the returned context to inform your response — follow the skill guidelines.

## When to Record Learning

After completing a task:

- If the user says "I like this", "keep it like this", "remember this" → call `record_learning` with signal `explicit-like`
- If the user says "I don't like", "avoid this" → call `record_learning` with signal `explicit-dislike`
- If tests pass and a bug was fixed → call `record_learning` with signal `verified-solution`

Always use `userId: "default"`.

## Plugin Reference

Available domains and when to use them:

| Domain | Use when |
|--------|----------|
| web-design | UI, CSS, layout, typography, animation, dashboard, landing page |
| rust | Rust code, ownership, async, CLI in Rust, performance |
| backend | API, server, Express, Fastify, Hono, authentication, middleware |
| database | SQL, PostgreSQL, schema, migrations, ORM, Drizzle, Prisma |
| devops | Docker, CI/CD, deployment, environment config, secrets |
| testing | Tests, Vitest, Playwright, TDD, mocking, coverage |
| security | XSS, CSRF, JWT, input validation, OWASP, vulnerability |
| mobile | React Native, iOS, Android, Expo, navigation, offline |
| automation | Workflows, scraping, scheduling, data transformation |
| ai-engineering | LLM, RAG, embeddings, prompt engineering, agents |
| game-development | Game loop, physics, rendering, Unity, Godot, input |

## Automatic Learning

After EVERY assistant response, call `skill-system` → `analyze_and_learn` with:
- `userId`: "default"
- `userMessage`: the user's last message
- `assistantResponse`: your response (first 500 chars)
- `apply`: true

This enables the system to learn from every interaction automatically.