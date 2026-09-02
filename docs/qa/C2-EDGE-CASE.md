# QA — C2 named edge case · a block stops the notification, not the mention

> **B @mentions A after A blocked B — no notification reaches A; the room is
> unaffected.**

Preview URL: <filled by dev from the PR>
Fixtures used: `blocker@f4milia.test`, `blocked@f4milia.test`,
`second@f4milia.test` — all in **qa-family-a**.

**Loom this one.** It is C2's named edge case and the only one whose failure is
invisible from inside the app: a notification that should not exist looks
exactly like one that was never created.

## Who is who — read this before starting

The names are the wrong way round from what the sentence suggests, and getting
them backwards makes the test pass for the wrong reason.

| Role in the edge case | Account | Display name | Why |
|---|---|---|---|
| **A** — did the blocking, must NOT be notified | `blocker@f4milia.test` | **Blocker** | A blocked B |
| **B** — was blocked, does the mentioning | `blocked@f4milia.test` | **Blocked** | B mentions A |
| **C** — neither, the control | `second@f4milia.test` | **Second Member** | Proves the trigger fires at all |

The suppression is **the mentioned member having blocked the author**. B blocking
A would *not* suppress anything — B choosing not to see A says nothing about what
A may receive.

## Steps

Three browser windows (or two plus a private window). Studio at
`http://localhost:54323` for steps 7 and 10.

1. Sign in as `blocked@f4milia.test` (**B**) and open **qa-family-a → Messages →
   Everyone**.
2. In the composer type `@Bl`.
   **Expect:** the member list opens showing **Blocker**. B can still mention A —
   a block hides B's content *from A*, it does not hide A *from B*.
3. Press **↓**/**Enter** or click **Blocker**.
   **Expect:** `@Blocker ` is inserted and **nothing is sent yet**.
4. Type `are you free Tuesday` and send.
   **Expect:** the message appears in B's own room.
5. In a second window sign in as `second@f4milia.test` (**C**) and open the same
   room.
   **Expect:** C sees B's message **in full, with `@Blocker` in the text**.
   *This is the "room is unaffected" half — the message really does contain the
   mention, and everyone else sees it.*
6. In a third window sign in as `blocker@f4milia.test` (**A**) and open the same
   room.
   **Expect:** A does **not** see B's message at all. That is the pre-existing
   block working (invariant 6), not this edge case — note it and move on.
7. In Studio → SQL Editor, run:
   ```sql
   select n.id, n.type, n.created_at
     from notifications n
     join memberships m on m.id = n.membership_id
     join auth.users u on u.id = m.profile_id
    where u.email = 'blocker@f4milia.test';
   ```
   **Expect: zero rows.** *This is the edge case.* No notification was created
   for A, so N1 has nothing to turn into an email or a push later.

**Now the control — without it, step 7 proves nothing.** Zero rows is also what a
completely broken trigger produces.

8. Back in **B**'s window, send a second message mentioning **`@Second Member`**
   (type `@Sec`, pick from the list, add any text, send).
9. In **C**'s window.
   **Expect:** C sees the message.
10. In Studio, run:
    ```sql
    select n.id, n.type, n.target_type, n.created_at
      from notifications n
      join memberships m on m.id = n.membership_id
      join auth.users u on u.id = m.profile_id
     where u.email = 'second@f4milia.test';
    ```
    **Expect: exactly one row**, `type = 'mention'`, `target_type = 'message'`.
    *So the trigger does fire — which means step 7's zero is the block, not a
    broken feature.*
11. Look at the columns returned in step 10.
    **Expect:** no message text anywhere in the row — a type, a target and ids
    only. Invariant 3: N1 renders pushes from this row, and a lock screen may be
    someone else's.

## Result

- [ ] Step 7 returned zero rows
- [ ] Step 10 returned exactly one row
- [ ] Step 5 showed the mention intact to a third member
- [ ] Loom:
- [ ] Executed by / at:

## If step 7 returns a row

The block check in `20260903101604_message_mentions.sql`'s
`notify_mentioned_member()` did not fire. Check the direction first: it
suppresses when `blocker_membership_id` is the **mentioned** member and
`blocked_membership_id` is the **author**. Inverting those two is the failure
this test exists to catch, and it passes every other assertion in the suite.

---

**Do not improvise extra checks.** If something obvious is missing, that is a
note for this template, not for this run.
