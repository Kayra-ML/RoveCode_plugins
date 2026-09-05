# RAG Patterns

## Retrieval Is the Product

RAG fails more often in retrieval than in generation. If the wrong passages arrive, a stronger model will hallucinate more confidently. Design the pipeline as: ingest → chunk → embed/index → retrieve → rerank → generate → cite. Measure each stage with its own metric. Do not treat "the chatbot answered" as success.

## Chunking Strategy

Chunk by semantic units, not by a magic token count.

- **Docs with headings:** split on H2/H3, keep the heading path as metadata (`Product > Billing > Refunds`).
- **Code:** split on function/class boundaries, keep file path and symbol name.
- **Tables:** keep a table as one chunk or serialize row-wise with column headers repeated.
- **Overlaps:** 10–15% overlap helps when a sentence straddles a boundary. More overlap duplicates noise.

Target 200–500 tokens for narrative docs, 80–200 for FAQs, and one symbol per chunk for code. Store `source_id`, `chunk_id`, `title`, `url`, `updated_at`. Retrieval without provenance cannot be cited.

Never embed a chunk that a human would not want quoted. Strip nav, cookie banners, and duplicated footers at ingest.

## Query Construction

Do not embed the raw user utterance blindly. Rewrite first:

1. Expand acronyms and product names from a glossary
2. Split multi-intent questions into sub-queries
3. Add the active tenant, locale, and doc set as filters
4. Keep the original query for keyword search

Hybrid search (sparse + dense) is the default, not a luxury. BM25 catches exact IDs, error codes, and rare proper nouns that embeddings miss. Dense search catches paraphrases. Fuse with Reciprocal Rank Fusion, then rerank.

## Reranking

Take top 30–50 from the index, rerank to top 4–8 for the prompt. Cross-encoders and small rerank models are cheap compared to a wrong context window.

Drop chunks below a score floor. An empty context is better than a plausible wrong one. If nothing passes the floor, the generator must abstain or ask a clarifying question.

## Context Assembly

Pack retrieved chunks with explicit IDs:

```
[D12] Billing > Refunds (updated 2026-01-04)
Refunds post within 5–7 business days...
```

Instruct the model: answer only from provided documents; cite `[D12]`; if the docs conflict, say so. Put the question *after* the documents so the model attends to evidence first, or use a model-specific layout that was eval'd.

Respect the context budget. More chunks after ~8 usually add distractors. Prefer fewer, higher-precision passages.

## Citations and Grounding

Every factual sentence should map to a chunk ID. Post-process: if a claim has no citation, strip it or flag it. Do not trust the model to "mostly cite".

For quotes, require a verbatim span that exists in the chunk. Fuzzy citations are how RAG demos look good and production systems lie.

## Freshness and Access Control

Index `updated_at` and prefer recent chunks for policies, prices, and APIs. Apply ACL filters *in the retriever*, not in the prompt. The model is not an authorization layer. If a user cannot read a document, it must never appear in the context.

Re-embed on document change. Stale vectors are silent bugs. Use a content hash so unchanged chunks are not rewritten.

## Failure Modes

**Lost in the middle.** Models underuse passages in the center of a long context. Put the highest-reranked chunk first and last, or keep the window short.

**Query drift.** Multi-hop questions need iterative retrieval: answer a sub-question, retrieve again. A single shot over a vague query returns related-but-wrong docs.

**Duplication.** Near-duplicate chunks dominate top-k. Deduplicate by hash and by title+heading.

**Eval blindness.** Measure recall@k on a labeled set, citation precision, and answer faithfulness. Golden questions should include "not in corpus" cases.

## When Not to Use RAG

Do not RAG for: pure style/tone tasks, math the model already does, or data that must be transactional (use a tool/SQL). RAG is for *knowledge that changes or does not fit in the prompt*. If the corpus is three pages, put it in the system prompt and skip the vector store.

## Minimal Production Shape

```
ingest → chunk + metadata → hybrid index
query rewrite → retrieve k=40 → rerank k=6
generate with citations → validate citations → log traces
```

Log query, rewritten query, chunk IDs, scores, and the final answer. You cannot debug RAG from the chat UI. If you cannot replay a bad answer against the exact retrieved set, you do not have a RAG system — you have a lottery.

## Chunking Strategy Tradeoffs

