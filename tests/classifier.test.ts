import { describe, it, expect } from "bun:test";
import { classifyRequest, extractKeywordsFromRequest } from "../src/router/classifier.js";

describe("Request Classifier", () => {
  it("classifies SaaS dashboard as web-design", () => {
    const result = classifyRequest("Build a responsive SaaS dashboard");
    expect(result.domains).toContain("web-design");
    expect(result.domains).not.toContain("rust");
  });

  it("classifies Rust ownership error as rust", () => {
    const result = classifyRequest("My Rust CLI has an ownership error");
    expect(result.domains).toContain("rust");
    expect(result.domains).not.toContain("web-design");
  });

  it("classifies browser automation as automation", () => {
    const result = classifyRequest("Automate browser scraping with Playwright");
    expect(result.domains).toContain("automation");
  });

  it("extracts relevant keywords", () => {
    const keywords = extractKeywordsFromRequest(
      "Build a responsive SaaS dashboard with sidebar"
    );
    expect(keywords).toContain("responsive");
    expect(keywords).toContain("dashboard");
    expect(keywords).toContain("sidebar");
    // Stop words should be excluded
    expect(keywords).not.toContain("with");
    expect(keywords).not.toContain("a");
  });

  it("preserves short technical terms like CLI", () => {
    const keywords = extractKeywordsFromRequest("My Rust CLI has an error");
    expect(keywords).toContain("rust");
    expect(keywords).toContain("cli");
  });

  it("returns at least one domain even for ambiguous requests", () => {
    const result = classifyRequest("Help me with my project");
    expect(result.domains.length).toBeGreaterThan(0);
  });

  it("classifies typography/animation as web-design", () => {
    const result = classifyRequest("Add beautiful typography and smooth animation to my site");
    expect(result.domains).toContain("web-design");
  });

  it("classifies tokio/async as rust", () => {
    const result = classifyRequest("Fix async tokio runtime error in my crate");
    expect(result.domains).toContain("rust");
  });

  it("classifies cron/retry as automation", () => {
    const result = classifyRequest("Set up a cron job with retry logic");
    expect(result.domains).toContain("automation");
  });

  it("classificationResult has required shape", () => {
    const result = classifyRequest("Build a dashboard");
    expect(Array.isArray(result.domains)).toBe(true);
    expect(Array.isArray(result.keywords)).toBe(true);
    expect(typeof result.confidence).toBe("object");
    expect(typeof result.isAmbiguous).toBe("boolean");
  });

  it("extractKeywordsFromRequest excludes common stop words", () => {
    const keywords = extractKeywordsFromRequest(
      "the a an is are and but or with about"
    );
    const stopWords = ["the", "a", "an", "is", "are", "and", "but", "or", "with", "about"];
    for (const sw of stopWords) {
      expect(keywords).not.toContain(sw);
    }
  });

  it("extractKeywordsFromRequest limits results to 20", () => {
    const longRequest =
      "dashboard sidebar navigation typography animation responsive layout grid flexbox component button modal form card hero brand visual interface frontend web";
    const keywords = extractKeywordsFromRequest(longRequest);
    expect(keywords.length).toBeLessThanOrEqual(20);
  });
});