import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { safeNext } from "@/lib/auth/confirm";
import { copy } from "@/lib/copy";
import { createClient } from "@/lib/supabase/server";

/**
 * Where an OAuth provider returns to. Separate from /auth/confirm because the
 * two carry different credentials: a provider hands back a PKCE `code` to
 * exchange, an emailed link hands back a token hash to verify. Same shape,
 * different call, and collapsing them would mean one route with two modes.
 *
 * The PKCE verifier lives in a cookie this browser already holds, because this
 * browser is the one that started the flow -- which is why the cross-device
 * problem that shaped the email templates does not apply here.
 *
 * A provider also reports failure to this URL, in query parameters it chooses.
 * None of that text is echoed back: `error_description` is attacker-influenced
 * in the general case, and reflecting it would put provider-authored prose on
 * our own sign-in page. Only `error` is read, and only compared against the
 * one value worth distinguishing.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeNext(searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) redirect(next);
  }

  // Cancelling at the provider is not a failure, and saying it failed would be
  // dishonest about what happened.
  const message =
    searchParams.get("error") === "access_denied"
      ? copy.auth.oauth.errors.cancelled
      : copy.auth.oauth.errors.failed;

  redirect(`/login?error=${encodeURIComponent(message)}`);
}
