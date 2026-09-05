// Hand-authored scenarios for src/learning/auto-detector.ts's detectSignalsFromTurn —
// the function actually wired into the live `analyze_and_learn` MCP tool
// (src/mcp/server.ts). Grounded directly in its real regex pattern tables
// (EXPLICIT_LIKE_PATTERNS, EXPLICIT_DISLIKE_PATTERNS, EXPLICIT_REMEMBER_PATTERNS,
// isVerifiedSolution), the same way benchmark/large/ scenarios are grounded
// in real activationSignals rather than invented keywords.

import type { SignalScenario } from "./types.js";

const LIKE: SignalScenario[] = [
  { id: "LIKE-01", category: "explicit-like", message: "I like this approach, let's keep going with it.",
    expectedSignals: ["explicit-like"], note: "Matches 'i like this'." },
  { id: "LIKE-02", category: "explicit-like", message: "I prefer that layout over the previous one.",
    expectedSignals: ["explicit-like"], note: "Matches 'i prefer that'." },
  { id: "LIKE-03", category: "explicit-like", message: "Perfect, keep the sidebar exactly like this.",
    expectedSignals: ["explicit-like"], note: "Matches 'perfect, keep'." },
  { id: "LIKE-04", category: "explicit-like", message: "Perfect! That's exactly the tone I wanted.",
    expectedSignals: ["explicit-like"], note: "Matches 'perfect!'." },
  { id: "LIKE-05", category: "explicit-like", message: "This is exactly what I wanted for the dashboard.",
    expectedSignals: ["explicit-like"], note: "Matches 'exactly what i wanted'." },
  { id: "LIKE-06", category: "explicit-like", message: "This is great! Keep it exactly as is.",
    expectedSignals: ["explicit-like"], note: "Matches 'this is great...keep it'." },
  { id: "LIKE-07", category: "explicit-like", message: "Always do it this way for every new component.",
    expectedSignals: ["explicit-like"], note: "Matches 'always do it this way'." },
  { id: "LIKE-08", category: "explicit-like", message: "From now on, use two-space indentation everywhere.",
    expectedSignals: ["explicit-like"], note: "Matches 'from now on'." },
  { id: "LIKE-09", category: "explicit-like", message: "Save this pattern, it's the one I want reused.",
    expectedSignals: ["explicit-like"], note: "Matches 'save this'." },
  { id: "LIKE-10", category: "explicit-like", message: "Keep it like this, don't change the spacing.",
    expectedSignals: ["explicit-like"], note: "Matches 'keep it like this'." },
];

const DISLIKE: SignalScenario[] = [
  { id: "DIS-01", category: "explicit-dislike", message: "I don't like how cramped this feels.",
    expectedSignals: ["explicit-dislike"], note: "Matches 'i don't like'." },
  { id: "DIS-02", category: "explicit-dislike", message: "Avoid using nested ternaries in this codebase.",
    expectedSignals: ["explicit-dislike"], note: "Matches 'avoid using'." },
  { id: "DIS-03", category: "explicit-dislike", message: "Never do this again, it broke production last time.",
    expectedSignals: ["explicit-dislike"], note: "Matches 'never do this'." },
  { id: "DIS-04", category: "explicit-dislike", message: "I hate when the modal steals focus like that.",
    expectedSignals: ["explicit-dislike"], note: "Matches 'i hate when'." },
  { id: "DIS-05", category: "explicit-dislike", message: "Don't use rounded cards for this section.",
    expectedSignals: ["explicit-dislike"], note: "Matches 'don't use'." },
  { id: "DIS-06", category: "explicit-dislike", message: "That's too much whitespace around the button.",
    expectedSignals: ["explicit-dislike"], note: "Matches 'too much'." },
  { id: "DIS-07", category: "explicit-dislike", message: "Less padding please on the mobile view.",
    expectedSignals: ["explicit-dislike"], note: "Matches 'less X please'." },
  { id: "DIS-08", category: "explicit-dislike", message: "Stop using inline styles across the app.",
    expectedSignals: ["explicit-dislike"], note: "Matches 'stop using'." },
  { id: "DIS-09", category: "explicit-dislike", message: "I do not like the way errors are surfaced here.",
    expectedSignals: ["explicit-dislike"], note: "Matches 'i do not like' (full form)." },
  { id: "DIS-10", category: "explicit-dislike", message: "Avoid that pattern, it caused the memory leak before.",
    expectedSignals: ["explicit-dislike"], note: "Matches 'avoid that'." },
];

const REMEMBER: SignalScenario[] = [
  { id: "REM-01", category: "explicit-remember", message: "Remember that I prefer compact layouts on dashboards.",
    expectedSignals: ["explicit-remember"], note: "Matches 'remember that'." },
  { id: "REM-02", category: "explicit-remember", message: "Note that we use Drizzle, not Prisma, in this repo.",
    expectedSignals: ["explicit-remember"], note: "Matches 'note that'." },
  { id: "REM-03", category: "explicit-remember", message: "Keep in mind our API always returns camelCase keys.",
    expectedSignals: ["explicit-remember"], note: "Matches 'keep in mind'." },
  { id: "REM-04", category: "explicit-remember", message: "For future reference, always run migrations before seeding.",
    expectedSignals: ["explicit-remember"], note: "Matches 'for future reference'." },
  { id: "REM-05", category: "explicit-remember", message: "Going forward, let's default new routes to POST + JSON.",
    expectedSignals: ["explicit-remember"], note: "Matches 'going forward'." },
  { id: "REM-06", category: "explicit-remember", message: "Always use pnpm instead of npm for this project.",
    expectedSignals: ["explicit-remember"], note: "Matches 'always use'." },
  { id: "REM-07", category: "explicit-remember", message: "Remember this: our staging DB has no seed data.",
    expectedSignals: ["explicit-remember"], note: "Matches 'remember this'." },
];

