#!/usr/bin/env bun
/**
 * Personal-learning-system benchmark.
 *
 * Phase 2 of the routing-benchmark follow-up: benchmark/large/ covers
 * plugin/skill routing exhaustively, but the OTHER half of this project's
 * pitch — personal preference learning + domain-aware retrieval — had no
 * equivalent large-scale check. tests/personal-retrieval.test.ts, for
 * example, verifies that the right domain's entries are returned but never
 * asserts that OTHER domains' entries are absent — the exact isolation gap
 * this benchmark closes.
 *
 * Two parts, both against the real, live code paths:
 *   1. Signal detection — src/learning/auto-detector.ts's detectSignalsFromTurn,
 *      the function actually wired into the `analyze_and_learn` MCP tool.
 *   2. Retrieval domain isolation — PersonalManager.findRelevantEntries
 *      (TF-IDF cosine + keyword + domain scoring in src/personal/index-db.ts),
 *      including two deliberately adversarial shared-vocabulary probes.
 */

import { mkdtempSync, rmSync } from "fs";
import { join, resolve } from "path";
import { tmpdir } from "os";
import { detectSignalsFromTurn, type ConversationTurn } from "../../src/learning/auto-detector.js";
import { createLearningCandidate } from "../../src/learning/pipeline.js";
import { PersonalManager } from "../../src/personal/manager.js";
import { getSignalScenarios } from "./signal-scenarios.js";
import { RETRIEVAL_SEED, RETRIEVAL_QUERIES } from "./retrieval-scenarios.js";

async function runSignalBenchmark() {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  SIGNAL DETECTION (detectSignalsFromTurn)");
  console.log("═══════════════════════════════════════════════════════════════\n");

  const scenarios = getSignalScenarios();
  let pass = 0;
  const failures: string[] = [];

  for (const s of scenarios) {
    const previousTurns: ConversationTurn[] = s.previousUserMessage
      ? [{ role: "user", content: s.previousUserMessage }]
      : [];
    const turn: ConversationTurn = {
      role: s.category === "verified-solution" ? "assistant" : "user",
      content: s.message,
    };

    const detected = detectSignalsFromTurn(turn, previousTurns);
    const actual = new Set(detected.map((d) => d.signal));
    const expected = new Set(s.expectedSignals);

    const ok =
      actual.size === expected.size && [...expected].every((sig) => actual.has(sig as any));

    if (ok) {
      pass++;
      console.log(`  ✅ ${s.id}  [${[...actual].join(",") || "none"}]`);
    } else {
      console.log(`  ❌ ${s.id}  expected=[${s.expectedSignals.join(",")}] actual=[${[...actual].join(",")}]`);
      console.log(`       "${s.message}"`);
      console.log(`       note: ${s.note}`);
      failures.push(s.id);
    }
  }

  const score = Math.round((pass / scenarios.length) * 100);
  console.log(`\n  Signal detection: ${pass}/${scenarios.length} (${score}/100)\n`);
  return { score, total: scenarios.length, pass, failures };
}

async function runRetrievalBenchmark() {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  RETRIEVAL DOMAIN ISOLATION (PersonalManager.findRelevantEntries)");
  console.log("═══════════════════════════════════════════════════════════════\n");

  const tmpDir = mkdtempSync(join(tmpdir(), "skill-learning-benchmark-"));
  const manager = new PersonalManager(tmpDir);
  const userId = "learning-benchmark-user";

  try {
    // Seed all entries. Use "explicit-remember" (confidence 0.95) purely as a
    // reliable way to get each entry ADDed — the signal type used to create
    // the entry isn't what's under test here, the retrieval behavior is.
    for (const seed of RETRIEVAL_SEED) {
      const candidate = createLearningCandidate("explicit-remember", seed.content, {
        entryType: seed.entryType,
        tags: seed.tags,
        domain: seed.domain || undefined,
        confidence: 0.95,
      });
      const { decision } = await manager.applyLearningCandidate(userId, candidate);
      if (decision.operation !== "ADD") {
        console.log(`  ⚠ seed ${seed.id} did not ADD (got ${decision.operation}: ${decision.reason}) — content may be too similar to another seed of the same type.`);
      }
    }

    let pass = 0;
    const failures: string[] = [];

    for (const q of RETRIEVAL_QUERIES) {
      const results = await manager.findRelevantEntries(userId, q.queryKeywords, q.queryDomain, 20);
      const resultContents = new Set(results.map((r) => r.content));

      // Map back from seed content to seed id (the API returns hydrated PersonalEntry,
      // which doesn't carry our benchmark's synthetic seed id).
      const idToContent = new Map(RETRIEVAL_SEED.map((s) => [s.id, s.content]));
      const resultIds = RETRIEVAL_SEED.filter((s) => resultContents.has(s.content)).map((s) => s.id);

      const expectedOk = q.expectedEntryIds.every((id) => resultIds.includes(id));
      const forbiddenOk = !q.forbiddenEntryIds.some((id) => resultIds.includes(id));
      const score = (expectedOk ? 50 : 0) + (forbiddenOk ? 50 : 0);
      const ok = score === 100;

      if (ok) {
        pass++;
        console.log(`  ✅ ${q.id}  [${q.queryDomain}] → [${resultIds.join(", ")}]`);
      } else {
        console.log(`  ❌ ${q.id}  [${q.queryDomain}] → [${resultIds.join(", ")}]`);
        if (!expectedOk) console.log(`       missing expected: ${q.expectedEntryIds.filter((id) => !resultIds.includes(id)).join(", ")}`);
        if (!forbiddenOk) console.log(`       LEAKED forbidden: ${q.forbiddenEntryIds.filter((id) => resultIds.includes(id)).join(", ")}`);
        console.log(`       note: ${q.note}`);
        failures.push(q.id);
      }
    }

    const overallScore = Math.round((pass / RETRIEVAL_QUERIES.length) * 100);
    console.log(`\n  Retrieval isolation: ${pass}/${RETRIEVAL_QUERIES.length} (${overallScore}/100)\n`);
    return { score: overallScore, total: RETRIEVAL_QUERIES.length, pass, failures };
  } finally {
    manager.close();
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

async function main() {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  PERSONAL LEARNING SYSTEM BENCHMARK");
  console.log("═══════════════════════════════════════════════════════════════\n");

  const signalResult = await runSignalBenchmark();
  const retrievalResult = await runRetrievalBenchmark();

  const overall = Math.round((signalResult.score + retrievalResult.score) / 2);

  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  SUMMARY");
  console.log("═══════════════════════════════════════════════════════════════\n");
  console.log(`  Signal detection:    ${signalResult.score}/100  (${signalResult.pass}/${signalResult.total})`);
  console.log(`  Retrieval isolation: ${retrievalResult.score}/100  (${retrievalResult.pass}/${retrievalResult.total})`);
  console.log(`  Overall:             ${overall}/100\n`);

  const outputPath = resolve(import.meta.dir, "results.json");
  await Bun.write(
    outputPath,
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        overall,
        signalDetection: signalResult,
        retrievalIsolation: retrievalResult,
      },
      null,
      2
    )
  );
  console.log(`  Results saved to benchmark/learning/results.json\n`);
  console.log("═══════════════════════════════════════════════════════════════\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
