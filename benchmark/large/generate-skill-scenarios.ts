// Generates one benchmark scenario per real skill, using that skill's actual
// `activationSignals` from plugins/*/skills-meta/*.json. This keeps the large
// benchmark grounded in the system's real routing data instead of invented
// keywords that might not match what the classifier/selector actually score.

import { readdirSync, readFileSync } from "fs";
import { join, resolve } from "path";
import type { Scenario } from "./types.js";

const PLUGINS_DIR = resolve(import.meta.dir, "../../plugins");
const VARIANTS_PER_SKILL = 5;

// Curated "clearly unrelated" plugins per plugin — used as the forbidden set
// for skill-level scenarios. Picked conservatively so legitimate cross-domain
// overlap (e.g. backend <-> security auth) never causes a false failure.
const FORBIDDEN_MAP: Record<string, string[]> = {
  "web-design": ["rust", "database", "game-development"],
  rust: ["web-design", "mobile", "database"],
  backend: ["web-design", "game-development", "mobile"],
  database: ["web-design", "mobile", "game-development"],
  devops: ["web-design", "mobile", "game-development"],
  testing: ["web-design", "game-development", "mobile"],
  security: ["web-design", "mobile", "game-development"],
  mobile: ["rust", "database", "game-development"],
  "ai-engineering": ["web-design", "game-development", "mobile"],
  automation: ["web-design", "game-development", "rust"],
  "game-development": ["backend", "database", "devops"],
};

interface SkillMeta {
  id: string;
  pluginId: string;
  name: string;
  description: string;
  activationSignals: string[];
}

interface PluginManifest {
  id: string;
  name: string;
}

function loadSkills(): { skills: SkillMeta[]; pluginNames: Record<string, string> } {
  const skills: SkillMeta[] = [];
  const pluginNames: Record<string, string> = {};

  for (const pluginDir of readdirSync(PLUGINS_DIR)) {
    const manifestPath = join(PLUGINS_DIR, pluginDir, "manifest.json");
    let manifest: PluginManifest;
    try {
      manifest = JSON.parse(readFileSync(manifestPath, "utf-8").replace(/^﻿/, ""));
    } catch {
      continue;
    }
    pluginNames[manifest.id] = manifest.name;

    const metaDir = join(PLUGINS_DIR, pluginDir, "skills-meta");
    let files: string[];
    try {
      files = readdirSync(metaDir).filter((f) => f.endsWith(".json"));
    } catch {
      continue;
    }
    for (const file of files) {
      const raw = JSON.parse(readFileSync(join(metaDir, file), "utf-8").replace(/^﻿/, ""));
      skills.push({
        id: raw.id,
        pluginId: raw.pluginId,
        name: raw.name,
        description: raw.description,
        activationSignals: raw.activationSignals ?? [],
      });
    }
  }

  return { skills, pluginNames };
}

// Keep only signals that read as natural words/phrases in a sentence —
// drop bare symbols, numeric-only codes, and API-fragment tokens.
function cleanSignals(signals: string[]): string[] {
  return signals.filter((s) => {
    if (s.length < 3) return false;
    if (/^\d+$/.test(s)) return false;
    if (/[(){}?]/.test(s)) return false;
    return true;
  });
}

const TEMPLATES: Array<(sig1: string, sig2: string, pluginCtx: string) => string> = [
  (sig1) => `I need help with ${sig1} for my project — what's the best-practice approach?`,
  (sig1, sig2) => `My app has an issue that touches both ${sig1} and ${sig2}. How should I approach fixing it?`,
  (sig1, _sig2, ctx) => `How do I properly implement ${sig1} in a real-world ${ctx} project?`,
  (sig1, sig2) => `What's the right way to handle ${sig1} when it interacts with ${sig2}?`,
  (sig1) => `Can you review my approach to ${sig1}? I'm not confident it follows best practices.`,
  (sig1) => `We're building a feature that needs solid ${sig1} — what should I watch out for?`,
  (sig1, sig2) => `I'm stuck on ${sig1}, specifically how it relates to ${sig2}.`,
  (sig1, _sig2, ctx) => `Walk me through designing ${sig1} for a production ${ctx} system.`,
];

export function generateSkillScenarios(): Scenario[] {
  const { skills, pluginNames } = loadSkills();
  const scenarios: Scenario[] = [];

  for (const skill of skills) {
    const clean = cleanSignals(skill.activationSignals);
    if (clean.length === 0) continue;
    const pluginCtx = (pluginNames[skill.pluginId] ?? skill.pluginId).toLowerCase();
    const forbidden = FORBIDDEN_MAP[skill.pluginId] ?? [];

    for (let v = 0; v < VARIANTS_PER_SKILL; v++) {
      const sig1 = clean[v % clean.length];
      const sig2 = clean[(v + 1) % clean.length];
      const template = TEMPLATES[v % TEMPLATES.length];
      const request = template(sig1, sig2, pluginCtx);

      scenarios.push({
        id: `SK-${skill.pluginId.toUpperCase().slice(0, 4)}-${skill.id}-${v + 1}`,
        category: "skill",
        domain: skill.pluginId,
        request,
        expectedPlugins: [skill.pluginId],
        expectedSkillIds: [skill.id],
        forbiddenPlugins: forbidden,
        note: `Auto-generated from real activationSignals of ${skill.pluginId}/${skill.id} ("${sig1}", "${sig2}").`,
      });
    }
  }

  return scenarios;
}
