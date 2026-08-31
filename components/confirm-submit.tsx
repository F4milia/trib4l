"use client";

import { useRef } from "react";
import { Button } from "@/components/ui";
import { copy } from "@/lib/copy";

/**
 * A destructive submit behind a confirmation that names what will happen.
 *
 * CLAUDE.md: "Every destructive action confirms, and the confirm dialog names
 * what will happen." Nothing in the repo had a confirmation pattern before this
 * -- grep found none -- so this is the first, and the two account-deletion and
 * session surfaces in S2 all use it.
 *
 * The native <dialog> rather than a hand-rolled overlay or a new dependency. It
 * brings the accessibility work already done: Escape closes it, focus is trapped
 * while it is open, focus returns to the trigger on close, and it renders in the
 * top layer so no z-index fight is possible. A div-and-fixed-position version
 * would be more markup and less correct.
 *
 * The dialog sits INSIDE the form so its confirm button is a real submit -- the
 * server action receives the form, and no JavaScript re-submits anything. With
 * JS disabled the trigger does nothing at all, which is the safe direction for
 * a destructive action: nothing happens rather than something unconfirmed.
 *
 * `consequences` is a list, not a sentence, because these actions have more than
 * one and burying the second in prose is how people miss it.
 */
export function ConfirmSubmit({
  action,
  hidden,
  trigger,
  title,
  consequences,
  confirmLabel,
  triggerVariant = "danger",
}: {
  action: (formData: FormData) => void | Promise<void>;
  hidden?: Record<string, string>;
  trigger: string;
  title: string;
  consequences: readonly string[];
  confirmLabel: string;
  triggerVariant?: "danger" | "ghost";
}) {
  const dialog = useRef<HTMLDialogElement>(null);

  return (
    <form action={action}>
      {hidden
        ? Object.entries(hidden).map(([name, value]) => (
            <input key={name} type="hidden" name={name} value={value} />
          ))
        : null}

      <Button type="button" variant={triggerVariant} onClick={() => dialog.current?.showModal()}>
        {trigger}
      </Button>

      {/* backdrop:bg-deep-slate/50 rather than an opacity animation: §8 keeps
          motion to colour and position, and a fading scrim is neither. */}
      <dialog
        ref={dialog}
        aria-labelledby="confirm-title"
        className="max-w-md border-2 border-deep-slate bg-parchment p-6 text-deep-slate backdrop:bg-deep-slate/50"
      >
        <h2 id="confirm-title" className="font-serif text-3xl leading-[0.9] tracking-tighter">
          {title}
        </h2>

        <ul className="mt-5 space-y-2 border-t-2 border-deep-slate pt-5 text-sm">
          {consequences.map((line) => (
            <li key={line} className="flex gap-3">
              <span aria-hidden="true" className="mt-2 size-1.5 shrink-0 bg-terracotta" />
              <span>{line}</span>
            </li>
          ))}
        </ul>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          {/* Confirm first in the DOM so it is the first thing reached by
              keyboard, but drawn rather than filled -- §2.1 reserves the
              terracotta fill for the action a screen wants you to take, and
              this is not one of those. */}
          <Button type="submit" variant="danger">
            {confirmLabel}
          </Button>
          <Button type="button" variant="ghost" onClick={() => dialog.current?.close()}>
            {copy.confirm.cancel}
          </Button>
        </div>
      </dialog>
    </form>
  );
}
