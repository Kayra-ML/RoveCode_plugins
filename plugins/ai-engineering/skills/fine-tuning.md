# Fine-Tuning

## Fine-Tune Last, Not First

Fine-tuning is for *behavior* that prompting and retrieval cannot stably encode: a house style, a tool-calling dialect, a classification taxonomy, or a domain language the base model mangles. It is not a knowledge dump. Facts go stale; weights do not update when the wiki changes. If the task needs current documents, use RAG. If it needs a new capability on private text that will keep changing, use RAG plus a small adapter at most.

Decision order:

1. Prompt + tools + RAG
2. Better model / constrained decoding
3. Supervised fine-tune (SFT) on input→output pairs
4. Preference methods (DPO/ORPO) for style and harmlessness
5. Full-weight training only if you have data, compute, and a team that can eval it

If you cannot write 200 high-quality examples, you are not ready to fine-tune.

## Data Quality Beats Data Volume

One noisy label in 50 examples teaches the model a new bug. Curate:

- Cover the real input distribution, including messy user text
- Include refusals and "I don't know" in the same format as successes
- Deduplicate; near-duplicates inflate loss curves and hide overfitting
- Hold out a frozen eval set *before* you iterate on the train set

Format must match production messages (system + user + assistant, tool calls included). Training on "Q: … A: …" and serving chat templates is a silent domain shift.

For SFT, prefer complete target answers. Partial or contradictory targets produce hedging models.

## LoRA and QLoRA

LoRA trains low-rank adapters on attention (and sometimes MLP) projections. It is the default: cheaper, swappable, and less likely to erase the base model.

- Rank 8–16 is enough for style and format; 32–64 for harder domain shifts
- Target `q_proj`, `v_proj` first; add `k_proj`, `o_proj`, and MLP if loss plateaus
- QLoRA (4-bit base + LoRA) is how most teams fine-tune 7B–70B on a single GPU
- Merge adapters for latency-sensitive serving, or keep them separate if you need many tenants

Do not LoRA-tune on a handful of examples and then declare a new "domain model". Measure against the base model on the same eval. If SFT does not beat a well-prompted base, ship the prompt.

## Catastrophic Forgetting

The model will forget general skills if every training token is your narrow task. Mitigate:

- Mix 10–30% general instruction data with domain data
- Use a low learning rate and early stopping on a general eval
- Prefer adapters over full fine-tunes
- Keep the original system prompt in training so production prompts still match

If the fine-tune starts failing simple reasoning or following JSON schemas it used to follow, you over-trained.

## Preference Tuning

SFT teaches "what a good answer looks like". DPO/ORPO teaches "this answer is better than that one" without a full RLHF stack. Use it when:

- SFT answers are correct but verbose, rude, or off-brand
- You can collect pairwise labels cheaper than writing gold answers

Pair quality matters more than pair count. A pair where both answers are bad teaches noise. Start from an SFT checkpoint; DPO on a raw base is unstable.

## Hyperparameters That Actually Matter

- Learning rate too high → garbled syntax and forgotten tools
- Epochs > 3 on a small set → memorization
- Context packing: do not concatenate unrelated examples into one sequence without separators
- Sequence length: train at the length you will serve, or the model will degrade on long prompts

Log train loss, eval loss, and *task* metrics (exact match, schema validity, tool-call F1). Loss going down is not success.

## Evaluation Before Deploy

Compare base vs prompted vs fine-tuned on:

- Golden set exactness and schema validity
- Hallucination / citation tests if RAG is still in the loop
- Safety prompts you already use in production
- Latency and cost (a 70B LoRA may lose to a prompted 8B)

Canary in production with the prompt version and adapter version logged. Keep an instant rollback to the base model. Fine-tunes fail as *behavior*, not as 500s.

## Anti-Patterns

- Fine-tuning to "add the employee handbook" instead of indexing it
- Scraping random transcripts as SFT data
- Training on chain-of-thought you will never serve
- One adapter for every customer with 20 examples each
- Shipping a fine-tune because the loss curve looks smooth

Fine-tuning is a product change. Treat it like a model swap: evals, versions, rollback, and a written reason why prompting was not enough.
