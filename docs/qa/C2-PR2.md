# QA — C2-PR2 · Schema: threading, notifications, mentions, reactions, attachments

Preview URL: <filled by dev from the PR>
Fixtures used: none — this PR ships schema only. There is no UI on it yet; C2
PR 4 builds that.

## Primary check

**This PR has no user-visible surface**, so the human check is a regression
check: five migrations, four new tables and a new column on `messages` must not
have disturbed the chat that already works. The named edge case (a block
suppressing a mention notification) is asserted in
`supabase/tests/database/230_notifications_and_mentions.sql` and is not
executable by hand until PR 4 renders mentions.

Two browsers, or one plus a private window:

1. Sign in as `alice@f4milia.test` (A) and `bob@f4milia.test` (B). Both open
   Caregiver Circle → the Family channel.
   **Expect:** the full message history loads in both.
2. A sends a message.
   **Expect:** it appears in B without a refresh. (`messages` gained a column
   and a BEFORE trigger; a trigger that rejected ordinary inserts would show
   here first.)
3. B replies with a normal message.
   **Expect:** it appears in A without a refresh.
4. A edits a message; then A deletes it.
   **Expect:** both changes reach B live.
5. A opens a DM with B and sends one message.
   **Expect:** delivered. DMs and the Family channel take different paths
   through `is_conversation_participant()`.
6. Open the browser console in both. Filter for errors.
   **Expect:** nothing new — in particular no error naming `parent_message_id`,
   `notifications`, or a missing relation.
7. Sign in as `carol@f4milia.test` (Founder Collective only) in a third window.
   Open her Family channel and send a message.
   **Expect:** it works, and nothing from Caregiver Circle is visible anywhere.

## Regression (previous two sessions)

- [ ] `#108` Realtime Authorization: typing indicators still appear between
      participants (step 2's window). The join policy is unchanged here, but
      every one of these tables sits behind the same participant check.
- [ ] `#107` PWA: the service worker still registers (DevTools → Application).
- [ ] `#106` definer functions: `dual@f4milia.test` sees only their own Family's
      data in each Family — `is_conversation_participant()` is called by four
      new policies in this PR.

## Result

- [ ] All pass
- Failures → issue links:
- Loom:
- Executed by / at:

---

**Do not improvise extra checks.** If something obvious is missing, that is a
note for this template, not for this run.
