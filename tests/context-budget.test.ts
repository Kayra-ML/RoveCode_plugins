import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { PluginRegistry } from "../src/plugins/registry.js";
import { PersonalManager } from "../src/personal/manager.js";
import { Router } from "../src/router/router.js";
import { resolve } from "path";
import type { TokenBudget } from "../src/types/index.js";

const PLUGINS_DIR = resolve(import.meta.dir, "../plugins");

let tmpDir: string;
let registry: PluginRegistry;
let personal: PersonalManager;

beforeEach(async () => {
  tmpDir = mkdtempSync(join(tmpdir(), "skill-budget-"));
  registry = new PluginRegistry(PLUGINS_DIR);
  await registry.load();
  personal = new PersonalManager(tmpDir);
});

afterEach(() => {
  personal.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("Context Budget", () => {
  it("skill selection stays within domain skill budget", async () => {
    const budget: TokenBudget = {
      personal: 500,
      domainSkills: 1500,
      projectContext: 500,
      total: 3000,
    };
    const router = new Router(registry, personal, budget);
    const decision = await router.route({
      userRequest: "Build a responsive SaaS dashboard",
      userId: "test",
    });
    const skillTokens = decision.selectedSkills.reduce(
      (sum, s) => sum + s.estimatedTokens,
      0
    );
    expect(skillTokens).toBeLessThanOrEqual(budget.domainSkills);
  });

  it("very tight budget selects fewer skills than a loose budget", async () => {
    const tightBudget: TokenBudget = {
      personal: 200,
      domainSkills: 800,
      projectContext: 200,
      total: 1500,
    };
    const looseBudget: TokenBudget = {
      personal: 1000,
      domainSkills: 5000,
      projectContext: 1000,
      total: 8000,
    };

    const tightRouter = new Router(registry, personal, tightBudget);
    const looseRouter = new Router(registry, personal, looseBudget);

    const tight = await tightRouter.route({
      userRequest: "Build a responsive SaaS dashboard",
      userId: "t",
    });
    const loose = await looseRouter.route({
      userRequest: "Build a responsive SaaS dashboard",
      userId: "t",
    });

    expect(tight.selectedSkills.length).toBeLessThanOrEqual(loose.selectedSkills.length);
  });

  it("rejected skills list is an array", async () => {
    const tightBudget: TokenBudget = {
      personal: 200,
      domainSkills: 800,
      projectContext: 200,
      total: 1500,
    };
    const router = new Router(registry, personal, tightBudget);
    const decision = await router.route({
      userRequest: "Build a responsive SaaS dashboard with animation and typography",
      userId: "test",
    });
    // Should always be an array, even if no skills were rejected
    expect(Array.isArray(decision.rejectedSkills)).toBe(true);
  });

  it("zero budget means no skills are selected", async () => {
    const zeroBudget: TokenBudget = {
      personal: 0,
      domainSkills: 0,
      projectContext: 0,
      total: 0,
    };
    const router = new Router(registry, personal, zeroBudget);
    const decision = await router.route({
      userRequest: "Build a responsive SaaS dashboard",
      userId: "test",
    });
    const skillTokens = decision.selectedSkills.reduce(
      (sum, s) => sum + s.estimatedTokens,
      0
    );
    expect(skillTokens).toBe(0);
  });

  it("tokenBudget is reflected in the decision", async () => {
    const budget: TokenBudget = {
      personal: 600,
      domainSkills: 2000,
      projectContext: 400,
      total: 4000,
    };
    const router = new Router(registry, personal, budget);
    const decision = await router.route({
      userRequest: "Build a responsive SaaS dashboard",
      userId: "test",
    });
    expect(decision.tokenBudget).toEqual(budget);
  });
});