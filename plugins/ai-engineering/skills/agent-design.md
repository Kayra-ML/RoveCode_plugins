# Agent Design

## An Agent Is a Loop With Privileges

An LLM agent is not "a chatbot that uses tools". It is a state machine: observe → decide → act → observe, with a budget and a kill switch. If you cannot draw the loop on a whiteboard, you do not have an architecture — you have a `while True` around a chat completion.

```
goal + context
  → planner (optional)
  → tool choice
  → sandbox execution
  → observation
  → stop | retry | ask user
```

Default to the smallest loop that works. Many tasks need one tool call, not an autonomous employee.

## Planner vs Executor

Split planning from acting when the task has more than two dependent steps or expensive side effects.

- **Planner** produces a structured plan: steps, tools, success criteria, and abort conditions
- **Executor** runs one step, returns observation, does not silently rewrite the goal
- Re-plan only on failure or when the observation invalidates the plan

A single model that "thinks and acts" will improvise new goals. Keep the goal immutable in state. The planner may change *how*, not *what*, unless the user says so.

For simple tool use (search, fetch, format), skip the planner. Extra roles add latency and another place to hallucinate.

## Tool Surface

Tools are the agent's API. Keep it small.

- Each tool: one job, typed schema, idempotency notes, timeout
- No catch-all `run_python` in production unless sandboxed and network-blocked
- Return structured errors the model can parse (`{ "error": "not_found", "hint": "..." }`)
- Cap payload size; do not dump a 2MB HTML page into the context

Prefer retrieval and typed RPCs over a shell. Shell access turns prompt injection into remote execution.

## Memory

Distinguish:

- **Working memory:** the current transcript + tool results (truncate aggressively)
- **Task state:** goal, plan, step index, artifacts (store outside the prompt)
- **Long-term memory:** user prefs and solved problems (retrieve, do not prepend everything)

Summarize old turns; never drop the original goal or the latest tool error. Agents fail by forgetting constraints, not by lacking poetry.

Write artifacts to files/objects and pass paths/IDs, not the whole blob, through the prompt.

## Termination Conditions

Agents need explicit stops:

- Success: output matches schema / tests pass / user-accepted
- Budget: max steps, max tokens, max wall time, max dollars
- User gate: any destructive tool (`delete`, `email`, `pay`) requires confirmation
- Uncertainty: two failed tool calls of the same type → ask, do not loop

A missing stop condition is how you get infinite "let me try another search".

## Multi-Agent Handoff

Add a second agent only when roles have different tools or different trust levels (researcher vs coder vs reviewer). Shared-whiteboard state beats a chain of free-form messages.

Handoff payload:

- Goal
- Constraints
- Artifacts (IDs)
- What the previous agent already tried

Do not let agents debate in prose for ten turns. Debate is a bug unless you are scoring it.

Reviewer agents should not have write tools. Separation of duty is a security control.

## Sandboxing and Injection

Treat every tool argument as untrusted. Treat every retrieved document as untrusted. Prompt injection lives in web pages, PDFs, and ticket comments.

- Disable unused tools per task
- Allow-list URLs and commands
- Run code in a VM/container with no secrets
- Pass secrets via the runtime, never via the prompt
- Log every tool call with hashed args for audit

If the agent can exfiltrate env vars, you shipped a vulnerability, not a feature.

## Reliability Patterns

- Deterministic pre-steps (validate IDs, check auth) before the model runs
- Retry tools on 429/5xx with backoff; do not retry invalid arguments without a new model decision
- Snapshot state after each step so a crash can resume
- Eval agents with scripted tool stubs, not live APIs

Measure: task success, steps-to-success, cost, and unsafe-tool attempts. A cheaper agent that asks the user is better than an autonomous one that emails the wrong customer.

## Anti-Patterns

- 15 tools "just in case"
- No step budget
- Putting the entire repo in context
- Multi-agent theatre for a single SQL query
- Trusting the model to "be careful" with `rm`

Design the privileges first. Then give the model the smallest loop that can finish the job.

## ReAct Pattern (Reason + Act)

ReAct interleaves reasoning traces with tool calls. The model thinks, then acts, then
observes, then thinks again. This makes the loop auditable and correctable.

**Example trace:**

```
Thought: The user wants the latest invoice for customer #4821. I should query the invoices
table filtered by customer ID and sort by date descending.

Action: query_database
Action Input: { "sql": "SELECT id, amount, date FROM invoices WHERE customer_id = $1 ORDER BY date DESC LIMIT 1", "params": [4821] }

Observation: [{ "id": "INV-9923", "amount": 4250.00, "date": "2026-08-15" }]

Thought: I have the invoice. I can answer directly now.

Final Answer: The latest invoice for customer #4821 is INV-9923 for $4,250.00 dated 2026-08-15.
```

