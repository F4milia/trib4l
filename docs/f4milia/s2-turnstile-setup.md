# Turnstile setup (S2)

What this repo configures, what only a dashboard can, and which keys to use
where. Companion to `docs/HOSTED-EMAIL-SETUP.md`, which has the same shape and
the same reason for existing: `supabase/config.toml` configures the **local**
stack only, and nothing here pushes it to a hosted project.

## Why the app never verifies the token

The obvious implementation — POST the token to Cloudflare's `siteverify` inside
the server action, then call GoTrue — guards a door no bot needs to use. The
anon key is public by design and ships in the client bundle, so anyone can POST
`/auth/v1/signup` directly and never reach `app/actions/auth.ts`.

So enforcement lives in GoTrue (`[auth.captcha]`), and the app's only job is to
obtain a token and forward it. `lib/auth/captcha.ts` says the same thing at the
call site.

## Which forms carry a widget

GoTrue applies captcha to four endpoints, so four forms need a token: signup,
password sign-in, magic link, password reset. `components/turnstile.tsx` renders
on each, and renders **nothing** where `NEXT_PUBLIC_TURNSTILE_SITE_KEY` is
absent — so local development and CI run captcha-free without any code branch.

`/reset-password` (setting the new password) has no widget: it calls
`updateUser`, which GoTrue does not captcha-guard.

## Widget mode is a dashboard setting, not a code setting

Cloudflare offers **Managed**, **Non-interactive** and **Invisible** on the site
key itself. Only Invisible draws nothing at all; Non-interactive still draws a
widget. S1's carry-forward note conflated the two — worth correcting, because the
design reasoning ("nothing arrives with rounded corners and its own palette")
only holds for Invisible.

Recommended: **Invisible**, or Managed with the code's
`appearance="interaction-only"` doing the same job — nothing is drawn unless
Cloudflare decides this visitor needs a challenge. Either way, if a challenge
*is* required the widget is Cloudflare's markup in an iframe and cannot be
restyled; zero-border-radius cannot be honoured there, and the mitigation is
that it is a rare path rather than the default screen.

## Keys

**Local and CI: Cloudflare's published test keys.** They need no account.

| Purpose | Site key | Secret key | Exercised here |
|---|---|---|---|
| Always passes, invisible | `1x00000000000000000000BB` | `1x0000000000000000000000000000000AA` | **Yes** — see below |
| Always blocks | `2x00000000000000000000AB` | `2x0000000000000000000000000000000AA` | Secret only |
| Forces an interactive challenge | `3x00000000000000000000FF` | — | No |

### What was actually measured, 2026-09-01

Against this stack, with `[auth.captcha]` enabled and the always-passes secret:

| Check | Result |
|---|---|
| `POST /auth/v1/token` with **no** token | `400` `captcha_failed` — "no captcha_token found" |
| Same call with a token of `"dummy"` | `200`, session issued — the always-passes secret verifies any non-empty string |
| Always-**blocks** secret against siteverify | `success: false`, `metadata.result_with_testing_key: true` |
| siteverify latency from this host | ~95–108 ms cold, ~58 ms on a warm connection |
| Isolation suite, 101 tests, captcha enforced | 28.7 s |
| Browser suite, 17 specs | 47 s |
| **Token arrival in a real browser after `/login` loads** | **2 659 ms** |

That last number is the one with consequences, and it is why
`copy.auth.captcha.notCompleted` exists: a returning visitor whose password
manager fills both fields can submit inside that window and would otherwise be
told their correct password "does not match an account".

I have **no captcha-off baseline from the same stack**, so the isolation and
browser figures above are absolute, not deltas.

**Staging and production: real keys**, one widget per environment, with the
hostname allowlist covering the deployment's own origin. A widget whose allowlist
omits the preview domain fails closed on that domain only, which presents as
"signup is broken on preview" and nothing else.

## Turning it on

Three things, in one change:

1. `TURNSTILE_SECRET_KEY` in the environment the Supabase CLI reads (see
   `.env.example`). The container reads it, not the app.
2. `NEXT_PUBLIC_TURNSTILE_SITE_KEY` in the app's environment. Public by design.
3. `[auth.captcha] enabled = true`, `provider = "turnstile"`, `secret =
   "env(TURNSTILE_SECRET_KEY)"` in `supabase/config.toml`.

Enabling the flag without the secret refuses every signup. Setting the secret
without the flag does nothing. Both, together, or neither.

Then restart the auth container — `config.toml` is read when the container is
created, and `db reset` does **not** reload it (S1's operational lesson):

```
npx supabase stop --no-backup
npx supabase start -x studio,vector,logflare,imgproxy,supavisor
docker exec supabase_auth_Trib4l env | grep -i captcha
```

Separate commands, not chained — chaining raced during S1 and the stack came up
with the previous configuration.

## Two traps the token creates, and what handles them

**A token is single-use.** Once GoTrue redeems it, it is spent. `/login` and
`/signup` are client components held in place by `useActionState`, so a failed
submit leaves the same spent token in the form and every retry fails until
reload — wrong password once, stuck until refresh. `useCaptchaReset` calls
`turnstile.reset()` after a failed action for exactly this. `/magic-link` and
`/forgot-password` need nothing: their actions redirect, so the widget is
rebuilt.

This one **cannot be reproduced locally or in CI**: the always-passes test
secret verifies the same string repeatedly, so the bug only exists where a real
secret is configured. It is reasoned from Cloudflare's single-use guarantee, not
measured. Worth re-checking by hand once real keys are in staging.

**The token arrives ~2.7 s after page load.** A submit before then gets
`captcha_failed`. All four actions map that code to
`copy.auth.captcha.notCompleted` rather than to a credential error — and on
`/magic-link` and `/forgot-password` it is the one error those actions surface
at all, because the alternative is sending someone to "check your email" for a
message that was never sent.

## The test suites

`[auth.captcha]` being on means anything calling a guarded endpoint in a test
must carry a token:

- `tests/isolation/helpers.ts` exports `TEST_CAPTCHA`; `signInAs` and
  `signUpNewUser` use it. The **admin API is not guarded**, so `createUser`
  needs nothing.
- `tests/e2e/helpers.ts` waits for the real widget's token before submitting —
  which is what a human's typing time supplies for free — and `roleIn()` passes
  a token because it talks to GoTrue directly with no form.
- `tests/isolation/captcha.test.ts` is the file that proves enforcement is real
  rather than configured: all four endpoints refused without a token, and a
  wrong password *with* a valid token still failing as `invalid_credentials`,
  so an enabled captcha is not masking every other auth error.

Separately, S2's rate limiter allows five attempts per address per fifteen
minutes, which the browser suite crosses immediately by signing in as the same
seeded users once per spec. `playwright.config.ts` sets
`AUTH_RATE_LIMIT_DISABLED=1` on its dev server; `lib/auth/rate-limit.ts` ignores
that unless `NODE_ENV` is not `production`, so it cannot open on a deployment.

## Hosted projects

`config.toml` does not reach them. On each of trib4l-staging
(`oxracoamlrogrttwlgyp`) and trib4l-production (`psflzvbpegpehpdoriff`):
Authentication → Attack Protection → enable CAPTCHA, provider Turnstile, paste
that environment's secret. The site key goes in the Vercel environment for the
matching deployment.

Until those dashboard steps are done, **captcha is not enforced on the hosted
projects** no matter what this repo says.
