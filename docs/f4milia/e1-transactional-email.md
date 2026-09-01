# E1 — Transactional email

Session record. Wave 1 · Stream B.

| | |
|---|---|
| **Ran** | 2026-08-31 – 2026-09-01 |
| **Scope** | `F4milia — Complete Run Doc`, Wave 1, Stream B |
| **Conditional** | The prompt runs "only if V1 shows it missing." `docs/v1-repo-audit.md` showed it missing, so E1 ran and W1 did not |
| **Delivered** | 9 PRs, `#18`–`#26`, plus `#32` re-landing content stranded from `#20` |
| **E1's own assertions** | 34 unit · 7 isolation · 37 pgTAP (`060` 11, `070` 26) |
| **Suites on `main` at close** | 988 unit · 135 isolation · 297 pgTAP across 13 files |
| **Status** | **Sending infrastructure complete and merged. Three of four templates have no sender**, and the headline acceptance criterion is not yet demonstrable — see §6 |

---

## 1. What was asked

> Resend, with SPF/DKIM and a custom sending domain. Templates: Family invite,
> Family Night digest, Vow notification, password reset. Message content carries
> no Table entry text — subject and body name the event, never the content.
> Assume the inbox may be shared.
>
> Per-Family notification preferences: a member in three Families sets
> preferences per Family, not one global mute.
>
> **Acceptance:** each template renders and delivers in staging (test mode —
> staging never sends real mail). A member with Family A muted and Family B
> unmuted receives exactly B's digest. No Table entry text appears in any message
> body — grep the templates to confirm.

## 2. What shipped

| PR | What |
|---|---|
| **#18** | Family-level `table_prompt_time` and `timezone`, with an IANA check |
| **#19** | `notification_preferences` — the per-Family table, its enums, and the re-membership reset trigger |
| **#20** | Isolation coverage for those preferences |
| **#21** | Resend dependency, the five email env vars, and `docs/email-sending-domain.md` |
| **#22** | `readEmailConfig()` and the SPF/DKIM alignment check |
| **#23** | `sendEmail()` with three delivery modes |
| **#24** | Per-Family preference resolution for the send path |
| **#25** | The four templates, and the invariant-3 test |
| **#26** | The invite send, with a rate limit on it |
| **#32** | Re-land of #20's isolation tests — see §8 for why they went missing |

## 3. The decisions worth remembering

**Invariant 3 is enforced structurally, not by scrubbing.** The prompt says
"grep the templates to confirm" — a grep only finds the content a test thought
of. Instead, no render function *has* a free-text parameter. Every argument is a
URL or a closed literal union, so there is no slot a Table entry could be poured
into. `templates.test.ts` reads the **source** of `templates/index.ts`, extracts
every `export function render*(args: {…})` signature, and fails on any field
typed `string` whose name does not end in `Url`. It also asserts that all four
templates were seen, because a regex that silently matches nothing would
otherwise pass while asserting about an empty set.

Two more source-level assertions close the other routes: no template literal
with interpolation anywhere in the file (`` /`[^`]*\$\{/ ``), and a URL carrying
markup comes back escaped rather than rendered.

**Absence of a row means subscribed.** The alternative — seeding a row per
(member × type × channel) on join — makes every new notification type a
backfill, and makes "has this member chosen?" unanswerable. A row exists only
where somebody expressed a choice.

**`org_id` is part of the key, not a column on `profiles`.** That is the entire
reason the table exists rather than a `notify_email boolean` on the profile.
Invariant 3's "never one global mute" is a schema property here, not a rule the
UI is trusted to honour.

**Two notification types, and the two exclusions are deliberate.**
`family_night_digest` and `vow_notification`. A **family invite** is excluded
because the recipient is not a member yet, so there is no per-Family preference
to consult. **Password reset** is excluded because it is account security, never
optional. N1 extends the enum; inventing values for features with no schema yet
is exactly what CLAUDE.md rules out.

**`notification_channel` has one value, `email`, and exists anyway.** So that N1
adds an enum value rather than adding a column to a populated table and
rebuilding its unique key. N1's own acceptance ("a muted type does not deliver —
in-app or push") needs that axis to already be there.

**The re-membership reset had to be a trigger.** `accept_invitation()` re-uses
the existing membership row on re-invite (`on conflict … do update set
deleted_at = null`), so a preference keyed on `(org_id, profile_id)` survives a
removal and re-applies months later — a member who muted the digest during a hard
week, left, came back, and quietly never hears from their Family again. There is
also no member-removal action in `app/actions` yet, so there was no code path to
add a step to. Both attachments exist: soft removal (the shape every path
actually uses) and hard delete (which must not depend on that staying true).

