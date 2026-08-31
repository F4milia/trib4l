"use client";

import { useActionState } from "react";
import { verifyAssuranceCode } from "@/app/actions/assurance";
import { Button, ErrorText, Input, Label } from "@/components/ui";
import { NO_ERRORS } from "@/lib/auth/form-errors";
import { copy } from "@/lib/copy";
import { useFocusFirstInvalid } from "./use-focus-first-invalid";

const t = copy.assurance;

/**
 * The code prompt at sign-in.
 *
 * Form-level errors only. There is one field, so attributing a failure to it
 * adds nothing, and S1's rule holds: a message under a field should say
 * something the field can be corrected by.
 *
 * autoFocus is right here and wrong on most screens: this page exists for one
 * purpose, the person has just been interrupted mid-sign-in, and the only thing
 * to do is type six digits.
 */
export function AssuranceForm() {
  const [state, action, pending] = useActionState(verifyAssuranceCode, NO_ERRORS);
  const formRef = useFocusFirstInvalid(state);

  return (
    <form ref={formRef} action={action} className="space-y-5" noValidate>
      {state.formError ? <ErrorText>{state.formError}</ErrorText> : null}

      <p className="text-sm text-deep-slate/70">{t.body}</p>

      <div>
        <Label htmlFor="code">{t.codeLabel}</Label>
        <Input
          id="code"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]*"
          maxLength={6}
          autoFocus
          required
          className="font-mono tracking-[0.4em]"
        />
        {state.fieldErrors?.password ? (
          <p className="mt-2 text-sm text-terracotta">{state.fieldErrors.password}</p>
        ) : null}
      </div>

      <Button type="submit" className="w-full" disabled={pending}>
        {t.submit}
      </Button>
    </form>
  );
}
