"use client";

import { useActionState } from "react";
import { signUp } from "@/app/actions/auth";
import { PasswordInput } from "@/components/password-input";
import { Turnstile } from "@/components/turnstile";
import { Button, ErrorText, FieldError, Input, Label } from "@/components/ui";
import { NO_ERRORS } from "@/lib/auth/form-errors";
import { copy } from "@/lib/copy";
import { useCaptchaReset } from "./use-captcha-reset";
import { useFocusFirstInvalid } from "./use-focus-first-invalid";

const t = copy.auth.signup;

export function SignupForm() {
  const [state, action, pending] = useActionState(signUp, NO_ERRORS);
  const formRef = useFocusFirstInvalid(state);
  // A Turnstile token is single-use, so a failed submit leaves a spent one in
  // this still-mounted form. See use-captcha-reset.ts.
  useCaptchaReset(state);

  const emailError = state.fieldErrors?.email;
  const passwordError = state.fieldErrors?.password;
  const consentError = state.fieldErrors?.consent;

  return (
    /* See LoginForm for why noValidate and `required` sit together. */
    <form ref={formRef} action={action} className="space-y-5" noValidate>
      {state.formError ? <ErrorText>{state.formError}</ErrorText> : null}

      <div>
        <Label htmlFor="email">{t.emailLabel}</Label>
        <Input
          type="email"
          name="email"
          id="email"
          autoComplete="email"
          /* See LoginForm: restores the address across React's post-action
             form reset. */
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
          autoComplete="new-password"
          required
          minLength={6}
          aria-invalid={passwordError ? true : undefined}
          aria-describedby={passwordError ? "password-error" : undefined}
        />
        {passwordError ? <FieldError id="password-error">{passwordError}</FieldError> : null}
      </div>

      {/* §2.4's tinted-fill step over a 2px object border. deep-slate/70 on
          bg-muted measures 5.69:1 -- the composed pair, not the token, per
          CLAUDE.md's 2026-08-27 learned constraint. */}
      <div className="space-y-3 border-2 border-terracotta/40 bg-muted p-4">
        <h2 className="text-lg">{t.consent.heading}</h2>
        <p className="text-sm text-deep-slate/70">{t.consent.body}</p>
        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            name="consent"
            /* Re-ticked for the same reason. Losing the acknowledgement
               because the address was malformed would make people click
               through it twice and mean it less. */
            defaultChecked={state.values?.consent ?? false}
            required
            className="mt-0.5 size-4 shrink-0 accent-terracotta"
            aria-invalid={consentError ? true : undefined}
            aria-describedby={consentError ? "consent-error" : undefined}
          />
          <span>{t.consent.checkbox}</span>
        </label>
        {consentError ? <FieldError id="consent-error">{consentError}</FieldError> : null}
      </div>

      <Turnstile action="signup" />
      <Button type="submit" className="w-full" disabled={pending}>
        {t.submit}
      </Button>
    </form>
  );
}