**Three delivery modes, and `dry-run` is the default.** `dry-run` sends nothing
and reports what it would have done; `redirect` sends everything to
`EMAIL_TEST_INBOX` with an `X-Intended-Recipient` header, which is how "delivers
in staging" and "staging never sends real mail" are both true at once; `live`
sends. A header rather than a subject prefix, because the subject is one of the
things under test and must render exactly as a member would see it.

**Domain alignment is checked, not documented.** In `live` mode,
`EMAIL_FROM_ADDRESS`'s domain must equal `EMAIL_SENDING_DOMAIN`, or SPF and DKIM
do not align and mail is filed as spam by recipients who never see it. A
mismatch throws rather than sends.

**`notification_preference_enabled()` is `service_role` EXECUTE only.** It is
SECURITY DEFINER and will answer for any member, so granting `authenticated`
would have contradicted the "a mute is private" RLS decision made in the same
migration. Caught in review of my own PR — see §4.

## 4. Things that were measured, and what each one changed

Every item below was found by running something.

**A pgTAP probe that passed on luck.** `070` picked a seed row with `order by
created_at limit 1`, but `audit_log.created_at` defaults to `now()`, which is
*transaction* time — every row written in one transaction shares a timestamp, so
the probe chose Alice or Bob arbitrarily. The isolation suite leaves a preference
row on Alice, so `count(*) = 1` passed from a fresh reset and failed when pgTAP
ran second. **CI resets first, so CI would have stayed green indefinitely.** Fixed
with `order by profile_id` and a delete-first.

**I granted `authenticated` EXECUTE on a definer function that answers for
anyone.** In the same migration that decided a mute is private. Restricted to
`service_role`. The lesson is that a `grant` line and a `create policy` line
were reviewed as separate things when they are one decision.

**The domain check does not "refuse to start."** I wrote that in a runbook, a
code comment, and a PR body. It throws on the first `sendEmail()` call —
`readEmailConfig()` is not invoked at boot. Corrected in all three places.

**The Family member cap blocked the manual QA I had just written.** Isolation
debris left `caregiver-circle` holding 16 counted members against a cap of 12, so
the invite step in E1's own QA table could not be run. Cleared by `db reset`. I
also miscounted 16 as 688 first, from a cross-join.

**Migration timestamps collided with Stream A's.** Both streams counted upward
from `20260903` in hundreds, and `100101` / `100201` / `100301` each existed
twice. `version` is the **primary key** of `supabase_migrations.schema_migrations`
and *is* the timestamp prefix, so the merged branch could not `db reset` at all.
Neither branch showed it alone. Renumbered to `x11`/`x12` in `#55`.

**Enabling captcha on `main` broke E1's and H1's isolation tests.** They predate
it and signed in with no token. Nine cases in `support-requests.test.ts` failed on
the merged tree only. A `config.toml` change is a cross-stream API change; a clean
text merge proves nothing.

## 5. How it was verified

- **34 unit assertions** across five files — config parsing and its refusals,
  transport in all three modes, preference resolution, the rate limiter, and the
  templates.
- **The invariant-3 test asserts a property of the source**, not of one rendered
  output (§3). Three separate routes closed: no free-text parameter, no
  interpolation in the file, and markup in a URL comes back escaped.
- **The design system is asserted per template** — Parchment ground, Deep Slate
  ink, exactly **one** occurrence of Terracotta (more than one means it has
  started being used as decoration), and `border-radius` absent entirely, since
  in an email there is no stylesheet to override it from.
- **The three Vow events are asserted to be three different messages**, not one
  with a variable in it — which is what invariant 3 would look like if it were
  being quietly worked around.
- **7 isolation assertions** against real GoTrue sessions and real RLS,
  including the dual-Family fixture.
- **37 pgTAP assertions** across `060` and `070`.
- **The named edge case was tested by hand, by James**, on the merged branch:
  remove a member, re-invite, confirm the old mute row is gone and defaults are
  fresh.
- **Every PR carries a manual-QA table** — one table, plain steps, expected
  result per row.

## 6. What is not satisfied

**Three of four templates have no sender.** Only `renderFamilyInvite` has a call
site. `renderFamilyNightDigest`, `renderVowNotification` and
`renderPasswordReset` render, are tested, and are wired to nothing. The first two
are **structurally blocked**: the digest needs `table_entries` and the Vow
notification needs `vows`, neither of which exists yet (schema PRs 5 and 6). This
is a sequencing consequence, not an oversight.

