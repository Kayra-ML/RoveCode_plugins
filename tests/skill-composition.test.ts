import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { selectSkills } from "../src/router/skill-selector.js";
import { PluginRegistry } from "../src/plugins/registry.js";
import type { Plugin, SkillMetadata } from "../src/types/index.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSkill(overrides: Partial<SkillMetadata> & Pick<SkillMetadata, "id">): SkillMetadata {
  return {
    pluginId: "test-plugin",
    name: overrides.id,
    description: "test skill",
    activationSignals: ["test"],
    estimatedTokens: 100,
    priority: 80,
    bodyPath: "/fake/path.md",
    ...overrides,
  };
}

function makePlugin(skills: SkillMetadata[]): Plugin {
  const map = new Map<string, SkillMetadata>();
  for (const s of skills) map.set(s.id, s);
  return {
    manifest: {
      id: "test-plugin",
      name: "Test Plugin",
      description: "test",
      version: "1.0.0",
      domains: ["web-design"],
      activationHints: [],
      skills: skills.map((s) => s.id),
    },
    skills: map,
    pluginDir: "/fake",
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Skill Composition", () => {
  // ---- requires ----

  it("a skill with `requires` pulls in its dependency", () => {
    const dep = makeSkill({ id: "dep-skill", activationSignals: ["dep"], estimatedTokens: 100 });
    const main = makeSkill({
      id: "main-skill",
      activationSignals: ["main"],
      estimatedTokens: 100,
      requires: ["dep-skill"],
    });
    const plugin = makePlugin([main, dep]);

    const result = selectSkills([plugin], ["main"], 1000);
    const ids = result.selected.map((s) => s.id);

    expect(ids).toContain("main-skill");
    expect(ids).toContain("dep-skill");
  });

  it("`requires` dependency is included even though it scored zero on keywords", () => {
    const dep = makeSkill({
      id: "zero-score-dep",
      activationSignals: ["completely-unrelated-xyz"],
      estimatedTokens: 50,
    });
    const main = makeSkill({
      id: "main-skill",
      activationSignals: ["main"],
      estimatedTokens: 100,
      requires: ["zero-score-dep"],
    });
    const plugin = makePlugin([main, dep]);

    const result = selectSkills([plugin], ["main"], 1000);
    const ids = result.selected.map((s) => s.id);

    expect(ids).toContain("main-skill");
    expect(ids).toContain("zero-score-dep");
  });

  it("`requires` dep is not added when budget is exhausted, but requiring skill stays selected", () => {
    // main costs 100, dep costs 400 — budget is exactly 100 (no room for dep)
    const dep = makeSkill({ id: "expensive-dep", activationSignals: ["dep"], estimatedTokens: 400 });
    const main = makeSkill({
      id: "main-skill",
      activationSignals: ["main"],
      estimatedTokens: 100,
      requires: ["expensive-dep"],
    });
    const plugin = makePlugin([main, dep]);

    const result = selectSkills([plugin], ["main"], 100);
    const ids = result.selected.map((s) => s.id);

    // main still selected
    expect(ids).toContain("main-skill");
    // dep cannot fit
    expect(ids).not.toContain("expensive-dep");
    // composition log should mention the budget issue
    expect(result.compositionLog.some((l) => l.includes("budget too tight") && l.includes("expensive-dep"))).toBe(true);
  });

  // ---- suggests ----

  it("a skill with `suggests` pulls in its soft dependency when budget allows", () => {
    const suggested = makeSkill({ id: "suggested-skill", activationSignals: ["sug"], estimatedTokens: 100 });
    const main = makeSkill({
      id: "main-skill",
      activationSignals: ["main"],
      estimatedTokens: 100,
      suggests: ["suggested-skill"],
    });
    const plugin = makePlugin([main, suggested]);

    const result = selectSkills([plugin], ["main"], 1000);
    const ids = result.selected.map((s) => s.id);

    expect(ids).toContain("main-skill");
    expect(ids).toContain("suggested-skill");
    expect(result.compositionLog.some((l) => l.includes("suggested by") && l.includes("suggested-skill"))).toBe(true);
  });

  it("`suggests` dependency is excluded when budget is too tight", () => {
    // main costs 900, suggested costs 200 — budget is 1000, only 100 left after main
    const suggested = makeSkill({ id: "suggested-skill", activationSignals: ["sug"], estimatedTokens: 200 });
    const main = makeSkill({
      id: "main-skill",
      activationSignals: ["main"],
      estimatedTokens: 900,
      suggests: ["suggested-skill"],
    });
    const plugin = makePlugin([main, suggested]);

    const result = selectSkills([plugin], ["main"], 1000);
    const ids = result.selected.map((s) => s.id);

    expect(ids).toContain("main-skill");
    expect(ids).not.toContain("suggested-skill");
  });

  it("`suggests` does not duplicate a skill already selected via activation signals", () => {
    const suggested = makeSkill({ id: "suggested-skill", activationSignals: ["sug"], estimatedTokens: 100 });
    const main = makeSkill({
      id: "main-skill",
      activationSignals: ["main"],
      estimatedTokens: 100,
      suggests: ["suggested-skill"],
    });
    const plugin = makePlugin([main, suggested]);

    // Both keywords match both skills directly
    const result = selectSkills([plugin], ["main", "sug"], 1000);
    const ids = result.selected.map((s) => s.id);

    expect(ids.filter((id) => id === "suggested-skill").length).toBe(1);
  });

  // ---- extends ----

  it("a skill with `extends` inherits parent activation signals via registry", async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "skill-comp-test-"));
    try {
      // Build a minimal fake plugin directory
      const pluginDir = join(tmpDir, "test-plugin");
      mkdirSync(pluginDir);
      mkdirSync(join(pluginDir, "skills-meta"));
      mkdirSync(join(pluginDir, "skills"));

      // manifest
      writeFileSync(
        join(pluginDir, "manifest.json"),
        JSON.stringify({
          id: "test-plugin",
          name: "Test Plugin",
          description: "test",
          version: "1.0.0",
          domains: ["web-design"],
          activationHints: ["test"],
          skills: ["parent-skill", "child-skill"],
        })
      );

      // parent skill
      writeFileSync(
        join(pluginDir, "skills-meta", "parent-skill.json"),
        JSON.stringify({
          id: "parent-skill",
          pluginId: "test-plugin",
          name: "Parent Skill",
          description: "parent",
          activationSignals: ["alpha", "beta"],
          estimatedTokens: 100,
          priority: 80,
          bodyPath: "skills/parent-skill.md",
        })
      );
      writeFileSync(join(pluginDir, "skills", "parent-skill.md"), "# Parent");

      // child skill — extends parent, has its own signal "gamma"
      writeFileSync(
        join(pluginDir, "skills-meta", "child-skill.json"),
        JSON.stringify({
          id: "child-skill",
          pluginId: "test-plugin",
          name: "Child Skill",
          description: "child",
          activationSignals: ["gamma"],
          estimatedTokens: 100,
          priority: 80,
          bodyPath: "skills/child-skill.md",
          extends: "parent-skill",
        })
      );
      writeFileSync(join(pluginDir, "skills", "child-skill.md"), "# Child");

      const registry = new PluginRegistry(tmpDir);
      await registry.load();

      const childMeta = registry.getSkillMetadata("test-plugin", "child-skill");
      expect(childMeta).toBeDefined();

      // child should have inherited alpha and beta from parent
      expect(childMeta!.activationSignals).toContain("alpha");
      expect(childMeta!.activationSignals).toContain("beta");
      // and still have its own signal
      expect(childMeta!.activationSignals).toContain("gamma");
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("`extends` does not duplicate signals already in child", async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "skill-comp-test-"));
    try {
      const pluginDir = join(tmpDir, "test-plugin");
      mkdirSync(pluginDir);
      mkdirSync(join(pluginDir, "skills-meta"));
      mkdirSync(join(pluginDir, "skills"));

      writeFileSync(
        join(pluginDir, "manifest.json"),
        JSON.stringify({
          id: "test-plugin",
          name: "Test",
          description: "test",
          version: "1.0.0",
          domains: ["web-design"],
          activationHints: [],
          skills: ["parent-skill", "child-skill"],
        })
      );

      writeFileSync(
        join(pluginDir, "skills-meta", "parent-skill.json"),
        JSON.stringify({
          id: "parent-skill",
          pluginId: "test-plugin",
          name: "Parent",
          description: "p",
          activationSignals: ["shared-signal", "parent-only"],
          estimatedTokens: 100,
          priority: 80,
          bodyPath: "skills/parent-skill.md",
        })
      );
      writeFileSync(join(pluginDir, "skills", "parent-skill.md"), "# Parent");

      // child already has "shared-signal"
      writeFileSync(
        join(pluginDir, "skills-meta", "child-skill.json"),
        JSON.stringify({
          id: "child-skill",
          pluginId: "test-plugin",
          name: "Child",
          description: "c",
          activationSignals: ["shared-signal", "child-only"],
          estimatedTokens: 100,
          priority: 80,
          bodyPath: "skills/child-skill.md",
          extends: "parent-skill",
        })
      );
      writeFileSync(join(pluginDir, "skills", "child-skill.md"), "# Child");

      const registry = new PluginRegistry(tmpDir);
      await registry.load();

      const childMeta = registry.getSkillMetadata("test-plugin", "child-skill");
      expect(childMeta).toBeDefined();

      const count = childMeta!.activationSignals.filter((s) => s === "shared-signal").length;
      expect(count).toBe(1); // no duplicates
      expect(childMeta!.activationSignals).toContain("parent-only");
      expect(childMeta!.activationSignals).toContain("child-only");
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  // ---- circular dependency guard ----

  it("circular `requires` (A → B → A) does not infinite loop", () => {
    const skillA = makeSkill({
      id: "skill-a",
      activationSignals: ["aaa"],
      estimatedTokens: 100,
      requires: ["skill-b"],
    });
    const skillB = makeSkill({
      id: "skill-b",
      activationSignals: ["bbb"],
      estimatedTokens: 100,
      requires: ["skill-a"],
    });
    const plugin = makePlugin([skillA, skillB]);

    // Should complete without hanging or throwing
    const result = selectSkills([plugin], ["aaa"], 1000);
    const ids = result.selected.map((s) => s.id);

    expect(ids).toContain("skill-a");
    // skill-b should be pulled in as required dep
    expect(ids).toContain("skill-b");
    // No duplicates
    expect(ids.filter((id) => id === "skill-a").length).toBe(1);
    expect(ids.filter((id) => id === "skill-b").length).toBe(1);
  });

  it("circular `suggests` (A → B → A) does not infinite loop", () => {
    const skillA = makeSkill({
      id: "skill-a",
      activationSignals: ["aaa"],
      estimatedTokens: 100,
      suggests: ["skill-b"],
    });
    const skillB = makeSkill({
      id: "skill-b",
      activationSignals: ["bbb"],
      estimatedTokens: 100,
      suggests: ["skill-a"],
    });
    const plugin = makePlugin([skillA, skillB]);

    const result = selectSkills([plugin], ["aaa"], 1000);
    const ids = result.selected.map((s) => s.id);

    expect(ids.filter((id) => id === "skill-a").length).toBe(1);
    expect(ids.filter((id) => id === "skill-b").length).toBe(1);
  });

  // ---- integration with real plugin data ----

  it("layout-composition suggests typography and responsive-design via real plugin", async () => {
    const { resolve } = await import("path");
    const PLUGINS_DIR = resolve(import.meta.dir, "../plugins");
    const registry = new PluginRegistry(PLUGINS_DIR);
    await registry.load();

    const plugin = registry.getPlugin("web-design");
    expect(plugin).toBeDefined();

    const layoutMeta = plugin!.skills.get("layout-composition");
    expect(layoutMeta).toBeDefined();
    expect(layoutMeta!.suggests).toContain("typography");
    expect(layoutMeta!.suggests).toContain("responsive-design");
  });

  it("creative-direction suggests visual-review via real plugin", async () => {
    const { resolve } = await import("path");
    const PLUGINS_DIR = resolve(import.meta.dir, "../plugins");
    const registry = new PluginRegistry(PLUGINS_DIR);
    await registry.load();

    const plugin = registry.getPlugin("web-design");
    expect(plugin).toBeDefined();

    const cdMeta = plugin!.skills.get("creative-direction");
    expect(cdMeta).toBeDefined();
    expect(cdMeta!.suggests).toContain("visual-review");
  });

  it("composition log is present in SkillSelectionResult", () => {
    const main = makeSkill({ id: "main-skill", activationSignals: ["main"], estimatedTokens: 100 });
    const plugin = makePlugin([main]);

    const result = selectSkills([plugin], ["main"], 1000);
    expect(Array.isArray(result.compositionLog)).toBe(true);
  });
});