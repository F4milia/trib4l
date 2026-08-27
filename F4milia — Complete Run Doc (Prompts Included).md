# **F4milia — Complete Run Doc (Prompts Included)**

**Executor:** James Jarin | **Owner:** Ivan Rattliff **This document replaces** f4milia-james-prompts.md (v2) as the execution sequence, **and contains the full prompt text for every session** with the v2 scope fully merged: auth hardening, search, member communication, goal dashboards, integrated AI, media, public website, Keepsake, and quality. James runs from this doc alone.

**Standing decisions already merged in:** solo-dev model (automated pipeline is load-bearing; James self-reviews and merges, exactly as Ferenz does on KinKeepers — Ivan gates only A1, A5, and any PR touching the equity ledger) · AI assists inputs, never the equity math · Keepsake restored from Layer 2 · Mitosis, Kindred, and bank-linking stay parked · profit-share billing stays not-for-production until legal sign-off.

---

## **Standing preamble — paste above every session prompt**

```
STANDING PREAMBLE (applies to this and every session)

1. FIRST OUTPUT, before any code: a PR plan — an ordered list of PRs
   for this session, each under 200 lines, each independently
   mergeable and passing CI on its own. Then execute PR by PR in
   that order. If mid-session the plan needs to change, restate the
   remaining plan before continuing.
2. Per PR: write tests first against the acceptance criteria,
   implement, run the tests, self-correct until green, then open the
   PR.
3. Modify only files within this session's scope. If you need to
   touch a file outside it — especially migrations, auth, RLS, or
   another session's surface — STOP and report which file and why.
   Do not proceed.
4. Every PR description lists: (a) every file modified, (b) any
   acceptance criterion not satisfied and why, (c) any assumption
   made that the prompt did not specify.
5. On merge, the reviewer tags the PR `clean` or `rework`. Nothing
   else — this is the week-one data that makes every estimate real.
```

---

## **How to run this**

Two Claude Code sessions in parallel, one per git worktree:

```
claude -w stream-a        # critical path
claude -w stream-b        # parallel track
```

**Stagger, don't synchronize.** Launch Stream B a half-day behind Stream A so one stream's PR review window overlaps the other's generation time.

**Daily rhythm:** review and merge both streams' open PRs before the 09:30 demo. Relaunch both streams after. Per stream: PRs under 200 lines, branches under 24 hours, 2-hour push cadence.

**Review tiers:** CodeRabbit-only PRs merge on James's 2-minute pass at any time. Greptile-tier PRs (pre-flight glob list) get the session's named edge case verified by hand before James merges them himself — same as Ferenz on KinKeepers. The only exceptions are the Ivan-gated sessions below. In Waves 0–2 and 5–7 most Stream A PRs are Greptile-tier — correct, not noise.

**Ivan-gated sessions — the three exceptions:** A1 (AI foundation), A5 (AI-equity assists), and any PR touching the equity ledger (`**/contribution/**`) wait for Ivan at the 09:30 window and do not merge without him. Everything else James merges on his own authority once the automated gates are green and the edge case is verified. These three are the only places a silent error is a wrong cap table or a cross-Family AI leak inherited by six downstream sessions — that is what earns the human gate. The rest of the build does not, and routing it through Ivan would make his availability a false bottleneck on 90% of work that doesn't need it.

To be explicit, because A1 is a gate and the other AI sessions inherit its context assembler: A2, A3, A4, and O1 are **not** Ivan-gated. They reuse A1's already-reviewed scoping, so James verifies each one's own cross-Family proof-test and merges it himself. The gate is on establishing the pattern (A1) and on the equity-touching application of it (A5), not on every session that uses the pattern.

**Migration rule — non-negotiable:** any PR containing a database migration merges same-day, and the other stream rebases before its next push.

**Learning loop:** every `rework` tag gets a one-line root cause added to CLAUDE.md before the next session launches — what bounced and why. Same for any discovered constraint or hidden coupling. This is the only mechanism that makes week four smarter than week one; a rework without a CLAUDE.md line is a lesson paid for twice.

