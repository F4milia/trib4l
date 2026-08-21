import { describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { ORG_IDS, SEEDED_USERS, signInAs } from "./helpers";

const SUPABASE_URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";

async function signUpNewUser(email: string) {
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { error } = await client.auth.signUp({ email, password: "password123" });
  if (error) throw new Error(`signUp failed for ${email}: ${error.message}`);
  return client;
}

describe("invitations", () => {
  it("a non-staff member cannot create an invitation for their org", async () => {
    const alice = await signInAs(SEEDED_USERS.alice); // plain member, caregiver-circle
    const { error } = await alice.from("invitations").insert({
      org_id: ORG_IDS.caregiverCircle,
      email: "nobody@f4milia.test",
      role: "member",
      invited_by_profile_id: (await alice.auth.getUser()).data.user!.id,
    });
    expect(error).not.toBeNull();
  });

  it("an organizer can invite a brand-new email, and that person can accept after signing up", async () => {
    const bob = await signInAs(SEEDED_USERS.bob); // organizer, caregiver-circle
    const inviteeEmail = `new-invitee-${Date.now()}@f4milia.test`;

    const { data: invite, error: insertError } = await bob
      .from("invitations")
      .insert({
        org_id: ORG_IDS.caregiverCircle,
        email: inviteeEmail,
        role: "member",
        invited_by_profile_id: (await bob.auth.getUser()).data.user!.id,
      })
      .select("token")
      .single();
    expect(insertError).toBeNull();
    expect(invite?.token).toBeTruthy();

    // The invitee has no account yet -- signs up fresh with the invited email.
    const invitee = await signUpNewUser(inviteeEmail);

    // They can see their own pending invitation without any org membership.
    const { data: visible } = await invitee
      .from("invitations")
      .select("token, status")
      .eq("token", invite!.token)
      .maybeSingle();
    expect(visible?.status).toBe("pending");

    const { data: membership, error: acceptError } = await invitee.rpc("accept_invitation", {
      invitation_token: invite!.token,
    });
    expect(acceptError).toBeNull();
    expect(membership?.org_id).toBe(ORG_IDS.caregiverCircle);
    expect(membership?.role).toBe("member");

    const { data: afterAccept } = await invitee
      .from("invitations")
      .select("status")
      .eq("token", invite!.token)
      .single();
    expect(afterAccept?.status).toBe("accepted");
  });

  it("re-inviting someone who already has a membership updates their role instead of erroring", async () => {
    // Alice is already 'member' in caregiver-circle. Bob (organizer) invites
    // her again, this time as 'organizer' -- the plan's specifically-called-
    // out case: this must not error just because the account/membership
    // already exists.
    const bob = await signInAs(SEEDED_USERS.bob);
    const { data: invite, error: insertError } = await bob
      .from("invitations")
      .insert({
        org_id: ORG_IDS.caregiverCircle,
        email: SEEDED_USERS.alice.email,
        role: "organizer",
        invited_by_profile_id: (await bob.auth.getUser()).data.user!.id,
      })
      .select("token")
      .single();
    expect(insertError).toBeNull();

    const alice = await signInAs(SEEDED_USERS.alice);
    const { data: membership, error: acceptError } = await alice.rpc("accept_invitation", {
      invitation_token: invite!.token,
    });

    expect(acceptError).toBeNull();
    expect(membership?.role).toBe("organizer");

    const { data: rows } = await alice
      .from("memberships")
      .select("role")
      .eq("org_id", ORG_IDS.caregiverCircle)
      .eq("profile_id", (await alice.auth.getUser()).data.user!.id);
    expect(rows?.length).toBe(1); // still exactly one row, not a duplicate
    expect(rows?.[0].role).toBe("organizer");
  });

  it("a different person cannot accept someone else's invitation", async () => {
    const bob = await signInAs(SEEDED_USERS.bob);
    const { data: invite } = await bob
      .from("invitations")
      .insert({
        org_id: ORG_IDS.caregiverCircle,
        email: "someone-else@f4milia.test",
        role: "member",
        invited_by_profile_id: (await bob.auth.getUser()).data.user!.id,
      })
      .select("token")
      .single();

    // Dave is a real signed-in user, but the invite wasn't addressed to him.
    const dave = await signInAs(SEEDED_USERS.dave);
    const { error } = await dave.rpc("accept_invitation", { invitation_token: invite!.token });
    expect(error).not.toBeNull();
    expect(error?.message).toMatch(/different email/i);
  });

  it("a revoked invitation cannot be accepted", async () => {
    const bob = await signInAs(SEEDED_USERS.bob);
    const revokeeEmail = `revoked-${Date.now()}@f4milia.test`;
    const { data: invite } = await bob
      .from("invitations")
      .insert({
        org_id: ORG_IDS.caregiverCircle,
        email: revokeeEmail,
        role: "member",
        invited_by_profile_id: (await bob.auth.getUser()).data.user!.id,
      })
      .select("token")
      .single();

    await bob.from("invitations").update({ status: "revoked" }).eq("token", invite!.token);

    const invitee = await signUpNewUser(revokeeEmail);
    const { error } = await invitee.rpc("accept_invitation", { invitation_token: invite!.token });
    expect(error).not.toBeNull();
    expect(error?.message).toMatch(/no longer pending/i);
  });
});
