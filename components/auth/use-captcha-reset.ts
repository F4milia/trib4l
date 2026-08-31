"use client";

import { useEffect, useRef } from "react";
import type { AuthFormState } from "@/lib/auth/form-errors";

/**
 * Discards the spent Turnstile token after a failed submission.
 *
 * WHY THIS IS NECESSARY, AND WHY NO TEST WOULD HAVE FOUND IT. A Turnstile token
 * is single-use: once GoTrue redeems it, it is spent. /login and /signup are
 * client components held in place by useActionState, so a failed submit leaves
 * the same widget -- and the same spent token -- sitting in the form. The next
 * attempt sends a token GoTrue has already redeemed, fails, and keeps failing
 * until the page is reloaded. Wrong password once, locked out until reload.
 *
 * It would not have shown up locally or in CI at all: [auth.captcha] points at
 * Cloudflare's always-passes TEST secret, which verifies the same string
 * repeatedly. The bug appears only where a REAL secret is configured, i.e. only
 * in staging and production. Reasoned from Cloudflare's single-use guarantee
 * rather than measured -- verifying it needs a real key, which is a dashboard
 * step this repo cannot take. Called out in the PR for that reason.
 *
 * The two server-rendered forms (/magic-link, /forgot-password) need nothing:
 * their actions redirect, so the browser navigates and the widget is rebuilt.
 *
 * Guarded on there being a previous state, so the reset does not fire on first
 * render and throw away a token that was never used.
 */
type Turnstile = { reset: (widget?: string) => void };

export function useCaptchaReset(state: AuthFormState) {
  const previous = useRef<AuthFormState | null>(null);

  useEffect(() => {
    const failed = Boolean(state.formError) || Boolean(state.fieldErrors);
    if (previous.current !== null && previous.current !== state && failed) {
      // Optional at every step: the script may not have loaded, and no site key
      // means no widget at all. A missing reset must never break the form.
      (window as unknown as { turnstile?: Turnstile }).turnstile?.reset();
    }
    previous.current = state;
  }, [state]);
}
