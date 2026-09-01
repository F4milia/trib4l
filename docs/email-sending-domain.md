# Sending domain, SPF and DKIM

Ferenz 12.1 asks for "Resend + SPF/DKIM + a custom sending domain". Two of
those three are DNS records at a registrar, which no code in this repo can
create. This page is the other half: exactly what to do, in what order, and
what the application does to stop a half-finished setup from shipping quietly.

Nothing here is optional before the first real member receives mail.
In `live` mode, the first attempt to send throws unless step 4 matches step 1 —
so a skipped step fails loudly, once, with a message naming the mismatch,
rather than as unexplained spam-foldering weeks later.

To be exact about when: the check runs inside `sendEmail()`, not at process
start. Nothing validates the configuration at boot, so a misconfigured deploy
comes up healthy and fails on its first invitation. Wiring a startup check is
worth doing when there is a natural place for it; today there isn't one that
does not belong to another session's files.

## 0. Two different domains, and only one of them is the Vercel one

These get conflated constantly, so before anything else:

| | Value | What it is |
|---|---|---|
| **App origin** — `NEXT_PUBLIC_SITE_URL` | `https://f4milia.vercel.app` | Where the app is served, and where a link inside an email points back to. |
| **Sending domain** — `EMAIL_SENDING_DOMAIN` | `f4milia.brandlamb.com` | What appears after the `@` in the `From:` header, and what SPF/DKIM are published for. |

**The sending domain cannot be `f4milia.vercel.app`,** and that is a constraint
rather than a preference. SPF and DKIM are DNS records published on the sending
domain itself, and `*.vercel.app` is Vercel's zone — there is nowhere to put a
`TXT` record for a hostname you do not control. Resend verifies a domain by
reading exactly those records, so it would never verify, and mail claiming to
come from a vercel.app address fails alignment at every receiver.

Nothing is lost by the two differing: members click links on
`f4milia.vercel.app` and receive mail from `f4milia.brandlamb.com`. That is how
nearly every product hosted on a platform domain works.

## 1. The sending domain is already decided

**`f4milia.brandlamb.com`.**

Not a fresh choice — `docs/session-4-checklist.md` recorded it on 22 August
2026, before this session existed: *"chosen to match the existing per-project
subdomain convention already used on this Resend account/Vercel team (e.g.
`signalpath.brandlamb.com`)."* An earlier draft of this page invented
`mail.f4milia.com` instead, which would have sent whoever followed it to
configure a domain nobody had agreed on.

The convention is also the right shape for its own reasons: a subdomain keeps
the sending reputation of transactional mail separate from whatever else the
apex is used for, a future deliverability problem stays contained to one name,
and Resend's DKIM and return-path records do not compete with records the apex
already carries.

**Also from that checklist, and worth knowing before you trust anything:** the
`RESEND_API_KEY` and `EMAIL_FROM_ADDRESS` values already sitting in the Vercel
project *predate this decision and do not correspond to it*. They are not a
working configuration for this domain. Treat the Resend side as unconfigured
until step 3 verifies.

## 2. Add the domain in Resend

If S1's setup has already been done, **this is done — skip to step 4.**
`docs/HOSTED-EMAIL-SETUP.md` covers creating the Resend account and verifying
the domain for Supabase Auth's own mail, and says plainly that E1 "should
inherit the SMTP setup rather than redo it." One verified domain and one API
key serve both: Auth sends through Resend's SMTP endpoint, this module sends
through Resend's API.

Otherwise: Resend dashboard → **Domains** → **Add Domain** → enter
`f4milia.brandlamb.com`, pick the region closest to the Supabase project.

Resend then shows three records. Add all three at the registrar:

| Type | Host | Purpose |
|---|---|---|
| `TXT` | `send.f4milia.brandlamb.com` | **SPF** — names Resend as allowed to send for this domain |
| `TXT` | `resend._domainkey.f4milia.brandlamb.com` | **DKIM** — the public key mail is signed with |
| `MX` | `send.f4milia.brandlamb.com` | return-path, so bounces come back to Resend |

Copy the values from the dashboard verbatim. Do not merge the SPF record into
an existing apex SPF record — it belongs on the subdomain, and an apex SPF with
more than ten lookups silently stops evaluating.

## 3. Verify

Back in Resend, **Verify DNS Records**. Propagation is usually minutes and
occasionally an hour. Verified means all three green; two of three is not
partially working, it is not working.

