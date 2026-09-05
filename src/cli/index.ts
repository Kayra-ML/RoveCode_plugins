#!/usr/bin/env bun
import { join, resolve } from "path";
import { PluginRegistry } from "../plugins/registry.js";
import { PluginDiscovery } from "../plugins/discovery.js";
import { PersonalManager } from "../personal/manager.js";
import { Router, DEFAULT_BUDGET } from "../router/router.js";
import { ContextAssembler } from "../context/assembler.js";
import { createLearningCandidate, sanitizeForLearning } from "../learning/pipeline.js";
import type { PersonalEntryType } from "../types/index.js";

// ============================================================
// PATHS (relative to project root, resolved at runtime)
// ============================================================
const PROJECT_ROOT = resolve(import.meta.dir, "../../");
const PLUGINS_DIR = join(PROJECT_ROOT, "plugins");
const DATA_DIR = join(PROJECT_ROOT, "data");

// ============================================================
// BOOTSTRAP
// ============================================================
async function bootstrap() {
  const registry = new PluginRegistry(PLUGINS_DIR);
  const discovery = new PluginDiscovery(registry, { builtinPluginsDir: PLUGINS_DIR });
  await discovery.discoverAll();
  registry.startWatching();

  const personal = new PersonalManager(DATA_DIR);
  const router = new Router(registry, personal, DEFAULT_BUDGET);
  const assembler = new ContextAssembler(registry);

  return { registry, discovery, personal, router, assembler };
}

// ============================================================
// COMMANDS
// ============================================================

async function cmdPlugins() {
  const { discovery } = await bootstrap();
  const summaries = discovery.listPluginSummaries();
  console.log("\nAvailable Plugins\n");
  for (const p of summaries) {
    console.log(`  ${p.id} (v${p.version}) — ${p.name}`);
    console.log(`    ${p.description}`);
    console.log(`    ${p.skillCount} skills\n`);
  }
}

async function cmdSkills(pluginId: string) {
  const { registry } = await bootstrap();
  const plugin = registry.getPlugin(pluginId);
  if (!plugin) {
    console.error(`Plugin not found: ${pluginId}`);
    process.exit(1);
  }
  console.log(`\nSkills in ${plugin.manifest.name}\n`);
  for (const [id, meta] of plugin.skills) {
    console.log(`  ${id}`);
    console.log(`    ${meta.description}`);
    console.log(`    Signals: ${meta.activationSignals.slice(0, 4).join(", ")}...`);
    console.log(`    ~${meta.estimatedTokens} tokens  priority: ${meta.priority}\n`);
  }
}

async function cmdInspectUser(userId: string) {
  const { personal } = await bootstrap();
  const skill = await personal.getSkill(userId);
  console.log(`\nPersonal Skill: ${userId}\n`);
  console.log(`  Version: ${skill.version}`);
  console.log(`  Entries: ${skill.entries.length}`);
  console.log(`  Updated: ${skill.updatedAt}\n`);

  if (skill.entries.length === 0) {
    console.log("  (no entries yet)");
    return;
  }

  for (const entry of skill.entries) {
    console.log(`  [${entry.id}] ${entry.type}`);
    console.log(`    ${entry.content.slice(0, 120).replace(/\n/g, " ")}`);
    console.log(`    confidence: ${entry.confidence.toFixed(2)}  strength: ${entry.strength.toFixed(2)}\n`);
  }
}

async function cmdRoute(request: string, userId = "default") {
  const { router } = await bootstrap();
  const decision = await router.route({ userRequest: request, userId });

  console.log(`\nRouting Decision\n`);
  console.log(`Request: "${request}"\n`);
  console.log(`Selected plugins: ${decision.selectedPlugins.join(", ") || "none"}`);
  console.log(`Selected skills (${decision.selectedSkills.length}):`);
  for (const s of decision.selectedSkills) {
    console.log(`  ✓ ${s.pluginId}/${s.id} — ${s.name} (~${s.estimatedTokens} tokens)`);
  }
  if (decision.rejectedSkills.length > 0) {
    console.log(`\nRejected skills (${decision.rejectedSkills.length}):`);
    for (const r of decision.rejectedSkills) {
      console.log(`  ✗ ${r.id} — ${r.reason}`);
    }
  }
  if (decision.selectedPersonalEntries.length > 0) {
    console.log(`\nPersonal knowledge (${decision.selectedPersonalEntries.length} entries):`);
    for (const e of decision.selectedPersonalEntries) {
      console.log(`  • ${e.content.slice(0, 100).replace(/\n/g, " ")}`);
    }
  } else {
    console.log("\nPersonal knowledge: none");
  }
  console.log(`\nEstimated context: ${decision.estimatedTokens} tokens`);
  console.log(`\nDebug log:`);
  for (const line of decision.debugLog) {
    console.log(`  ${line}`);
  }
}

