# Embedding Strategies

## Embeddings Are a Metric Space, Not Magic

An embedding model maps text to a vector so that *semantic nearness* matches *geometric nearness* under a chosen metric. If you pick the wrong model, metric, or normalization, nearest-neighbor search is cosplay. Treat embeddings as infrastructure: versioned, evaluated, and frozen until you have a reason to change them.

## Model Selection

Choose a model for the *query/document pair you actually have*:

- **English product docs / support:** a strong general English model (E5, GTE, OpenAI text-embedding-3, Cohere embed) is enough
- **Code:** use a code-trained model; general models collapse `getUser` and `getUsers`
- **Multilingual:** use a model trained for your languages; do not assume English-centric models generalize
- **Short queries vs long docs:** asymmetric models (query encoder ≠ document encoder) beat symmetric ones for search

Smaller dedicated embedding models often beat using an LLM's hidden state. Do not extract embeddings from a chat model "to save a vendor".

Match train-time instructions. Many models expect `query: ...` vs `passage: ...` prefixes. Dropping the prefix is a silent recall drop.

## Dimensionality and Matryoshka

Higher dimensions are not free. They cost storage, RAM, and distance compute. If the model supports Matryoshka / dimension truncation, eval at 256, 512, 768, 1536 on your recall@k. Ship the smallest dimension that holds recall within 1–2% of full.

Do not PCA-reduce a vendor embedding unless you re-eval. Naive truncation of non-MRL models destroys neighborhoods.

## Similarity Metrics

Use the metric the model was trained for:

- **Cosine / inner product on L2-normalized vectors:** default for most sentence models
- **L2 (Euclidean):** some older models; mixing cosine and L2 rankings is undefined
- **Dot product without normalization:** only if vectors are already unit length

Normalize once at index time. Normalizing at query time only is a bug if the index stored raw vectors.

Score thresholds are dataset-specific. A cosine of 0.75 means nothing portably. Calibrate on labeled pairs.

## Indexing: HNSW, IVF, Flat

- **Flat (brute force):** correct, fine under ~100k vectors, use as the eval baseline
- **HNSW:** default for low-latency semantic search; high recall, more RAM
- **IVF / IVF-PQ:** scale to millions; tune `nlist`/`nprobe`; expect recall tradeoffs
- **Hybrid:** keep BM25 alongside vectors; embeddings miss identifiers and typos

Rebuild or incrementally update with the same model version. Mixing two embedding versions in one index is corruption.

Store the model id, dimension, metric, and content hash with every vector. Or you will never be able to migrate.

## Embedding Hygiene

- Embed the same text you will show/cite, plus a small title prefix
- Do not embed boilerplate, nav, or duplicated headers
- Lowercase only if the model was trained that way (usually do not)
- Chunk first, embed second; never embed a 10k-token blob and hope
- Cache by content hash; re-embed on model bump, not on every request

Query-side: embed the *rewritten* search query, not the chatty user sentence, unless you have shown that chatty queries work.

## Multi-Vector and Late Interaction

For high-stakes search (legal, medical, code), consider ColBERT-style late interaction or multi-vector-per-doc. They cost more to store and score but recover recall when a single pooled vector smears a long document.

Start with single-vector + rerank. Move to multi-vector when rerank cannot recover missed hits.

## Evaluation

Build a set of (query, relevant chunk ids). Track:

- recall@10 / recall@50 (retrieval)
- MRR / nDCG (ranking)
- end-to-end answer faithfulness after RAG

Change one variable at a time: model, chunk size, metric, index params. A/B a new embedding model like a schema migration: dual-write, shadow retrieve, then cut over.

## Anti-Patterns

- One global index with no tenant/ACL filter
- Re-embedding daily "to stay fresh" without content changes
- Using cosine on unnormalized vectors
- Storing embeddings of PII in a vendor index without a DPA and redaction
- Switching embedding models because a blog post said the new one is SOTA

Embeddings are a lock-in choice. Pick a model you can eval, version it, and do not churn it for fashion.
