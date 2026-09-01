"use client";

import { useMemo } from "react";

import { copy } from "@/lib/copy";
import { cn } from "@/lib/utils";

/**
 * C2. The list that appears while someone is typing an @mention.
 *
 * SCOPE, AND WHY IT MATTERS MORE THAN THE UI. The candidate list is passed in,
 * already scoped to the current Family by whoever fetched it. This component
 * does no fetching and no filtering by Family -- if it did, it would be a
 * second place where "which Family am I in" is decided, and the one nobody
 * tests. It filters by TYPED PREFIX only.
 *
 * BLOCKS ARE NOT FILTERED HERE EITHER, deliberately. A blocked member is
 * mentionable; what does not happen is the notification, and that is enforced
 * by a trigger at write time so no caller can forget it. Hiding them from this
 * list would tell the blocker who they had blocked, in a list, which is a
 * different leak.
 *
 * ACCESSIBILITY. A combobox listbox: the input keeps focus and owns
 * aria-activedescendant, options are `role="option"` with `aria-selected`, and
 * the whole list is labelled so its appearance is announced rather than silent.
 */

export type MentionCandidate = {
  membershipId: string;
  /** Already resolved by the caller. This component renders, never fetches. */
  displayName: string;
};

export type MentionAutocompleteProps = {
  /** The text after "@". Empty string shows everyone. */
  query: string;
  candidates: MentionCandidate[];
  activeIndex: number;
  onChoose: (candidate: MentionCandidate) => void;
  /** The id of the input this list belongs to, for aria wiring. */
  listboxId: string;
  className?: string;
};

export function filterCandidates(
  candidates: MentionCandidate[],
  query: string,
): MentionCandidate[] {
  const needle = query.trim().toLowerCase();
  if (needle.length === 0) return candidates;
  // Prefix match on the whole name and on each word, so "@ru" finds "Ana Ruiz".
  // Not a substring match: "@an" should not surface "Joanna", which is the
  // kind of result that makes someone mention the wrong person.
  return candidates.filter((candidate) => {
    const name = candidate.displayName.toLowerCase();
    return name.startsWith(needle) || name.split(/\s+/).some((w) => w.startsWith(needle));
  });
}

export function MentionAutocomplete({
  query,
  candidates,
  activeIndex,
  onChoose,
  listboxId,
  className,
}: MentionAutocompleteProps) {
  const matches = useMemo(() => filterCandidates(candidates, query), [candidates, query]);

  return (
    <div
      className={cn(
        "border-2 border-deep-slate bg-parchment",
        className,
      )}
    >
      <p className="border-b border-deep-slate/20 px-2 py-1 font-mono text-xs text-deep-slate/70">
        {copy.conversations.mentions.hint}
      </p>

      {matches.length === 0 ? (
        // Honest empty state: what is true, nothing invented, no suggestion to
        // "try another name".
        <p className="px-2 py-2 text-sm text-deep-slate">
          {copy.conversations.mentions.noMatches}
        </p>
      ) : (
        <ul
          id={listboxId}
          role="listbox"
          aria-label={copy.conversations.mentions.listLabel}
          className="max-h-48 overflow-y-auto"
        >
          {matches.map((candidate, index) => (
            <li
              key={candidate.membershipId}
              id={`${listboxId}-option-${index}`}
              role="option"
              aria-selected={index === activeIndex}
              // onMouseDown, not onClick: the composer has focus, and a click
              // would blur it first -- closing the list before the choice
              // registers. Pointer users otherwise cannot pick at all.
              onMouseDown={(event) => {
                event.preventDefault();
                onChoose(candidate);
              }}
              className={cn(
                "cursor-pointer px-2 py-2 text-sm",
                index === activeIndex
                  ? "bg-deep-slate text-parchment"
                  : "text-deep-slate",
              )}
            >
              {candidate.displayName}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
