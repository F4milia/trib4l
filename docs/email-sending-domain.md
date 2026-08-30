# Sending domain, SPF and DKIM

Ferenz 12.1 asks for "Resend + SPF/DKIM + a custom sending domain". Two of
those three are DNS records at a registrar, which no code in this repo can
create. This page is the other half: exactly what to do, in what order, and
what the application does to stop a half-finished setup from shipping quietly.

Nothing here is optional before the first real member receives mail.
`EMAIL_DELIVERY_MODE=live` refuses to start unless step 4 matches step 1, so a
skipped step fails loudly at boot rather than as unexplained spam-foldering
weeks later.

## 1. Pick a subdomain, not the apex

Send from `mail.f4milia.com`, not `f4milia.com`.

A subdomain keeps the sending reputation of transactional mail separate from
whatever else the apex is used for, and a future deliverability problem stays
contained to one name. It also means Resend's DKIM and return-path records do
not compete with records the apex already carries.

## 2. Add the domain in Resend

Resend dashboard → **Domains** → **Add Domain** → enter the subdomain, pick the
region closest to the Supabase project.

Resend then shows three records. Add all three at the registrar:

| Type | Host | Purpose |
|---|---|---|
| `TXT` | `send.mail.f4milia.com` | **SPF** — names Resend as allowed to send for this domain |
| `TXT` | `resend._domainkey.mail.f4milia.com` | **DKIM** — the public key mail is signed with |
| `MX` | `send.mail.f4milia.com` | return-path, so bounces come back to Resend |

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
dig +short TXT send.mail.f4milia.com
dig +short TXT resend._domainkey.mail.f4milia.com
dig +short MX  send.mail.f4milia.com
```

## 4. Configure the application

```
EMAIL_SENDING_DOMAIN=mail.f4milia.com
EMAIL_FROM_ADDRESS=F4milia <hello@mail.f4milia.com>
EMAIL_DELIVERY_MODE=live
RESEND_API_KEY=re_...
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
TXT  _dmarc.mail.f4milia.com  "v=DMARC1; p=none; rua=mailto:dmarc@f4milia.com"
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

## Supabase Auth's own mail

The password-reset and email-verification messages Supabase Auth sends are
**not** routed through this module. They come from the Auth service directly,
configured in `supabase/config.toml` under `[auth.email.smtp]`, which is Stream
A's surface (S1 built those flows, S2 hardens them). Pointing Auth at the same
verified domain is a one-time config change owed there; the reset template in
`lib/email/templates` renders the same content for parity but is not wired to
Auth by this session.
