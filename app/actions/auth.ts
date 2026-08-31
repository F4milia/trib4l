"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { copy } from "@/lib/copy";

export async function signUp(formData: FormData) {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const consent = formData.get("consent") === "on";

  if (!consent) {
    redirect("/signup?error=" + encodeURIComponent(copy.auth.signup.errors.consentRequired));
  }
  if (!email || !password) {
    redirect("/signup?error=" + encodeURIComponent(copy.auth.signup.errors.missingFields));
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({ email, password });
  if (error) {
    redirect("/signup?error=" + encodeURIComponent(error.message));
  }

  // Confirmation is mandatory, so signUp returns no session and there is
  // nothing to land on yet. This redirect is unconditional on purpose: when
  // the address already belongs to an account, GoTrue succeeds with an
  // obfuscated user rather than erroring, so branching here would rebuild the
  // account-enumeration oracle Supabase is deliberately avoiding.
  redirect("/check-email");
}

export async function signIn(formData: FormData) {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    redirect("/login?error=" + encodeURIComponent(error.message));
  }

  redirect("/");
}

/**
 * Emails a one-time sign-in link.
 *
 * `shouldCreateUser: false` is the load-bearing option. Left at its default,
 * signInWithOtp CREATES an account for an unknown address -- which would be a
 * second signup path that never shows, and never records, the platform-access
 * acknowledgement the /signup form requires. New accounts go through /signup.
 *
 * The redirect is the same whether the address has an account or not. GoTrue
 * returns a distinguishable error for an unknown address once creation is
 * off, and passing that through would turn this form into an account
 * enumeration oracle: submit an address, learn from the response whether that
 * person is on the platform. The message is deliberately phrased so it is
 * true either way -- it says what was done, not what will arrive.
 */
export async function sendMagicLink(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();

  if (!email) {
    redirect("/magic-link?error=" + encodeURIComponent(copy.auth.magicLink.errors.missingEmail));
  }

  const supabase = await createClient();
  await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });

  redirect("/link-sent");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
