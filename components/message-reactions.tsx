"use client";

import { useState } from "react";

import { copy } from "@/lib/copy";
import { cn } from "@/lib/utils";
import type { Reaction } from "@/lib/message-interactions";

/**
 * C2. The reaction bar under a message.
 *
 * DESIGN (f4milia-design-system.md): zero radius everywhere, 2px borders, the
 * hand-rolled-button focus form (`outline-2 outline-offset-2 outline-terracotta`)
 * rather than the primitive `ring` form, and terracotta reserved for the ONE
 * meaning it carries -- "you are in this". A count you reacted to is terracotta
 * bordered; the others are ink at /20. No hover tints, because a tinted fill
 * over a tinted ground is how the destructive button reached 4.11:1 while
 * passing every token-level guard.
 *
 * ACCESSIBILITY. The "you reacted" state is a BORDER, which a screen reader
 * cannot perceive -- so the accessible name carries it in words. `aria-pressed`
 * expresses the toggle, and the emoji itself is `aria-hidden` inside a labelled
 * button: read out raw, "thumbs up sign" ahead of the count is noise.
 *
 * CONTRAST, MEASURED AS RENDERED rather than read off tokens -- the lesson from
 * the destructive button, which passed every token-level guard at 4.11:1:
 *
 *   text-deep-slate on parchment          15.87:1  (counts)          AA
 *   text-terracotta on parchment           4.70:1  (failure status)  AA
 *   border-terracotta on parchment         4.70:1  (you reacted)     1.4.11
 *   border-deep-slate/20 on parchment      1.52:1  (not reacted)     see below
 *
 * The last one does not reach 1.4.11's 3:1, and it is NOT this component's to
 * fix: `/20` is the design system's own border value, used by Input and by the
 * example button in section 6. Diverging here would make one control
 * inconsistent with every other and leave the system's value unexamined.
 *
 * What makes the control identifiable without that border: it contains its own
 * text at 15.87:1, it is a real <button> with an accessible name, and the STATE
 * that must be distinguishable -- "you reacted" -- is carried by the terracotta
 * border at 4.70:1 AND by aria-pressed AND by the accessible name. The border
 * at /20 is the resting decoration, not the state.
 *
 * Reported for the design system rather than patched around.
 */

const PICKER = ["👍", "❤️", "🧱", "🙏", "😂", "😮"] as const;

export type MessageReactionsProps = {
  reactions: Reaction[];
  /** Adds or removes the caller's own reaction. Toggling is the caller's job. */
  onToggle: (emoji: string) => void | Promise<void>;
  /** Hidden entirely when the viewer cannot post -- a departed member, say. */
  canReact?: boolean;
  className?: string;
};

export function MessageReactions({
  reactions,
  onToggle,
  canReact = true,
  className,
}: MessageReactionsProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [failed, setFailed] = useState(false);

  async function toggle(emoji: string) {
    setFailed(false);
    try {
      await onToggle(emoji);
      setPickerOpen(false);
    } catch {
      // A refusal the member caused something to happen for, so it says so
      // rather than failing silently.
      setFailed(true);
    }
  }

  const visible = reactions.filter((r) => r.count > 0);

  return (
    <div className={cn("flex flex-wrap items-center gap-1", className)}>
      {visible.map((reaction) => (
        <button
          key={reaction.emoji}
          type="button"
          aria-pressed={reaction.reactedByMe}
          aria-label={copy.conversations.reactions.count(
            reaction.emoji,
            reaction.count,
            reaction.reactedByMe,
          )}
          onClick={() => void toggle(reaction.emoji)}
          disabled={!canReact}
          className={cn(
            "inline-flex h-8 select-none items-center gap-1 border-2 px-2 text-sm",
            "transition-colors active:translate-y-px",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta",
            "disabled:pointer-events-none disabled:opacity-50",
            reaction.reactedByMe
              ? "border-terracotta text-deep-slate"
              : "border-deep-slate/20 text-deep-slate",
          )}
        >
          <span aria-hidden="true">{reaction.emoji}</span>
          <span className="font-mono text-xs">{reaction.count}</span>
        </button>
      ))}

      {canReact ? (
        <div className="relative">
          <button
            type="button"
            aria-expanded={pickerOpen}
            aria-label={copy.conversations.reactions.add}
            onClick={() => setPickerOpen((open) => !open)}
            className={cn(
              "inline-flex h-8 select-none items-center border-2 border-deep-slate/20 px-2",
              "text-sm text-deep-slate transition-colors active:translate-y-px",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta",
            )}
          >
            <span aria-hidden="true">+</span>
          </button>

          {pickerOpen ? (
            <div
              role="group"
              aria-label={copy.conversations.reactions.pickerLabel}
              className="absolute bottom-full left-0 z-10 mb-1 flex gap-1 border-2 border-deep-slate bg-parchment p-1"
            >
              {PICKER.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  aria-label={emoji}
                  onClick={() => void toggle(emoji)}
                  className={cn(
                    "inline-flex h-8 w-8 items-center justify-center text-base",
                    "transition-colors active:translate-y-px",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta",
                  )}
                >
                  <span aria-hidden="true">{emoji}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {failed ? (
        <span role="status" className="text-xs text-terracotta">
          {copy.conversations.reactions.failed}
        </span>
      ) : null}
    </div>
  );
}
