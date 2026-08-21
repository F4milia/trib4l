# Session 4 — Transactional Email

**Status: Skipped, per direct instruction (August 22, 2026).** Not started
— no code, no dependencies installed, no provider account fully configured
for this project. This file exists so the skip is recorded as a deliberate
decision rather than discovered later as a silent gap.

## What was decided before the skip

- Provider: **Resend** (over Postmark).
- Sending domain, if/when this resumes: **`f4milia.brandlamb.com`** — chosen
  to match the existing per-project subdomain convention already used on
  this Resend account/Vercel team (e.g. `signalpath.brandlamb.com`).
- Nothing was created under that domain — the Resend account for this team
  has no domain or API key specific to this project. The `RESEND_API_KEY`
  / `EMAIL_FROM_ADDRESS` values already sitting in Vercel predate this
  decision and don't correspond to it.

## What depends on this, downstream

Nothing currently built breaks without it — Session 3's invitation flow
was deliberately designed to work without email (the invitee just finds
their pending invitation after signing in). But later plan sessions assume
email exists:

- **Session 9 (mentorship)** — mentor pairing notices
- **Session 10 (meetups)** — reminders ("your meetup starts in an hour")
- **Session 14 (checkout)** — receipts
- **Password resets, account confirmation** — currently fall back to
  Supabase's own built-in sender, which is rate-limited and unbranded
  (this is what caused the "email rate limit exceeded" message during
  Session 3 testing)

None of these are blocked from being built — they'd just ship without a
real notification/email step until this session is revisited.

## To resume later

1. Add `f4milia.brandlamb.com` in Resend, get DNS records, add them at
   brandlamb.com's DNS, verify.
2. Create a dedicated Resend API key for this project.
3. Replace the stale `RESEND_API_KEY`/`EMAIL_FROM_ADDRESS` in Vercel.
4. Then the actual build: `lib/email.ts`, templates, wiring into the
   invitation flow, per-org notification preferences, digest scaffolding.