const VERIFIED: SignalScenario[] = [
  { id: "VER-01", category: "verified-solution",
    previousUserMessage: "This endpoint keeps crashing with a null pointer error.",
    message: "Fixed it — the crash was from missing null-check before accessing `user.profile`. ```ts\nif (!user.profile) return res.status(404).end();\n```",
    expectedSignals: ["verified-solution"], note: "Assistant turn has 'fixed' + code, previous turn described a crash." },
  { id: "VER-02", category: "verified-solution",
    previousUserMessage: "The build is broken, TypeScript won't compile.",
    message: "This works now — resolved the type error by adding the missing generic parameter.",
    expectedSignals: ["verified-solution"], note: "'resolved' + 'this works' after a build-broken problem turn." },
  { id: "VER-03", category: "verified-solution",
    previousUserMessage: "Tests are failing on the checkout flow.",
    message: "All tests passing now ✅ — the issue was a stale mock returning the old price.",
    expectedSignals: ["verified-solution"], note: "Pass marker (✅) after a failing-tests problem turn." },
  { id: "VER-04", category: "verified-solution",
    previousUserMessage: "There's a bug where the sidebar collapses on refresh.",
    message: "Found the root cause and the solution: the collapse state wasn't persisted to localStorage.",
    expectedSignals: ["verified-solution"], note: "'solution' after a bug report." },
  { id: "VER-05", category: "verified-solution",
    previousUserMessage: "Can you explain how the router selects a plugin?",
    message: "Sure — it classifies the request, then matches plugins by domain and activation hints.",
    expectedSignals: [], note: "No solution markers, and previous turn wasn't a problem report — plain explanation." },
  { id: "VER-06", category: "verified-solution",
    previousUserMessage: "What's the difference between MERGE and STRENGTHEN?",
    message: "MERGE combines content from a similar-but-distinct entry; STRENGTHEN just boosts an entry that already matches closely. This works well for most cases.",
    expectedSignals: [], note: "Contains 'this works' but previous turn was a question, not a problem report — should NOT count as verified-solution." },
];

const NEGATIVE: SignalScenario[] = [
  { id: "NEG-01", category: "negative", message: "I like turtles, they're my favorite animal.",
    expectedSignals: [], note: "'I like' without 'this'/'that' immediately after must not match explicit-like." },
  { id: "NEG-02", category: "negative", message: "Perfect timing, the meeting starts in five minutes.",
    expectedSignals: [], note: "'Perfect timing' must not match the 'perfect!' pattern (already a known regression test in tests/deduplication.test.ts, re-verified here through the real function)." },
  { id: "NEG-03", category: "negative", message: "This is great, but keep it small for now — we'll expand later.",
    expectedSignals: [], note: "'this is great' followed by an extra clause before 'keep it' must not match the tighter 'this is great...keep it' pattern." },
  { id: "NEG-04", category: "negative", message: "Always do something like this when you refactor, but check the tests first.",
    expectedSignals: [], note: "'always do... like this' must not match the stricter 'always do it/this/that way' pattern." },
  { id: "NEG-05", category: "negative", message: "Can you walk me through how the budget calculation works?",
    expectedSignals: [], note: "Plain question, no preference or memory signal." },
  { id: "NEG-06", category: "negative", message: "What time zone should I use for the cron schedule?",
    expectedSignals: [], note: "Plain question, no signal." },
  { id: "NEG-07", category: "negative", message: "The deployment takes about ten minutes usually.",
    expectedSignals: [], note: "Factual statement, no signal." },
  { id: "NEG-08", category: "negative", message: "I remember we discussed this last week, what did we decide?",
    expectedSignals: [], note: "'I remember' (not 'remember that/this') — must not match explicit-remember, which requires the imperative form." },
  { id: "NEG-09", category: "negative", message: "To avoid using too much memory, let's stream the file instead of loading it all at once.",
    expectedSignals: ["explicit-dislike"], note: "This is a plain technical design statement, not the user expressing a preference to remember — but 'avoid using' still matches the dislike pattern. Tracked as a known over-triggering risk, not asserted as correct." },
  { id: "NEG-10", category: "negative", message: "Too much coffee this morning, I'm wired.",
    expectedSignals: ["explicit-dislike"], note: "'too much' is a very broad pattern — flags as explicit-dislike even for an unrelated personal remark. Tracked as a known over-triggering risk, not silently ignored." },
];

export function getSignalScenarios(): SignalScenario[] {
  return [...LIKE, ...DISLIKE, ...REMEMBER, ...VERIFIED, ...NEGATIVE];
}
