import { describe, it, expect } from "bun:test";
import { PluginRegistry } from "../src/plugins/registry.js";
import { resolve } from "path";

const PLUGINS_DIR = resolve(import.meta.dir, "../plugins");

describe("Plugin Discovery", () => {
  it("discovers all plugins without hardcoding names", async () => {
    const registry = new PluginRegistry(PLUGINS_DIR);
    await registry.load();
    const ids = registry.getPluginIds();
    expect(ids.length).toBeGreaterThanOrEqual(3);
    expect(ids).toContain("web-design");
    expect(ids).toContain("rust");
    expect(ids).toContain("automation");
  });

  it("each discovered plugin has a valid manifest", async () => {
    const registry = new PluginRegistry(PLUGINS_DIR);
    await registry.load();
    for (const plugin of registry.getAllPlugins()) {
      expect(plugin.manifest.id).toBeTruthy();
      expect(plugin.manifest.name).toBeTruthy();
      expect(plugin.manifest.version).toMatch(/^\d+\.\d+\.\d+$/);
      expect(Array.isArray(plugin.manifest.activationHints)).toBe(true);
      expect(plugin.manifest.activationHints.length).toBeGreaterThan(0);
    }
  });

  it("registry.load() is idempotent", async () => {
    const registry = new PluginRegistry(PLUGINS_DIR);
    await registry.load();
    const first = registry.getPluginIds();
    await registry.load(); // second call — should be a no-op
    const second = registry.getPluginIds();
    expect(first).toEqual(second);
  });

  it("missing plugin directory throws gracefully", async () => {
    const registry = new PluginRegistry("/nonexistent/path/plugins");
    await expect(registry.load()).rejects.toThrow();
  });
});