import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./supabase/database.types";
import { SupportRateLimitExceeded, assertSupportRateLimitNotExceeded } from "./support";

type Filter = { column: string; value: string };

/**
 * In-memory stand-in for the one query this module makes, recording the filters
 * it was given -- same shape as lib/email/rate-limit.test.ts's fake.
 */
function fakeSupportClient(count: number | null, error: { message: string } | null = null) {
  const filters: Filter[] = [];

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

const SUBMITTER = "profile-someone";

describe("assertSupportRateLimitNotExceeded", () => {
  it("lets somebody stuck send several messages", async () => {
    // Being told to wait is a bad first experience of asking for help, so the
    // limit has to be loose enough that a person legitimately confused does not
    // hit it. Four in the window is fine.
    const { client } = fakeSupportClient(4);
    await expect(assertSupportRateLimitNotExceeded(client, SUBMITTER)).resolves.toBeUndefined();
  });

  it("refuses the sixth message in the window", async () => {
    // /help is the one write endpoint reachable by an account that belongs to
    // nothing -- the insert policy has no membership test, by design. Five an
    // hour is generous for a person and useless for a script.
    const { client } = fakeSupportClient(5);
    await expect(assertSupportRateLimitNotExceeded(client, SUBMITTER)).rejects.toBeInstanceOf(
      SupportRateLimitExceeded,
    );
  });

  it("counts the submitter's own messages, inside a time window", async () => {
    const { client, filters } = fakeSupportClient(0);
    await assertSupportRateLimitNotExceeded(client, SUBMITTER);

    expect(filters).toContainEqual({ column: "__table", value: "support_requests" });
    expect(filters).toContainEqual({ column: "submitted_by_profile_id", value: SUBMITTER });

    const window = filters.find((f) => f.column === "created_at");
    expect(window).toBeDefined();
    // A window, not "every message ever" -- otherwise somebody who needed help
    // five times last year can never ask again.
    const windowMs = Date.now() - new Date(window!.value).getTime();
    expect(windowMs).toBeGreaterThan(59 * 60_000);
    expect(windowMs).toBeLessThan(61 * 60_000);
  });

  it("treats a null count as zero rather than as unlimited", async () => {
    const { client } = fakeSupportClient(null);
    await expect(assertSupportRateLimitNotExceeded(client, SUBMITTER)).resolves.toBeUndefined();
  });

  it("surfaces a query failure instead of silently allowing the write", async () => {
    const { client } = fakeSupportClient(null, { message: "connection reset" });
    await expect(assertSupportRateLimitNotExceeded(client, SUBMITTER)).rejects.toThrow();
  });

  it("the refusal message tells the person what to do", async () => {
    // Invariant: "Limits fail with plain messages" (Q2's wording, and the rule
    // for every session). No status codes, no jargon, and it says how long.
    const message = new SupportRateLimitExceeded().message;
    expect(message).toMatch(/wait a few minutes/i);
    expect(message).not.toMatch(/\b(429|rate.?limit|PGRST|policy)\b/i);
  });
});