**Wave 1 retro — scheduled, not intended:** at the end of Wave 1, a fixed 30-minute checkpoint: read the clean/rework tags, compute actual cycle time per PR, and deliberately re-decide stream count, prep depth, and the Greptile glob list against measured numbers. Every estimate in this doc is constructed, not measured — this is where it gets corrected.

**Rules for every session:**

* Every mutation writes to `audit_log`. No exceptions, no "minor" changes.  
* Every destructive action confirms, and the confirm dialog names what will happen.  
* Role is resolved server-side from the database. Never from a client claim.  
* Hearth & Material tokens on every screen: zero border-radius, no SaaS blues, Terracotta for primary actions only. Re-read f4milia-design-system.md before each UI session.  
* AI sessions (Waves 6–7): all model calls server-side, only the caller's own Family-scoped data in context, every output is a suggestion approved before any write, every AI-assisted record carries a marker. The slice formula stays deterministic — no model output ever modifies hours, multipliers, or slices.

---

## **Pre-flight (before any Wave 0 session launches)**

Thirty minutes of config, done once. Not Claude Code sessions.

1. **Greptile trigger paths** — the F4milia-shaped list:

```
supabase/migrations/**
lib/auth/**
**/rls*
**/conversations/**
**/messages/**
**/contribution/**
**/ai/**
**/storage/**
app/admin/**
```

No Stripe globs — commerce stays dormant-per-Tower and nothing in this doc touches it.

2. **ZeroStep path filter** — condition the Playwright job on `app/**` and `components/**`. Backend-only PRs must not wait on browser tests. pgTAP stays unconditional on every PR.

3. **Worktrees** — create `stream-a` and `stream-b`, name the terminal panes, confirm both see CLAUDE.md.

4. **Companion docs in repo** — confirm CLAUDE.md, f4milia-design-system.md, f4milia-product-narrative-and-spec.md, and f4milia-testing-workflow.md exist in the repo the worktrees check out. A prompt whose required reading is missing produces a session that invents the constraints.

---

## **Wave table**

| Wave | Stream A (critical path) | Stream B | Gate / notes |
| ----- | ----- | ----- | ----- |
| 0 | S1 auth flows | V1 repo audit | V1's report reviewed at the 09:30 demo before Wave 1; missing carry-overs slotted then. Every missing item is checked against every later wave's dependencies before slotting — not just appended to the backlog. A gap that a Wave 4+ session silently assumes (e.g. a Program Partner endpoint N1 or K1 reads) gets slotted upstream of that wave, or the wave table gets re-cut. |
| 1 | S2 auth hardening | E1 email (if V1 shows missing), else W1 marketing site | E1 gates all notification work |
| 2 | C1 chat schema \+ realtime | D1 home dashboard | C1 is Greptile-tier; D1 touches no shared files |
| 3 | C2 mentions, media, storage | D2 who's-doing-what \+ calendar | Stream A owns storage policies this wave |
| 4 | N1 notifications center \+ push \+ reminders | W2 legal pages, first-run, PWA | N1 consumes E1 |
| 5 | F1 keyword search, then F2 semantic | F3 search UI (trails F1), then M1 media on entries | F1/F2 Greptile-tier — search must not bypass RLS |
| 6 | A1 AI foundation, then A2 Tower→Bricks | A3 Family Night narrative, then A4 Member Card suggestions | A1 merges before Stream B's A3/A4 launch. A1 is Ivan-gated (it establishes the context assembler the others inherit); A2/A3/A4 are James-merged |
| 7 | A5 AI-equity assists | O1 onboarding guide, then H1 help page | A5 merges at 09:30 with Ivan present, no exceptions |
| 8 | K1 Keepsake aggregation \+ PDF | K2 share page, then Q1 accessibility | K1 needs completed-Tower seed data in staging |
| 9 | Q2 rate-limit sweep \+ Q3 analytics | Q4 full E2E | Q4 green is the launch gate |
| 10 | R1 deploy pipeline \+ rollback runbook | — | R1 completes before any production traffic. Q4 green \+ R1 done \= launch |
| — | *Parked:* Mitosis, Kindred, bank-linking, profit-share activation |  | Profit-share blocked on legal; others blocked on real need |

