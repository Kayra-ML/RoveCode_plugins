#!/usr/bin/env bun
/**
 * Large-scale objective benchmark for the RoveCode Plugins routing system.
 *
 * Combines:
 *   - ~360 auto-generated scenarios, 5 per real skill, built directly from
 *     that skill's `activationSignals` in plugins/{plugin}/skills-meta/{skill}.json
 *     (see generate-skill-scenarios.ts)
 *   - ~85 hand-authored scenarios covering keyword-overlap isolation traps,
 *     legitimately multi-domain requests, vague negative controls, and
 *     skill-composition (requires/suggests) chains (see manual-scenarios.ts)
 *
 * For each scenario it runs the real Router used in production, then scores
 * four dimensions: routing accuracy, token efficiency, latency, and domain
 * isolation. Results are written to benchmark/large/results.json and a
 * human-readable benchmark/large/REPORT.md.
 */

import { resolve } from "path";
import { PluginRegistry } from "../../src/plugins/registry.js";
import { PersonalManager } from "../../src/personal/manager.js";
import { Router, DEFAULT_BUDGET } from "../../src/router/router.js";
import { generateSkillScenarios } from "./generate-skill-scenarios.js";
import { getManualScenarios } from "./manual-scenarios.js";
import type { Scenario, ScenarioCategory } from "./types.js";

const PLUGINS_DIR = resolve(import.meta.dir, "../../plugins");
const DATA_DIR = resolve(import.meta.dir, "../../data");

interface ScenarioResult {
  id: string;
  category: ScenarioCategory;
  domain: string;
  request: string;
  pluginOk: boolean;
  skillOk: boolean;
  forbiddenOk: boolean;
  maxPluginsOk: boolean;
  routingScore: number;
  tokensUsed: number;
  tokenEfficiencyScore: number;
  routingMs: number;
  speedScore: number;
  isolationScore: number;
  selectedPlugins: string[];
  selectedSkills: string[];
  note: string;
  overall: number;
}

function scoreScenario(
  scenario: Scenario,
  selectedPlugins: string[],
  selectedSkillIds: string[],
  tokensUsed: number,
  elapsedMs: number
): Pick<ScenarioResult, "pluginOk" | "skillOk" | "forbiddenOk" | "maxPluginsOk" | "routingScore" | "isolationScore"> {
  const forbiddenOk = !scenario.forbiddenPlugins.some((p) => selectedPlugins.includes(p));

  if (scenario.category === "negative") {
    const maxPluginsOk = scenario.maxPlugins === undefined || selectedPlugins.length <= scenario.maxPlugins;
    const routingScore = maxPluginsOk && forbiddenOk ? 100 : 0;
    const isolationScore =
      selectedPlugins.length === 0 ? 100 : selectedPlugins.length === 1 ? 60 : 20;
    return { pluginOk: true, skillOk: true, forbiddenOk, maxPluginsOk, routingScore, isolationScore };
  }

  const pluginOk = scenario.expectedPlugins.every((p) => selectedPlugins.includes(p));

  let skillOk = true;
  if (scenario.expectedSkillIds.length > 0) {
    skillOk =
      scenario.category === "composition"
        ? scenario.expectedSkillIds.every((s) => selectedSkillIds.includes(s))
        : scenario.expectedSkillIds.some((s) => selectedSkillIds.includes(s));
  }

  const maxPluginsOk = scenario.maxPlugins === undefined || selectedPlugins.length <= scenario.maxPlugins;

  const routingScore = (pluginOk ? 40 : 0) + (skillOk ? 40 : 0) + (forbiddenOk ? 20 : 0);

  const irrelevantPlugins = selectedPlugins.filter((p) => !scenario.expectedPlugins.includes(p));
  const isolationScore = irrelevantPlugins.length === 0 ? 100 : irrelevantPlugins.length === 1 ? 60 : 20;

  return { pluginOk, skillOk, forbiddenOk, maxPluginsOk, routingScore, isolationScore };
}

