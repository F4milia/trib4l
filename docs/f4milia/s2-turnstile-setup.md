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

**Local and CI: Cloudflare's published test keys.** They need no account and no
network round trip to a real site key. From Cloudflare's Turnstile
documentation — **verify against their current page before relying on them**,
and see the note below on which pair has actually been exercised here:

| Purpose | Site key | Secret key |
|---|---|---|
| Always passes, invisible | `1x00000000000000000000BB` | `1x0000000000000000000000000000000AA` |
| Always blocks | `2x00000000000000000000AB` | `2x0000000000000000000000000000000AA` |
| Forces an interactive challenge | `3x00000000000000000000FF` | — |

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

## Hosted projects

`config.toml` does not reach them. On each of trib4l-staging
(`oxracoamlrogrttwlgyp`) and trib4l-production (`psflzvbpegpehpdoriff`):
Authentication → Attack Protection → enable CAPTCHA, provider Turnstile, paste
that environment's secret. The site key goes in the Vercel environment for the
matching deployment.

Until those dashboard steps are done, **captcha is not enforced on the hosted
projects** no matter what this repo says.
