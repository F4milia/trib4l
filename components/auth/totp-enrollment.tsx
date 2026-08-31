"use client";

import { useActionState } from "react";
import { enrollTotp } from "@/app/actions/mfa";
import { TOTP_ENROLL_IDLE } from "@/lib/auth/totp-state";
import { Button, ErrorText, Input, Label, StatusText } from "@/components/ui";
import { copy } from "@/lib/copy";

const t = copy.mfa;

/**
 * The enrollment flow: start, scan, verify.
 *
 * A client component because the QR and the setup key exist only in the action's
 * return value -- `enroll()` hands the secret back exactly once and there is no
 * API to read it again, so there is nothing a server component could re-render
 * from. useActionState is what carries it across the two steps.
 *
 * The QR is a data: URI, measured rather than assumed (Supabase returns
 * `data:image/svg+xml;utf-8,<svg…>`), so it renders in an <img> and needs no
 * dangerouslySetInnerHTML. It is also large -- 321 KB in the probe -- and that
 * whole string crosses the wire inside the action result. Acceptable for a
 * one-time screen, and noted in the PR as the first thing to change if this page
 * ever feels slow: the `uri` is enough to draw a QR client-side.
 */
export function TotpEnrollment() {
  const [state, action, pending] = useActionState(enrollTotp, TOTP_ENROLL_IDLE);

  if (state.step === "done") {
    return <StatusText>{t.done}</StatusText>;
  }

  if (state.step === "scan" && state.qrCode && state.secret) {
    return (
      <form action={action} className="space-y-5">
        <input type="hidden" name="factor_id" value={state.factorId} />

        {state.error ? <ErrorText>{state.error}</ErrorText> : null}

        <div>
          <h3 className="font-serif text-2xl leading-[0.9] tracking-tighter">{t.scan.heading}</h3>
          <p className="mt-2 max-w-md text-sm text-deep-slate/70">{t.scan.body}</p>
        </div>

        {/**
         * A plain <img>, not next/image, and measured rather than chosen by
         * taste: next/image REFUSES this src outright -- "Image with src
         * data:image/svg+xml;utf-8,<?xml…" is a runtime error, even with
         * `unoptimized`. There is also nothing for it to optimise; the bytes are
         * already in the HTML.
         *
         * alt="" because the square is decorative: everything it encodes is in
         * the setup key below it, which is a real form field. An alt text
         * describing a QR code would be noise to a screen reader that cannot
         * scan it.
         */}
        {/* eslint-disable-next-line @next/next/no-img-element -- see above: next/image rejects a data: URI */}
        <img
          src={state.qrCode}
          alt=""
          width={200}
          height={200}
          className="border-2 border-deep-slate bg-parchment p-2"
        />

        <div>
          <Label htmlFor="totp-secret">{t.scan.secretLabel}</Label>
          {/* Mono and selectable: it is a key to be copied, not prose. readOnly
              rather than disabled so it can still be selected and copied. */}
          <Input
            id="totp-secret"
            readOnly
            value={state.secret}
            className="font-mono tracking-widest"
          />
        </div>

        <div>
          <Label htmlFor="totp-code">{t.scan.codeLabel}</Label>
          <Input
            id="totp-code"
            name="code"
            /* inputMode + autoComplete are what make this bearable on a phone,
               where the person is switching apps to read the code. */
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            maxLength={6}
            required
            className="font-mono tracking-[0.4em]"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={pending}>
            {t.scan.submit}
          </Button>
          {/* Starting again is a fresh factor, not a resumed one -- the old
              secret is unrecoverable by design, so the action enrolls anew
              whenever no code is submitted.
              formNoValidate is load-bearing: the code field above is `required`,
              so without it this button cannot submit at all and the only way out
              of a half-finished setup is a page reload. */}
          <Button type="submit" variant="ghost" formNoValidate disabled={pending}>
            {t.scan.cancel}
          </Button>
        </div>
      </form>
    );
  }

  return (
    <form action={action} className="space-y-4">
      {state.error ? <ErrorText>{state.error}</ErrorText> : null}
      <Button type="submit" disabled={pending}>
        {t.start}
      </Button>
    </form>
  );
}