**Launch gates.** *Communication-complete* (end of Wave 4): hardened auth, live chat, working notifications, the home dashboard — a Family can actually live in the product daily. *Fully featured* (end of Wave 9): search, AI, media, public site, Keepsake, E2E green.

**If a stream stalls:** fix-forward on the stalled stream; the other continues. No third worktree. Both stalled at once \= raise at 09:30.

---

## **Named edge-case register**

One per session — the check the human reviewer executes by hand before merging, chosen because the automated gates structurally can't catch it. This is the "session's named edge case" the review-tier rule refers to. C1 and F1 already carry theirs in-prompt; listed here for completeness.

| Session | Edge case to verify by hand | Why the gates miss it |
| ----- | ----- | ----- |
| S1 | Google OAuth signup using the email of an existing password account — explicit link-or-block, no duplicate member | Identity merge is a product decision no test asserts unprompted |
| V1 | `git diff` after the session shows the report file and nothing else | Audit sessions that "helpfully fix" things are the failure mode |
| S2 | Sign-out-everywhere from device A kills device B on its next request; then delete a seeded account and confirm memorial-lock content persists | Session revocation and the anonymize-vs-purge policy both span systems |
| E1 | Remove a member from a Family, re-invite later — old mute rows don't silently apply; defaults are fresh | Stale preference rows surviving re-membership |
| C1 | *(in prompt)* dual-Family user sees exactly their own conversations in each Family, nothing across | Per-participant scoping under overlapping membership |
| C2 | B @mentions A after A blocked B — no notification reaches A; the room is unaffected | Blocks × mentions is a cross-feature decision |
| D1 | Dual-Family member switches Families — Tower, streak, Vow holder all switch with zero bleed | Per-Family UI state isolation |
| D2 | A member with claimed Bricks leaves the Family — their Bricks revert to open, not attributed to a ghost | Departure cleanup crosses membership and tasks |
| N1 | A mention inside a DM — exactly ONE notification, and per-type mutes resolve predictably | Type-overlap dedup |
| W2 | Complete first-run inside the installed PWA, not a browser tab | Install context changes storage and navigation behavior |
| F1 | *(in prompt)* dual-Family user searches a term present in both Families — both returned, correctly scoped | RLS on the search path under overlapping membership |
| F2 | Edit an entry after embedding — a semantic query for the NEW phrasing finds it | Re-embed-on-write vs stale vectors |
| F3 | A query with zero keyword hits but semantic hits renders grouped results sanely | Merge-path rendering |
| M1 | Delete an entry carrying a photo — the storage object is unreachable afterward | Orphaned-object policy |
| A1 | A dual-Family member invokes AI inside Family A — context contains zero Family B content even though the CALLER can read B | Scoping by Family-of-invocation, not by the caller's total access — the subtlest leak |
| A2 | Dismiss the draft, re-invoke — fresh draft, nothing persisted from the dismissed one | Dismissal-state hygiene |
| A3 | A week with zero Table entries — the draft is honestly empty and invents nothing | The no-invented-copy rule under empty input |
| A4 | Accept a suggestion edited down to an empty string — treated as dismiss, no blank line written | Degenerate accept |
| A5 | Confirm an AI effort estimate, then manually edit it before logging — the ledger holds the final human number, marker semantics correct | Human-after-AI ordering on the one surface that must stay deterministic |
| O1 | A non-creator second member runs the guide — permissions correct, prefill submits under THEIR identity | Role assumptions in onboarding |
| H1 | A user in no Family submits the form — routes to staff, audit row written | Pre-Family support path |
| K1 | A Tower whose contributor left mid-Build — the Keepsake attributes their historical Bricks correctly | Departed-member attribution at export |
| K2 | Publish, change approved content, unpublish, republish — the page reflects current approved state, never a stale snapshot | Static-page regeneration |
| Q1 | Keyboard-only through a full Table entry WITH a photo attached | The composite flow, not the fields |
| Q2 | Hit a rate limit mid-action and retry — plain message, no data loss | Limit UX under legitimate burst |
| Q3 | Capture events during an AI session — zero prompt or suggestion text in any payload | AI payloads are the newest leak surface |
| Q4 | Run the suite twice consecutively — run 2 passes on run 1's residue | Test-data hygiene |
| R1 | Roll back a migration in staging with seeded data present — data intact, app healthy | Down-paths are never exercised until the night they're needed |

