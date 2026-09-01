# QA — <SESSION_ID> <session name>

Copy this file to `docs/qa/<SESSION_ID>.md` at the END of the session that
built the work, before opening the PR. It is executed by a human during the
NEXT session's run. See `docs/qa-previous-session-sop.md`.

**Hard cap: 15 numbered steps.** If execution takes more than 30 minutes, the
doc is too long — that is the SOP's own failure signal, not a reason to hurry.

Preview URL: <filled by dev from the PR>
Fixtures used: <only named seed fixtures — see the SOP's prerequisite 2>

## Primary check (from the wave table)

<one line: the session's "Manual Verification Focus" / named edge case, verbatim>

1. Log in as `dual@f4milia.test`. Open Family A → Chat.
   **Expect:** only Family A conversations listed. No Family B names anywhere.
2. Switch to Family B.
   **Expect:** …

## Regression (previous two sessions)

Two or three behaviours most likely to have been disturbed by this change.

- [ ] S2: sign-out-everywhere still terminates the second browser session
- [ ] E1: preference toggle survives leave + rejoin

## Result

- [ ] All pass
- Failures → issue links:
- Loom:
- Executed by / at:

---

**Do not improvise extra checks.** If something obvious is missing, that is a
note for this template, not for this run — the SOP works because execution
requires no judgment about *what* to test.