**Implementation in prompt:**

```
You are an agent that answers questions using tools.

For each step, output:
Thought: <your reasoning>
Action: <tool_name>
Action Input: <JSON args>

After the Observation, continue with another Thought or output:
Final Answer: <answer>

Never skip the Thought step. Never invent an Observation.
```

The explicit `Thought:` prefix makes the model's reasoning inspectable. Log every
Thought/Action/Observation tuple for debugging. If the model skips Thought and goes
straight to Action, it is guessing — add a check in your parser.

## Tool Design Principles

**Atomic:** one tool does one thing. A `get_user_and_orders` tool is harder to reuse and
harder to test than separate `get_user` and `list_orders` tools.

**Idempotent where possible:** tools that read are always safe to retry. Tools that write
should accept an idempotency key so retries do not double-apply:

```ts
const tools = [
  {
    name: "send_email",
    description: "Send a single email. Call only after explicit user confirmation. Side effect: sends real email.",
    parameters: {
      type: "object",
      required: ["to", "subject", "body", "idempotency_key"],
      properties: {
        to: { type: "string", format: "email" },
        subject: { type: "string", maxLength: 200 },
        body: { type: "string", maxLength: 5000 },
        idempotency_key: { type: "string", description: "UUID. Reusing the same key is safe." },
      },
    },
  },
];
```

**Typed errors:** return structured errors the model can reason about:

```ts
// Good tool response on failure
{ "error": "rate_limited", "retry_after_seconds": 30, "hint": "Try again after the delay." }

// Bad tool response on failure — model cannot act on this
{ "error": true, "message": "Something went wrong" }
```

**Documented side effects:** if a tool sends email, charges a card, or deletes data, say
so in the description. The model uses descriptions to decide whether to confirm with the
user first.

## Agent Memory Types

| Type | What it is | Where it lives | Lifetime |
|---|---|---|---|
| Working memory | Current transcript + tool results | In-context (the prompt) | Current session |
| Task state | Goal, plan, step index, artifacts | External store (Redis/DB) | Duration of task |
| Episodic memory | Past task summaries, solved problems | Vector store + summaries | Across sessions |
| Semantic memory | Facts, domain knowledge, user prefs | Retrieval index | Persistent |
| Procedural memory | How to do things (few-shot, skill prompts) | Prompt library | Updated by engineers |

**Working memory management:**

```ts
function trimWorkingMemory(
  messages: Message[],
  maxTokens = 6000
): Message[] {
  // Always keep: system prompt, first user message (goal), last N exchanges
  const system = messages.filter((m) => m.role === "system");
  const goal = messages.slice(0, 2).filter((m) => m.role === "user");
  const recent = messages.slice(-10); // last 5 exchanges

  const core = [...system, ...goal, ...recent];
  const coreTokens = estimateTokens(core);

  if (coreTokens > maxTokens) {
    // Summarize the middle — never drop system or goal
    const summary = await summarize(messages.slice(2, -10));
    return [...system, goal[0], { role: "assistant", content: summary }, ...recent.slice(-6)];
  }
  return core;
}
```

## Error Handling in Agentic Loops

```
Tool call result
      │
      ├── Success → continue loop
      │
      ├── Retriable error (429, 503, timeout)
      │     → exponential backoff, max 3 retries
      │     → if still failing: escalate to user
      │
      ├── Invalid arguments (400, schema error)
      │     → do NOT retry with same args
      │     → return error + hint to model, let model fix args
      │     → if model repeats same error: stop and ask user
      │
      ├── Authorization error (401, 403)
      │     → do NOT retry
      │     → stop loop, tell user what permission is missing
      │
      └── Unexpected / unknown error
            → log full context (tool name, args, response)
            → stop loop, return safe error message to user
```

```ts
async function callToolWithRetry(
  tool: ToolCall,
  maxRetries = 3
): Promise<ToolResult> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await executeTool(tool);
    } catch (err) {
      if (isRetriable(err)) {
        await sleep(Math.pow(2, attempt) * 500);
        continue;
      }
      if (isArgumentError(err)) {
        // Return to model with the exact validation message
        return { error: "invalid_arguments", detail: err.message };
      }
      throw err; // non-retriable: let outer handler stop the loop
    }
  }
  return { error: "max_retries_exceeded", hint: "The external service is unavailable." };
}
```

## Parallel Tool Calling

When tool calls are independent, run them concurrently:

```ts
// Sequential — 3× the latency
const user = await getUser(userId);
const orders = await getOrders(userId);
const balance = await getBalance(userId);

// Parallel — latency of the slowest call
const [user, orders, balance] = await Promise.all([
  getUser(userId),
  getOrders(userId),
  getBalance(userId),
]);
```

Most modern LLM APIs support returning multiple tool calls in a single response. Parse the
full list before executing any — dependencies may exist:

