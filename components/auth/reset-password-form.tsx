"use client";

import { useActionState } from "react";
import { updatePassword } from "@/app/actions/auth";
import { PasswordInput } from "@/components/password-input";
import { Button, ErrorText, FieldError, Label } from "@/components/ui";
import { NO_ERRORS } from "@/lib/auth/form-errors";
import { copy } from "@/lib/copy";
import { useFocusFirstInvalid } from "./use-focus-first-invalid";

const t = copy.auth.resetPassword;

export function ResetPasswordForm() {
  const [state, action, pending] = useActionState(updatePassword, NO_ERRORS);
  const formRef = useFocusFirstInvalid(state);

  const passwordError = state.fieldErrors?.password;
  const confirmationError = state.fieldErrors?.passwordConfirmation;

  return (
    /* See LoginForm for why noValidate and `required` sit together. */
    <form ref={formRef} action={action} className="space-y-5" noValidate>
      {state.formError ? <ErrorText>{state.formError}</ErrorText> : null}

      <p className="text-sm text-deep-slate/70">{t.body}</p>

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

      <div>
        <Label htmlFor="password_confirmation">{t.confirmLabel}</Label>
        <PasswordInput
          name="password_confirmation"
          id="password_confirmation"
          autoComplete="new-password"
          required
          minLength={6}
          aria-invalid={confirmationError ? true : undefined}
          aria-describedby={confirmationError ? "password-confirmation-error" : undefined}
        />
        {/* A mismatch is reported here rather than on the field above: the
            first entry is what they meant, the second is the one that
            disagrees with it. */}
        {confirmationError ? (
          <FieldError id="password-confirmation-error">{confirmationError}</FieldError>
        ) : null}
      </div>

      <Button type="submit" className="w-full" disabled={pending}>
        {t.submit}
      </Button>
    </form>
  );
}
