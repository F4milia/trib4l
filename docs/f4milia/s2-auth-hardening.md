# S2 — Auth hardening

Session record. Wave 1 · Stream A.

| | |
|---|---|
| **Ran** | 2026-09-01 |
| **Scope** | `F4milia — Complete Run Doc`, Wave 1, Stream A |
| **Delivered** | 10 PRs, `#33`–`#42`, stacked; all open for review |
| **Suites at close** | 883 unit · 115 isolation · 8 pgTAP files · 30 Playwright specs |
| **Status** | **Code complete.** Three items unmet, each by decision or by definition — see §6 |

---

## 1. What was asked

> 2FA (TOTP), optional for members, ENFORCED for platform_staff — verify it is
> actually enforced at sign-in, not just documented. Signup abuse protection:
> CAPTCHA or equivalent on signup, rate limiting on every auth endpoint. Session
> management UI: active sessions list, sign-out-everywhere. Account deletion
> wired to the existing anonymize-vs-purge policy.
>
> **Acceptance:** a platform_staff account without 2FA cannot complete sign-in.
> Sixth rapid auth attempt is refused. Deletion of a seeded account anonymizes
> what the policy anonymizes and preserves what it preserves — verified against
> seed data, not assumed.

## 2. What shipped

| PR | What |
|---|---|
| **#33** | Rate-limit counter store — its own `ratelimit` schema, service-role only |
| **#34** | Rate limits on six auth endpoints, two buckets per attempt |
| **#35** | Turnstile widget and captcha-token plumbing (inert) |
| **#36** | Captcha enforced at GoTrue, local and CI |
| **#37** | Own-session read, revoke, and bulk revoke |
| **#38** | Session management UI, and the repo's first confirmation pattern |
| **#39** | TOTP enrollment |
| **#40** | 2FA enforced at sign-in for staff, and for anyone enrolled |
| **#41** | `delete_my_account()` against the retention policy |
| **#42** | Account deletion UI, and the refusal afterwards |

## 3. The decisions worth remembering

**Half of invariant 7 was already true.** `is_platform_admin()` has been
`is_platform_staff() and aal = 'aal2'` since Session 2, so every RLS policy
carrying the platform bypass already refused an unverified staff session. What
was missing was the door: a staff member with **no authenticator at all** signed
in and used the product normally. That discovery removed a migration and a round
of fixture churn from the plan.

**Enforcement for staff is not literally "cannot complete sign-in".** GoTrue
issues a session for a correct password, and refusing staff a session entirely
would leave them no way to ever enrol. What is enforceable, and what is proven,
is that such an account reaches **nothing** but the enrolment page.

**Two-factor is enforced for every enrolled member, not only staff.** Not asked
for. Supabase issues an aal1 session whether or not a factor exists, so deciding
aal1 is insufficient is the application's job — without it, "Two-factor is on"
was a claim the product did not honour.

**Captcha is enforced at GoTrue, never in a server action.** The anon key is
public and ships in the client bundle, so `/auth/v1/signup` is reachable without
the app. A check in the action guards a door no bot needs.

**The rate limiter has two buckets with different limits.** Five per address
(the acceptance criterion) and twenty per source. A single per-IP limit of five
would lock out a whole household behind one NAT — and a Family is 8–12 people
who may share one.

**The counter lives outside `public`.** Invariant 5 attaches the audit trigger to
every table there, and a counter taking a write per auth attempt would either
flood an append-only log or need the invariant amended. Its own schema honours
the intent without touching the text.

**Deletion keeps the GoTrue user.** `profiles.id` cascades from `auth.users`, so
deleting the account in GoTrue purges the profile row the policy preserves. The
account is made unusable instead — which makes `requireUser()`'s refusal the
actual defence rather than defence in depth.

## 4. Things that were measured, and what each one changed

Every item was found by running something.

**The Turnstile token arrives 2,659 ms after `/login` loads.** A returning
visitor whose password manager fills both fields submits inside that window, and
would have been told their *correct* password "does not match an account". All
four captcha-guarded actions now map `captcha_failed` to its own message — and on
`/magic-link` and `/forgot-password` it is the one error they surface, because the
alternative is sending someone to check an inbox for mail that was never sent.

**A Turnstile token is single-use, and the test secret hides it.** After a failed
submit the spent token sat in the still-mounted form and every retry failed until
reload. Invisible locally *by construction* — the always-passes secret verifies
the same string repeatedly — so it exists only where a real secret is configured.
Reasoned, not measured; **needs a by-hand check once staging has real keys.**

**PostgREST validates a JWT's signature and expiry, not whether the session
exists.** A revoked access token keeps reading the Data API until `jwt_expiry`
(3600s). But supabase-js drops its session the moment GoTrue answers
`session_not_found`, so a revoked device running the SDK loses access at once.
Both halves are asserted, and the raw-token one needs a bare `fetch` — written
through the SDK it asserted the opposite of the truth.

**GoTrue refuses both MFA enrol and unenrol from an aal1 session.**
`/settings/security` was offering "Set up an authenticator" whose only possible
answer was "Setup could not be started. Try again." It now offers the code screen
and withholds both impossible actions.

**`listFactors().totp` excludes unverified factors** — `all` is the only place
they appear, so cleaning up an abandoned setup by reading `.totp` finds nothing,
every time.

