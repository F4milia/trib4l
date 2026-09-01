# QA fixtures

The named accounts from `docs/qa-previous-session-sop.md` prerequisite 2, as
actually seeded. A QA step cites one by email and gets the state below without
setting anything up.

Password for all of them: `password123`, same as the rest of `supabase/seed.sql`.

| Email | State it is in | Lives in |
|---|---|---|
| `dual@f4milia.test` | Member of two Families, with **different** Tower, streak and Vow in each. Owns QA Family A | qa-family-a, qa-family-b |
| `second@f4milia.test` | Joined QA Family A, did **not** create it. Plain `member` | qa-family-a |
| `blocker@f4milia.test` | Has blocked `blocked@` | qa-family-a |
| `blocked@f4milia.test` | Has written two Table entries, hidden from `blocker@` **only** | qa-family-a |
| `departed@f4milia.test` | Left mid-Build. Their two open Bricks reverted to open and unassigned; the one they finished is still attributed to them | qa-family-a (soft-deleted) |
| `memorial@f4milia.test` | Memorial-locked. Entries stay **visible** and stop being editable | qa-family-a |
| `orphan@f4milia.test` | Signed up, belongs to nothing at all | — |
| `staff1@f4milia.test` | `platform_staff`, **with a verified TOTP factor already seeded** | — |
| `staff2@f4milia.test` | Same. Two, per invariant 3 — never just one | — |

## Signing in as staff

Invariant 7 enforces two-factor for `platform_staff` at sign-in, so a staff
fixture is useless without a factor. Both staff accounts carry one already, so
no enrolment is needed after a reset. Add this secret to any TOTP app:

```
JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP
```

In a test, `QA_TOTP_SECRET` is exported from `tests/isolation/helpers.ts`.

## Why they are in their own Families

`caregiver-circle`, `founder-collective` and `wellness-guild` have their member
counts, streaks and Tower titles asserted across 27 isolation files and
`180_seed_domain_data.sql`. Putting a departed member or a memorial lock into
one of them would perturb assertions that exist to catch real regressions —
and every future QA fixture would perturb them again. `qa-family-a` and
`qa-family-b` are separate so the two fixture sets cannot interfere.

The three original Families remain the fixtures for **isolation** tests; these
two are the fixtures for **manual QA**.

## What keeps them honest

Every state above is the result of a transition — a soft delete, a block, a
memorial lock — not a column somebody typed. Seeding an end state directly
would leave the emails intact and the states wrong, and a QA doc would then
verify nothing while looking like it had.

- `supabase/tests/database/190_qa_fixtures.sql` — 20 assertions, one per claim
  in the table above. Runs in the normal pgTAP suite.
- `tests/isolation/qa-fixtures.test.ts` — proves they are *usable*, not just
  present: that `staff1@` actually reaches aal2 with the seeded secret, that
  `blocker@` really cannot see `blocked@`'s entries while another member can,
  and that `dual@`'s two Families genuinely differ.

## Not done yet

Prerequisites 1, 3 and 4 of the SOP are untouched by this: per-PR preview
deploys, the PR template's QA block, and the `qa-gate` workflow. There is also
no nightly staging reset — these fixtures exist in `supabase/seed.sql`, so they
appear wherever that seed is applied, and nothing yet applies it to staging on
a schedule.
