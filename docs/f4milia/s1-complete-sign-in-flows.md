# S1 — Complete sign-in flows

Session record. Wave 0 · Stream A.

| | |
|---|---|
| **Ran** | 2026-08-30 → 2026-09-01 |
| **Scope** | `F4milia — Complete Run Doc`, Wave 0, Stream A |
| **Delivered** | 10 PRs, all merged. `main` at `2d3e7a7` |
| **Suites at close** | 696 unit · 88 isolation · 112 pgTAP · 17 Playwright — all green |
| **Status** | **Code complete.** Two acceptance criteria unmet, both by decision — see §6 |

---

## 1. What was asked

> Email/password with mandatory verification, magic links, Google + Apple OAuth. Every auth screen on the Hearth & Material tokens. Password reset and email-change with re-verification. Verification emails carry no Family names or content.
>
> **Acceptance:** sign up, verify, sign in by password, by magic link, and by each OAuth provider, end to end in staging. Unverified accounts cannot reach any Family data — proven by test. Auth screens match the design tokens on mobile widths.

## 2. What shipped

| PR | What |
|---|---|
| **#9** | Auth screens on Hearth & Material tokens; `AuthShell`; every string into the copy deck |
| **#10** | Mandatory email verification; `/auth/confirm`; the unverified-access proof test |
| **#11** | Magic link sign-in |
| **#12** | Google + Apple OAuth code path; `/auth/callback`; provider registry |
| **#13** | Password reset |
| **#14** | Email change with double confirmation |
| **#16** | Show/hide password toggle |
| **#17** | Field-level form errors; closed the signup enumeration leak |
| **#28** | Emailed links return to the deployment that sent them |
| **#29** | Enabled Google sign-in |

`#16`–`#29` were follow-ups requested mid-session; they landed on top of the stack rather than amending earlier PRs, which avoided rebasing seven branches.

## 3. The decisions worth remembering

**Verification is enforced upstream of RLS, not inside it.** With
`enable_confirmations = true`, GoTrue mints no session for an unconfirmed
address — so an unverified person never holds a JWT to present to a policy.

Deliberately **not** gated on an `email_verified` JWT claim: GoTrue keeps that
flag in `user_metadata`, which the user can rewrite via
`auth.updateUser({ data })`. A policy reading it would be checking an
attacker-supplied value.

**Sign-in failures are never attributed to a field.** Measured against a real
GoTrue: a wrong password, an unknown address, a malformed address and an empty
one all return the identical `invalid_credentials`. Saying which field was
wrong would mean first asking whether the address has an account — the
enumeration oracle `/magic-link` and `/forgot-password` were built to avoid.

**Three flows are deliberately indistinguishable** between "this address has an
account" and "it does not": magic link, password reset, and — after #17 —
signup. Their copy is conditional (*"if that address can be used…"*) because a
definite claim would be false on one of the two paths.

**Emailed links carry the sending origin.** `{{ .SiteURL }}` is one fixed value
per Supabase project, so a template hardcoding it sends every preview
deployment's link to production. The app passes `emailRedirectTo`; templates
render `{{ .RedirectTo }}`.

## 4. Things that were measured, and two that corrected earlier claims

Every item here was found by running something, not by reading documentation.

**GoTrue never leaves `{{ .RedirectTo }}` empty.** With no redirect supplied it
substitutes the project's SiteURL. A `{{ if .RedirectTo }}` fallback can
therefore never fire — and the first version of #28 shipped a link reading
`http://127.0.0.1:3000?token_hash=…` with `/auth/confirm` missing entirely,
while all 694 unit tests passed.

**A bare origin fails Supabase's redirect allow-list**, even with the matching
`/**` entry — the wildcard does not match a pathless URL. Worse, it is not
rejected: GoTrue **silently substitutes the Site URL**, so mail still arrives,
pointing at the wrong place.

**`enabled = true` with an unset `env()` client id does not break anything.**
❗ This corrects #12's headline claim, which said it would take down every local
stack and all three CI jobs. Measured with a variable guaranteed not to exist:
the config parses and the stack boots healthy. Only a *literal* empty
`client_id = ""` breaks the parse. The real risk is quieter — valid config,
green CI, and sign-in that fails when somebody clicks the button.

