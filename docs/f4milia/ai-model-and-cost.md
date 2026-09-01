# AI model choice and what it costs

Backing detail for **decision 4** (model provider and keys) and **decision 5**
(AI cost ceiling) in `stream-a-blockers.md` §10. Neither decision is closed; this
records the numbers they turn on so the choice is not made from memory later.

| | |
|---|---|
| **Written** | 2026-09-02 |
| **Status** | Recommendation, not a ruling. Decisions 4 and 5 remain open |
| **Price source** | Claude: the bundled Claude API reference, cached 2026-06-24. Embeddings: vendor pages, verified 2026-09-02 (§5) |

---

## 1. The shape of the problem

Anthropic ships **no embeddings endpoint** — re-checked against the API
reference's own surface list, not recalled. F2 needs embeddings and A1 needs
generation, so **the AI stack is two vendors and two keys**, both server-side
only per invariant 2. That is not a preference; it is forced.

## 2. Prices per million tokens

| Model | Input | Output |
|---|---|---|
| **Claude Opus 5** (`claude-opus-5`) | $5.00 | $25.00 |
| Claude Sonnet 5 (`claude-sonnet-5`) | $2.00 | $10.00 |
| Claude Haiku 4.5 (`claude-haiku-4-5`) | $1.00 | $5.00 |
| Claude Fable 5.1 (`claude-fable-5-1`) | $10.00 | $50.00 |

Embeddings: **OpenAI `text-embedding-3-small` $0.02/M** ($0.01 through the Batch
API) · **Voyage 3.5-lite $0.02/M**. Identical price; embeddings bill input only.

## 3. What F4milia would spend

Assumptions, stated so they can be argued with: **8 Families × 12 = 96 members**
(decision 12), a suggestion carrying **~8K tokens** of assembled Family context
in and **~300 tokens** out.

| Model | Per suggestion | 2/member/day (5,760/mo) | At the proposed 100/Family/day cap (24,000/mo) |
|---|---|---|---|
| Opus 5 | $0.048 | **~$275/mo** | **~$1,140/mo** |
| Opus 5 + prompt caching | $0.012 | ~$66/mo | ~$276/mo |
| Sonnet 5 + caching | $0.005 | ~$27/mo | ~$110/mo |
| Haiku 4.5 + caching | $0.002 | ~$13/mo | ~$55/mo |

**Embeddings, the whole of F2: about $0.01/month.** 96 daily Table entries plus
Bricks and posts is ~450K tokens/month; a full re-embed of a year of content is
$0.11. **So the embedding choice is not a cost decision** — it is a decision
about vendor count and about the dimension, which the schema locks in.

## 4. Three consequences, one of them a correction

**4.1 — The rate limit *is* the budget.** 100 suggestions/Family/day on Opus 5
uncached is a **$1,140/month** exposure at 8 Families. Decision 5's numbers
should be set against this table rather than against intuition.

**4.2 — CORRECTION to decision 5's recommendation: `max_tokens: 1024` is
wrong.** Thinking is on by default on Opus 5, **thinking tokens bill at the
output rate, and they count against `max_tokens`** — so a 1024 cap can be
consumed by thinking and truncate the suggestion itself. Use
`output_config: {effort: "low"}` with `max_tokens: ~2048`. Low effort is correct
for a short suggestion anyway and saves more than the tight cap did.

**4.3 — Prompt caching is the largest lever: ~75%.** Family context repeats
across suggestions, so it caches well. Two caveats that decide whether the
saving is real: the default TTL is **5 minutes**, so it only pays when a
member's suggestions cluster in one sitting (a 1h TTL exists at 1.25× write
cost); and it must be **verified** by reading `usage.cache_read_input_tokens` —
zero across repeated calls means something volatile sits in the prefix and full
price is being paid silently.

**Also worth taking:** the Batch API is 50% off at 24-hour turnaround. Useless
for interactive suggestions, but **A4's Member Card suggestions need not be
interactive** — generated nightly, that line item halves.

## 5. Recommendation

- **Generation: `claude-opus-5`**, `effort: "low"`, adaptive thinking left on,
  Family context prompt-cached. Budget **~$70–280/month** at 8 Families.
- **Embeddings: OpenAI `text-embedding-3-small`, 1536 dimensions.** Voyage costs
  the same; OpenAI is more widely documented and 1536 is conventional. **The
  dimension must be fixed before F2 writes its migration** — `vector(1536)` bakes
  the model into the schema and changing it means re-embedding everything.
- If the Opus figure is more than intended, **Sonnet 5 + caching at ~$27/month is
  the sensible step down.** Recorded as available, not taken: downgrading a model
  for cost is the owner's call.

An earlier draft of this recommendation named `claude-sonnet-5` as the default.
That was a cost downgrade made without asking, and it is corrected here: the
default is Opus 5, with the cheaper tiers priced above as deliberate levers.

## 6. Sources

- OpenAI embedding pricing — <https://tokenmix.ai/blog/openai-embedding-pricing>
- Voyage 3.5-lite pricing — <https://vercel.com/ai-gateway/models/voyage-3.5-lite>
- Claude pricing, live — <https://platform.claude.com/docs/en/pricing.md>
  (the table in §2 is the bundled reference's cached copy; check this before
  committing budget)
