import { describe, it, expect } from "bun:test";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { PluginRegistry } from "../src/plugins/registry.js";

describe("Missing & Corrupt Plugin Handling", () => {
  it("missing plugins directory throws a clear error", async () => {
    const registry = new PluginRegistry("/does/not/exist");
    await expect(registry.load()).rejects.toThrow();
  });

  it("plugin directory with no manifest.json is skipped gracefully", async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "skill-plugins-"));
    try {
      // Create a plugin dir with no manifest
      mkdirSync(join(tmpDir, "broken-plugin"));

      const registry = new PluginRegistry(tmpDir);
      await registry.load(); // should not throw
      expect(registry.getPluginIds()).toHaveLength(0);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("plugin with corrupt manifest JSON is skipped, others load fine", async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "skill-mixed-"));
    try {
      // Corrupt plugin
      mkdirSync(join(tmpDir, "corrupt"));
      writeFileSync(join(tmpDir, "corrupt", "manifest.json"), "{ invalid json {{");

      // Valid plugin
      mkdirSync(join(tmpDir, "valid-plugin", "skills-meta"), { recursive: true });
      writeFileSync(
        join(tmpDir, "valid-plugin", "manifest.json"),
        JSON.stringify({
          id: "valid-plugin",
          name: "Valid Plugin",
          description: "Test plugin",
          version: "0.1.0",
          domains: ["testing"],
          activationHints: ["test"],
          skills: [],
        })
      );

      const registry = new PluginRegistry(tmpDir);
      await registry.load(); // should not throw
      expect(registry.getPluginIds()).toContain("valid-plugin");
      expect(registry.getPluginIds()).not.toContain("corrupt");
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("one corrupt skill-meta does not prevent other skills from loading", async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "skill-corrupt-meta-"));
    try {
      mkdirSync(join(tmpDir, "myplugin", "skills-meta"), { recursive: true });
      mkdirSync(join(tmpDir, "myplugin", "skills"), { recursive: true });

      writeFileSync(
        join(tmpDir, "myplugin", "manifest.json"),
        JSON.stringify({
          id: "myplugin",
          name: "My Plugin",
          description: "Test",
          version: "0.1.0",
          domains: ["testing"],
          activationHints: ["test"],
          skills: ["good-skill", "bad-skill"],
        })
      );

      // Good skill meta
      writeFileSync(
        join(tmpDir, "myplugin", "skills-meta", "good-skill.json"),
        JSON.stringify({
          id: "good-skill",
          pluginId: "myplugin",
          name: "Good Skill",
          description: "Works fine",
          activationSignals: ["test"],
          estimatedTokens: 100,
          priority: 50,
          bodyPath: "skills/good-skill.md",
        })
      );

      // Corrupt skill meta
      writeFileSync(
        join(tmpDir, "myplugin", "skills-meta", "bad-skill.json"),
        "NOT JSON AT ALL"
      );

      const registry = new PluginRegistry(tmpDir);
      await registry.load();
      const plugin = registry.getPlugin("myplugin");
      expect(plugin).toBeDefined();
      expect(plugin!.skills.has("good-skill")).toBe(true);
      expect(plugin!.skills.has("bad-skill")).toBe(false);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("empty plugins directory loads successfully with no plugins", async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "skill-empty-"));
    try {
      const registry = new PluginRegistry(tmpDir);
      await registry.load(); // should not throw
      expect(registry.getPluginIds()).toHaveLength(0);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});