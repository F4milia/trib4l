"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { assertFamilyMemberCapNotExceeded, FamilyMemberCapExceeded } from "@/lib/family-cap";
import { assertInviteRateLimitNotExceeded, InviteRateLimitExceeded } from "@/lib/email/rate-limit";
import { renderFamilyInvite } from "@/lib/email/templates";
import { sendEmail } from "@/lib/email/transport";
import type { Database } from "@/lib/supabase/database.types";

type MembershipRole = Database["public"]["Enums"]["membership_role"];

export async function createInvitation(formData: FormData) {
  const orgId = String(formData.get("org_id") ?? "");
  const orgSlug = String(formData.get("org_slug") ?? "");
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const role = String(formData.get("role") ?? "member") as MembershipRole;

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/login");

  if (!email) {
    redirect(`/o/${orgSlug}/settings/members?error=${encodeURIComponent("An email address is required.")}`);
  }

  try {
    await assertFamilyMemberCapNotExceeded(supabase, orgId, role);
    // Invariant 7 -- this action sends mail now, so it needs a limit before it
    // writes the row, not after.
    await assertInviteRateLimitNotExceeded(supabase, userData.user!.id);
  } catch (err) {
    if (err instanceof FamilyMemberCapExceeded || err instanceof InviteRateLimitExceeded) {
      redirect(`/o/${orgSlug}/settings/members?error=${encodeURIComponent(err.message)}`);
    }
    throw err;
  }

  const { error } = await supabase.from("invitations").insert({
    org_id: orgId,
    email,
    role,
    invited_by_profile_id: userData.user!.id,
  });

  if (error) {
    redirect(`/o/${orgSlug}/settings/members?error=${encodeURIComponent(error.message)}`);
  }

  // Delivery. Until now an invitee found out because somebody told them --
  // docs/session-3-checklist.md says it plainly: "Actual email delivery for
  // invitations... Session 4 adds the transactional email that would send the
  // invite link automatically."
  //
  // Deliberately AFTER the insert and outside its error path: the invitation
  // is a real row whether or not mail goes out, and rolling it back because
  // Resend had a bad minute would leave the organizer worse off than the
  // status quo this replaces.
  //
  // No token in the link. Acceptance happens on the signed-in home page, which
  // matches pending invitations against the caller's own verified email; a
  // token in a URL would be a second, weaker acceptance path sitting beside
  // it. So the mail names no Family, no inviter and no token (invariant 3) --
  // all three are behind the sign-in.
  const origin = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000";
  const invite = renderFamilyInvite({ acceptUrl: `${origin}/` });

  try {
    await sendEmail({
      to: email,
      subject: invite.subject,
      html: invite.html,
      text: invite.text,
      kind: invite.kind,
    });
  } catch {
    // The row exists; say so, rather than reporting a failure that did not
    // happen. The error is already on its way to Sentry, and its message is
    // Resend's own -- never the mail body (invariant 12).
    revalidatePath(`/o/${orgSlug}/settings/members`);
    redirect(
      `/o/${orgSlug}/settings/members?error=${encodeURIComponent(
        "The invitation was created, but the email could not be sent. Send them the link yourself, or revoke and re-invite.",
      )}`,
    );
  }

  revalidatePath(`/o/${orgSlug}/settings/members`);
  redirect(`/o/${orgSlug}/settings/members`);
}

export async function revokeInvitation(formData: FormData) {
  const invitationId = String(formData.get("invitation_id") ?? "");
  const orgSlug = String(formData.get("org_slug") ?? "");

  const supabase = await createClient();
  await supabase.from("invitations").update({ status: "revoked" }).eq("id", invitationId);

  revalidatePath(`/o/${orgSlug}/settings/members`);
  redirect(`/o/${orgSlug}/settings/members`);
}

export async function acceptInvitation(formData: FormData) {
  const token = String(formData.get("token") ?? "");

  const supabase = await createClient();
  const { data: membership, error } = await supabase.rpc("accept_invitation", {
    invitation_token: token,
  });

  if (error || !membership) {
    redirect("/?error=" + encodeURIComponent(error?.message ?? "Could not accept invitation."));
  }

  const { data: org } = await supabase
    .from("organizations")
    .select("slug")
    .eq("id", membership.org_id)
    .single();

  redirect(org ? `/o/${org.slug}` : "/");
}