**`filterByPreference()` has zero callers.** It is built and unit-tested, but the
only sender is the invite, which correctly does not consult preferences. So E1's
headline acceptance — *"a member with Family A muted and Family B unmuted
receives exactly B's digest"* — **cannot currently be demonstrated end to end.**
The preference logic is proven at the unit and RLS layers only.

**There is no preferences UI.** Nothing under `app/settings/` writes
`notification_preferences`. A member cannot set a mute through the product. Not
blocked by anything — this is Stream B work that was not in E1's PR plan.

**Nothing has been delivered, anywhere.** "Each template renders and delivers in
staging" is half-met: rendering is asserted, delivery is not. The five env vars
are placeholders in `.env.example`, the Resend domain is unverified, and no
hosted project has them set. Runbook: `docs/email-sending-domain.md`.

**`EMAIL_DELIVERY_MODE` unset resolves to `dry-run`.** Good for local and CI —
an unconfigured environment reports rather than sends. **Bad in production:** a
deploy that forgets the variable silently drops every message while the UI
reports success, because `app/actions/invitations.ts` ignores `sendEmail()`'s
`SendOutcome`. Raised by CodeRabbit on `#57` and confirmed against the code. The
per-call-site fix treats one of N callers; the structural fix is refusing
`dry-run` when `NODE_ENV` is production.

**The password-reset path is undecided.** GoTrue sends password-reset mail itself
from its own templates. Routing it through Resend means configuring Supabase Auth
SMTP — a dashboard and `config.toml` concern — not calling our transport. E1
shipped the template; which system actually sends it was never settled.

## 7. Carried forward

- **`SendOutcome`'s `suppressed-by-preference` variant is unreachable.** It is
  declared in the union but `sendEmail()` never returns it — preference filtering
  lives in `lib/email/preferences.ts` and is applied by callers. Either wire it
  or drop the variant; a union member that cannot occur will be read as dead
  reasoning by the next person.
- **The rate limiter is invite-only.** `assertInviteRateLimitNotExceeded()` is
  specific to one send. Invariant 7 wants a limit on everything that sends, so
  the digest and Vow senders need their own or a generalisation.
- **The email runbook is split across two files** —
  `docs/HOSTED-EMAIL-SETUP.md` (Resend account, domain verification) and
  `docs/email-sending-domain.md` (which env var means what, and why). They
  cross-reference each other rather than duplicating, so this is a division of
  labour, not a redundancy — but there is no single entry point that says "start
  here", and the second is the wrong door to walk through first.
- **The sending domain changed twice mid-session** — `mail.f4milia.com`
  (invented), then `f4milia.brandlamb.com` (already recorded in
  `docs/session-4-checklist.md`), then `send.f4milia.com` on a fresh Resend
  account, because `f4milia.com`'s apex SPF is live for Google Workspace.
  The last is the current answer; check the runbook rather than this paragraph.

## 8. Two operational lessons

**`git add -A` swept untracked reference docs into E1's commits three times**, and
once actually committed them before being amended out with `git rm --cached`.
Two large prompt documents were in the working tree for reference only and were
never meant to be tracked. The fix is boring and absolute: **stage explicit
paths, never `-A`**, in a worktree that shares a directory with anything
untracked and unwanted.

**Deleting a merged branch closed an unrelated open PR.** `--delete-branch` on
`#45` auto-closed `#22`, because a PR closes when its base branch is deleted —
and a closed PR cannot be retargeted. Recovery was pushing the merge commit's
second parent back as a branch, reopening, and retargeting. The rule adopted for
the rest of the session: **retarget first, merge second, delete nothing.**

**A stacked PR merged into its own parent reaches no trunk, and it looks like
success.** `#20` merged cleanly into `e1/notification-preferences-schema` — after
that branch had already been merged upward. GitHub reported a merge, the PR shows
`MERGED` to this day, and the content was simply not anywhere it mattered. It had
to be re-landed as `#32`.

**This recurred at the end of the session, in the schema stack**: `#59`, `#60`
and `#61` each merged into their stack parent minutes after that parent had gone
up, leaving `towers`, `builds` and `bricks` stranded in `schema/builds` while
`main` had only `ledger_events`. Twice is a pattern, so it is written down here
rather than remembered:

> In a stack, merge **bottom-up and one at a time**, confirming each lands on the
> trunk before opening the next merge. A green "Merged" badge says the base
> branch accepted the commit — it says nothing about whether the base branch
> still leads anywhere. Verify with containment (`git merge-base --is-ancestor`),
> never with the badge.
