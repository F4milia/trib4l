# Secrets and environment — what James configures, and where

Every key F4milia needs, who needs it, and **which side of invariant 2 it lives
on**. Written so that a session never has to guess where a secret belongs, and so
that no model key can drift into a client bundle.

| | |
|---|---|
| **Written** | 2026-09-02 |
| **Companion** | `stream-a-unblock-plan.md` (the scaffolding PRs) · `ai-model-and-cost.md` (decisions 4 and 5) |
| **Rule** | `NEXT_PUBLIC_*` is compiled into the browser bundle. Anything not marked public in the table below must never carry that prefix |

---

## 1. The three stores, and why the distinction matters

| Store | Reached by | Set with |
|---|---|---|
| **Supabase Edge Function secrets** | Edge Functions only. Never the Next.js app, never the browser | `supabase secrets set KEY=value` |
| **Vercel environment** | Next.js server code, and — with `NEXT_PUBLIC_` — the browser | `vercel env add KEY` |
| **Local `.env.local`** | Development only. Gitignored | Copied from `.env.example` |

**Invariant 2 lives in this table.** AI is server-side only and runs in Edge
Functions, so **model keys go in Supabase secrets and nowhere else** — not in the
Vercel environment even as a server variable, because a key that exists in the
Next.js process can be imported into a client component by accident, and A1's
acceptance greps the build output for exactly that.

## 2. The keys

| Key | Store | Public? | First needed | Status |
|---|---|---|---|---|
| `OPENAI_API_KEY` | Supabase secrets | No | **F2, Wave 5** | ⬜ Awaiting decision 4 |
| `ANTHROPIC_API_KEY` | Supabase secrets | No | A1, Wave 6 | ⬜ Awaiting decision 4 |
| `SENTRY_DSN` | Vercel env | No | **before Wave 5** | ⬜ PR 1 reads it |
| `NEXT_PUBLIC_SENTRY_DSN` | Vercel env | **Yes** | **before Wave 5** | ⬜ PR 1 reads it |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Vercel env | **Yes** | N1, Wave 4 | ⬜ You generate — §3 |
| `VAPID_PRIVATE_KEY` | Vercel env | No | N1, Wave 4 | ⬜ You generate — §3 |
| `VAPID_SUBJECT` | Vercel env | No | N1, Wave 4 | ⬜ A `mailto:` you own |
| `INNGEST_EVENT_KEY` | Vercel env | No | N1, Wave 4 | ⬜ From the Inngest dashboard |
| `INNGEST_SIGNING_KEY` | Vercel env | No | N1, Wave 4 | ⬜ From the Inngest dashboard |
| `NEXT_PUBLIC_POSTHOG_KEY` | Vercel env | **Yes** | Q3, Wave 9 | ⬜ Awaiting decision 7 |
| `NEXT_PUBLIC_POSTHOG_HOST` | Vercel env | **Yes** | Q3, Wave 9 | ⬜ Awaiting decision 7 |
| `AI_DISABLED` | Supabase secrets | No | A1, Wave 6 | Optional kill switch, decision 5 |

**A note on the Sentry DSN.** It needs two variables because
`instrumentation-client.ts` runs in the browser and `sentry.server.config.ts` /
`sentry.edge.config.ts` do not. A DSN in a client bundle is normal and is not the
part invariant 12 is about — the invariant is that **CI and staging must not
report into the production project**, which is why it comes from the environment
rather than from a committed constant. Leave both unset and Sentry no-ops, which
is the correct default until you create the non-production project.

## 3. Generating the VAPID keypair

Web push needs one keypair per application, generated once and then kept. It is
not obtained from a vendor:

```bash
npx web-push generate-vapid-keys
```

Public key → `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (it is designed to be public; the
browser needs it to create a subscription). Private key → `VAPID_PRIVATE_KEY`,
server only. `VAPID_SUBJECT` is a `mailto:` address you own, which push services
use to contact you about a misbehaving sender.

**Rotating the pair invalidates every existing push subscription.** Generate once
and store it properly the first time.

## 4. Inngest

Account and keys come from the Inngest dashboard — an event key and a signing
key. The scaffolding lands inert (see the unblock plan): the client is
constructed, the route is mounted, and nothing is sent until the keys exist, so
the app boots and the suite passes with all of these unset.

## 5. What is already configured

Supabase (local and hosted) and the Vercel project link are in place. `lib/email/`
is built and configured. Nothing in this document blocks a session that does not
appear in its "first needed" column.
