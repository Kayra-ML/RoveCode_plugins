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
  tmpDir = mkdtempSync(join(tmpdir(), "skill-test-"));
  registry = new PluginRegistry(PLUGINS_DIR);
  await registry.load();
  personal = new PersonalManager(tmpDir);
  router = new Router(registry, personal, DEFAULT_BUDGET);
});

afterEach(() => {
  personal.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("Routing", () => {
  it("SaaS dashboard request selects web-design, not rust or automation", async () => {
    const decision = await router.route({
      userRequest: "Build a responsive SaaS dashboard",
      userId: "test",
    });
    expect(decision.selectedPlugins).toContain("web-design");
    expect(decision.selectedPlugins).not.toContain("rust");
    expect(decision.selectedPlugins).not.toContain("automation");
  });

  it("Rust ownership error selects rust, not web-design", async () => {
    const decision = await router.route({
      userRequest: "My Rust CLI has an ownership error",
      userId: "test",
    });
    expect(decision.selectedPlugins).toContain("rust");
    expect(decision.selectedPlugins).not.toContain("web-design");
  });

  it("Rust request selects ownership-borrowing skill", async () => {
    const decision = await router.route({
      userRequest: "Rust ownership borrow checker error",
      userId: "test",
    });
    const ids = decision.selectedSkills.map((s) => s.id);
    expect(ids).toContain("ownership-borrowing");
  });

  it("irrelevant skills are excluded from results", async () => {
    const decision = await router.route({
      userRequest: "Build a responsive SaaS dashboard",
      userId: "test",
    });
    const ids = decision.selectedSkills.map((s) => `${s.pluginId}/${s.id}`);
    // Rust skills should never appear in a web-design request
    expect(ids.some((id) => id.startsWith("rust/"))).toBe(false);
    expect(ids.some((id) => id.startsWith("automation/"))).toBe(false);
  });

  it("respects token budget", async () => {
    const tightRouter = new Router(registry, personal, {
      ...DEFAULT_BUDGET,
      domainSkills: 1000, // very tight
    });
    const decision = await tightRouter.route({
      userRequest: "Build a responsive SaaS dashboard",
      userId: "test",
    });
    const skillTokens = decision.selectedSkills.reduce(
      (sum, s) => sum + s.estimatedTokens,
      0
    );
    expect(skillTokens).toBeLessThanOrEqual(1000);
  });

  it("decision includes debug log", async () => {
    const decision = await router.route({
      userRequest: "Build a responsive SaaS dashboard",
      userId: "test",
      debug: true,
    });
    expect(decision.debugLog.length).toBeGreaterThan(0);
    expect(decision.debugLog.some((l) => l.includes("[classifier]"))).toBe(true);
    expect(decision.debugLog.some((l) => l.includes("[plugins]"))).toBe(true);
  });

  it("decision has correct shape", async () => {
    const decision = await router.route({
      userRequest: "Build a responsive SaaS dashboard",
      userId: "test",
    });
    expect(typeof decision.request).toBe("string");
    expect(Array.isArray(decision.selectedPlugins)).toBe(true);
    expect(Array.isArray(decision.selectedSkills)).toBe(true);
    expect(Array.isArray(decision.rejectedSkills)).toBe(true);
    expect(Array.isArray(decision.selectedPersonalEntries)).toBe(true);
    expect(typeof decision.estimatedTokens).toBe("number");
  });
});