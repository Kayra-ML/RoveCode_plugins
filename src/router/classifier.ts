import type { Domain } from "../types/index.js";

export interface ClassificationResult {
  domains: Domain[];
  keywords: string[];
  confidence: Record<Domain, number>;
  isAmbiguous: boolean;
}

// Domain keyword maps — signals must be SPECIFIC to the domain.
// Avoid generic words (web, node, server, performance) that appear in many domains.
// Multi-word phrases (bigrams) score 2x and are preferred over single words.
const DOMAIN_SIGNALS: Record<string, string[]> = {
  "web-design": [
    // Visual / design-specific only
    "ui design", "ux design", "web design", "visual design",
    "typography", "typeface", "font pairing", "type scale",
    "color palette", "color system", "brand identity", "design system",
    "landing page", "hero section", "marketing site", "portfolio site",
    "responsive design", "responsive layout", "mobile-first", "breakpoint layout",
    "css animation", "motion design", "micro-interaction",
    "animation", "smooth animation", "scroll animation",
    "accessibility audit", "wcag", "contrast ratio",
    "figma", "sketch app", "framer",
    "tailwind", "css grid", "flexbox layout",
    "dark mode", "light mode", "theme tokens", "design token",
    "whitespace", "visual hierarchy", "layout composition",
    "glassmorphism", "neumorphism",
    "creative direction", "design dna",
    "sidebar design", "dashboard design", "card design",
    "saas dashboard", "dashboard", "dashboard ui",
    "responsive", "navigation design",
  ],
  "rust": [
    "rust", "cargo",
    "ownership", "borrow checker", "lifetime",
    "tokio", "async rust",
    "trait bound", "trait object",
    "enum", "match arm",
    "result type", "option type",
    "struct impl", "unsafe rust",
    "ffi", "wasm",
    "crate", "rustc", "clippy", "rustfmt",
    "zero-cost abstraction", "memory safety",
    "borrow", "lifetime error", "rust cli",
  ],
  "automation": [
    "automate", "automation",
    "workflow automation", "workflow design",
    "scheduled task", "cron job", "cron",
    "web scraping", "scrape", "scraping", "crawl",
    "data pipeline", "etl", "data transformation",
    "batch processing", "retry logic",
    "webhook", "background job", "task queue",
    "puppeteer", "selenium",
  ],
  "backend": [
    "rest api", "graphql api", "api endpoint", "api design",
    "express", "fastify", "hono", "koa",
    "jwt", "oauth", "oauth2", "pkce", "refresh token",
    "rate limiting", "rate limit",
    "middleware", "request handler", "route handler",
    "api server", "backend server", "node.js server", "node.js api",
    "authentication", "authorization",
    "http server", "bun server",
    "node.js", "nodejs", "node api",
    "server performance", "api performance", "backend performance",
  ],
  "database": [
    "sql", "postgres", "postgresql", "mysql", "sqlite", "mongodb",
    "redis",
    "database schema", "db schema", "schema design",
    "migration", "db migration", "schema migration",
    "database index", "composite index", "query optimization",
    "orm", "drizzle", "prisma", "typeorm",
    "transaction", "join query", "foreign key",
    "slow query", "explain analyze",
    "multi-tenant schema",
  ],
  "devops": [
    "docker", "dockerfile", "docker compose",
    "kubernetes", "k8s", "helm chart",
    "github actions", "gitlab ci", "ci/cd", "ci pipeline",
    "terraform", "ansible", "infrastructure as code",
    "nginx", "reverse proxy", "load balancer",
    "ssl certificate", "tls setup",
    "monitoring", "alerting", "observability",
    "deployment strategy", "blue-green", "canary deploy",
    "container", "containerize",
  ],
  "testing": [
    "unit test", "unit tests", "unit testing",
    "integration test", "integration tests", "integration testing",
    "end-to-end test", "e2e test", "e2e tests",
    "jest", "vitest", "cypress",
    "playwright test", "playwright tests", "playwright",
    "test coverage", "code coverage",
    "mock", "stub", "spy",
    "tdd", "test driven", "bdd",
    "test suite", "test spec", "write tests",
  ],
  "security": [
    "xss", "cross-site scripting",
    "csrf", "cross-site request forgery",
    "sql injection", "injection attack", "code injection",
    "owasp", "vulnerability", "security audit",
    "jwt security", "token security", "auth security",
    "oauth", "oauth2", "pkce",
    "input validation", "sanitization", "sanitize input",
    "content security policy", "csp header",
    "dependency audit", "npm audit", "security scan",
    "penetration test", "pentest",
    "secrets management", "credential leak",
  ],
  "mobile": [
    "react native", "expo sdk",
    "ios app", "android app", "native app",
    "mobile navigation", "react navigation",
    "offline storage", "asyncstorage", "mmkv",
    "push notification", "fcm", "apns",
    "app store", "play store", "eas build",
    "mobile performance", "hermes", "metro bundler",
    "native module",
  ],
  "ai-engineering": [
    "llm", "large language model",
    "prompt engineering", "system prompt", "prompt template",
    "rag", "retrieval augmented",
    "vector search", "vector store",
    "embedding", "embeddings",
    "openai api", "anthropic api", "langchain",
    "fine-tune", "fine-tuning", "finetune",
    "ai agent", "agentic", "tool calling",
    "semantic search", "model evaluation",
    "chatgpt api",
  ],
  "game-development": [
    "unity", "unreal engine", "godot",
    "game loop", "game engine", "game physics",
    "sprite", "tilemap", "tileset",
    "game shader", "vertex shader",
    "collision detection", "hitbox", "rigidbody",
    "game state", "game scene",
    "delta time", "fixed timestep",
    "game object", "prefab",
    "2d platformer", "3d game",
    "physics engine",
  ],
};