| Strategy | How | Best for | Tradeoff |
|---|---|---|---|
| Fixed-size | Split every N tokens with M overlap | Homogeneous prose, quick start | Cuts mid-sentence; overlaps waste index space |
| Sentence | Split on `.`, `?`, `!` boundaries | Dense factual docs, FAQs | Short chunks may lack context; fragile on abbreviations |
| Semantic | Embed sentences, split when cosine drops | Mixed-format docs, long articles | Expensive at ingest time; requires calibration |
| Structural | Split on headings, code blocks, tables | Markdown docs, code repos | Requires parser per format |
| Hierarchical | Parent = section, child = paragraph | Large documents with navigation | More complex retrieval logic (fetch child, return parent) |

**Practical default:** structural chunking (split on H2/H3) for documentation; sentence
chunking with 2-sentence overlap for support transcripts; one symbol per chunk for code.

**Overlap guidance:** 10–15% overlap by token count is sufficient. More than 20% causes
top-k to surface near-duplicate chunks that waste context budget without adding information.

## Embedding Model Selection Guide

```
Dimension  | Model                    | Notes
───────────────────────────────────────────────────────────────────────
1536       | text-embedding-3-small   | OpenAI. Fast, cheap, good multilingual
3072       | text-embedding-3-large   | OpenAI. Best English recall, 2× cost
1024       | embed-english-v3.0       | Cohere. Strong reranker pairing
768        | all-MiniLM-L6-v2         | Local. 80MB, fast, adequate for internal tools
768        | bge-m3                   | Local. Best open-source multilingual
1024       | e5-large-v2              | Local. Strong English, runs on CPU
```

**Decision criteria:**

- **Multilingual corpus** → text-embedding-3-small or bge-m3
- **High security / on-prem requirement** → bge-m3 or e5-large-v2 (runs locally)
- **High volume, cost-sensitive** → text-embedding-3-small (5× cheaper than large)
- **Best recall on English enterprise docs** → text-embedding-3-large or embed-english-v3

Never mix embedding models in the same index. Re-embed the entire corpus when switching
models. Store the model name and version as index metadata.

## Hybrid Search: BM25 + Semantic

Dense semantic search misses exact IDs, product codes, and rare proper nouns. BM25 keyword
search misses paraphrases. Combine both with Reciprocal Rank Fusion (RRF):

```ts
// RRF fusion of two ranked lists
function reciprocalRankFusion(
  denseResults: Array<{ id: string; score: number }>,
  sparseResults: Array<{ id: string; score: number }>,
  k = 60
): Array<{ id: string; score: number }> {
  const scores = new Map<string, number>();

  for (const [rank, item] of denseResults.entries()) {
    scores.set(item.id, (scores.get(item.id) ?? 0) + 1 / (k + rank + 1));
  }
  for (const [rank, item] of sparseResults.entries()) {
    scores.set(item.id, (scores.get(item.id) ?? 0) + 1 / (k + rank + 1));
  }

  return [...scores.entries()]
    .map(([id, score]) => ({ id, score }))
    .sort((a, b) => b.score - a.score);
}
```

**k=60** is the standard RRF constant from the original paper; higher values flatten the
curve and weight recall over precision. Use pgvector + tsvector in Postgres for a
self-contained hybrid index, or Elasticsearch/OpenSearch for managed BM25.

## Reranking with Cross-Encoders

Cross-encoders score each (query, chunk) pair jointly — they see both at once and produce
calibrated relevance scores. Bi-encoders (embedding models) cannot do this.

```ts
import { pipeline } from "@xenova/transformers";

const reranker = await pipeline("text-classification", "cross-encoder/ms-marco-MiniLM-L-6-v2");

async function rerank(
  query: string,
  candidates: Array<{ id: string; text: string }>,
  topK = 6
) {
  const scores = await Promise.all(
    candidates.map(async (c) => {
      const result = await reranker(`${query} [SEP] ${c.text}`);
      return { id: c.id, score: result[0].score };
    })
  );
  return scores
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .filter((r) => r.score > 0.1); // drop low-confidence chunks
}
```

Cohere's `rerank-english-v3.0` API is an easy managed alternative. Send top-40 from the
index, rerank to top-6. The cost is ~$0.002 per 1k chunks reranked — negligible vs a
wrong context window that causes a hallucination.

