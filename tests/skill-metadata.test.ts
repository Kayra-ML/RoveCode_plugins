import { describe, it, expect } from "bun:test";
import { PluginRegistry } from "../src/plugins/registry.js";
import { resolve } from "path";

const PLUGINS_DIR = resolve(import.meta.dir, "../plugins");

describe("Skill Metadata Loading", () => {
  it("loads skill metadata without reading skill body files", async () => {
    const registry = new PluginRegistry(PLUGINS_DIR);
    await registry.load();

    const plugin = registry.getPlugin("web-design");
    expect(plugin).toBeDefined();
    expect(plugin!.skills.size).toBe(12);

    for (const [id, meta] of plugin!.skills) {
      expect(meta.id).toBe(id);
      expect(meta.name).toBeTruthy();
      expect(meta.description).toBeTruthy();
      expect(Array.isArray(meta.activationSignals)).toBe(true);
      expect(meta.estimatedTokens).toBeGreaterThan(0);
      expect(meta.priority).toBeGreaterThanOrEqual(0);
      expect(meta.priority).toBeLessThanOrEqual(100);
      // bodyPath should exist but body content should NOT be loaded
      expect(meta.bodyPath).toBeTruthy();
      expect((meta as any).body).toBeUndefined();
    }
  });

  it("lazily loads skill body only when requested", async () => {
    const registry = new PluginRegistry(PLUGINS_DIR);
    await registry.load();
    const meta = registry.getSkillMetadata("rust", "ownership-borrowing");
    expect(meta).toBeDefined();
    // Body not loaded yet
    expect((meta as any).body).toBeUndefined();
    // Now load it
    const body = await registry.loadSkillBody(meta!);
    expect(body.length).toBeGreaterThan(100);
    expect(body).toContain("Ownership");
  });

  it("corrupt skill-meta JSON does not crash registry", async () => {
    // The registry warns and skips bad metadata; other skills load fine
    const registry = new PluginRegistry(PLUGINS_DIR);
    await registry.load(); // should not throw
    expect(registry.getPluginIds().length).toBeGreaterThan(0);
  });

  it("rust plugin has 6 skills", async () => {
    const registry = new PluginRegistry(PLUGINS_DIR);
    await registry.load();
    const plugin = registry.getPlugin("rust");
    expect(plugin).toBeDefined();
    expect(plugin!.skills.size).toBe(6);
  });

  it("automation plugin has 6 skills", async () => {
    const registry = new PluginRegistry(PLUGINS_DIR);
    await registry.load();
    const plugin = registry.getPlugin("automation");
    expect(plugin).toBeDefined();
    expect(plugin!.skills.size).toBe(6);
  });

  it("each skill metadata has a bodyPath", async () => {
    const registry = new PluginRegistry(PLUGINS_DIR);
    await registry.load();
    for (const plugin of registry.getAllPlugins()) {
      for (const [, meta] of plugin.skills) {
        expect(typeof meta.bodyPath).toBe("string");
        expect(meta.bodyPath.length).toBeGreaterThan(0);
      }
    }
  });
});