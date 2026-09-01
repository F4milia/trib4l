# QA — C2-PR1 · Realtime Authorization

Preview URL: <filled by dev from the PR>
Fixtures used: `alice@f4milia.test`, `bob@f4milia.test` (Caregiver Circle),
`carol@f4milia.test` (Founder Collective only).

## Primary check

A typing indicator must still work between participants, and the live message
stream must not have gone silent. The refusal itself is covered by
`tests/isolation/conversations-broadcast-authorization.test.ts`; what a human
needs to confirm is that **nothing legitimate broke**, because the failure mode
of this change is a room that looks fine and stops updating.

Two browsers side by side, or one plus a private window:

1. Sign in as `alice@f4milia.test` in browser A and `bob@f4milia.test` in
   browser B. Both open Caregiver Circle → the Family channel.
   **Expect:** both see the same message history.
2. In browser A, start typing in the composer. Do not send.
   **Expect:** browser B shows Alice's typing indicator within ~1 second.
3. Stop typing in A and wait 5 seconds.
   **Expect:** the indicator disappears in B.
4. In browser A, send a message.
   **Expect:** it appears in browser B **without a refresh**, within ~1 second.
5. In browser B, send a reply.
   **Expect:** it appears in browser A without a refresh. (Both directions —
   the send policy is separate from the join policy, and only this step
   exercises B's.)
6. In browser A, edit the message sent in step 4.
   **Expect:** browser B shows the edit without a refresh.
7. In browser A, delete that message.
   **Expect:** it disappears from browser B without a refresh.
8. Open the browser console in B. Filter for `CHANNEL_ERROR`.
   **Expect:** nothing. A participant must never see a refused join.
9. In browser B, open a DM with Alice and repeat steps 2 and 4 inside it.
   **Expect:** typing and messages both live. DMs use the same channel shape as
   the Family channel and are the case most likely to differ.
10. Sign out in browser B, sign back in, reopen the Family channel, and have A
    send one more message.
    **Expect:** it arrives live. A fresh JWT must still satisfy the join policy.

## Regression (previous two sessions)

- [ ] `#107` PWA: the app still loads and the service worker still registers
      (DevTools → Application → Service Workers shows `sw.js` activated).
- [ ] `#106` definer functions: `dual@f4milia.test` sees only their own Family's
      data in each Family. `is_conversation_participant()` is called by the new
      policy and `is_org_member()` was altered last session.
- [ ] `#103` Sentry: no console error about a missing DSN on load.

## Result

- [ ] All pass
- Failures → issue links:
- Loom:
- Executed by / at:

---

**Do not improvise extra checks.** If something obvious is missing, that is a
note for this template, not for this run.
