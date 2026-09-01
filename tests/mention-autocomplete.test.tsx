import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  MentionAutocomplete,
  filterCandidates,
} from "../components/mention-autocomplete";
import { copy } from "../lib/copy";

const CANDIDATES = [
  { membershipId: "m1", displayName: "Ana Ruiz" },
  { membershipId: "m2", displayName: "Joanna Bell" },
  { membershipId: "m3", displayName: "Bob Stone" },
];

describe("filterCandidates", () => {
  it("matches a prefix of the whole name", () => {
    expect(filterCandidates(CANDIDATES, "ana").map((c) => c.displayName)).toEqual([
      "Ana Ruiz",
    ]);
  });

  it("matches a prefix of any word, so a surname works", () => {
    expect(filterCandidates(CANDIDATES, "ru").map((c) => c.displayName)).toEqual([
      "Ana Ruiz",
    ]);
  });

  it("does NOT match mid-word", () => {
    // "@an" must not surface "Joanna". A substring match is how someone
    // mentions the wrong person -- and a mention notifies them.
    expect(filterCandidates(CANDIDATES, "an").map((c) => c.displayName)).toEqual([
      "Ana Ruiz",
    ]);
  });

  it("shows everyone for an empty query", () => {
    expect(filterCandidates(CANDIDATES, "")).toHaveLength(3);
  });
});

describe("MentionAutocomplete", () => {
  it("is a labelled listbox, so its appearance is announced", () => {
    render(
      <MentionAutocomplete
        query=""
        candidates={CANDIDATES}
        activeIndex={0}
        onChoose={vi.fn()}
        listboxId="mentions"
      />,
    );
    const list = screen.getByRole("listbox", {
      name: copy.conversations.mentions.listLabel,
    });
    expect(list).toBeTruthy();
    expect(screen.getAllByRole("option")).toHaveLength(3);
  });

  it("marks the active option with aria-selected", () => {
    render(
      <MentionAutocomplete
        query=""
        candidates={CANDIDATES}
        activeIndex={1}
        onChoose={vi.fn()}
        listboxId="mentions"
      />,
    );
    const options = screen.getAllByRole("option");
    expect(options[1].getAttribute("aria-selected")).toBe("true");
    expect(options[0].getAttribute("aria-selected")).toBe("false");
  });

  it("says a mention notifies, at the point of choosing", () => {
    render(
      <MentionAutocomplete
        query=""
        candidates={CANDIDATES}
        activeIndex={0}
        onChoose={vi.fn()}
        listboxId="mentions"
      />,
    );
    expect(screen.getByText(copy.conversations.mentions.hint)).toBeTruthy();
  });

  it("chooses on mousedown, not click", () => {
    // The composer holds focus. A click would blur it first, closing the list
    // before the choice registers -- so pointer users could not pick at all.
    const onChoose = vi.fn();
    render(
      <MentionAutocomplete
        query=""
        candidates={CANDIDATES}
        activeIndex={0}
        onChoose={onChoose}
        listboxId="mentions"
      />,
    );
    const option = screen.getAllByRole("option")[2];
    option.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    expect(onChoose).toHaveBeenCalledWith(CANDIDATES[2]);
  });

  it("states an honest empty result with nothing invented", () => {
    render(
      <MentionAutocomplete
        query="zzz"
        candidates={CANDIDATES}
        activeIndex={0}
        onChoose={vi.fn()}
        listboxId="mentions"
      />,
    );
    expect(screen.getByText(copy.conversations.mentions.noMatches)).toBeTruthy();
    expect(screen.queryByRole("listbox")).toBeNull();
  });
});
