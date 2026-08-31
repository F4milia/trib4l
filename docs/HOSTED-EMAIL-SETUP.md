# Sending real email from a deployed environment

What has to be configured outside this repo before auth email works anywhere
but a developer's laptop, and why none of it is automatic.

| | |
|---|---|
| **Verified** | 2026-08-31 against Supabase and Resend's live docs |
| **Applies to** | any hosted Supabase project — staging, production, Vercel previews |
| **Status** | **not done** — no project is linked, nothing pushes config |

---

## 1. Why a deployed build sends nothing today

**`supabase/config.toml` and `supabase/templates/` configure the local stack
only.** They are read by `supabase start`. Nothing in this repo pushes them to
a hosted project — there is no `supabase link`, and no `config push` in CI.

So on a hosted project, until the steps below are done:

| | Local | Hosted, unconfigured |
|---|---|---|
| Mail goes to | **Mailpit**, `:54324` | Supabase's built-in SMTP |
| Who can receive | anyone | **only your project team** — everyone else is silently rejected |
| Rate | unlimited | **2 per hour** |
| `enable_confirmations` | from `config.toml` | whatever the dashboard says |
| Our templates | used | **not present** — GoTrue sends its own default |

Supabase states plainly that the built-in service is *"not meant for production
use"*. That is why a Vercel deployment appeared to send nothing: the address
was not on the team.

The template gap matters most. GoTrue's default confirmation email links to
`/auth/v1/verify`, not to this app's `/auth/confirm` route — so even a
delivered message would land somewhere nothing handles.

## 2. One-time setup

**a. Resend — the sending domain.** Create the account, add your domain, and
publish the SPF/DKIM DNS records it gives you. Until the domain verifies,
Resend also only sends to your own address. This is the only step with an
unpredictable wait, so start it first.

Free tier: **3,000 emails/month, 100/day, 3 domains** — comfortably enough for
Families of 8–12. Pro is $20/mo for 50,000 if the daily cap ever bites.

**b. Supabase → Project Settings → Authentication → SMTP.** Enable custom SMTP:

```
host:     smtp.resend.com
port:     587
username: resend
password: <your Resend API key>
sender:   an address on the verified domain
```

This is the step that lifts "team members only, 2 per hour". Configuring it
costs nothing on any Supabase plan.

**c. Auth → Rate Limits.** Supabase imposes 30/hour on a newly configured
custom SMTP as a reputation guard. Raise it to suit.

**d. Auth → URL Configuration.**

- **Site URL** — the production domain.
- **Redirect URLs** — must include every origin that sends mail:
  ```
  https://<production-domain>/**
  https://*-<team>.vercel.app/**     ← preview deployments
  ```
  **Include the path wildcard.** Measured 2026-08-31: a redirect is matched
  against this list, and a URL that does not match is **silently replaced by
  the Site URL** with no error — the link still arrives, pointing at the wrong
  place.

**e. Templates.** `supabase link` then `supabase config push`, or paste the
four files from `supabase/templates/` into the dashboard. Do this **after all
four have merged**, so one push carries the whole set.

**f. Vercel env.** Set `NEXT_PUBLIC_SITE_URL` to the production origin. Leave
it unset on preview deployments so each preview uses its own origin.

## 3. How a link finds its way back

Every emailed link is built from `{{ .RedirectTo }}`, which renders whatever
the app passed as `emailRedirectTo` — `<origin>/auth/confirm`, derived per
request in `lib/auth/providers.ts`.

That is what makes preview deployments work. `{{ .SiteURL }}` is **one fixed
value per project**, so a template hardcoding it would send every preview's
mail to production.

Two behaviours worth knowing, both measured rather than assumed:

- **A bare origin is not accepted.** `http://localhost:3000` fails the
  allow-list even when `http://localhost:3000/**` is on it; the wildcard does
  not match a pathless URL. This is why the app sends the full `/auth/confirm`
  route rather than an origin.
- **`{{ .RedirectTo }}` is never empty.** With no redirect supplied, GoTrue
  substitutes the Site URL — a bare origin — and the link loses its path. A
  `{{ if .RedirectTo }}` fallback cannot help, because the value is never
  falsy. The guard is instead that all four emailed flows pass a redirect,
  asserted in `tests/auth-redirect.test.ts`.

## 4. What to check once it is set up

| # | Do this | You should see |
|---|---|---|
| 1 | Sign up on the deployed URL with a real address **not on your Supabase team** | The email arrives |
| 2 | Check the sender | Your verified domain, not `supabase.io` |
| 3 | Read the link's host | The deployment you signed up on — a preview URL if that is where you were |
| 4 | Read the link's path | `/auth/confirm`, **not** `/auth/v1/verify`. The latter means the templates were never pushed. |
| 5 | Click it | Signed in on that same deployment |
| 6 | Repeat on a **preview** deployment | The link points at the preview, not production |

## 5. Related

- `docs/GREPTILE-CONFIG.md` — same shape of problem: repo config that no hosted
  system reads.
- **E1** (Wave 1, Stream B) owns transactional email properly — Family invites,
  Family Night digests, Vow notifications, per-Family preferences. This
  document covers only the auth mail S1 produces, and E1 should inherit the
  SMTP setup rather than redo it.