---

---

---

# **WAVE 0**

## **Stream A — S1: Complete sign-in flows**

```
Read CLAUDE.md and f4milia-design-system.md before starting.

Configure Supabase Auth for the full standard flow: email/password with
mandatory email verification, magic links, and Google + Apple OAuth.

Every auth screen styled per the Hearth & Material tokens — zero
border-radius, Parchment/Deep Slate/Terracotta — not Supabase defaults.
These are the first screens anyone sees; they set the tone.

Password reset and email-change flows, with re-verification on email
change. Verification emails carry no Family names or content — assume
the inbox may be shared.

Acceptance: sign up, verify, sign in by password, by magic link, and by
each OAuth provider, end to end in staging. Unverified accounts cannot
reach any Family data — proven by test, not assumption. Auth screens
match the design tokens on mobile widths.

Commit: "feat: complete sign-in flows"
```

## **Stream B — V1: Repo audit**

```
Read CLAUDE.md before starting. This session writes a report, not code.

Audit the repository against two prior prompt lists and report actual
state: Ferenz's backend items 12.1–12.6 (Program Partner: program_partners,
family_program_enrollments, aggregate endpoints, privacy floor) and
13.1–13.19 (transactional email, commerce sessions 13–16, reshaped
analytics, HQ dashboard, three-tier billing), plus old James items
15.1–17.1 (HQ UI, billing UI, Family settings).

For each: done / partial / missing, with the evidence (migration present,
tests passing, route exists). Do not rebuild anything. Do not "fix" anything
found broken — report it.

Acceptance: a written done/partial/missing table Ivan can review at 09:30,
with a proposed slot in the wave table for each missing item. For every
missing or partial item, name which later sessions in this doc depend on
it (search the wave table's session scopes, don't guess) — an item nothing
depends on is backlog; an item a later wave assumes must slot upstream of
that wave. The report says which is which.

Commit: "chore: repo audit against prior prompt lists"
```

---

# **WAVE 1**

## **Stream A — S2: Auth hardening**

```
Read CLAUDE.md before starting.

2FA (TOTP), optional for members, ENFORCED for platform_staff — this was
a standing invariant; verify it is actually enforced at sign-in, not
just documented.

Signup abuse protection: CAPTCHA or equivalent on signup, rate limiting
on every auth endpoint (sign-in, code/link requests, password reset).

Session management UI: active sessions list, sign-out-everywhere.
Account deletion wired to the existing anonymize-vs-purge policy —
memorial-lock rules apply; a deletion request does not purge content
the policy says must persist.

Acceptance: a platform_staff account without 2FA cannot complete
sign-in. Sixth rapid auth attempt is refused. Deletion of a seeded
account anonymizes what the policy anonymizes and preserves what it
preserves — verified against seed data, not assumed.

Commit: "feat: 2FA, rate limits, session management, account deletion"
```

## **Stream B — E1: Transactional email (run only if V1 shows it missing; otherwise run W1 from Wave 4's Stream B early)**