export function classifyRequest(request: string): ClassificationResult {
  const lower = request.toLowerCase();
  const words = lower.split(/[\s,.\-_/(){}[\]'"!?]+/).filter((w) => w.length > 1);
  const wordSet = new Set(words);

  // Build bigrams and trigrams for multi-word signal matching
  const ngrams = new Set<string>();
  for (let i = 0; i < words.length - 1; i++) {
    ngrams.add(`${words[i]} ${words[i + 1]}`);
  }
  for (let i = 0; i < words.length - 2; i++) {
    ngrams.add(`${words[i]} ${words[i + 1]} ${words[i + 2]}`);
  }

  const scores: Record<string, number> = {};
  const matchedKeywords: string[] = [];

  for (const [domain, signals] of Object.entries(DOMAIN_SIGNALS)) {
    let score = 0;
    for (const signal of signals) {
      const isMultiWord = signal.includes(" ");
      const matched = isMultiWord ? ngrams.has(signal) : wordSet.has(signal);
      if (matched) {
        // Multi-word signals are much more specific → higher weight
        score += isMultiWord ? 3 : 1;
        matchedKeywords.push(signal);
      }
    }
    scores[domain] = score;
  }

  const maxScore = Math.max(...Object.values(scores), 0);

  // Stricter threshold: must score at least 60% of the best-matching domain
  // AND at least 2 points absolute minimum
  const threshold = Math.max(2, maxScore * 0.6);

  const selectedDomains = Object.entries(scores)
    .filter(([, s]) => s >= threshold)
    .sort((a, b) => b[1] - a[1])
    .map(([d]) => d as Domain);

  const confidence: Record<Domain, number> = {};
  for (const [d, s] of Object.entries(scores)) {
    confidence[d as Domain] = maxScore > 0 ? s / maxScore : 0;
  }

  // If nothing passes threshold, fall back to the highest-scoring domain (never empty)
  const finalDomains = selectedDomains.length > 0
    ? selectedDomains
    : Object.entries(scores)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 1)
        .map(([d]) => d as Domain);

  return {
    domains: finalDomains,
    keywords: [...new Set(matchedKeywords)],
    confidence,
    isAmbiguous: selectedDomains.length === 0 || selectedDomains.length > 2 || maxScore < 3,
  };
}

export function extractKeywordsFromRequest(request: string): string[] {
  const stopWords = new Set([
    "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
    "have", "has", "had", "do", "does", "did", "will", "would", "could",
    "should", "may", "might", "shall", "can", "need", "dare", "ought",
    "used", "to", "of", "in", "on", "at", "by", "for", "with", "about",
    "against", "between", "into", "through", "during", "before", "after",
    "above", "below", "from", "up", "down", "out", "off", "over", "under",
    "again", "then", "once", "here", "there", "when", "where", "why",
    "how", "all", "both", "each", "few", "more", "most", "other", "some",
    "such", "no", "nor", "not", "only", "own", "same", "so", "than",
    "too", "very", "just", "my", "our", "your", "his", "her", "its",
    "and", "but", "or", "if", "as", "that", "this", "these", "those",
    "i", "we", "you", "it", "they", "me", "him", "us", "them",
  ]);

  const technicalShortTerms = new Set([
    "cli", "ui", "ux", "css", "api", "sql", "jwt", "ffi", "tui", "tdd",
    "bdd", "ci", "cd", "vm", "db", "ssl", "svg", "cdn", "dns", "orm",
    "xss", "csrf", "rag", "llm", "k8s",
  ]);

  return request
    .toLowerCase()
    .split(/[\s,.\-_/(){}[\]'"!?]+/)
    .filter((w) => (w.length > 3 || technicalShortTerms.has(w)) && !stopWords.has(w))
    .slice(0, 20);
}