function tokenScore(tokensUsed: number, budgetTotal: number): number {
  if (tokensUsed === 0) return 0;
  const pct = (tokensUsed / budgetTotal) * 100;
  if (pct <= 60) return 100;
  if (pct <= 80) return 75;
  return 50;
}

function speedScoreFor(elapsedMs: number): number {
  if (elapsedMs < 50) return 100;
  if (elapsedMs < 100) return 90;
  if (elapsedMs < 200) return 75;
  if (elapsedMs < 500) return 50;
  return 25;
}

async function main() {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  ROVECODE PLUGINS — LARGE-SCALE OBJECTIVE BENCHMARK");
  console.log("═══════════════════════════════════════════════════════════════\n");

  const skillScenarios = generateSkillScenarios();
  const manualScenarios = getManualScenarios();
  const allScenarios: Scenario[] = [...skillScenarios, ...manualScenarios];

  console.log(`  ${skillScenarios.length} auto-generated skill scenarios (5 per skill, ${skillScenarios.length / 5} skills)`);
  console.log(`  ${manualScenarios.length} hand-authored edge-case scenarios`);
  console.log(`  ${allScenarios.length} total scenarios\n`);

  const registry = new PluginRegistry(PLUGINS_DIR);
  await registry.load();
  const personal = new PersonalManager(DATA_DIR);
  const router = new Router(registry, personal, DEFAULT_BUDGET);

  const results: ScenarioResult[] = [];
  let done = 0;

  for (const scenario of allScenarios) {
    const start = performance.now();
    const decision = await router.route({
      userRequest: scenario.request,
      userId: `large-benchmark-${scenario.category}`,
    });
    const elapsed = performance.now() - start;

    const selectedPlugins = decision.selectedPlugins;
    const selectedSkillIds = decision.selectedSkills.map((s) => s.id);
    const tokensUsed = decision.estimatedTokens;

    const scored = scoreScenario(scenario, selectedPlugins, selectedSkillIds, tokensUsed, elapsed);
    const tokenEfficiencyScore = tokenScore(tokensUsed, DEFAULT_BUDGET.total);
    const speedScore = speedScoreFor(elapsed);
    const overall =
      scenario.category === "negative"
        ? Math.round((scored.routingScore + speedScore) / 2)
        : Math.round((scored.routingScore + tokenEfficiencyScore + speedScore + scored.isolationScore) / 4);

    results.push({
      id: scenario.id,
      category: scenario.category,
      domain: scenario.domain,
      request: scenario.request,
      pluginOk: scored.pluginOk,
      skillOk: scored.skillOk,
      forbiddenOk: scored.forbiddenOk,
      maxPluginsOk: scored.maxPluginsOk,
      routingScore: scored.routingScore,
      tokensUsed,
      tokenEfficiencyScore,
      routingMs: Math.round(elapsed * 100) / 100,
      speedScore,
      isolationScore: scored.isolationScore,
      selectedPlugins,
      selectedSkills: selectedSkillIds,
      note: scenario.note,
      overall,
    });

    done++;
    if (done % 50 === 0 || done === allScenarios.length) {
      process.stdout.write(`  ...${done}/${allScenarios.length} scenarios run\n`);
    }
  }

  // ─── Aggregate ────────────────────────────────────────────────────────
  const avg = (arr: number[]) => (arr.length === 0 ? 0 : Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 10) / 10);

  const byCategory: Record<string, ScenarioResult[]> = {};
  for (const r of results) {
    (byCategory[r.category] ??= []).push(r);
  }

  const byPlugin: Record<string, ScenarioResult[]> = {};
  for (const r of results.filter((r) => r.category === "skill")) {
    (byPlugin[r.domain] ??= []).push(r);
  }

  const overallAvg = avg(results.map((r) => r.overall));
  const routingAvg = avg(results.map((r) => r.routingScore));
  const tokenAvg = avg(results.filter((r) => r.category !== "negative").map((r) => r.tokenEfficiencyScore));
  const speedAvg = avg(results.map((r) => r.speedScore));
  const isolationAvg = avg(results.map((r) => r.isolationScore));
  const avgTokens = Math.round(avg(results.map((r) => r.tokensUsed)));
  const avgMs = avg(results.map((r) => r.routingMs));

  const passCount = results.filter((r) => r.overall >= 80).length;
  const warnCount = results.filter((r) => r.overall >= 60 && r.overall < 80).length;
  const failCount = results.filter((r) => r.overall < 60).length;

  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log("  OVERALL");
  console.log("═══════════════════════════════════════════════════════════════\n");
  console.log(`  Total scenarios:      ${results.length}`);
  console.log(`  Pass (>=80):          ${passCount} (${Math.round((passCount / results.length) * 100)}%)`);
  console.log(`  Warn (60-79):         ${warnCount} (${Math.round((warnCount / results.length) * 100)}%)`);
  console.log(`  Fail (<60):           ${failCount} (${Math.round((failCount / results.length) * 100)}%)`);
  console.log(`\n  Overall Score:        ${overallAvg}/100`);
  console.log(`  Routing Accuracy:     ${routingAvg}/100`);
  console.log(`  Token Efficiency:     ${tokenAvg}/100  (avg ${avgTokens} tokens/request)`);
  console.log(`  Routing Speed:        ${speedAvg}/100  (avg ${avgMs}ms)`);
  console.log(`  Domain Isolation:     ${isolationAvg}/100`);

  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log("  BY CATEGORY");
  console.log("═══════════════════════════════════════════════════════════════\n");
  for (const [cat, group] of Object.entries(byCategory)) {
    const catAvg = avg(group.map((r) => r.overall));
    const catPass = group.filter((r) => r.overall >= 80).length;
    console.log(`  ${cat.padEnd(12)} n=${String(group.length).padEnd(4)} avg=${String(catAvg).padEnd(6)} pass=${catPass}/${group.length}`);
  }

  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log("  BY PLUGIN (skill-category scenarios only)");
  console.log("═══════════════════════════════════════════════════════════════\n");
  for (const [plugin, group] of Object.entries(byPlugin).sort()) {
    const pAvg = avg(group.map((r) => r.overall));
    const pPass = group.filter((r) => r.overall >= 80).length;
    const icon = pAvg >= 80 ? "✅" : pAvg >= 60 ? "⚠️ " : "❌";
    console.log(`  ${icon} ${plugin.padEnd(18)} n=${String(group.length).padEnd(4)} avg=${String(pAvg).padEnd(6)} pass=${pPass}/${group.length}`);
  }

  const failures = results.filter((r) => r.overall < 80).sort((a, b) => a.overall - b.overall);
  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log(`  FAILURES / WARNINGS (${failures.length} total, showing worst 25)`);
  console.log("═══════════════════════════════════════════════════════════════\n");
  for (const f of failures.slice(0, 25)) {
    console.log(`  ${f.overall.toString().padStart(3)}/100  ${f.id.padEnd(24)} plugins=[${f.selectedPlugins.join(",")}] skills=[${f.selectedSkills.join(",")}]`);
    console.log(`         "${f.request}"`);
  }

  // ─── Save results ────────────────────────────────────────────────────
  const outputPath = resolve(import.meta.dir, "results.json");
  await Bun.write(
    outputPath,
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        totalScenarios: results.length,
        scores: { overall: overallAvg, routing: routingAvg, token: tokenAvg, speed: speedAvg, isolation: isolationAvg },
        avgTokens,
        avgMs,
        passCount,
        warnCount,
        failCount,
        byCategory: Object.fromEntries(
          Object.entries(byCategory).map(([cat, group]) => [
            cat,
            { n: group.length, avg: avg(group.map((r) => r.overall)), pass: group.filter((r) => r.overall >= 80).length },
          ])
        ),
        byPlugin: Object.fromEntries(
          Object.entries(byPlugin).map(([p, group]) => [
            p,
            { n: group.length, avg: avg(group.map((r) => r.overall)), pass: group.filter((r) => r.overall >= 80).length },
          ])
        ),
        results,
      },
      null,
      2
    )
  );
  console.log(`\n  Full results saved to benchmark/large/results.json`);

  // ─── Markdown report ─────────────────────────────────────────────────
  const grade = overallAvg >= 90 ? "A+" : overallAvg >= 80 ? "A" : overallAvg >= 70 ? "B+" : overallAvg >= 60 ? "B" : "C";

  const lines: string[] = [];
  lines.push(`# RoveCode Plugins — Large-Scale Benchmark Report`);
  lines.push(``);
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push(``);
  lines.push(`**${results.length} scenarios** across 5 categories — ${skillScenarios.length} auto-generated directly from real \`activationSignals\` in every one of the 72 skills, plus ${manualScenarios.length} hand-authored edge cases (keyword-overlap isolation traps, multi-domain ambiguity, vague negative controls, and requires/suggests composition chains).`);
  lines.push(``);
  lines.push(`## Overall`);
  lines.push(``);
  lines.push(`| Metric | Score |`);
  lines.push(`|---|---|`);
  lines.push(`| **Overall Score** | **${overallAvg}/100 (${grade})** |`);
  lines.push(`| Routing Accuracy | ${routingAvg}/100 |`);
  lines.push(`| Token Efficiency | ${tokenAvg}/100 (avg ${avgTokens} tok/request) |`);
  lines.push(`| Routing Speed | ${speedAvg}/100 (avg ${avgMs}ms) |`);
  lines.push(`| Domain Isolation | ${isolationAvg}/100 |`);
  lines.push(`| Pass / Warn / Fail | ${passCount} / ${warnCount} / ${failCount} (of ${results.length}) |`);
  lines.push(``);
  lines.push(`## By Category`);
  lines.push(``);
  lines.push(`| Category | n | Avg Score | Pass (>=80) |`);
  lines.push(`|---|---|---|---|`);
  for (const [cat, group] of Object.entries(byCategory)) {
    lines.push(`| ${cat} | ${group.length} | ${avg(group.map((r) => r.overall))} | ${group.filter((r) => r.overall >= 80).length}/${group.length} |`);
  }
  lines.push(``);
  lines.push(`## By Plugin (skill-category scenarios)`);
  lines.push(``);
  lines.push(`| Plugin | n | Avg Score | Pass (>=80) |`);
  lines.push(`|---|---|---|---|`);
  for (const [plugin, group] of Object.entries(byPlugin).sort()) {
    lines.push(`| ${plugin} | ${group.length} | ${avg(group.map((r) => r.overall))} | ${group.filter((r) => r.overall >= 80).length}/${group.length} |`);
  }
  lines.push(``);
  lines.push(`## Worst-Scoring Scenarios (all below 80/100)`);
  lines.push(``);
  lines.push(`| Score | ID | Category | Selected Plugins | Selected Skills | Request |`);
  lines.push(`|---|---|---|---|---|---|`);
  for (const f of failures) {
    lines.push(`| ${f.overall} | ${f.id} | ${f.category} | ${f.selectedPlugins.join(", ") || "—"} | ${f.selectedSkills.join(", ") || "—"} | ${f.request.replace(/\|/g, "\\|")} |`);
  }
  lines.push(``);

  await Bun.write(resolve(import.meta.dir, "REPORT.md"), lines.join("\n"));
  console.log(`  Markdown report saved to benchmark/large/REPORT.md\n`);
  console.log("═══════════════════════════════════════════════════════════════\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
