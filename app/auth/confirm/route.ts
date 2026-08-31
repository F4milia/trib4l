import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { confirmableType, safeNext } from "@/lib/auth/confirm";
import { copy } from "@/lib/copy";
import { createClient } from "@/lib/supabase/server";

/**
 * Where every emailed auth link lands. Verifies the token hash server-side and
 * exchanges it for a session, then sends the person on.
 *
 * A Route Handler rather than a Server Component because verifyOtp has to
 * WRITE the session cookie, and a Server Component cannot set cookies --
 * lib/supabase/server.ts's setAll silently no-ops there by design.
 *
 * Both untrusted inputs are narrowed by lib/auth/confirm.ts before they are
 * used: `type` against a closed set (EmailOtpType widens to `string & {}`, so
 * a cast would forward an attacker-chosen string to verifyOtp), and `next`
 * against same-origin paths only (a confirmation link is a high-trust link
 * from an inbox, which is precisely what an open redirect wants to borrow).
 *
 * Every failure lands on the same message. Distinguishing "no such token"
 * from "already used" from "expired" would turn this route into an oracle,
 * and none of the three changes what the person does next.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = confirmableType(searchParams.get("type"));
  const next = safeNext(searchParams.get("next"));

  if (tokenHash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) redirect(next);
  }

  redirect(`/login?error=${encodeURIComponent(copy.auth.confirm.errors.invalidLink)}`);
}
