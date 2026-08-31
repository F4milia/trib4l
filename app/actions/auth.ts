"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { callbackUrl, oauthProvider } from "@/lib/auth/providers";
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

/**
 * Emails a one-time link to choose a new password.
 *
 * Same enumeration reasoning as sendMagicLink: one destination whatever the
 * outcome. resetPasswordForEmail is already non-committal on its own -- it
 * succeeds for an unknown address -- but the redirect is unconditional here so
 * a future change to that behaviour cannot quietly open an oracle.
 *
 * The link's destination lives in the template, not in `redirectTo`: the
 * template pins `next=/reset-password`, and app/auth/confirm/route.ts narrows
 * that through safeNext like any other value arriving from a URL.
 */
export async function requestPasswordReset(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();

  if (!email) {
    redirect("/forgot-password?error=" + encodeURIComponent(copy.auth.forgotPassword.errors.missingEmail));
  }

  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(email);

  redirect("/reset-sent");
}

/**
 * Sets a new password on the session the recovery link created.
 *
 * There is no "current password" field, and there should not be: the caller
 * proved control of the address by opening a single-use emailed link, which is
 * the whole point of a reset. What it does require is a live session -- this
 * page is a plain URL, so it must not offer a password field to someone who
 * never opened one.
 *
 * updateUser is the authorisation boundary itself, not this check: it applies
 * to the session's own user and nobody else's, so there is no id to tamper
 * with in the form.
 */
export async function updatePassword(formData: FormData) {
  const password = String(formData.get("password") ?? "");
  const confirmation = String(formData.get("password_confirmation") ?? "");

  const supabase = await createClient();
  const { data, error: sessionError } = await supabase.auth.getUser();
  if (sessionError || !data.user) {
    redirect("/forgot-password?error=" + encodeURIComponent(copy.auth.resetPassword.errors.noSession));
  }

  if (!password || !confirmation) {
    redirect("/reset-password?error=" + encodeURIComponent(copy.auth.resetPassword.errors.missingFields));
  }
  if (password !== confirmation) {
    redirect("/reset-password?error=" + encodeURIComponent(copy.auth.resetPassword.errors.mismatch));
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    redirect("/reset-password?error=" + encodeURIComponent(error.message));
  }

  redirect("/");
}

/**
 * Starts an OAuth round trip. signInWithOAuth does not redirect on the server
 * -- it returns the provider's authorize URL, and this action redirects to it,
 * so the whole exchange stays out of the client bundle and no provider
 * credential is ever needed in the browser.
 *
 * The provider name arrives in a form field, so it is narrowed against the
 * closed set rather than passed through.
 */
export async function signInWithProvider(formData: FormData) {
  const provider = oauthProvider(String(formData.get("provider") ?? ""));
  const redirectTo = provider ? callbackUrl((await headers()).get("origin")) : null;

  if (!provider || !redirectTo) {
    redirect("/login?error=" + encodeURIComponent(copy.auth.oauth.errors.failed));
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({ provider, options: { redirectTo } });

  if (error || !data?.url) {
    redirect("/login?error=" + encodeURIComponent(copy.auth.oauth.errors.failed));
  }

  redirect(data.url);
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
