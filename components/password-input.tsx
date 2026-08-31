"use client";

import { Eye, EyeOff } from "lucide-react";
import { useId, useState, type InputHTMLAttributes } from "react";
import { Input } from "@/components/ui";
import { copy } from "@/lib/copy";
import { cn } from "@/lib/utils";

const t = copy.auth.passwordToggle;

/**
 * A password field with a reveal toggle.
 *
 * A client island inside otherwise server-rendered pages -- the only state
 * here is whether the characters are showing, and it deliberately lives
 * nowhere but this component: nothing is persisted, so every arrival at every
 * auth screen starts hidden. A remembered "show password" would be a
 * shoulder-surfing hazard the person did not opt into on this visit.
 *
 * Positioned with the same relative-wrapper pattern Select already uses for
 * its chevron, rather than by widening the shared `field` constant -- that
 * constant is on ~238 call sites and none of the others have a button in them.
 *
 * The toggle is `type="button"`. Inside a <form> the default is `submit`, so
 * omitting it would make revealing your password submit the form.
 */
export function PasswordInput({
  className,
  id,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "type">) {
  const [visible, setVisible] = useState(false);
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const Icon = visible ? EyeOff : Eye;

  return (
    <div className="relative w-full">
      <Input
        {...props}
        id={inputId}
        type={visible ? "text" : "password"}
        className={cn("pr-11", className)}
      />
      <button
        type="button"
        onClick={() => setVisible((shown) => !shown)}
        /**
         * aria-pressed carries the state, so the accessible name can stay
         * fixed rather than changing under the user mid-interaction. aria-label
         * still flips, because a name of "Show password" on a pressed toggle
         * reads as a lie to anyone navigating by name alone.
         */
        aria-pressed={visible}
        aria-controls={inputId}
        aria-label={visible ? t.hide : t.show}
        // size-11 matches the field's h-11: a 44px target, which is WCAG
        // 2.5.5's minimum and the difference between usable and not on a phone.
        className="absolute right-0 top-0 flex size-11 items-center justify-center text-deep-slate/60 transition-colors hover:text-deep-slate focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta"
      >
        <Icon aria-hidden="true" className="size-4" />
      </button>
    </div>
  );
}