```ts
const toolCalls = response.tool_calls; // may contain [search_docs, get_user]

// Check for dependencies
const independent = toolCalls.filter((tc) => !dependsOnPrior(tc, toolCalls));
const results = await Promise.all(independent.map(callTool));
// Run dependent calls sequentially after their dependencies resolve
```

Cap parallelism with a concurrency limiter (e.g., p-limit) to avoid overwhelming external
APIs and blowing per-minute rate limits.

## Agent Evaluation Framework

```
Dimension          | What to measure                        | How
───────────────────────────────────────────────────────────────────────────────
Task success       | Did the agent complete the goal?       | Binary + partial credit rubric
Steps to success   | How many tool calls were needed?       | Count; compare to human baseline
Unsafe tool use    | Did it attempt disallowed actions?     | Scripted traps with mock tools
Cost per task      | Total tokens + API calls               | Log and aggregate
Latency            | Wall time from query to answer         | P50, P95, P99
Hallucination rate | Did it invent tool arguments or facts? | Manual sample review + NLI check
Retry loops        | Did it get stuck retrying?             | Count consecutive same-type retries
```

**Evaluation harness:**

```ts
async function evalAgent(scenario: Scenario): Promise<EvalResult> {
  const mockTools = createMockTools(scenario.expectedToolCalls);
  const agent = new Agent({ tools: mockTools, maxSteps: 10 });

  const result = await agent.run(scenario.input);

  return {
    success: scenario.validate(result.output),
    steps: result.stepCount,
    unsafeAttempts: mockTools.getUnsafeCallCount(),
    cost: result.tokenUsage,
    trace: result.trace,
  };
}
```

Run evals against scripted tool stubs, not live APIs. Live APIs introduce flakiness that
hides regressions. The tool stubs should return realistic responses including edge cases
(empty results, rate limits, partial data).

## Safety Guardrails for Production Agents

```ts
class AgentSafetyLayer {
  private readonly DESTRUCTIVE_TOOLS = new Set(["delete_record", "send_email", "charge_card"]);
  private readonly MAX_STEPS = 15;
  private readonly MAX_COST_USD = 0.50;

  async run(goal: string, userId: string): Promise<AgentResult> {
    const stepCount = { value: 0 };
    const costAccumulator = { usd: 0 };

    const wrappedTools = this.wrapWithGuardrails(this.tools, {
      onDestructiveTool: async (toolName, args) => {
        // Require explicit user confirmation for destructive tools
        const confirmed = await this.requestConfirmation(userId, toolName, args);
        if (!confirmed) throw new Error("User declined action");
      },
      onEveryCall: (tokens) => {
        stepCount.value++;
        costAccumulator.usd += tokens * COST_PER_TOKEN;

        if (stepCount.value > this.MAX_STEPS) throw new Error("Step budget exceeded");
        if (costAccumulator.usd > this.MAX_COST_USD) throw new Error("Cost budget exceeded");
      },
    });

    return this.innerAgent.run(goal, wrappedTools);
  }
}
```

Additional guardrails:
- **Prompt injection detection:** scan tool results for injection patterns before adding
  to context
- **Output filtering:** scan final answer for PII, secrets, or off-topic content before
  returning to user
- **Audit log:** every tool call with args (hashed for sensitive fields), user ID, session
  ID, and timestamp

## Cost Control Strategies

**Caching:** cache tool results that are deterministic for a given input:

```ts
const cache = new LRUCache<string, ToolResult>({ max: 1000, ttl: 5 * 60 * 1000 });

async function cachedTool(name: string, args: object): Promise<ToolResult> {
  const key = `${name}:${JSON.stringify(args)}`;
  if (cache.has(key)) return cache.get(key)!;
  const result = await executeTool(name, args);
  if (result.cacheable !== false) cache.set(key, result);
  return result;
}
```

**Early termination:** if the model produces a `Final Answer` after 2 steps that passes
validation, stop. Do not run remaining allowed steps.

**Prompt caching:** use Anthropic or OpenAI prompt caching for the system prompt + static
context. On a 2k-token system prompt at 1M daily calls, caching saves ~$300/day at
Claude 3.5 Sonnet pricing.

**Model routing:** use a cheap model (Haiku, GPT-4o-mini) for intent classification,
routing, and simple tool calls. Escalate to a frontier model only for complex reasoning:

```ts
function selectModel(task: TaskType): string {
  if (["classify", "route", "extract"].includes(task)) return "claude-haiku-4-5";
  if (["reason", "plan", "synthesize"].includes(task)) return "claude-sonnet-5";
  return "claude-sonnet-5"; // safe default
}
```

**Token budget enforcement:** set `max_tokens` to the realistic output size. An agent
that generates 4k tokens of reasoning when 400 suffices costs 10× more and is not more
accurate.
