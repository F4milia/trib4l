"use client";

import { useEffect, useRef } from "react";
import type { AuthFormState } from "@/lib/auth/form-errors";

/**
 * Moves focus to the first field a submission marked invalid.
 *
 * Without this, a field-level message is invisible to anyone not looking at
 * that part of the screen: it is wired to its input through aria-describedby,
 * which is read when the input takes focus, so nothing announces it on its
 * own. Focus is what turns the message into feedback for a screen-reader or
 * keyboard user, and it also saves a sighted user from hunting for which of
 * three fields went red.
 *
 * Queried from the DOM rather than tracked per field, so a form that grows a
 * fourth field needs no change here. Order comes from the markup, which is
 * the same order the person reads.
 */
export function useFocusFirstInvalid(state: AuthFormState) {
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!state.fieldErrors) return;
    formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [state]);

  return formRef;
}