**Signup leaked account existence.** ❗ #10's description claimed GoTrue
"succeeds with an obfuscated user". It does not: an address with a confirmed
account returns `user_already_exists`, and the action passed that message
straight to the screen. Closed in #17.

**React 19 resets an uncontrolled `<form action>`** once the action resolves.
Every failed submission wiped what had been typed — fill the email, submit, and
be told *"enter your email address"* on the next attempt, forever. jsdom does
not perform that reset, so a fully green suite said nothing. Fixed by echoing
values back as `defaultValue`; never the password.

**Subject lines had no test coverage at all.** They live in `config.toml`, not
in the templates, so the invariant-3 content guard never saw them. A subject is
the part of a message a shared inbox displays without anyone opening it. Now
asserted.

## 5. How it was verified

Beyond the suites, each flow was exercised against a real GoTrue and the real
local inbox — not mocks:

- **57 automated checks** across #12, #13, #14, #16, #17, #28, run on the
  stacked tip. All passing.
- **17 checks** on #11 specifically, including that no account is created for
  an unknown address and that the two responses are byte-identical.
- **#14's double confirmation observed directly:** after *one* confirmation the
  database still held the old address and the old password still signed in.
  Only after the second did it move.
- **#10's gate proven by removal:** turning `enable_confirmations` off fails
  exactly **1** of 4 assertions, not 4 — GoTrue refuses sign-in for a null
  `email_confirmed_at` regardless of the setting. The file records which
  assertion moves, and why the other three rest on GoTrue's own behaviour.
- **Screens rendered and screenshotted at 375px**, not only asserted in classes.

## 6. What is not satisfied

**Apple OAuth — deliberately deferred.** $99/year for the Apple Developer
Program, plus a client secret Apple caps at six months, meaning a rotation that
breaks sign-in silently if missed. Sign in with Apple is only *required* for
App Store apps; F4milia is a PWA. The code path supports it — one flag and a
credential pair away.

**"End to end in staging" — blocked on hosted configuration, not on code.**
`supabase/config.toml` and `supabase/templates/` configure the local stack
only; nothing in this repo pushes them to a hosted project. Until the dashboard
steps in `docs/HOSTED-EMAIL-SETUP.md` are done, Supabase's built-in SMTP
delivers only to project team members, at 2 messages an hour, and GoTrue sends
its own default templates — which link to `/auth/v1/verify` rather than this
app's `/auth/confirm`.

**S1's named edge case is unrun.** Google signup over an existing password
account, asserting one `auth.users` row and two `auth.identities`. It needs a
real Google login and a completed confirmation, so it is runnable locally today
but not on the hosted projects until SMTP exists.

## 7. Carried forward

- **Google is live in production** (`psflzvbpegpehpdoriff`) and **not** on
  preview (`oxracoamlrogrttwlgyp`) — one toggle.
- **Turnstile** chosen over hCaptcha for S2's signup protection: free with
  unlimited verifications, and its non-interactive mode renders no widget at
  all, so nothing arrives with rounded corners and its own palette on the first
  screen anyone sees.
- **"Memorial-lock"** appears in CLAUDE.md invariant 8 and twice in the run doc
  — including as S2's named edge case — but is defined nowhere. James's call
  (2026-09-01) was to disregard it. S2 should build deletion against
  `docs/data-retention-policy.md` and report memorial-lock as unimplemented
  because undefined, rather than invent rules. **The governing docs still
  reference it and have not been amended.**

## 8. Two operational lessons

**Checking out a branch does not reload Supabase's config.** `config.toml` and
the email templates are read when the auth container is created. `db reset`
does not reload them. Every branch from #10 onward changes one or both, so
switching branches needs:

```
npx supabase stop --no-backup
npx supabase start -x studio,vector,logflare,imgproxy,supavisor
```

Run those as **separate commands** — chaining them raced, and the stack came up
with confirmations off and no Google config. Verify before trusting a test run:

```
docker exec supabase_auth_Trib4l env | grep -E "MAILER_AUTOCONFIRM|GOOGLE"
```

**Both streams share one local Supabase stack.** During this session a
`db reset` collided with Stream B's H1 run — ten of their test users survived
the reset, and their run was very likely invalidated. This is CLAUDE.md's
2026-08-30 constraint, and it presents as flaky tests rather than as a
collision. Agree a window before restarting or resetting the stack.
