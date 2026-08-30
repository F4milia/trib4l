import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../supabase/database.types";
import { InviteRateLimitExceeded, assertInviteRateLimitNotExceeded } from "./rate-limit";

type Filters = { column: string; value: string }[];

/**
 * In-memory stand-in for the one query this module makes, recording the
 * filters it was given. Mirrors exactly what the code depends on: a counted
 * head-select over `invitations`, narrowed to one inviter and one time window.
 */
function fakeInvitationsClient(count: number | null, error: { message: string } | null = null) {
  const filters: Filters = [];

  const builder = {
    eq(column: string, value: string) {
      filters.push({ column, value });
      return builder;
    },
    gte(column: string, value: string) {
      filters.push({ column, value });
      return Promise.resolve({ count, error });
    },
  };

  const client = {
    from(table: string) {
      filters.push({ column: "__table", value: table });
      return { select: () => builder };
    },
  };

  return { client: client as unknown as SupabaseClient<Database>, filters };
}

const INVITER = "profile-bob";

describe("assertInviteRateLimitNotExceeded", () => {
  it("lets an organizer through under the limit", async () => {
    const { client } = fakeInvitationsClient(4);
    await expect(assertInviteRateLimitNotExceeded(client, INVITER)).resolves.toBeUndefined();
  });

  it("refuses the sixth invitation in the window", async () => {
    // E1 opens a path that sends mail to an address nobody at F4milia has
    // verified. Shipping that with no limit and adding one in Q2, eight waves
    // later, is how an open relay happens.
    const { client } = fakeInvitationsClient(5);
    await expect(assertInviteRateLimitNotExceeded(client, INVITER)).rejects.toBeInstanceOf(
      InviteRateLimitExceeded,
    );
  });

  it("counts the inviter's own invitations, inside a time window", async () => {
    const { client, filters } = fakeInvitationsClient(0);
    await assertInviteRateLimitNotExceeded(client, INVITER);

    expect(filters).toContainEqual({ column: "__table", value: "invitations" });
    expect(filters).toContainEqual({ column: "invited_by_profile_id", value: INVITER });

    const window = filters.find((f) => f.column === "created_at");
    expect(window).toBeDefined();
    // A window, not "all invitations ever" -- otherwise an organizer who has
    // run a Family for a year can never invite anyone again.
    expect(new Date(window!.value).getTime()).toBeLessThanOrEqual(Date.now());
    expect(new Date(window!.value).getTime()).toBeGreaterThan(Date.now() - 120_000);
  });

  it("treats a null count as zero rather than as unlimited", async () => {
    const { client } = fakeInvitationsClient(null);
    await expect(assertInviteRateLimitNotExceeded(client, INVITER)).resolves.toBeUndefined();
  });

  it("surfaces a query failure instead of silently allowing the send", async () => {
    const { client } = fakeInvitationsClient(null, { message: "connection reset" });
    await expect(assertInviteRateLimitNotExceeded(client, INVITER)).rejects.toThrow();
  });
});
