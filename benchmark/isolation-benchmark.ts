#!/usr/bin/env bun
/**
 * Plugin Isolation Benchmark
 * Tests that domains do NOT bleed into unrelated requests
 * Also tests: weak/ambiguous signals, edge cases
 */

import { PluginRegistry } from "../src/plugins/registry.js";
import { PersonalManager } from "../src/personal/manager.js";
import { Router, DEFAULT_BUDGET } from "../src/router/router.js";
import { resolve } from "path";

const PLUGINS_DIR = resolve(import.meta.dir, "../plugins");
const DATA_DIR    = resolve(import.meta.dir, "../data");

interface IsolationTest {
  id: string;
  label: string;
  request: string;
  mustInclude: string[];    // plugins that MUST appear
  mustExclude: string[];    // plugins that must NOT appear
  note: string;
}

const TESTS: IsolationTest[] = [
  // Pure domain tests
  { id: "ISO-01", label: "Pure Rust — no web noise",
    request: "Fix borrow checker error in my Rust struct",
    mustInclude: ["rust"], mustExclude: ["web-design","mobile","game-development"],
    note: "Core isolation: Rust-only request" },
  { id: "ISO-02", label: "Pure web-design — no backend noise",
    request: "Choose typography and color palette for a portfolio site",
    mustInclude: ["web-design"], mustExclude: ["rust","database","devops"],
    note: "Design-only: no code domain bleed" },
  { id: "ISO-03", label: "Pure devops — no web noise",
    request: "Write a GitHub Actions workflow for Docker build and push",
    mustInclude: ["devops"], mustExclude: ["web-design","rust","mobile"],
    note: "CI/CD only" },
  { id: "ISO-04", label: "Pure database — no frontend noise",
    request: "Add a composite index to speed up a slow JOIN query in Postgres",
    mustInclude: ["database"], mustExclude: ["web-design","mobile","game-development"],
    note: "DB-only: no UI domain" },
  { id: "ISO-05", label: "Pure security — no mobile noise",
    request: "Prevent SQL injection in my Express query builder",
    mustInclude: ["security"], mustExclude: ["mobile","game-development","rust"],
    note: "Security only" },
  { id: "ISO-06", label: "Pure testing — no devops noise",
    request: "Write Vitest unit tests with mocks for a service class",
    mustInclude: ["testing"], mustExclude: ["devops","game-development","mobile"],
    note: "Testing only" },
  { id: "ISO-07", label: "Pure AI engineering — no web noise",
    request: "Build a RAG pipeline with embeddings and vector search",
    mustInclude: ["ai-engineering"], mustExclude: ["web-design","game-development","mobile"],
    note: "AI/ML only" },
  { id: "ISO-08", label: "Pure game-dev — no backend noise",
    request: "Implement AABB collision detection for a 2D platformer",
    mustInclude: ["game-development"], mustExclude: ["backend","database","devops"],
    note: "Game-dev only" },
  { id: "ISO-09", label: "Pure mobile — no web noise",
    request: "Set up React Native navigation with deep linking",
    mustInclude: ["mobile"], mustExclude: ["web-design","rust","database"],
    note: "Mobile only" },
  { id: "ISO-10", label: "Pure backend — no game noise",
    request: "Implement rate limiting middleware with Redis in Node.js",
    mustInclude: ["backend"], mustExclude: ["game-development","mobile","web-design"],
    note: "Backend only" },

  // Edge cases
  { id: "ISO-11", label: "Word 'render' should NOT trigger game-dev",
    request: "Render a React component with server-side rendering",
    mustInclude: [], mustExclude: ["game-development","rust","mobile"],
    note: "Keyword overlap: 'render' appears in both web and game-dev" },
  { id: "ISO-12", label: "Word 'pipeline' should NOT trigger devops alone",
    request: "Build a data transformation pipeline in TypeScript",
    mustInclude: ["automation"], mustExclude: ["game-development","mobile","security"],
    note: "Keyword overlap: 'pipeline' in devops + automation" },
  { id: "ISO-13", label: "Word 'performance' should NOT trigger all domains",
    request: "Optimize performance of my Node.js API",
    mustInclude: ["backend"], mustExclude: ["game-development","mobile","web-design"],
    note: "Generic word: should stay domain-specific" },
  { id: "ISO-14", label: "Word 'test' should NOT trigger all domains",
    request: "Write integration tests for my REST API endpoints",
    mustInclude: ["testing"], mustExclude: ["game-development","mobile","rust"],
    note: "Generic word: test context matters" },
  { id: "ISO-15", label: "Security in auth should not bleed to game-dev",
    request: "Implement OAuth2 with PKCE for my web app",
    mustInclude: ["backend","security"], mustExclude: ["game-development","rust","mobile"],
    note: "Multi-domain but bounded" },
];

async function runIsolationBenchmark() {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  PLUGIN ISOLATION BENCHMARK");
  console.log("  15 edge case + isolation tests");
  console.log("═══════════════════════════════════════════════════════════════\n");

  const registry = new PluginRegistry(PLUGINS_DIR);
  await registry.load();
  const personal = new PersonalManager(DATA_DIR);
  const router = new Router(registry, personal, DEFAULT_BUDGET);

  let passed = 0;
  let failed = 0;
  const failures: string[] = [];

  for (const test of TESTS) {
    const decision = await router.route({
      userRequest: test.request,
      userId: "isolation-benchmark",
    });
    const selected = decision.selectedPlugins;

    const includeOk = test.mustInclude.length === 0 ||
      test.mustInclude.every(p => selected.includes(p));
    const excludeOk = !test.mustExclude.some(p => selected.includes(p));
    const ok = includeOk && excludeOk;

    if (ok) {
      passed++;
      console.log(`  ✅ ${test.id} ${test.label}`);
    } else {
      failed++;
      const issues: string[] = [];
      if (!includeOk) {
        const missing = test.mustInclude.filter(p => !selected.includes(p));
        issues.push(`missing: ${missing.join(", ")}`);
      }
      if (!excludeOk) {
        const leaked = test.mustExclude.filter(p => selected.includes(p));
        issues.push(`leaked: ${leaked.join(", ")}`);
      }
      console.log(`  ❌ ${test.id} ${test.label}`);
      console.log(`       → ${issues.join(" | ")}`);
      console.log(`       → selected: [${selected.join(", ")}]`);
      failures.push(`${test.id}: ${issues.join(" | ")}`);
    }
    console.log(`       note: ${test.note}`);
  }

  const score = Math.round(passed / TESTS.length * 100);

  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log(`  ISOLATION SCORE: ${score}/100  (${passed}/${TESTS.length} passed)`);
  console.log("═══════════════════════════════════════════════════════════════\n");

  if (failures.length > 0) {
    console.log("  FAILURES:");
    failures.forEach(f => console.log(`    - ${f}`));
  }

  // Save
  const out = {
    timestamp: new Date().toISOString(),
    score,
    passed,
    total: TESTS.length,
    failures,
  };
  await Bun.write(
    resolve(import.meta.dir, "isolation-results.json"),
    JSON.stringify(out, null, 2)
  );
  console.log("\n  Results saved to benchmark/isolation-results.json\n");

  return score;
}

runIsolationBenchmark().catch(console.error);