Check it from outside the dashboard as well, because a registrar that appends
the zone name to an already-qualified host produces a record that looks right
in the UI and does not resolve:

```
dig +short TXT send.f4milia.brandlamb.com
dig +short TXT resend._domainkey.f4milia.brandlamb.com
dig +short MX  send.f4milia.brandlamb.com
```

## 4. Configure the application

```
EMAIL_SENDING_DOMAIN=f4milia.brandlamb.com
EMAIL_FROM_ADDRESS=F4milia <hello@f4milia.brandlamb.com>
EMAIL_DELIVERY_MODE=live
RESEND_API_KEY=re_...

# Not an email setting, but the reason links inside that mail resolve. Set on
# the Vercel project (f4milia_production) for Production. Deliberately NOT set
# for Preview, so a preview deployment's links resolve to that preview rather
# than to production -- which is what S1's PR #28 wanted for auth callbacks.
NEXT_PUBLIC_SITE_URL=https://f4milia.vercel.app
```

`lib/email/config.ts` asserts that the From address's domain **is**
`EMAIL_SENDING_DOMAIN` and throws otherwise. That check exists because Resend
will happily accept a From address on an unverified domain: the mail sends, SPF
and DKIM fail to align, and the result is a deliverability problem that reads
as "our email is unreliable" rather than as a misconfiguration.

## 5. DMARC, once the above is verified

DMARC tells receivers what to do when alignment fails, and gives you reports.
Start at `p=none` so nothing is rejected while you watch:

```
TXT  _dmarc.f4milia.brandlamb.com  "v=DMARC1; p=none; rua=mailto:dmarc@brandlamb.com"
```

Move to `p=quarantine` after the reports come back clean for a couple of weeks.
Do not start at `p=reject`.

## Environment matrix

| Environment | `EMAIL_DELIVERY_MODE` | Effect |
|---|---|---|
| Local dev | unset (→ `dry-run`) | Nothing is sent. `sendEmail()` reports what it would have done. |
| CI | unset (→ `dry-run`) | Same. No test needs a network call to assert a template. |
| Staging | `redirect` | Real Resend delivery, but **every** recipient is rewritten to `EMAIL_TEST_INBOX`. The intended recipient travels in an `X-F4milia-Intended-Recipient` header so a tester can tell whose mail they are reading; the subject is left exactly as a member would see it. |
| Production | `live` | Delivered to the member, from the verified domain. |

`dry-run` is the default when `EMAIL_DELIVERY_MODE` is unset. That is
deliberate, and it is deliberately not inferred from `NODE_ENV`: a preview
deployment and production are both `NODE_ENV=production`, and the failure that
inference produces is real mail to real members from a branch build.

## What is deliberately not in the mail

CLAUDE.md invariant 3: *"NO Family content in any outbound message. Emails and
pushes name the event, never the content. Assume the inbox may be shared."*

This is enforced by construction rather than by scrubbing — the template render
functions take no content parameter, so there is nothing for a caller to pass
and nothing downstream to strip. A subject may say that there is a new Table
entry; it may not say what the entry said. Someone else may be reading over the
member's shoulder, or sharing the mailbox.

## Supabase Auth's own mail — and one redundancy to settle

The password-reset and email-verification messages Supabase Auth sends are
**not** routed through this module. They come from the Auth service directly,
and S1 now owns them end to end: `supabase/templates/recovery.html`,
`confirmation.html`, `magic-link.html` and `email-change.html`, with the SMTP
setup documented in `docs/HOSTED-EMAIL-SETUP.md`.

**So `renderPasswordReset()` in `lib/email/templates` is redundant.** It was
written when S1's templates did not exist yet, on the reasoning that E1's
prompt names "password reset" as one of its four templates and that touching
`[auth.email.smtp]` was another session's file. Both halves were right at the
time; S1 has since filled the gap from its own side, which is the better place
for it — Auth sends that mail, so Auth should own its wording.

Two ways to settle it, and it is a review decision rather than a defect:

- **Delete `renderPasswordReset()`** and let `supabase/templates/recovery.html`
  be the only password-reset copy in the repo. One source of truth, and E1's
  prompt is satisfied in substance by S1 having built it.
- **Keep it** as the template for a future app-sent reset that does not go
  through Supabase Auth. Nothing needs that today.

Whichever way it goes, do not leave both as live copy for the same message —
two templates for one email is how they drift.
