# QA — C2-PR4 · Reactions and mentions in the room

Preview URL: <filled by dev from the PR>
Fixtures used: `alice@f4milia.test`, `bob@f4milia.test` (both Caregiver Circle).

## Primary check

Reactions and @mentions are now live in the Family channel. The parts a human
adds here are the two an automated test cannot reach: **the keyboard path
through the mention list**, and **whether a notification actually arrives for
the mentioned person**.

Two browsers side by side, or one plus a private window:

1. Sign in as `alice@f4milia.test` (A) and `bob@f4milia.test` (B). Both open
   Caregiver Circle → the Family channel.
2. In A, click **+** under any message, then pick 👍.
   **Expect:** a 👍 1 count appears with a **terracotta border** — the border is
   how "you reacted" is shown.
3. In B, reload. Click the same 👍 count.
   **Expect:** it becomes 👍 2. B's copy now has the terracotta border; A's
   still does too.
4. In A, click the 👍 count again.
   **Expect:** back to 👍 1, and A's border is no longer terracotta.
5. Tab to a reaction count with the **keyboard only**.
   **Expect:** a visible focus outline. Press Space or Enter.
   **Expect:** the count toggles. **Never remove focus styling** — with zero
   radius, the outline is the only affordance.
6. In A's composer type `@` (with a space before it).
   **Expect:** the member list opens above the composer, showing Bob but
   **not Alice** — you are not offered to yourself.
7. Press **↓** then **Enter**.
   **Expect:** `@Bob ` is inserted and **the message is NOT sent**. This is the
   step most likely to regress.
8. Type `hello` and press **Enter**.
   **Expect:** now it sends. B sees it live.
9. In A, type `write to bob@f4milia.test` and watch the composer.
   **Expect:** **no list opens** — an email address mid-word is not a mention.
10. In A, type `@` again, then press **Escape**.
    **Expect:** the list closes and the text you typed is **still there**.
11. As B, look for the notification the step-8 mention created (there is no
    notification UI yet — check via Studio: `select * from notifications` for
    Bob's membership).
    **Expect:** exactly one row, type `mention`, **carrying no message text**.

## Regression (previous two sessions)

- [ ] `#118` data access: sending, editing and deleting a message still work,
      and still reach the other browser live.
- [ ] `#110` storage: the `family-attachments` bucket is still private.
- [ ] `#108` Realtime Authorization: typing indicators still appear between
      participants.

## Result

- [ ] All pass
- Failures → issue links:
- Loom:
- Executed by / at:

---

**Do not improvise extra checks.** If something obvious is missing, that is a
note for this template, not for this run.
