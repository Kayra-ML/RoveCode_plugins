import type {
  RoutingRequest,
  RoutingDecision,
  TokenBudget,
  SkillMetadata,
  PersonalEntry,
  Plugin,
} from "../types/index.js";
import type { PluginRegistry } from "../plugins/registry.js";
import type { PersonalManager } from "../personal/manager.js";
import { classifyRequest, extractKeywordsFromRequest } from "./classifier.js";
import { selectSkills } from "./skill-selector.js";

export const DEFAULT_BUDGET: TokenBudget = {
  personal: 800,
  domainSkills: 4000,
  projectContext: 1000,
  total: 6000,
};

export class Router {
  constructor(
    private registry: PluginRegistry,
    private personal: PersonalManager,
    private budget: TokenBudget = DEFAULT_BUDGET
  ) {}

  async route(req: RoutingRequest): Promise<RoutingDecision> {
    const debug = req.debug === true;
    const debugLog: string[] = [];

    // 1. Classify
    const classification = classifyRequest(req.userRequest);
    if (debug) {
      debugLog.push(`[classifier] domains: ${classification.domains.join(", ")}`);
      debugLog.push(`[classifier] keywords: ${classification.keywords.join(", ")}`);
      if (classification.isAmbiguous) debugLog.push("[classifier] ⚠ ambiguous request");
    }

    // 2. Match plugins
    const selectedPlugins: Plugin[] = [];
    const allPlugins = this.registry.getAllPlugins();
    const requestLower = req.userRequest.toLowerCase();

    for (const plugin of allPlugins) {
      const domainMatch = classification.domains.includes(plugin.manifest.id as any);

      // hintMatch: count how many activation hints appear in the request
      // Single-word hints need 2+ matches; multi-word hints need only 1
      const matchingHints = plugin.manifest.activationHints.filter((hint) =>
        requestLower.includes(hint.toLowerCase())
      );
      const multiWordHits = matchingHints.filter(h => h.includes(" ")).length;
      const singleWordHits = matchingHints.filter(h => !h.includes(" ")).length;

      // Strong hint: at least one multi-word match, OR 3+ single-word matches
      const strongHintMatch = multiWordHits >= 1 || singleWordHits >= 3;

      // When classifier is confident (not ambiguous), only accept strong hint matches
      // When ambiguous, accept weaker signals too
      const hintMatch = classification.isAmbiguous
        ? matchingHints.length >= 1
        : strongHintMatch;

      // Never add a plugin via hintMatch alone if classifier already found domains
      // and this plugin's domain is not among them — unless the hit is very strong
      const classifierFoundDomains = classification.domains.length > 0 && !classification.isAmbiguous;
      const shouldInclude = domainMatch || (hintMatch && (!classifierFoundDomains || multiWordHits >= 1));

      if (shouldInclude) {
        selectedPlugins.push(plugin);
        if (debug) debugLog.push(`[plugins] ✓ selected: ${plugin.manifest.id}`);
      } else {
        if (debug) debugLog.push(`[plugins] ✗ rejected: ${plugin.manifest.id} (no domain/hint match)`);
      }
    }

    // 3. Select skills within token budget
    // Extract keywords once and reuse for both skill selection and personal retrieval
    const extractedKeywords = extractKeywordsFromRequest(req.userRequest);
    const skillKeywords = [...classification.keywords, ...extractedKeywords];

    const { selected: selectedSkills, rejected: rejectedSkills, compositionLog } = selectSkills(
      selectedPlugins,
      skillKeywords,
      this.budget.domainSkills
    );

    if (debug) {
      for (const s of selectedSkills) {
        debugLog.push(`[skills] ✓ selected: ${s.pluginId}/${s.id} (~${s.estimatedTokens} tokens)`);
      }
      for (const r of rejectedSkills) {
        debugLog.push(`[skills] ✗ rejected: ${r.id} — ${r.reason}`);
      }
      for (const c of compositionLog) {
        debugLog.push(c);
      }
    }

    // 4. Retrieve personal knowledge
    const allKeywords = [
      ...skillKeywords,
      ...(req.techHints ?? []),
    ];
    const primaryDomain = classification.domains[0];

    const personalEntries = await this.personal.findRelevantEntries(
      req.userId,
      allKeywords,
      primaryDomain,
      8
    );

    const personalTokensUsed = estimateTokens(
      personalEntries.map((e) => e.content).join("\n")
    );

    if (personalTokensUsed > this.budget.personal) {
      // Trim to fit budget
      let tokens = 0;
      const trimmed: PersonalEntry[] = [];
      for (const entry of personalEntries) {
        const cost = estimateTokens(entry.content);
        if (tokens + cost <= this.budget.personal) {
          trimmed.push(entry);
          tokens += cost;
        }
      }
      personalEntries.splice(0, personalEntries.length, ...trimmed);
    }

    if (debug) {
      for (const e of personalEntries) {
        debugLog.push(`[personal] ✓ selected: ${e.id} (${e.type})`);
      }
    }

    // 5. Total estimate
    // If no personal entries were found, note the unused personal budget as available headroom
    const skillTokens = selectedSkills.reduce((sum, s) => sum + s.estimatedTokens, 0);
    const actualPersonalTokens = personalEntries.length === 0 ? 0 : personalTokensUsed;
    const estimatedTokens = skillTokens + actualPersonalTokens;
    if (debug) {
      debugLog.push(`[budget] estimated total: ${estimatedTokens} / ${this.budget.total}`);
      if (personalEntries.length === 0) {
        debugLog.push(`[budget] personal budget unused (+${this.budget.personal} tokens available as headroom)`);
      }
    }

    return {
      request: req.userRequest,
      selectedPlugins: selectedPlugins.map((p) => p.manifest.id),
      selectedSkills,
      rejectedSkills,
      selectedPersonalEntries: personalEntries,
      estimatedTokens,
      tokenBudget: this.budget,
      debugLog,
    };
  }
}

function estimateTokens(text: string): number {
  // Rough approximation: 1 token ≈ 4 characters
  return Math.ceil(text.length / 4);
}