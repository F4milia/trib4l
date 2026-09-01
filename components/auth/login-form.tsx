"use client";

import { useActionState } from "react";
import { signIn } from "@/app/actions/auth";
import { PasswordInput } from "@/components/password-input";
import { Turnstile } from "@/components/turnstile";
import { Button, ErrorText, FieldError, Input, Label } from "@/components/ui";
import { NO_ERRORS, formError } from "@/lib/auth/form-errors";
import { copy } from "@/lib/copy";
import { useCaptchaReset } from "./use-captcha-reset";
import { useFocusFirstInvalid } from "./use-focus-first-invalid";

const t = copy.auth.login;

/**
 * `initialError` is how a redirect from /auth/confirm or /auth/callback gets
 * shown. It is seeded into the action state rather than rendered separately by
 * the page, so there is exactly ONE error surface here: submitting the form
 * after arriving at /login?error=… replaces that message instead of stacking a
 * second one under it while the first is still in the URL.
 */
export function LoginForm({ initialError }: { initialError?: string }) {
  const [state, action, pending] = useActionState(
    signIn,
    initialError ? formError(initialError) : NO_ERRORS,
  );
  const formRef = useFocusFirstInvalid(state);
  // A Turnstile token is single-use, so a failed submit leaves a spent one in
  // this still-mounted form. See use-captcha-reset.ts.
  useCaptchaReset(state);

  const emailError = state.fieldErrors?.email;
  const passwordError = state.fieldErrors?.password;

  return (
    /* noValidate suppresses the browser's own validation bubble, which is
       unstyleable and would pre-empt every message below. `required` stays on
       each field: it is what exposes aria-required to a screen reader, and
       dropping it to reach our own messages would trade one affordance for
       another. */
    <form ref={formRef} action={action} className="space-y-5" noValidate>
      {state.formError ? <ErrorText>{state.formError}</ErrorText> : null}

      <div>
        <Label htmlFor="email">{t.emailLabel}</Label>
        <Input
          type="email"
          name="email"
          id="email"
          autoComplete="email"
          /* React 19 resets an uncontrolled <form action> once the action
             resolves, back to each field's DEFAULT value -- so echoing the
             submitted address here is what stops a failed attempt wiping what
             was typed. The password is deliberately not echoed. */
          defaultValue={state.values?.email ?? ""}
          required
          aria-invalid={emailError ? true : undefined}
          aria-describedby={emailError ? "email-error" : undefined}
        />
        {emailError ? <FieldError id="email-error">{emailError}</FieldError> : null}
      </div>

      <div>
        <Label htmlFor="password">{t.passwordLabel}</Label>
        <PasswordInput
          name="password"
          id="password"
          autoComplete="current-password"
          required
          aria-invalid={passwordError ? true : undefined}
          aria-describedby={passwordError ? "password-error" : undefined}
        />
        {passwordError ? <FieldError id="password-error">{passwordError}</FieldError> : null}
      </div>

      {/* Disabled while in flight rather than relabelled: the design system
          has no loading choreography, and a second submission here is a second
          sign-in attempt against the rate limit. */}
      <Turnstile action="signin" />
      <Button type="submit" className="w-full" disabled={pending}>
        {t.submit}
      </Button>
    </form>
  );
}
