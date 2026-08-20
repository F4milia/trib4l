import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./supabase/database.types";
import { IdempotencyKeyReused, IdempotencyRequestInFlight, withIdempotencyKey } from "./idempotency";

type Row = {
  key: string;
  request_fingerprint: string;
  response_status: number | null;
  response_body: unknown;
  completed_at: string | null;
};

// In-memory stand-in for the idempotency_keys table, mirroring exactly the
// constraint this code actually depends on: a unique `key`, so a second
// insert with the same key fails with Postgres's 23505 error code.
function fakeIdempotencyClient() {
  const rows = new Map<string, Row>();

  const client = {
    from() {
      return {
        insert(row: { key: string; request_fingerprint: string; profile_id: string | null }) {
          if (rows.has(row.key)) {
            return Promise.resolve({ error: { code: "23505", message: "duplicate key" } });
          }
          rows.set(row.key, {
            key: row.key,
            request_fingerprint: row.request_fingerprint,
            response_status: null,
            response_body: null,
            completed_at: null,
          });
          return Promise.resolve({ error: null });
        },
        select() {
          return {
            eq(_col: string, key: string) {
              return {
                single() {
                  const row = rows.get(key);
                  return Promise.resolve(row ? { data: row, error: null } : { data: null, error: { message: "not found" } });
                },
              };
            },
          };
        },
        update(patch: Partial<Row>) {
          return {
            eq(_col: string, key: string) {
              const row = rows.get(key);
              if (row) Object.assign(row, patch);
              return Promise.resolve({ error: null });
            },
          };
        },
      };
    },
  };

  return client as unknown as SupabaseClient<Database>;
}

describe("withIdempotencyKey", () => {
  it("runs the handler on a fresh key", async () => {
    const client = fakeIdempotencyClient();
    let calls = 0;

    const result = await withIdempotencyKey(client, "key-1", "fp-a", async () => {
      calls++;
      return { status: 201, body: { orderId: "order-1" } };
    });

    expect(calls).toBe(1);
    expect(result).toEqual({ status: 201, body: { orderId: "order-1" } });
  });

  it("replays the stored response instead of re-running the handler", async () => {
    const client = fakeIdempotencyClient();
    let calls = 0;
    const handler = async () => {
      calls++;
      return { status: 201, body: { orderId: "order-1" } };
    };

    await withIdempotencyKey(client, "key-2", "fp-a", handler);
    const replay = await withIdempotencyKey(client, "key-2", "fp-a", handler);

    expect(calls).toBe(1);
    expect(replay).toEqual({ status: 201, body: { orderId: "order-1" } });
  });

  it("rejects the same key reused with a different request", async () => {
    const client = fakeIdempotencyClient();
    await withIdempotencyKey(client, "key-3", "fp-a", async () => ({ status: 201, body: {} }));

    await expect(
      withIdempotencyKey(client, "key-3", "fp-different", async () => ({ status: 201, body: {} })),
    ).rejects.toBeInstanceOf(IdempotencyKeyReused);
  });

  it("rejects a key whose original request hasn't completed yet", async () => {
    const client = fakeIdempotencyClient();
    await client.from("idempotency_keys").insert({ key: "key-4", request_fingerprint: "fp-a", profile_id: null });

    await expect(
      withIdempotencyKey(client, "key-4", "fp-a", async () => ({ status: 201, body: {} })),
    ).rejects.toBeInstanceOf(IdempotencyRequestInFlight);
  });
});