**`enroll()` returns the secret once**, so a reload mid-setup orphans a factor
whose QR can never be shown again. Each start clears unverified leftovers.

**`next/image` refuses Supabase's QR outright** — a 321 KB unencoded
`data:image/svg+xml;utf-8,<svg…>` URI is a runtime error even with `unoptimized`.

**A `"use server"` file may export only async functions.** Exporting the initial
state object beside the action broke every importing page at module evaluation,
in the browser, while `tsc --noEmit` and `eslint` both passed.

**15 SECURITY DEFINER functions pin `search_path = public`, which leaves
`pg_temp` implicitly first for relation lookups** — and a temp table named
`platform_staff` makes `is_platform_admin()` return **true** for a plain member.
Measured as the `authenticated` role. Not reachable through PostgREST, which
offers clients no DDL, so it is a latent escalation rather than a live hole. See
§7.

## 5. How it was verified

- **883 unit assertions**, including two whole-tree censuses: `surface-migration`
  (design rules, which picked up every new `.tsx` automatically) and a new
  `assurance-gate` census that walks `app/` and fails on any page reading user
  data without a gate.
- **115 isolation assertions** against a real GoTrue and real RLS, and **8 pgTAP
  files**.
- **Five removal proofs**, because an assertion that cannot fail is not an
  assertion: granting `anon` what the rate-limit migration revokes flips three
  privilege assertions; dropping `user_id = auth.uid()` from the session
  functions flips both cross-account assertions; turning the limiter fail-open
  flips both fail-closed assertions; deleting the sign-in limiter flips the
  wiring assertions; and replacing deletion's step 1 with a hard delete **aborts
  with a foreign-key violation** rather than merely failing.
- **Real codes, not mocks.** The browser suite implements RFC 6238 in ~20 lines
  and hands a genuine TOTP code to a real GoTrue.
- **The named edge case, both halves, through the UI.** Two browser contexts:
  sign-out-everywhere from one, and the other is at `/login` on its next
  navigation.
- **Ran twice consecutively** where residue was a risk (the MFA specs), per Q4's
  rule.

## 6. What is not satisfied

**Memorial-lock — unimplemented because undefined.** Invariant 8 and S2's own
named edge case both require it; no governing doc says what it is. Built against
`docs/trib4l-docs/data-retention-policy.md` instead and reported, per James's
call of 2026-09-01. **The governing docs still reference it and have not been
amended.** Every step of deletion preserves content and severs only the link to
the person, so nothing here contradicts a future definition.

**Hosted configuration — two runbook items, not code.** `config.toml` never
reaches a hosted project, so captcha needs a dashboard step on both
trib4l-staging and trib4l-production (`docs/f4milia/s2-turnstile-setup.md`), and
**it is unconfirmed whether either project is on a Supabase plan that includes
MFA TOTP** — enrollment will fail there while passing locally if not.

**A single full 30-spec browser run was never completed.** Three times the shared
local database was reset out from under a run in progress, and once the auth
container was recreated without S2's captcha config. Every resulting failure was
verified environmental by checking the schema immediately afterwards. Each spec
passes when its migrations are actually present. **Take the full-suite result from
CI**, where each job builds its own stack.

**No recovery codes.** Not asked for, and a real design decision — where they are
shown, how they are stored, what happens when they run out. A member who loses
their authenticator needs staff help. This matters more now that the gate is real.

## 7. Carried forward

- **`search_path = public` on 15 definer functions** (§4). One line each to fix
  (`public, pg_temp`), and it touches Session 2's helper migration plus the
  pending audit series — so it is reported, not fixed. Every RLS gate in the app
  is in that list.
- **`jwt_expiry` is 3600s**, which is exactly the raw-token window after a
  revoke. 900s would cut it fourfold at the cost of more refresh traffic. A
  product-wide call.
- **No Content-Security-Policy header anywhere** — `next.config.ts` sets none.
  Unrelated to Turnstile (it is why the Cloudflare script needed no allowlist
  change) but a standing gap on an auth surface. Candidate for Q2.
- **The QR is 321 KB** crossing the wire inside an action result. Fine for a
  one-time screen; the first thing to change if that page ever feels slow.
- **`surface-migration.test.ts` pairs quote characters across a whole file**, so
  an apostrophe in a comment can flip the parity and fail an unrelated rule
  elsewhere in the same file. It cost twenty minutes to diagnose.

## 8. Two operational lessons

**The shared stack collided four times in one session**, in three distinct
shapes: the database reset out from under a run (migrations gone, `PGRST202` from
a stale schema cache), the auth container recreated with the other worktree's
config (`GOTRUE_SECURITY_CAPTCHA_ENABLED=false`), and verified factors left on
seeded users by the isolation suite, which made three browser specs test a
different starting state than they described. CLAUDE.md's 2026-08-30 entry
predicts the first; the others are new. **The fix that worked was making specs
establish their preconditions rather than assume them** —
`clearMfaFactors()`, disposable accounts, and no assertions about starting state.

**Counting lines is not reading values.** Checking captcha with `grep -c` returned
three matching lines and I read that as "my config is loaded". Printing the
values showed `ENABLED=false`. The lines were there; the values were the other
stream's.
