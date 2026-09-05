import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { PluginRegistry } from "../plugins/registry.js";
import { PersonalManager } from "../personal/manager.js";
import { Router, DEFAULT_BUDGET } from "../router/router.js";
import { ContextAssembler } from "../context/assembler.js";
import { createLearningCandidate, sanitizeForLearning } from "../learning/pipeline.js";
import { detectSignalsFromTurn } from "../learning/auto-detector.js";
import { SessionLearningBuffer } from "../learning/session-buffer.js";
import type { PersonalEntryType } from "../types/index.js";
import { resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const PLUGINS_DIR = resolve(__dirname, "../../plugins");
const DATA_DIR = resolve(__dirname, "../../data");

export async function createMcpServer() {
  // Initialize core services
  const registry = new PluginRegistry(PLUGINS_DIR);
  await registry.load();
  registry.startWatching();

  const personal = new PersonalManager(DATA_DIR);
  const router = new Router(registry, personal, DEFAULT_BUDGET);
  const assembler = new ContextAssembler(registry);

  const server = new Server(
    { name: "skill-system", version: "0.1.0" },
    { capabilities: { tools: {} } }
  );

  // List available tools
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: "route_request",
        description:
          "Route a user request to relevant domain skills and personal knowledge. Returns selected plugins, skills, and personal entries without loading full skill content.",
        inputSchema: {
          type: "object",
          properties: {
            userRequest: { type: "string", description: "The user's request or question" },
            userId: { type: "string", description: "User identifier for personal knowledge retrieval" },
            techHints: {
              type: "array",
              items: { type: "string" },
              description: "Optional technology hints to improve routing accuracy",
            },
          },
          required: ["userRequest", "userId"],
        },
      },
      {
        name: "get_context",
        description:
          "Get full assembled context for a request — loads skill bodies and assembles a complete system prompt section. Use this when you need the actual skill content, not just routing metadata.",
        inputSchema: {
          type: "object",
          properties: {
            userRequest: { type: "string" },
            userId: { type: "string" },
            projectContext: { type: "string", description: "Optional current project context" },
          },
          required: ["userRequest", "userId"],
        },
      },
      {
        name: "record_learning",
        description:
          "Record a learning signal to update the user's personal skill. Use after a user expresses a preference, dislikes something, asks to remember something, or after a solution is verified.",
        inputSchema: {
          type: "object",
          properties: {
            userId: { type: "string" },
            signal: {
              type: "string",
              enum: ["explicit-like", "explicit-dislike", "explicit-remember", "verified-solution"],
            },
            content: { type: "string", description: "What to learn (will be sanitized)" },
            entryType: {
              type: "string",
              enum: ["design-preference", "working-preference", "technical-preference", "solved-problem", "workflow-preference"],
            },
            domain: { type: "string", description: "Optional domain (web-design, rust, etc.)" },
            tags: { type: "array", items: { type: "string" } },
          },
          required: ["userId", "signal", "content", "entryType"],
        },
      },
      {
        name: "analyze_and_learn",
        description:
          "Analyze a conversation turn for learning signals and optionally apply them to personal skill. Call this after each assistant response to enable automatic learning.",
        inputSchema: {
          type: "object",
          properties: {
            userId: { type: "string", description: "User identifier" },
            userMessage: { type: "string", description: "The user's last message" },
            assistantResponse: { type: "string", description: "The assistant's response (first 500 chars is sufficient)" },
            apply: { type: "boolean", description: "If true, apply high-confidence signals immediately" },
          },
          required: ["userId", "userMessage", "assistantResponse"],
        },
      },
    ],
  }));

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    if (name === "route_request") {
      const decision = await router.route({
        userRequest: args!.userRequest as string,
        userId: args!.userId as string,
        techHints: args!.techHints as string[] | undefined,
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                selectedPlugins: decision.selectedPlugins,
                selectedSkills: decision.selectedSkills.map((s) => ({
                  id: s.id,
                  pluginId: s.pluginId,
                  name: s.name,
                  estimatedTokens: s.estimatedTokens,
                })),
                personalEntries: decision.selectedPersonalEntries.map((e) => ({
                  id: e.id,
                  type: e.type,
                  content: e.content,
                  domain: e.domain,
                })),
                estimatedTokens: decision.estimatedTokens,
                debugLog: decision.debugLog,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    if (name === "get_context") {
      const decision = await router.route({
        userRequest: args!.userRequest as string,
        userId: args!.userId as string,
      });

      // assemble() takes (decision, projectContext?) separately and returns AssembledContext
      const ctx = await assembler.assemble(
        decision,
        args!.projectContext as string | undefined
      );

      // buildPrompt() converts AssembledContext → full string
      const text = assembler.buildPrompt(ctx);

      return {
        content: [{ type: "text", text }],
      };
    }

    if (name === "record_learning") {
      const candidate = createLearningCandidate(
        args!.signal as any,
        args!.content as string,
        {
          entryType: args!.entryType as PersonalEntryType,
          domain: args!.domain as string | undefined,
          tags: args!.tags as string[] | undefined,
        }
      );

      const result = await personal.applyLearningCandidate(
        args!.userId as string,
        candidate
      );

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                operation: result.decision.operation,
                reason: result.decision.reason,
                updated: result.updated,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    if (name === "analyze_and_learn") {
      const userId = args!.userId as string;
      const userMessage = args!.userMessage as string;
      const assistantResponse = args!.assistantResponse as string;
      const apply = (args!.apply as boolean) ?? false;

      const buffer = new SessionLearningBuffer();

      // Detect signals from the user turn (no previous context available here)
      const userTurn = { role: "user" as const, content: userMessage };
      for (const sig of detectSignalsFromTurn(userTurn)) {
        buffer.add(sig);
      }

      // Detect signals from the assistant turn, with the user message as context
      const assistantTurn = { role: "assistant" as const, content: assistantResponse };
      for (const sig of detectSignalsFromTurn(assistantTurn, [userTurn])) {
        buffer.add(sig);
      }

      const highConfidence = buffer.getHighConfidence();
      let applied = 0;
      let skipped = 0;

      if (apply) {
        for (const sig of highConfidence) {
          const safe = sanitizeForLearning(sig.content);
          const candidate = createLearningCandidate(sig.signal, safe, {
            entryType: sig.entryType,
            domain: sig.domain,
            confidence: sig.confidence,
          });
          const result = await personal.applyLearningCandidate(userId, candidate);
          if (result.updated) {
            applied++;
          } else {
            skipped++;
          }
        }
      } else {
        skipped = highConfidence.length;
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                detectedSignals: highConfidence,
                applied,
                skipped,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    throw new Error(`Unknown tool: ${name}`);
  });

  return { server, personal };
}