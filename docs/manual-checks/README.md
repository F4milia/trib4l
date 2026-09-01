# Manual checks

**Not under `supabase/tests/`, and that is deliberate.** `supabase test db`
globs every `.sql` beneath that directory and runs it as pgTAP, so a fixture
with no `plan()` fails the whole suite with "No plan found in TAP output" --
which names the fixture but reads as a broken test run. These files live here
instead.

The run doc's **named edge case register** assigns one check per session that
the human reviewer executes by hand before merging, "chosen because the
automated gates structurally can't catch it."

These are those checks. They are committed rather than kept in a reviewer's
shell history for the same reason the companion docs are committed: a
procedure nobody else can run is a procedure that gets skipped, and then
re-invented differently.

They are **not** wired into CI on purpose. The point of a hand-check is a
person looking at the output.

## C1 — "the dual-Family user sees exactly their own conversations in each"

```bash
npx supabase db reset
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
  -f docs/manual-checks/c1-dual-family-fixture.sql
bash docs/manual-checks/c1-dual-family-check.sh
```

Every numbered line must read as its `(want ...)` says, the message list must
show exactly one message per Family, and the overlap must be `0`.

### Why the fixture exists

The seed alone **cannot fail this check**. Caregiver Circle holds only Alice
and Bob, so every room in it is one Alice belongs to — and "she sees her own
rooms" would pass against a policy that simply returned everything in her
Families, which is the exact bug the check is for.

The fixture adds Dave to Caregiver Circle and creates a Bob-to-Dave DM. Alice
is a member of that Family and must still not see that room. That is the
assertion with teeth.

### Prove the check can fail

A check nobody has seen fail is a check nobody should trust. Swap the correct
policies for the plausible-but-wrong Family-scoped version:

```sql
drop policy conversations_select on conversations;
create policy conversations_select on conversations for select to authenticated
  using (is_org_member(org_id));
drop policy messages_select on messages;
create policy messages_select on messages for select to authenticated
  using (is_org_member(org_id));
```

Measured 2026-09-02 — lines 1, 3, 4 and 5 go to `2`, `1`, `1`, `1`, the
message list gains `BOB-TO-DAVE-PRIVATE`, and Caregiver rooms becomes 2.
`npx supabase db reset` restores.

That wrong version is worth looking at, because it is what a reasonable person
writes: it scopes by Family, it is not obviously careless, and it passes every
cross-Family test in the suite. It only fails **inside** a Family — which is
why this check exists.

### It talks to PostgREST directly, not through supabase-js

The SDK is under suspicion as much as the policy is. A client library that
filtered correctly in front of a permissive policy would look identical from
the app. `curl` with the user's own bearer token is the server's actual answer.