## Context Window Management

```
Total context budget: 128k tokens
─────────────────────────────────────────────────────────────
System prompt:        ~800 tokens   (fixed)
Conversation history: ~2000 tokens  (sliding window, summarize old turns)
Retrieved chunks:     ~4000 tokens  (6 chunks × ~650 tokens each)
User question:        ~200 tokens
Output budget:        ~1000 tokens
─────────────────────────────────────────────────────────────
Total used:           ~8000 tokens  (well within budget)
```

**Rules for trimming when budget is tight:**

1. Trim conversation history first (summarize turns > 3 exchanges ago)
2. Drop the lowest-ranked retrieved chunk
3. Truncate long chunks at their first natural sentence boundary past 500 tokens
4. Never truncate the system prompt or the question

Order chunks: highest-relevance first AND last (avoid the "lost in the middle" effect).
Lowest-relevance chunks go in the middle of the context block.

## RAG Evaluation Metrics

| Metric | What it measures | How to compute |
|---|---|---|
| Recall@k | Are the right chunks in the top k? | Label ground-truth chunk IDs; check if they appear |
| Context precision | Are all retrieved chunks relevant? | Rate each chunk: relevant / total retrieved |
| Faithfulness | Does the answer only use retrieved content? | LLM judge or NLI model: does each claim appear in context? |
| Answer relevance | Does the answer address the question? | Embed question and answer; cosine similarity |
| Groundedness | Are citations correct and complete? | Verify each cited span exists verbatim in the cited chunk |
| "Not in corpus" rate | Does the system abstain when it should? | Test with questions outside the corpus |

Automate with frameworks like RAGAS or DeepEval. Run on every pipeline change. Set a
minimum faithfulness threshold (e.g., 0.85) as a CI gate before deploying a new index.

## Production RAG Architecture (ASCII)

```
┌─────────────────────────────────────────────────────────────┐
│                        INGEST PIPELINE                      │
│  Source docs → Parser → Chunker → Metadata tagger           │
│             → Embedder → Dedup (hash) → Hybrid index        │
│                          (pgvector + tsvector / Elasticsearch)│
└─────────────────────────────────────────────────────────────┘
                              │ (index updated on doc change)
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                       QUERY PIPELINE                        │
│  User query                                                 │
│     → Query rewriter (expand acronyms, split multi-intent)  │
│     → Hybrid search (BM25 + dense, k=40)                    │
│     → ACL filter (remove docs user cannot access)           │
│     → Cross-encoder rerank (k=6)                            │
│     → Score threshold filter (drop < 0.1)                   │
│     → Context assembler (add chunk IDs, trim to budget)     │
│     → LLM generator                                         │
│     → Citation validator (verify each [Dxx] exists)         │
│     → Response                                              │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                        OBSERVABILITY                        │
│  Log: query, rewritten query, chunk IDs, scores,            │
│       answer, faithfulness score, latency, cost             │
└─────────────────────────────────────────────────────────────┘
```

## Metadata Filtering Strategies

Metadata filters run before embedding comparison — they are fast (index scan) and reduce
the candidate set before expensive vector operations:

```ts
// pgvector with metadata filter
const chunks = await db.query(`
  SELECT id, content, 1 - (embedding <=> $1) AS score
  FROM chunks
  WHERE
    tenant_id = $2                          -- access control
    AND doc_type = ANY($3::text[])          -- content type filter
    AND updated_at > NOW() - INTERVAL '90 days'  -- freshness filter
    AND language = $4                       -- locale filter
  ORDER BY embedding <=> $1
  LIMIT 40
`, [queryEmbedding, tenantId, docTypes, locale]);
```

**Common metadata fields to index:**

- `tenant_id` — mandatory for multi-tenant; never skip
- `doc_type` — e.g., `["policy", "faq", "release_note"]`; filter by intent
- `product` — reduces false positives in multi-product corpora
- `locale` — serve the right language without embedding cross-lingual noise
- `updated_at` — freshness filter for policies and pricing
- `access_level` — `["public", "internal", "confidential"]`; enforce at query time

Create a composite index on `(tenant_id, doc_type, updated_at)` for fast pre-filtering
before the vector scan. Without this, a large corpus will full-scan on every query.
