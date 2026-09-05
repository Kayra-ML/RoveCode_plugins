# LLM Evaluation

## If You Cannot Eval It, You Cannot Ship It

LLM features regress silently. A prompt tweak, a model snapshot, a retriever change, or a temperature bump can drop groundedness without throwing. Evaluation is the release gate, not a research extra. You need: a frozen golden set, automatic graders, a human spot-check, and a production trace you can replay.

## Golden Sets

Start with 50–200 real tasks, not synthetic trivia.

- Sample from production logs (PII-stripped)
- Include must-handle cases: empty retrieval, injection attempts, multilingual, long context, "I don't know"
- Label expected *behavior*, not one exact string: schema, citations, refusal, tool sequence
- Freeze the set. If you keep editing labels to match the new model, you are cheating

Split: smoke (20, run on every PR), regression (full, run on prompt/model change), hard (known failures you are not allowed to forget).

## Offline Metrics That Matter

Pick metrics that match the product:

- **Extraction / routing:** exact match, F1, schema validity
- **RAG answers:** faithfulness (claim supported by context), citation precision/recall, answer relevance
- **Agents:** task success, illegal tool rate, steps-to-success, cost
- **Chat:** rubric scores with anchored examples, not a vibe

Do not report BLEU/ROUGE as quality for open generation. They reward n-gram overlap, not truth.

For RAG, grade the retriever separately (recall@k) from the generator. Otherwise you will fine-tune the prompt when the index is wrong.

## LLM-as-Judge: Use It, Don't Trust It

A judge model is a noisy instrument.

- Give the judge a rubric with 3–5 anchored levels and force a JSON verdict
- Show source documents when grading faithfulness
- Randomize candidate order; judges prefer the first or the verbose answer
- Use a different model family than the candidate when possible
- Calibrate against a human-labeled subset; if Cohen's kappa is poor, stop

Never let the judge see chain-of-thought you would not show a human rater. Pairwise preference ("A vs B") is more stable than absolute 1–5 scores.

Human review remains the source of truth for safety, tone, and "would we ship this".

## Hallucination and Grounding

Define hallucination operationally: a claim not entailed by provided context (RAG) or not true against a knowledge source (closed-book). Detect with:

- Citation requirement + span check
- NLI/entailment between answer sentences and retrieved chunks
- Known-unknown questions that must abstain

Track hallucination rate as a first-class SLO. A fluent wrong answer is worse than a refusal.

## Latency, Cost, and Quality Together

Plot quality vs p95 latency vs $ / request. Teams "improve" quality by calling GPT-class models three times and then fail SLOs. Record:

- tokens in / out
- tool round-trips
- cache hit rate
- dollars per successful task, not per call

A smaller model with constrained decoding often wins this plot.

## Regression Gates

CI should fail the deploy when:

- smoke set schema validity < 100%
- faithfulness drops more than a set delta vs last release
- safety cases regress
- p95 latency or cost exceeds budget

Store eval artifacts: prompt version, model id, retriever id, git SHA, metric JSON. Without lineage, a failed eval is a mystery novel.

## Online Evaluation

Offline sets miss distribution shift. In production:

- Log traces (prompt, tools, retrieval ids, output)
- Sample for human review
- Track thumbs-down, retry, and escalation rates
- Canary new prompts to 5% traffic

Do not A/B on "user liked the vibe" alone. Pair it with task completion.

## Anti-Patterns

- Demo questions as the only eval
- Changing the golden set the day of the launch
- One 1–5 "quality" number with no rubric
- Shipping because "the new model feels smarter"
- Evaluating only happy paths

Evaluation is how LLM engineering becomes engineering. Write the tests first, then change the prompt.
