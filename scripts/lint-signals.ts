#!/usr/bin/env bun
/**
 * Signal collision linter.
 *
 * Scans every plugins/{plugin}/manifest.json activationHints and every
 * plugins/{plugin}/skills-meta/{skill}.json activationSignals for the exact
 * classes of bug that shipped in this system and were only caught by manually
 * reading through a 445-scenario benchmark's failures:
 *
 *   - a hint/signal short enough to match as a raw substring inside unrelated
 *     words ("ci" inside "circuit", "orm" inside "performance") — router.ts
 *     now matches hints on word boundaries, so this class is defused, but a
 *     short signal is still a smell worth flagging before it causes surprises
 *     elsewhere (e.g. skill-selector.ts's scoreSkill still does substring
 *     containment between keywords and signals).
 *   - a multi-word phrase declared verbatim by more than one plugin's skills
 *     ("error handling" in both rust/error-handling and
 *     backend/error-handling-http) — router.ts's multi-word skill-signal
 *     pathway already excludes these, but new plugins can reintroduce the
 *     same collision under a skill nobody thought to cross-check.
 *   - a single-word signal that is common English/CS vocabulary rather than
 *     domain-specific jargon (visual-review's "review"/"improve") — these
 *     are what caused the original web-design contamination via
 *     skill-selector's keyword-substring scoring.
 *   - a single-word signal shared verbatim across multiple plugins.
 *
 * Run: bun run lint:signals
 *
 * Severity reflects what's actually still exploitable given the fixes
 * already shipped in router.ts (word-boundary hint matching, and excluding
 * skill-signal phrases shared across plugins): a generic English word used
 * as a plugin-level activationHint is the one remaining class that can still
 * cause a whole unrelated plugin to load, so that's the only ERROR (fails
 * the run). Everything else — short hints/signals, duplicated multi-word
 * skill phrases, shared single-word skill signals, generic-word *skill*
 * signals — is now either fully mitigated or contained to noisier skill
 * selection within an already-correct plugin, so those are WARN-only.
 */

import { readdirSync, readFileSync } from "fs";
import { join, resolve } from "path";

const PLUGINS_DIR = resolve(import.meta.dir, "../plugins");
const MIN_SAFE_LENGTH = 4; // signals shorter than this are substring-collision-prone

// A deliberately non-exhaustive list of generic English/CS words that have
// already caused real cross-domain leakage in this system, or are the same
// shape of word that did (common verbs/nouns used in ordinary sentences
// about *any* domain, not specific jargon). Extend this list whenever a new
// leak is found instead of only patching the one word that leaked.
const GENERIC_WORDS = new Set([
  "review", "feedback", "improve", "evaluate", "assess", "test", "tests",
  "mock", "fake", "error", "errors", "performance", "generic", "iterator",
  "heap", "move", "state", "input", "output", "data", "model", "format",
  "style", "table", "form", "card", "page", "view", "list", "item", "sync",
  "cache", "config", "secret", "token", "session", "thread", "container",
  "service", "client", "server", "image", "asset", "event", "action",
  "handler", "request", "response", "object", "string", "number", "boolean",
  "array", "function", "class", "type", "value", "key", "index", "node",
  "link", "path", "file", "name", "id", "flag", "tool", "utility", "binary",
  "prompt", "interactive", "fast", "speed", "loading", "cache", "optimize",
  "process", "flow", "chain", "sequence", "step", "failure", "recover",
  "monitor", "monitoring", "alert", "alerts", "metrics", "logging", "log",
  "test", "spec", "assertion", "expect", "panic", "recover", "look",
]);

interface SkillMeta {
  id: string;
  pluginId: string;
  activationSignals: string[];
}

interface Manifest {
  id: string;
  activationHints: string[];
}

function loadAll(): { manifests: Manifest[]; skills: SkillMeta[] } {
  const manifests: Manifest[] = [];
  const skills: SkillMeta[] = [];

  for (const pluginDir of readdirSync(PLUGINS_DIR)) {
    const manifestPath = join(PLUGINS_DIR, pluginDir, "manifest.json");
    let manifest: Manifest;
    try {
      manifest = JSON.parse(readFileSync(manifestPath, "utf-8").replace(/^﻿/, ""));
    } catch {
      continue;
    }
    manifests.push(manifest);

    const metaDir = join(PLUGINS_DIR, pluginDir, "skills-meta");
    let files: string[];
    try {
      files = readdirSync(metaDir).filter((f) => f.endsWith(".json"));
    } catch {
      continue;
    }
    for (const file of files) {
      const raw = JSON.parse(readFileSync(join(metaDir, file), "utf-8").replace(/^﻿/, ""));
      skills.push({ id: raw.id, pluginId: raw.pluginId, activationSignals: raw.activationSignals ?? [] });
    }
  }

  return { manifests, skills };
}

