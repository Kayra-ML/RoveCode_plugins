// Shared scenario type for the large-scale benchmark.

export type ScenarioCategory =
  | "skill"        // auto-generated from real activationSignals, one per skill
  | "isolation"    // keyword-overlap / domain-leak traps
  | "ambiguous"    // legitimately multi-domain requests
  | "negative"     // vague/non-technical requests — system should stay conservative
  | "composition"; // requires/suggests chains should pull in related skills

export interface Scenario {
  id: string;
  category: ScenarioCategory;
  /** Primary domain/plugin this scenario targets, for grouping in reports. "" for negative controls. */
  domain: string;
  request: string;
  /** All of these plugin ids must appear in selectedPlugins. Empty = no assertion. */
  expectedPlugins: string[];
  /** At least one of these skill ids must appear in selectedSkills (when non-empty). */
  expectedSkillIds: string[];
  /** None of these plugin ids may appear in selectedPlugins. */
  forbiddenPlugins: string[];
  /** Optional: none of these skill ids may appear (used for exclusion tests). */
  forbiddenSkillIds?: string[];
  /** Optional: cap on how many plugins may be selected at once (isolation/negative checks). */
  maxPlugins?: number;
  note: string;
}