```
Read CLAUDE.md before starting.

Resend, with SPF/DKIM and a custom sending domain. Templates: Family
invite, Family Night digest, Vow notification, password reset. Message
content carries no Table entry text — subject and body name the event,
never the content. Assume the inbox may be shared.

Per-Family notification preferences: a member in three Families sets
preferences per Family, not one global mute.

Acceptance: each template renders and delivers in staging (test mode —
staging never sends real mail). A member with Family A muted and Family
B unmuted receives exactly B's digest. No Table entry text appears in
any message body — grep the templates to confirm.

Commit: "feat: transactional email with per-Family preferences"
```

---

# **WAVE 2**

## **Stream A — C1: Conversations schema and realtime chat**

```
Read CLAUDE.md before starting. Greptile-tier: new RLS surface.

Design and migrate `conversations` and `messages`: one Family-wide
channel per Family created automatically, plus 1:1 and small-group DMs
between members of the same Family only. RLS scoped to conversation
participants — not to the Family generally, to the participants.

Realtime delivery via Supabase Realtime: live messages, typing
indicator, unread counts, read receipts.

The existing member_blocks table applies here from day one: a blocked
member's messages are hidden from the blocker — hidden from them
specifically, not deleted for the room.

Acceptance: a member of Family A cannot read Family B's channel or any
DM they are not a participant in — pgTAP proves it. Messages appear
live without refresh. After A blocks B, B's messages vanish from A's
view and remain visible to everyone else. Named edge case for the
09:30 review: a user who is a member of BOTH Families A and B sees
exactly their own conversations in each and nothing across.

Commit: "feat: family channels and DMs with realtime delivery"
```

## **Stream B — D1: Home dashboard**

```
Read CLAUDE.md and f4milia-design-system.md before starting.
Read-only UI over existing tables — no migrations in this session.

The screen a member lands on daily: today's Table prompt status, their
claimed Bricks with due windows, the Family's Tower progress rendered
as stacked masonry blocks (never a smooth bar), the current Vow holder,
the streak, and recent Ledger highlights.

This is the most-seen screen in the product. It gets a real design
pass, not an assembly of cards.

Acceptance: every element reflects live seeded data. Tower progress
renders as blocks. Loads correctly for a brand-new Family with no
Tower yet — honest empty states, no invented placeholders.

Commit: "feat: member home dashboard"
```

---

# **WAVE 3**

## **Stream A — C2: Mentions, reactions, threading, media in messages**

```
Read CLAUDE.md before starting. This session owns Supabase Storage
policies — Stream B does not touch storage this wave.

@mentions with notification records (delivery UI arrives in N1 —
write the rows now). Emoji reactions. Reply-threading in the Family
channel.

Image and file attachments via Supabase Storage: storage RLS matching
the conversation's participant scoping, per-Family quota, per-file
size cap.

Acceptance: a mention writes a notification row. An attachment
uploaded to Family A's channel is unreachable by URL from a Family B
session — proven, not assumed. Quota exceeded fails with a plain
message, not a broken upload.

Commit: "feat: mentions, reactions, threads, message attachments"
```

## **Stream B — D2: Who's-doing-what and calendar**

```
Read CLAUDE.md before starting. Pure UI over existing tables.

Who's-doing-what: every open and claimed Brick in the Family, grouped
by member, one screen — nobody has to ask who's on what.

Calendar view: Family Night schedule, Vow rotation turns, Brick due
windows. Reminder toggles per item write preference rows (delivery
arrives in N1).

Acceptance: an unclaimed Brick shows as open, not attributed. Calendar
respects the Family's stored timezone. Reminder toggles persist.

Commit: "feat: family task board and calendar"
```

---

# **WAVE 4**

## **Stream A — N1: Notifications center, push, reminders**

```
Read CLAUDE.md before starting. Consumes E1's preference schema.

In-app notification inbox aggregating: mentions, DMs, Care Actions,
Brick nudges, Vow events, Family Night reminders — with per-type,
per-Family preferences extending E1's schema.

Web push (PWA) for DMs, mentions, and the daily Table prompt,
respecting the same preferences.

Calendar reminders from D2's toggles delivered through this center
via Inngest.

Acceptance: each event type lands in the inbox. A muted type does not
deliver — in-app or push. Push arrives on a locked phone in staging.
The daily Table prompt push fires at the Family's chosen time in the
Family's timezone.

Commit: "feat: notifications center and web push"
```