async function cmdContext(request: string, userId = "default") {
  const { router, assembler } = await bootstrap();
  const decision = await router.route({ userRequest: request, userId });
  const ctx = await assembler.assemble(decision);
  const prompt = assembler.buildPrompt(ctx);

  console.log("\nAssembled Context\n");
  console.log(`Estimated tokens: ${ctx.estimatedTokens}\n`);
  console.log("--- SYSTEM CONTEXT ---");
  console.log(ctx.systemContext);
  if (ctx.personalKnowledge) {
    console.log("\n--- PERSONAL KNOWLEDGE ---");
    console.log(ctx.personalKnowledge);
  }
  if (ctx.domainSkills) {
    console.log("\n--- DOMAIN SKILLS (truncated to 500 chars) ---");
    console.log(ctx.domainSkills.slice(0, 500) + (ctx.domainSkills.length > 500 ? "\n..." : ""));
  }
}

async function cmdLearn(userId: string, content: string, type: string) {
  const { personal } = await bootstrap();
  const safe = sanitizeForLearning(content);
  const entryType = type as PersonalEntryType;

  const candidate = createLearningCandidate("explicit-remember", safe, {
    entryType,
    tags: [],
    confidence: 0.95,
    sourceContext: "manual-cli",
  });

  const { decision, updated } = await personal.applyLearningCandidate(userId, candidate);
  console.log(`\nLearning candidate: ${candidate.id}`);
  console.log(`Operation: ${decision.operation}`);
  console.log(`Reason: ${decision.reason}`);
  console.log(`Updated: ${updated}`);
}

// ============================================================
// HELP
// ============================================================
function printHelp() {
  console.log(`
skill — Adaptive personal skill + domain plugin system

COMMANDS:
  plugins                          List all available domain plugins
  skills <plugin-id>               List skills for a plugin
  user <user-id>                   Inspect a user's personal skill
  route <request> [user-id]        Route a request and show decision
  context <request> [user-id]      Route and assemble full context
  learn <user-id> <content> <type> Record a learning candidate

TYPES for learn command:
  working-preference   design-preference   technical-preference
  solved-problem       workflow-preference  avoided-pattern  successful-pattern

EXAMPLES:
  bun run src/cli/index.ts plugins
  bun run src/cli/index.ts skills web-design
  bun run src/cli/index.ts route "Build a responsive SaaS dashboard"
  bun run src/cli/index.ts route "My Rust CLI has an ownership error"
  bun run src/cli/index.ts learn default "Prefers compact sidebars" design-preference
  bun run src/cli/index.ts context "Create an animated dashboard" default
`);
}

// ============================================================
// MAIN
// ============================================================
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  try {
    switch (command) {
      case "plugins":
        await cmdPlugins();
        break;

      case "skills":
        if (!args[1]) { console.error("Usage: skills <plugin-id>"); process.exit(1); }
        await cmdSkills(args[1]);
        break;

      case "user":
        if (!args[1]) { console.error("Usage: user <user-id>"); process.exit(1); }
        await cmdInspectUser(args[1]);
        break;

      case "route":
        if (!args[1]) { console.error("Usage: route <request> [user-id]"); process.exit(1); }
        await cmdRoute(args[1], args[2] ?? "default");
        break;

      case "context":
        if (!args[1]) { console.error("Usage: context <request> [user-id]"); process.exit(1); }
        await cmdContext(args[1], args[2] ?? "default");
        break;

      case "learn":
        if (!args[1] || !args[2] || !args[3]) {
          console.error("Usage: learn <user-id> <content> <type>");
          process.exit(1);
        }
        await cmdLearn(args[1], args[2], args[3]);
        break;

      case "help":
      case "--help":
      case "-h":
      case undefined:
        printHelp();
        break;

      default:
        console.error(`Unknown command: ${command}`);
        printHelp();
        process.exit(1);
    }
  } catch (err: any) {
    console.error(`\nError: ${err.message}`);
    if (process.env.DEBUG) console.error(err.stack);
    process.exit(1);
  }
}

main();