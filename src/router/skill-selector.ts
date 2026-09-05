import type { Plugin, SkillMetadata } from "../types/index.js";

const MIN_SKILL_SCORE = 0.3;

export interface RejectedSkill {
  id: string;
  reason: string;
}

export interface SkillSelectionResult {
  selected: SkillMetadata[];
  rejected: RejectedSkill[];
  compositionLog: string[];
}

export function selectSkills(
  plugins: Plugin[],
  keywords: string[],
  tokenBudget: number
): SkillSelectionResult {
  const selected: SkillMetadata[] = [];
  const rejected: RejectedSkill[] = [];

  // Build a flat map of all skills across all plugins for dependency resolution
  const allSkills = new Map<string, SkillMetadata>();
  for (const plugin of plugins) {
    for (const skill of plugin.skills.values()) {
      allSkills.set(skill.id, skill);
    }
  }

  // Collect all skill metadata from selected plugins
  const candidates: Array<{ skill: SkillMetadata; score: number }> = [];

  for (const plugin of plugins) {
    for (const skill of plugin.skills.values()) {
      const score = scoreSkill(skill, keywords);
      candidates.push({ skill, score });
    }
  }

  // Sort by score descending
  candidates.sort((a, b) => b.score - a.score);

  let usedTokens = 0;

  for (const { skill, score } of candidates) {
    if (score < MIN_SKILL_SCORE) {
      rejected.push({ id: `${skill.pluginId}/${skill.id}`, reason: "No activation signal match." });
      continue;
    }

    const cost = skill.estimatedTokens;

    if (usedTokens + cost > tokenBudget) {
      rejected.push({
        id: `${skill.pluginId}/${skill.id}`,
        reason: `Token budget exceeded (would use ${usedTokens + cost}, budget ${tokenBudget}).`,
      });
      continue;
    }

    // Check exclusions
    const excluded = selected.some(
      (s) => skill.exclusions?.includes(s.id) || s.exclusions?.includes(skill.id)
    );
    if (excluded) {
      rejected.push({ id: `${skill.pluginId}/${skill.id}`, reason: "Excluded by selected skill." });
      continue;
    }

    selected.push(skill);
    usedTokens += cost;
  }

  // Resolve composition (requires/suggests) after initial selection
  const { compositionLog } = resolveComposition(selected, allSkills, tokenBudget - usedTokens, rejected);

  return { selected, rejected, compositionLog };
}

function resolveComposition(
  selected: SkillMetadata[],
  allSkills: Map<string, SkillMetadata>,
  budgetRemaining: number,
  rejected: RejectedSkill[]
): { compositionLog: string[] } {
  const compositionLog: string[] = [];
  const selectedIds = new Set(selected.map((s) => s.id));
  // Guard against circular dependencies by tracking visited requires/suggests
  const visited = new Set<string>();
  let budget = budgetRemaining;

  // 1. Hard requires — must include or skip (but keep the requiring skill)
  // Iterate over a snapshot since selected grows during iteration
  let i = 0;
  while (i < selected.length) {
    const skill = selected[i];
    for (const reqId of skill.requires ?? []) {
      if (selectedIds.has(reqId) || visited.has(`req:${skill.id}:${reqId}`)) {
        i++;
        continue;
      }
      visited.add(`req:${skill.id}:${reqId}`);
      const dep = allSkills.get(reqId);
      if (!dep) {
        compositionLog.push(`[composition] ✗ missing required dep: ${reqId} (needed by ${skill.id})`);
        continue;
      }
      if (dep.estimatedTokens <= budget) {
        selected.push(dep);
        selectedIds.add(reqId);
        budget -= dep.estimatedTokens;
        compositionLog.push(`[composition] ✓ included: ${dep.pluginId}/${dep.id} (required by ${skill.id})`);
      } else {
        compositionLog.push(`[composition] ✗ budget too tight for required dep: ${dep.pluginId}/${dep.id} (needed by ${skill.id})`);
      }
    }
    i++;
  }

  // 2. Soft suggests — include if budget allows
  i = 0;
  while (i < selected.length) {
    const skill = selected[i];
    for (const sugId of skill.suggests ?? []) {
      if (selectedIds.has(sugId) || visited.has(`sug:${skill.id}:${sugId}`)) {
        i++;
        continue;
      }
      visited.add(`sug:${skill.id}:${sugId}`);
      const dep = allSkills.get(sugId);
      if (!dep) {
        compositionLog.push(`[composition] ✗ missing suggested dep: ${sugId} (suggested by ${skill.id})`);
        continue;
      }
      if (dep.estimatedTokens <= budget) {
        selected.push(dep);
        selectedIds.add(sugId);
        budget -= dep.estimatedTokens;
        compositionLog.push(`[composition] ✓ included: ${dep.pluginId}/${dep.id} (suggested by ${skill.id})`);
      } else {
        compositionLog.push(`[composition] ✗ budget too tight for suggested dep: ${dep.pluginId}/${dep.id} (suggested by ${skill.id})`);
      }
    }
    i++;
  }

  return { compositionLog };
}

function scoreSkill(skill: SkillMetadata, keywords: string[]): number {
  const signalLower = skill.activationSignals.map((s) => s.toLowerCase());
  let score = 0;

  for (const keyword of keywords) {
    const kw = keyword.toLowerCase();
    for (const signal of signalLower) {
      if (signal === kw) { score += 3; break; }
      if (signal.includes(kw) || kw.includes(signal)) { score += 1; break; }
    }
  }

  // Weight by priority
  score = score * (skill.priority / 100);

  return score;
}