## **Stream B — W2: Legal pages, guided first-run, PWA shell**

```
Read CLAUDE.md and f4milia-design-system.md before starting.

Terms of Service and Privacy Policy pages with clearly-marked
placeholder copy — final language comes from counsel; the pages,
routing, and signup consent checkboxes exist now. Placeholder text
must be visibly placeholder ("[PENDING LEGAL REVIEW]"), not
plausible-sounding invented terms.

Guided first-run: create or join a Family → first Table entry →
invite members. The Tower prompt arrives later per the progressive-
disclosure pacing — do not front-load it.

PWA: installable, app icon, offline-tolerant shell.

Acceptance: signup blocks without consent checkboxes. First-run
completes end to end for a new user. Lighthouse reports installable.
No invented legal language anywhere — grep for the placeholder marker.

Commit: "feat: legal page shells, first-run, PWA"
```

---

# **WAVE 5**

## **Stream A — F1: Keyword search, then F2: Semantic search**

```
[F1] Read CLAUDE.md before starting. Greptile-tier: search is a new
read path and must enforce the same RLS as direct reads.

Postgres full-text search over posts, comments, Bricks, and Ledger
events. The search path goes through RLS — not a service-role
shortcut with filtering bolted on top.

Acceptance: a search from a Family A session returns zero Family B
rows for a term that exists in both — pgTAP proves the path itself is
policy-enforced. Named edge case for 09:30: the dual-Family user
searches a term present in both their Families and sees both, scoped
correctly.

Commit: "feat: keyword search, RLS-enforced"

[F2] Same rules. pgvector: embed Table entries, posts, and Bricks on
write via Edge Function. Embedding tables carry org_id and the same
RLS as their source rows. Semantic results merge alongside keyword
results.

Acceptance: embeddings inherit RLS — the Family A/B test passes on
the vector path too. A meaning-based query ("times we struggled")
surfaces relevant entries a keyword miss would skip.

Commit: "feat: semantic search on pgvector"
```

## **Stream B — F3: Search UI (launch after F1 merges), then M1: Media on entries**

```
[F3] Read f4milia-design-system.md before starting.

One search bar in the navigation shell. Results grouped by type —
posts, Bricks, Ledger, members — keyboard-navigable, monospaced
metadata per the Ledger's visual language.

Acceptance: keyboard-only search works end to end. Empty results show
an honest empty state.

Commit: "feat: search UI"

[M1] Optional photos on Table entries, file attachments on Bricks —
reusing Wave 3's storage policy pattern, same quotas, same caps.

Acceptance: a photo on a Family A Table entry is unreachable from a
Family B session by direct URL. Entry composer stays one-tap-first —
the photo is optional, never a required step.

Commit: "feat: media on table entries and bricks"
```

---

# **WAVE 6**

## **Stream A — A1: AI foundation, then A2: Tower→Bricks assistant**

```
[A1] Read CLAUDE.md before starting. Greptile-tier; merges only at
09:30 with Ivan present — same gate as A5. A1 is gated precisely
because A2, A3, A4, A5, and O1 all inherit this session's context
assembler: if A1's isolation is subtly wrong, it is wrong in six
sessions. The gate is here so the inheritors don't need one — they
reuse already-reviewed scoping and James merges them himself. Get
the pattern right once.

A server-side AI utility (Edge Function): assembles context strictly
from the calling member's own Family, calls the model, returns a
suggestion object. No client-side model calls anywhere. Every
AI-assisted write carries an ai_assisted marker column.

Write the proof-test now, not later: an AI endpoint invoked from a
Family A session with a crafted attempt to reference Family B content
returns nothing from B — the context assembler structurally cannot
include it.

Acceptance: the cross-Family proof-test passes. No model API key
reaches the client bundle — grep the build output.

Commit: "feat: AI foundation with family-scoped context"

[A2] Tower→Bricks assistant: given the Family's Tower description,
draft a proposed Build/Brick breakdown. The Family edits and accepts;
accepted Bricks enter the normal lifecycle unchanged and carry the
marker. Nothing writes without explicit acceptance.

Acceptance: dismissing the draft writes nothing. Accepted Bricks are
marked. The draft never references another Family's Towers as
"examples."

Commit: "feat: AI tower-to-bricks assistant"
```

