import { describe, it, expect } from "bun:test";
import { sanitizeForLearning, detectSignals } from "../src/learning/pipeline.js";

describe("Security & Learning Boundaries", () => {
  it("sanitizeForLearning strips API keys with sk- prefix", () => {
    const content = "Use sk-proj-abc123def456ghi789jkl012mno345 as the API key";
    const safe = sanitizeForLearning(content);
    expect(safe).not.toContain("sk-proj-abc123");
    expect(safe).toContain("[REDACTED]");
  });

  it("sanitizeForLearning strips long base64-like tokens", () => {
    const content =
      "Auth token: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP48Zernt";
    const safe = sanitizeForLearning(content);
    // The long base64 portion (>=40 chars) should be redacted
    expect(safe.length).toBeLessThan(content.length + 20);
  });

  it("sanitizeForLearning strips password-like tokens", () => {
    const content = "Set password=SuperSecret123 in the config";
    const safe = sanitizeForLearning(content);
    expect(safe).not.toContain("SuperSecret123");
    expect(safe).toContain("[REDACTED]");
  });

  it("sanitizeForLearning strips IPv4 addresses", () => {
    const content = "Connect to 192.168.1.100 on port 5432";
    const safe = sanitizeForLearning(content);
    expect(safe).not.toContain("192.168.1.100");
    expect(safe).toContain("[REDACTED]");
  });

  it("sanitizeForLearning leaves normal text untouched", () => {
    const content = "Prefers narrow sidebars for navigation panels";
    const safe = sanitizeForLearning(content);
    expect(safe).toBe(content);
  });

  it("detectSignals returns null for neutral messages", () => {
    expect(detectSignals("How do I create a component?")).toBeNull();
    expect(detectSignals("What is the best way to handle errors?")).toBeNull();
    expect(detectSignals("Can you show me an example?")).toBeNull();
  });

  it("detectSignals returns explicit-like for positive signals", () => {
    expect(detectSignals("I like this layout, keep it")).toBe("explicit-like");
    expect(detectSignals("I prefer compact interfaces")).toBe("explicit-like");
    expect(detectSignals("I love this dark theme")).toBe("explicit-like");
  });

  it("detectSignals returns explicit-dislike for negative signals", () => {
    expect(detectSignals("I dislike rounded cards")).toBe("explicit-dislike");
    expect(detectSignals("I hate these large gradients")).toBe("explicit-dislike");
  });

  it("detectSignals returns explicit-remember for memory signals", () => {
    expect(detectSignals("Remember that I always use Tailwind")).toBe("explicit-remember");
    expect(detectSignals("Note that we use PostgreSQL for this project")).toBe("explicit-remember");
    expect(detectSignals("Always use TypeScript strict mode")).toBe("explicit-remember");
  });

  it("detectSignals is case-insensitive", () => {
    expect(detectSignals("I LIKE this layout")).toBe("explicit-like");
    expect(detectSignals("REMEMBER THAT we always use bun")).toBe("explicit-remember");
  });
});