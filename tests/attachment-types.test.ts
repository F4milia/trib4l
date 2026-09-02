import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  ATTACHMENT_ALLOWED_TYPES,
  ATTACHMENT_MAX_BYTES,
} from "../lib/message-interactions";

/**
 * The client's copy of the attachment caps must agree with the bucket row.
 *
 * WHY THIS CAN GO WRONG SILENTLY, IN BOTH DIRECTIONS:
 *
 *   A type in the CLIENT but not the bucket -- the picker offers a file the
 *   platform then rejects. The member chooses a photo, writes a message, and
 *   the upload fails for a reason the UI already told them was fine.
 *
 *   A type in the BUCKET but not the client -- the product supports a file the
 *   UI refuses. Nobody reports that, because it looks like the feature simply
 *   does not do that.
 *
 * Neither shows up in any other test: the component's tests mock the network,
 * and the bucket's pgTAP never sees TypeScript.
 *
 * READ FROM THE MIGRATIONS, NOT FROM A COPY. The last migration that sets each
 * value wins, so a later `update storage.buckets` is picked up rather than
 * ignored -- a test pinned to the CREATE would go stale the first time anyone
 * widened the list.
 */

const MIGRATIONS_DIR = path.join(process.cwd(), "supabase", "migrations");

function migrationsInOrder(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => readFileSync(path.join(MIGRATIONS_DIR, f), "utf8"));
}

/** The mime-type array from the last migration that sets one. */
function bucketMimeTypes(): string[] | null {
  let found: string[] | null = null;
  for (const sql of migrationsInOrder()) {
    // Matches both the `insert ... values (... array[...])` form and a later
    // `update storage.buckets set allowed_mime_types = array[...]`.
    for (const match of sql.matchAll(/allowed_mime_types[\s\S]{0,200}?array\s*\[([\s\S]*?)\]/g)) {
      found = [...match[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
    }
    // An insert that lists columns puts the array later; catch that shape too.
    if (/insert\s+into\s+storage\.buckets/i.test(sql)) {
      const arrays = [...sql.matchAll(/array\s*\[([\s\S]*?)\]/g)];
      const last = arrays.at(-1);
      if (last) found = [...last[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
    }
  }
  return found;
}

/** The size limit from the last migration that sets one. */
function bucketSizeLimit(): number | null {
  let found: number | null = null;
  for (const sql of migrationsInOrder()) {
    if (!/storage\.buckets/i.test(sql)) continue;
    // The literal sits on its own line in the insert, and after `=` in an
    // update. Both are bare integers.
    const insert = [...sql.matchAll(/^\s*(\d{4,})\s*,\s*(?:--.*)?$/gm)].at(-1);
    const update = [...sql.matchAll(/file_size_limit\s*=\s*(\d+)/g)].at(-1);
    if (update) found = Number(update[1]);
    else if (insert) found = Number(insert[1]);
  }
  return found;
}

describe("attachment caps agree with the bucket row", () => {
  it("finds the bucket definition at all", () => {
    // Guards the guard. A regex that silently matches nothing would make every
    // assertion below pass against null, which is the failure mode a
    // parsing test has that a normal test does not.
    expect(bucketMimeTypes()).not.toBeNull();
    expect(bucketSizeLimit()).not.toBeNull();
  });

  it("allows exactly the same mime types as the bucket", () => {
    expect([...ATTACHMENT_ALLOWED_TYPES].sort()).toEqual(bucketMimeTypes()!.sort());
  });

  it("uses the same size limit as the bucket", () => {
    expect(ATTACHMENT_MAX_BYTES).toBe(bucketSizeLimit());
  });

  it("does not offer a type the platform will reject", () => {
    // The direction that wastes a member's time: the picker accepts it, they
    // write a message, and the upload fails.
    const bucket = new Set(bucketMimeTypes()!);
    expect(ATTACHMENT_ALLOWED_TYPES.filter((t) => !bucket.has(t))).toEqual([]);
  });

  it("does not refuse a type the platform would accept", () => {
    // The direction nobody reports, because it looks like the feature simply
    // does not do that.
    const client = new Set<string>(ATTACHMENT_ALLOWED_TYPES);
    expect(bucketMimeTypes()!.filter((t) => !client.has(t))).toEqual([]);
  });

  it("still excludes video, whatever else changes", () => {
    // Mux is already the video path. A 5 MB video cap would be a worse version
    // of a feature that exists, so this is a rule rather than an oversight.
    expect(ATTACHMENT_ALLOWED_TYPES.some((t) => t.startsWith("video/"))).toBe(false);
    expect(bucketMimeTypes()!.some((t) => t.startsWith("video/"))).toBe(false);
  });
});