## **Stream B — A3: Family Night narrative, then A4: Member Card suggestions (launch after A1 merges)**

```
[A3] The convener sees an AI-drafted weekly summary from the week's
Table entries and Brick progress — warm, short, editable. Never
auto-published: the convener edits and posts, or discards.

Acceptance: the draft renders only to the convener. Publishing is an
explicit act. The published rollup carries the marker.

Commit: "feat: AI family night narrative draft"

[A4] After a Table entry, suggest an updated Member Card line the
member can accept, edit, or dismiss. Suggestion-only — this is the
safe revival of the auto-update idea. Dismissed suggestions do not
reappear for the same entry.

Acceptance: dismissal writes nothing and does not re-prompt. Accepted
updates are marked. Suggestions render only to the entry's author.

Commit: "feat: member card suggestions"
```

---

# **WAVE 7**

## **Stream A — A5: AI-equity assists**

```
Read CLAUDE.md before starting. Highest-stakes session in this doc.
Greptile-tier; merges only at 09:30 with Ivan present.

THE BOUNDARY, STATED FIRST
The slice formula is deterministic and auditable. No model output
ever modifies hours, multipliers, or slices. AI assists inputs and
review. If any part of this session would violate that, stop and
raise it rather than building around it.

BUILD
1. Suggested effort estimates at Brick creation — the Family confirms
   or edits; only the confirmed number enters the ledger.
2. Anomaly flags when logged hours land far outside a Brick's
   confirmed estimate — surfaced privately to the organizer as a
   review prompt. Not an accusation, never an automatic adjustment,
   invisible to other members.
3. AI-drafted narrative section of the Contribution Report. The
   accrual table stays generated by the existing math, untouched.

Acceptance: grep proves no AI code path writes to contribution_ledger
numeric columns. An anomaly flag is visible to the organizer only.
The Contribution Report's table matches the deterministic output
byte-for-byte with the AI narrative present.

Commit: "feat: AI-assisted equity inputs, deterministic math preserved"
```

## **Stream B — O1: Onboarding guide, then H1: Help page**

```
[O1] A conversational helper for a new Family's first sessions —
articulating a Tower, setting the Table time, understanding Vows.
Built on A1's foundation, same scoping, same markers. It suggests
and explains; the Family decides and clicks.

Acceptance: the guide cannot write a Tower directly — it prefills
the definition form the member submits. Cross-Family proof-test
passes on this endpoint too.

Commit: "feat: onboarding guide"

[H1] Help page: FAQ plus a contact form routing to platform_staff,
written to the audit log like every mutation.

Acceptance: a submitted form reaches the staff view and writes an
audit row.

Commit: "feat: help and support"
```

---

# **WAVE 8**

## **Stream A — K1: Keepsake aggregation and PDF**

```
Read CLAUDE.md before starting. Needs a completed Tower in staging
seed — extend the seed script in this PR if one doesn't exist.

Aggregation service compiling a completed Build or Tower's full
history — Bricks, contributors, Ledger events, dates — into an
exportable structure. PDF generation via @react-pdf/renderer for the
memory-book and Contribution Report templates, styled to the design
system: this document is the product's signature artifact and should
look like it.

Acceptance: a seeded completed Tower exports a PDF whose contents
match the Ledger record exactly. A member of another Family cannot
trigger or fetch the export. The Contribution Report PDF's numbers
match the deterministic ledger.

Commit: "feat: keepsake aggregation and pdf export"
```

