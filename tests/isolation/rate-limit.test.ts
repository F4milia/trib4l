import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import type { Database } from "../../lib/supabase/database.types";
import { SEEDED_USERS, createServiceRoleClient, signInAs } from "./helpers";

/**
 * The rate limiter's store, through PostgREST rather than through psql.
 *
 * 060_rate_limit_counters.sql already asserts the GRANTs in the catalog. This
 * file asserts the layer above them: what actually happens when a real client
 * holding a real key calls the RPC over HTTP. A catalog GRANT and an HTTP 404
 * are different claims, and only one of them is what an attacker meets.
 *
 * Unique bucket keys per test, not shared ones. Every isolation file runs
 * against one database within a single `db reset` (CLAUDE.md, 2026-08-29), and a
 * counter is stateful by definition -- a fixed bucket name would make this file
 * order-dependent against itself on a second run.
 */

const SUPABASE_URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";

function bucket(label: string) {
  return `test:${label}:${crypto.randomUUID()}`;
}

describe("consume_rate_limit over PostgREST", () => {
  it("refuses the sixth attempt in a window", async () => {
    const supabase = createServiceRoleClient();
    const key = bucket("sixth");
    const outcomes: unknown[] = [];

    for (let attempt = 1; attempt <= 6; attempt += 1) {
      const { data, error } = await supabase.rpc("consume_rate_limit", {
        p_bucket: key,
        p_limit: 5,
        p_window_seconds: 900,
      });
      expect(error).toBeNull();
      outcomes.push(data);
    }

    // The acceptance criterion, end to end: five allowed, the sixth refused.
    expect(outcomes).toEqual([true, true, true, true, true, false]);
  });

  it("gives each bucket its own allowance", async () => {
    const supabase = createServiceRoleClient();
    const exhausted = bucket("exhausted");
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      await supabase.rpc("consume_rate_limit", {
        p_bucket: exhausted,
        p_limit: 5,
        p_window_seconds: 900,
      });
    }
    const { data: refused } = await supabase.rpc("consume_rate_limit", {
      p_bucket: exhausted,
      p_limit: 5,
      p_window_seconds: 900,
    });
    const { data: allowed } = await supabase.rpc("consume_rate_limit", {
      p_bucket: bucket("fresh"),
      p_limit: 5,
      p_window_seconds: 900,
    });

    expect(refused).toBe(false);
    // One address being limited must not lock out another.
    expect(allowed).toBe(true);
  });

  /**
   * The reason the function takes the limit as an argument and is not
   * client-callable. A visitor who could reach it could exhaust somebody
   * else's allowance by guessing a bucket, or hand themselves a limit of 10000.
   */
  it("is unreachable with the anon key", async () => {
    const anon = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data, error } = await anon.rpc("consume_rate_limit", {
      p_bucket: bucket("anon"),
      p_limit: 5,
      p_window_seconds: 900,
    });

    expect(error).not.toBeNull();
    expect(data).toBeNull();
  });

  it("is unreachable by a signed-in member", async () => {
    const member = await signInAs(SEEDED_USERS.alice);
    const { data, error } = await member.rpc("consume_rate_limit", {
      p_bucket: bucket("member"),
      p_limit: 5,
      p_window_seconds: 900,
    });

    expect(error).not.toBeNull();
    expect(data).toBeNull();
  });

  /**
   * A signed-in member is `authenticated`, not `service_role`, no matter what
   * their platform role is -- so platform_staff must be refused too. Asserted
   * separately because "staff can do anything" is the assumption that would
   * make a reviewer skip it.
   */
  it("is unreachable by platform_staff", async () => {
    const staff = await signInAs(SEEDED_USERS.erin);
    const { error } = await staff.rpc("consume_rate_limit", {
      p_bucket: bucket("staff"),
      p_limit: 5,
      p_window_seconds: 900,
    });

    expect(error).not.toBeNull();
  });

  it("refuses a limit that would disable or widen the policy", async () => {
    const supabase = createServiceRoleClient();
    const zero = await supabase.rpc("consume_rate_limit", {
      p_bucket: bucket("zero"),
      p_limit: 0,
      p_window_seconds: 900,
    });
    const huge = await supabase.rpc("consume_rate_limit", {
      p_bucket: bucket("huge"),
      p_limit: 5,
      p_window_seconds: 999999,
    });

    expect(zero.error).not.toBeNull();
    expect(huge.error).not.toBeNull();
  });
});
