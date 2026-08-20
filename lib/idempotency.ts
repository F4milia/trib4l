import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./supabase/database.types";

export class IdempotencyKeyReused extends Error {
  constructor(key: string) {
    super(`Idempotency key "${key}" was already used for a different request.`);
    this.name = "IdempotencyKeyReused";
  }
}

export class IdempotencyRequestInFlight extends Error {
  constructor(key: string) {
    super(`Idempotency key "${key}" is still being processed.`);
    this.name = "IdempotencyRequestInFlight";
  }
}

type IdempotentResponse<T> = { status: number; body: T };

const UNIQUE_VIOLATION = "23505";

/**
 * Wraps a write that costs money or creates a record so a client-supplied
 * idempotency key makes retries safe. The key row is inserted *before*
 * `handler` runs (insert-before-process): a double-tapped submit on bad
 * signal either replays the first call's stored response or throws, and
 * never runs `handler` twice.
 */
export async function withIdempotencyKey<T>(
  supabase: SupabaseClient<Database>,
  key: string,
  requestFingerprint: string,
  handler: () => Promise<IdempotentResponse<T>>,
  profileId?: string,
): Promise<IdempotentResponse<T>> {
  const { error: insertError } = await supabase
    .from("idempotency_keys")
    .insert({ key, request_fingerprint: requestFingerprint, profile_id: profileId ?? null });

  if (insertError) {
    if (insertError.code !== UNIQUE_VIOLATION) {
      throw insertError;
    }
    return replayOrReject<T>(supabase, key, requestFingerprint);
  }

  const result = await handler();

  const { error: updateError } = await supabase
    .from("idempotency_keys")
    .update({
      response_status: result.status,
      response_body: result.body as Database["public"]["Tables"]["idempotency_keys"]["Update"]["response_body"],
      completed_at: new Date().toISOString(),
    })
    .eq("key", key);

  if (updateError) {
    throw updateError;
  }

  return result;
}

async function replayOrReject<T>(
  supabase: SupabaseClient<Database>,
  key: string,
  requestFingerprint: string,
): Promise<IdempotentResponse<T>> {
  const { data: existing, error: fetchError } = await supabase
    .from("idempotency_keys")
    .select("request_fingerprint, response_status, response_body, completed_at")
    .eq("key", key)
    .single();

  if (fetchError || !existing) {
    throw fetchError ?? new Error(`Idempotency key "${key}" vanished after conflict.`);
  }

  if (existing.request_fingerprint !== requestFingerprint) {
    throw new IdempotencyKeyReused(key);
  }

  if (!existing.completed_at) {
    throw new IdempotencyRequestInFlight(key);
  }

  return { status: existing.response_status!, body: existing.response_body as T };
}