## **Stream B — K2: Shareable Tower page, then Q1: Accessibility pass**

```
[K2] A shareable static page for a completed Tower — the Family
chooses to publish it; nothing is public by default. Published pages
show what the Family approved, with an unpublish action.

Acceptance: unpublished Towers 404 publicly. Publishing is explicit,
confirmable, reversible, audited.

Commit: "feat: shareable tower page"

[Q1] Accessibility pass: run every screen through a contrast checker —
the Terracotta-on-Parchment primary button is a known open flag;
resolve it with a verified-passing value, adjusting the token if
needed rather than exempting the button. Keyboard navigation and
screen-reader labels on the Table and Brick flows specifically.

Acceptance: primary button passes WCAG AA at its rendered size,
verified with a checker, value recorded in the design-system doc.
Table entry and Brick claim complete keyboard-only.

Commit: "fix: accessibility pass, contrast resolved"
```

---

# **WAVE 9**

## **Stream A — Q2: Rate-limit sweep, then Q3: Analytics**

```
[Q2] Rate limiting on every endpoint that costs money or sends
anything: AI calls, email, push, storage upload — extending the
existing invariant. Limits fail with plain messages.

Acceptance: each listed endpoint refuses past its limit in staging.

Commit: "feat: rate limiting on cost-bearing endpoints"

[Q3] PostHog: product analytics across the app. Event names and
anonymous counts only — no Table entry text, no message content, no
member-identifying payloads. Write the scrubbing test before the
first event ships.

Acceptance: a captured event stream contains zero content strings —
verified against staging traffic, not assumed.

Commit: "feat: privacy-scoped analytics"
```

## **Stream B — Q4: Full E2E (the launch gate)**

```
Read f4milia-testing-workflow.md before starting.

One ZeroStep suite covering the full life: signup → verify → create
Family → invite (second user joins) → Table entry with photo → chat
message with mention → notification received → Tower defined via
onboarding guide → AI Brick draft accepted → Brick claimed, worked,
peer-verified → slice accrues → dashboard reflects all of it →
search finds the entry → Keepsake exports.

Acceptance: the suite passes green in staging twice consecutively.
Every failure found on the way is fixed-forward in this wave, not
deferred.

Commit: "test: full product e2e"
```

---

# **WAVE 10**

## **Stream A — R1: Deploy pipeline and rollback runbook**

```
Read CLAUDE.md before starting. Runs after Q4 is green; completes
before any production traffic.

DEPLOY
One-command deploy from main, gated on green CI including the full
pgTAP and E2E suites. Environment variables documented; staging and
production differ only where the X1 README already says they do.

MIGRATION ROLLBACK
Every migration in the repo gets a decision, recorded in the
migration file itself: a tested down-path, or a documented
forward-fix with the reason a down-path is unsafe. No migration is
undecided.

ROLLBACK DRILL
In staging, with seeded data: deploy, migrate, roll back, verify
data intact and app healthy. Document the exact steps as executed —
the runbook is the drill's transcript, not a hypothetical.

INCIDENT NOTES
One page: who flips what when a bad merge reaches production, how a
Family is told if their data or a Family Night is affected — plain
language, no invented reassurances.

Acceptance: the staged rollback drill executed and documented.
Deploy from clean main completes in under 10 minutes. The runbook is
followable by someone who didn't write it. Every migration carries
its rollback decision — grep for undecided migrations returns zero.

Commit: "chore: deploy pipeline and rollback runbook"
```

---

# **PARKED**

**Mitosis, Kindred, bank-linking** — unchanged: blocked on real need, not difficulty. **Profit-share activation** — built (if V1 confirms) but not-for-production until legal sign-off; no session in this doc touches it. **ToS/Privacy final copy** — counsel's, not Claude Code's; the W2 placeholders hold until it lands.

