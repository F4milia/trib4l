import { beforeAll, describe, expect, it } from "vitest";
import { listConversations, resolveMembershipId } from "../../lib/conversations";
import { ORG_IDS, SEEDED_USERS, signInAs } from "./helpers";

/**
 * C2 PR 3. The acceptance criterion the prompt words most strongly:
 *
 *   "an attachment uploaded to Family A's channel is unreachable by URL from a
 *   Family B session -- PROVEN, not assumed."
 *
 * pgTAP cannot make this claim: it connects as postgres and bypasses RLS. Only
 * a real session with a real JWT going through the storage API can, which is
 * why this file exists alongside 250_attachment_storage.sql rather than instead
 * of it.
 *
 * The bucket is private, so "unreachable by URL" means two separate things and
 * both are checked: the object does not download, and it does not appear in a
 * listing. A leak through `list` would be a directory of another Family's
 * filenames -- less severe than the bytes, and far easier to ship by accident.
 */

const BUCKET = "family-attachments";

let familyAConversationId: string;
let familyAPath: string;

beforeAll(async () => {
  const alice = await signInAs(SEEDED_USERS.alice);
  const room = (await listConversations(alice, ORG_IDS.caregiverCircle)).find(
    (c) => c.kind === "family_channel",
  )!;
  familyAConversationId = room.id;

  // Path shape is <org_id>/<conversation_id>/<file>, which is what every policy
  // and every quota sum reads.
  familyAPath = `${ORG_IDS.caregiverCircle}/${familyAConversationId}/probe-${crypto.randomUUID()}.txt`;

  const { error } = await alice.storage
    .from(BUCKET)
    .upload(familyAPath, new Blob(["family A private content"], { type: "text/plain" }), {
      contentType: "text/plain",
    });
  if (error) throw new Error(`fixture upload failed: ${error.message}`);
}, 60_000);

describe("attachment storage isolation", () => {
  it("lets a participant download the object -- the control", async () => {
    // Without this, every refusal below is satisfied by a bucket that simply
    // does not work.
    const bob = await signInAs(SEEDED_USERS.bob);
    const { data, error } = await bob.storage.from(BUCKET).download(familyAPath);
    expect(error).toBeNull();
    expect(await data!.text()).toBe("family A private content");
  }, 30_000);

  it("refuses the download to a member of another Family who knows the path", async () => {
    // Carol is in Founder Collective only. She has the exact path -- this is
    // the "unreachable by URL" claim, with the URL already in hand.
    const carol = await signInAs(SEEDED_USERS.carol);
    const { data, error } = await carol.storage.from(BUCKET).download(familyAPath);
    expect(data).toBeNull();
    expect(error).not.toBeNull();
  }, 30_000);

  it("does not even list another Family's directory", async () => {
    const carol = await signInAs(SEEDED_USERS.carol);
    const { data } = await carol.storage
      .from(BUCKET)
      .list(`${ORG_IDS.caregiverCircle}/${familyAConversationId}`);
    // A listing leak is a directory of another Family's filenames: less severe
    // than the bytes, much easier to ship by accident.
    expect(data ?? []).toHaveLength(0);
  }, 30_000);

  it("refuses an upload into another Family's path", async () => {
    const carol = await signInAs(SEEDED_USERS.carol);
    const { error } = await carol.storage
      .from(BUCKET)
      .upload(
        `${ORG_IDS.caregiverCircle}/${familyAConversationId}/intruder.txt`,
        new Blob(["should not land"], { type: "text/plain" }),
      );
    expect(error).not.toBeNull();
  }, 30_000);

  it("refuses a file over the 5 MB cap at the platform level", async () => {
    // Asserted through the API rather than by reading the bucket row, because
    // the cap is only worth having if the platform enforces it when the app
    // forgets to. 6 MB of incompressible-enough bytes.
    const alice = await signInAs(SEEDED_USERS.alice);
    const big = new Blob([new Uint8Array(6 * 1024 * 1024)], { type: "text/plain" });
    const { error } = await alice.storage
      .from(BUCKET)
      .upload(`${ORG_IDS.caregiverCircle}/${familyAConversationId}/too-big.txt`, big);
    expect(error).not.toBeNull();
  }, 60_000);

  it("reports the quota in a plain sentence rather than a raw error", async () => {
    // The acceptance criterion is "quota exceeded fails with a plain message,
    // not a broken upload". The function is what the UI will call before it
    // uploads; this asserts it answers, and answers in words.
    const alice = await signInAs(SEEDED_USERS.alice);
    const { data, error } = await alice.rpc("check_family_storage_quota", {
      check_org_id: ORG_IDS.caregiverCircle,
      incoming_bytes: 6 * 1024 * 1024,
    });
    expect(error).toBeNull();
    expect(data).toMatch(/5 MB/);
  }, 30_000);

  it("does not let a member of another Family measure this Family's usage", async () => {
    // family_storage_bytes() is SECURITY DEFINER because it reads
    // storage.objects, which members have no grant on -- so it needs its own
    // check that the caller belongs to the Family it is asking about. A number
    // is a read path too: C1 PR4's lesson.
    const carol = await signInAs(SEEDED_USERS.carol);
    const { data } = await carol.rpc("family_storage_bytes", {
      check_org_id: ORG_IDS.caregiverCircle,
    });
    expect(data ?? 0).toBe(0);
  }, 30_000);
});
