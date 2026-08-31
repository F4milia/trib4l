"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  fieldError,
  formError,
  signupFieldForCode,
  type AuthFormState,
} from "@/lib/auth/form-errors";
import { callbackUrl, oauthProvider } from "@/lib/auth/providers";
import { createClient } from "@/lib/supabase/server";
import { copy } from "@/lib/copy";

export async function signUp(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const consent = formData.get("consent") === "on";

  // Echoed back so React's post-action form reset restores them. Never the
  // password -- see AuthFormValues.
  const values = { email, consent };

  // Ours to attribute, so attributed: each names the field at fault.
  if (!email) return fieldError("email", copy.auth.signup.errors.emailRequired, values);
  if (!password) return fieldError("password", copy.auth.signup.errors.passwordRequired, values);
  if (!consent) return fieldError("consent", copy.auth.signup.errors.consentRequired, values);

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({ email, password });

  /**
   * `user_already_exists` is swallowed on purpose, and this is the only place
   * in the app that treats a GoTrue error as a success.
   *
   * Measured 2026-08-30 against a real GoTrue with confirmations on: an
   * address that already has a CONFIRMED account returns `user_already_exists`
   * / "User already registered". The previous version of this action passed
   * error.message straight to the screen, so /signup told any visitor whether
   * a given address was on the platform -- the exact oracle /magic-link and
   * /forgot-password are built to avoid, left open on the form most likely to
   * be probed.
   *
   * Falling through to the same destination as a real signup closes it. The
   * person who genuinely owns the address is unaffected: they have an account
   * already, and can sign in or reset. The person probing learns nothing.
   */
  if (error && error.code !== "user_already_exists") {
    const field = signupFieldForCode(error.code);
    if (field === "password") return fieldError("password", copy.auth.signup.errors.weakPassword, values);
    if (field === "email") return fieldError("email", copy.auth.signup.errors.invalidEmail, values);
    return formError(copy.auth.signup.errors.failed, values);
  }

  // Confirmation is mandatory, so signUp returns no session and there is
  // nothing to land on yet. /check-email's copy is conditional ("if that
  // address can be used") precisely because this path is also reached by an
  // address that already has an account, where no mail was sent.
  redirect("/check-email");
}

export async function signIn(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  // Echoed back so React's post-action form reset restores it. Never the
  // password -- see AuthFormValues.
  const values = { email };

  if (!email) return fieldError("email", copy.auth.login.errors.emailRequired, values);
  if (!password) return fieldError("password", copy.auth.login.errors.passwordRequired, values);

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  /**
   * Form-level, always. GoTrue returns one identical `invalid_credentials` for
   * a wrong password, an unknown address, a malformed address and an empty
   * one -- measured, see lib/auth/form-errors.ts. There is nothing to
   * attribute, and finding out would mean first asking whether the address has
   * an account.
   */
  if (error) return formError(copy.auth.login.errors.invalidCredentials, values);

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
 * Starts a change of address.
 *
 * `double_confirm_changes = true` in config.toml is what makes this a
 * re-verification rather than a rename: GoTrue emails BOTH the current address
 * and the new one, and the change lands only when both confirm. That is also
 * the protection against a walk-up attacker on an unlocked session -- they
 * cannot complete it without the old inbox, which is why this action does not
 * ask for the current password on top.
 *
 * Requires a session, and takes the current address from that session rather
 * than from the form. Nothing here trusts a client-supplied identity.
 */
export async function requestEmailChange(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();

  const supabase = await createClient();
  const { data, error: sessionError } = await supabase.auth.getUser();
  if (sessionError || !data.user) {
    redirect("/login");
  }

  if (!email) {
    redirect("/account/email?error=" + encodeURIComponent(copy.auth.changeEmail.errors.missingEmail));
  }
  if (email.toLowerCase() === (data.user.email ?? "").toLowerCase()) {
    redirect("/account/email?error=" + encodeURIComponent(copy.auth.changeEmail.errors.unchanged));
  }

  const { error } = await supabase.auth.updateUser({ email });
  if (error) {
    redirect("/account/email?error=" + encodeURIComponent(error.message));
  }

  redirect("/account/email?sent=1");
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
export async function updatePassword(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const password = String(formData.get("password") ?? "");
  const confirmation = String(formData.get("password_confirmation") ?? "");

  // Still checked before the fields are: a signed-out caller is turned away
  // for being signed out, not told which of their two passwords was wrong.
  // This one redirects rather than returning state, because the answer is a
  // different page -- they need a new link, not a corrected field.
  const supabase = await createClient();
  const { data, error: sessionError } = await supabase.auth.getUser();
  if (sessionError || !data.user) {
    redirect("/forgot-password?error=" + encodeURIComponent(copy.auth.resetPassword.errors.noSession));
  }

  if (!password) return fieldError("password", copy.auth.resetPassword.errors.passwordRequired);
  if (!confirmation) {
    return fieldError("passwordConfirmation", copy.auth.resetPassword.errors.confirmationRequired);
  }
  // Under the confirmation field, not the first one: the first is what they
  // meant, the second is the one that disagrees with it.
  if (password !== confirmation) {
    return fieldError("passwordConfirmation", copy.auth.resetPassword.errors.mismatch);
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    const field = signupFieldForCode(error.code);
    if (field === "password") return fieldError("password", copy.auth.resetPassword.errors.weakPassword);
    return formError(copy.auth.resetPassword.errors.failed);
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
