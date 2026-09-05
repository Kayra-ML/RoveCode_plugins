import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { PluginRegistry } from "../src/plugins/registry.js";
import { PersonalManager } from "../src/personal/manager.js";
import { Router, DEFAULT_BUDGET } from "../src/router/router.js";
import { resolve } from "path";

const PLUGINS_DIR = resolve(import.meta.dir, "../plugins");

let tmpDir: string;
let registry: PluginRegistry;
let personal: PersonalManager;
let router: Router;

beforeEach(async () => {
  tmpDir = mkdtempSync(join(tmpdir(), "skill-isolation-"));
  registry = new PluginRegistry(PLUGINS_DIR);
  await registry.load();
  personal = new PersonalManager(tmpDir);
  router = new Router(registry, personal, DEFAULT_BUDGET);
});

afterEach(() => {
  personal.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("Plugin Isolation", () => {
  it("Rust request does not select web-design skills", async () => {
    const decision = await router.route({
      userRequest: "Fix Rust async borrow checker issue in Tokio",
      userId: "test",
    });
    const webDesignSkills = decision.selectedSkills.filter(
      (s) => s.pluginId === "web-design"
    );
    expect(webDesignSkills).toHaveLength(0);
  });

  it("web-design request does not select rust skills", async () => {
    const decision = await router.route({
      userRequest: "Design a beautiful landing page with typography and animations",
      userId: "test",
    });
    const rustSkills = decision.selectedSkills.filter((s) => s.pluginId === "rust");
    expect(rustSkills).toHaveLength(0);
  });

  it("automation request does not load web-design or rust skills", async () => {
    const decision = await router.route({
      userRequest: "Set up a cron job with retry logic and exponential backoff",
      userId: "test",
    });
    const nonAutomationSkills = decision.selectedSkills.filter(
      (s) => s.pluginId !== "automation"
    );
    expect(nonAutomationSkills).toHaveLength(0);
  });

  it("Rust plugin is not selected for a web-design request", async () => {
    const decision = await router.route({
      userRequest: "Build a responsive dashboard with sidebar navigation and cards",
      userId: "test",
    });
    expect(decision.selectedPlugins).not.toContain("rust");
  });

  it("web-design plugin is not selected for a Rust request", async () => {
    const decision = await router.route({
      userRequest: "Implement a Rust struct with lifetime annotations and Arc<Mutex<T>>",
      userId: "test",
    });
    expect(decision.selectedPlugins).not.toContain("web-design");
  });

  it("automation plugin is not selected for a Rust request", async () => {
    const decision = await router.route({
      userRequest: "Debug Rust ownership borrow checker error in async function",
      userId: "test",
    });
    expect(decision.selectedPlugins).not.toContain("automation");
  });
});