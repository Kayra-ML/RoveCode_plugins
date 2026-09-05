import type {
  AssembledContext,
  RoutingDecision,
  LoadedSkill,
  PersonalEntry,
} from "../types/index.js";
import type { PluginRegistry } from "../plugins/registry.js";

export class ContextAssembler {
  constructor(private registry: PluginRegistry) {}

  async assemble(
    decision: RoutingDecision,
    projectContext?: string
  ): Promise<AssembledContext> {
    // Load skill bodies for selected skills in parallel
    const loadedSkills: LoadedSkill[] = (
      await Promise.all(
        decision.selectedSkills.map(async (meta) => {
          try {
            const body = await this.registry.loadSkillBody(meta);
            return { ...meta, body } as LoadedSkill;
          } catch (err: any) {
            console.warn(`[assembler] Could not load skill body ${meta.id}: ${err.message}`);
            return null;
          }
        })
      )
    ).filter((s): s is LoadedSkill => s !== null);

    const personalSection = formatPersonalKnowledge(decision.selectedPersonalEntries);
    const domainSection = formatDomainSkills(loadedSkills);
    const projectSection = projectContext?.trim() ?? "";

    const estimatedTokens =
      Math.ceil(personalSection.length / 4) +
      Math.ceil(domainSection.length / 4) +
      Math.ceil(projectSection.length / 4);

    return {
      systemContext: buildSystemContext(decision),
      personalKnowledge: personalSection,
      domainSkills: domainSection,
      projectContext: projectSection,
      estimatedTokens,
    };
  }

  buildPrompt(ctx: AssembledContext): string {
    const parts: string[] = [];

    if (ctx.systemContext) parts.push(ctx.systemContext);

    if (ctx.personalKnowledge) {
      parts.push("## User Preferences & Knowledge\n\n" + ctx.personalKnowledge);
    }

    if (ctx.domainSkills) {
      parts.push("## Domain Expertise\n\n" + ctx.domainSkills);
    }

    if (ctx.projectContext) {
      parts.push("## Project Context\n\n" + ctx.projectContext);
    }

    return parts.join("\n\n---\n\n");
  }
}

function buildSystemContext(decision: RoutingDecision): string {
  const pluginList = decision.selectedPlugins.join(", ");
  const skillList = decision.selectedSkills.map((s) => s.name).join(", ");
  return [
    `Active domains: ${pluginList || "general"}`,
    `Loaded skills: ${skillList || "none"}`,
  ].join("\n");
}

function formatPersonalKnowledge(entries: PersonalEntry[]): string {
  if (entries.length === 0) return "";

  const sections: Record<string, PersonalEntry[]> = {};
  for (const entry of entries) {
    (sections[entry.type] ??= []).push(entry);
  }

  return Object.entries(sections)
    .map(([type, ents]) => {
      const heading = typeToHeading(type);
      const items = ents.map((e) => `- ${e.content}`).join("\n");
      return `### ${heading}\n\n${items}`;
    })
    .join("\n\n");
}

function formatDomainSkills(skills: LoadedSkill[]): string {
  if (skills.length === 0) return "";
  return skills.map((s) => `### ${s.name}\n\n${s.body}`).join("\n\n---\n\n");
}

function typeToHeading(type: string): string {
  const map: Record<string, string> = {
    "working-preference": "Working Preferences",
    "design-preference": "Design Preferences",
    "technical-preference": "Technical Preferences",
    "solved-problem": "Solved Problems",
    "workflow-preference": "Workflow Preferences",
    "avoided-pattern": "Patterns to Avoid",
    "successful-pattern": "Successful Patterns",
  };
  return map[type] ?? type;
}