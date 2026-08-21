import { describe, expect, it } from "vitest";
import { ORG_IDS, SEEDED_USERS, signInAs } from "./helpers";

describe("role escalation is blocked", () => {
  it("an org_owner cannot write to platform_staff", async () => {
    // Carol is org_owner of founder-collective -- the highest org-scoped
    // role that exists -- and still has zero access to platform_staff.
    const carol = await signInAs(SEEDED_USERS.carol);

    const { data: userData } = await carol.auth.getUser();
    const { error } = await carol
      .from("platform_staff")
      .insert({ profile_id: userData!.user!.id });

    expect(error).not.toBeNull();
  });

  it("no org role can grant itself platform_staff", async () => {
    // Bob is organizer of caregiver-circle -- also tries, also fails, for
    // the same reason: no policy on platform_staff references any org role
    // at all, so this isn't a permission he could have if the escalation
    // path were slightly different -- there's no path.
    const bob = await signInAs(SEEDED_USERS.bob);
    const { data: userData } = await bob.auth.getUser();

    const { error } = await bob.from("platform_staff").insert({ profile_id: userData!.user!.id });
    expect(error).not.toBeNull();

    const { data: staffRow } = await bob
      .from("platform_staff")
      .select("id")
      .eq("profile_id", userData!.user!.id)
      .maybeSingle();
    expect(staffRow).toBeNull();
  });

  it("a member cannot self-promote to org_owner", async () => {
    // Dave is a plain member of wellness-guild. He tries to rewrite his
    // own membership row to org_owner.
    const dave = await signInAs(SEEDED_USERS.dave);
    const { data: userData } = await dave.auth.getUser();

    const { data: updated, error } = await dave
      .from("memberships")
      .update({ role: "org_owner" })
      .eq("org_id", ORG_IDS.wellnessGuild)
      .eq("profile_id", userData!.user!.id)
      .select();

    // RLS silently filters rather than erroring: the UPDATE runs but
    // matches zero rows, since the USING clause requires org_owner *before*
    // the update, which Dave never had.
    expect(error).toBeNull();
    expect(updated).toEqual([]);

    const { data: stillMember } = await dave
      .from("memberships")
      .select("role")
      .eq("org_id", ORG_IDS.wellnessGuild)
      .eq("profile_id", userData!.user!.id)
      .single();
    expect(stillMember?.role).toBe("member");
  });
});