function main() {
  const { manifests, skills } = loadAll();
  const errors: string[] = [];
  const warnings: string[] = [];

  // 1. Short activationHints (plugin manifests) — substring-collision risk.
  //    WARN only: router.ts now matches hints on word boundaries (\bhint\b),
  //    which already defuses the "ci" inside "circuit" class of bug for
  //    plugin-level hints. This is a defense-in-depth smell, not a live bug.
  for (const m of manifests) {
    for (const hint of m.activationHints) {
      if (hint.length < MIN_SAFE_LENGTH && !hint.includes(" ")) {
        warnings.push(`[${m.id}] manifest activationHint "${hint}" is only ${hint.length} chars — word-boundary matching already prevents substring collisions, but a longer hint is still safer if a natural alternative exists.`);
      }
    }
  }

  // 2. Short activationSignals (skills) — same risk, scoreSkill() still does
  //    substring containment between extracted keywords and signals.
  for (const s of skills) {
    for (const sig of s.activationSignals) {
      if (sig.length < MIN_SAFE_LENGTH && !sig.includes(" ")) {
        warnings.push(`[${s.pluginId}/${s.id}] activationSignal "${sig}" is only ${sig.length} chars — substring-collision risk in skill-selector.ts's scoreSkill().`);
      }
    }
  }

  // 3. Multi-word skill signals shared verbatim across >1 plugin.
  const multiWordOwners = new Map<string, Set<string>>();
  for (const s of skills) {
    for (const sig of s.activationSignals) {
      if (!sig.includes(" ")) continue;
      const key = sig.toLowerCase();
      if (!multiWordOwners.has(key)) multiWordOwners.set(key, new Set());
      multiWordOwners.get(key)!.add(s.pluginId);
    }
  }
  for (const [phrase, owners] of multiWordOwners) {
    if (owners.size > 1) {
      warnings.push(`Multi-word signal "${phrase}" is declared by ${owners.size} plugins (${[...owners].join(", ")}) — router.ts's skill-signal pathway already excludes shared phrases (not a live bug), but this means the phrase is currently dead weight for plugin-inclusion in all of them. Consider making it more specific per-plugin.`);
    }
  }

  // 4. Single-word skill signals shared verbatim across >1 plugin (informational).
  const singleWordOwners = new Map<string, Set<string>>();
  for (const s of skills) {
    for (const sig of s.activationSignals) {
      if (sig.includes(" ")) continue;
      const key = sig.toLowerCase();
      if (!singleWordOwners.has(key)) singleWordOwners.set(key, new Set());
      singleWordOwners.get(key)!.add(s.pluginId);
    }
  }
  for (const [word, owners] of singleWordOwners) {
    if (owners.size > 1) {
      warnings.push(`Single-word signal "${word}" is shared by ${owners.size} plugins (${[...owners].join(", ")}) — fine if genuinely cross-domain (e.g. "auth"), worth a second look otherwise.`);
    }
  }

  // 5. Generic-English-word single signals.
  for (const s of skills) {
    for (const sig of s.activationSignals) {
      if (sig.includes(" ")) continue;
      if (GENERIC_WORDS.has(sig.toLowerCase())) {
        warnings.push(`[${s.pluginId}/${s.id}] activationSignal "${sig}" is a generic English/CS word — router.ts deliberately excludes single-word skill signals from plugin-inclusion for this exact reason, but it still scores within skill-selector.ts once its plugin is otherwise selected, which can pull in an irrelevant skill (e.g. visual-review's "review"/"improve" historically did).`);
      }
    }
  }
  for (const m of manifests) {
    for (const hint of m.activationHints) {
      if (hint.includes(" ")) continue;
      if (GENERIC_WORDS.has(hint.toLowerCase())) {
        errors.push(`[${m.id}] manifest activationHint "${hint}" is a generic English/CS word used as a plugin-level hint — this can include the whole plugin on an unrelated request whenever the classifier is in ambiguous mode.`);
      }
    }
  }

  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  SIGNAL COLLISION LINT");
  console.log("═══════════════════════════════════════════════════════════════\n");
  console.log(`  Scanned ${manifests.length} plugins, ${skills.length} skills.\n`);

  if (errors.length > 0) {
    console.log(`  ERRORS (${errors.length}):`);
    for (const e of errors) console.log(`    ✗ ${e}`);
    console.log("");
  }
  if (warnings.length > 0) {
    console.log(`  WARNINGS (${warnings.length}):`);
    for (const w of warnings) console.log(`    ⚠ ${w}`);
    console.log("");
  }
  if (errors.length === 0 && warnings.length === 0) {
    console.log("  Clean — no collision risks found.\n");
  }

  console.log("═══════════════════════════════════════════════════════════════\n");

  if (errors.length > 0) {
    process.exit(1);
  }
}

main();
