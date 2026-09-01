import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { MessageReactions } from "../components/message-reactions";
import { copy } from "../lib/copy";

// Declared bare and installed in beforeEach: `vi.fn(impl)` INFERS the mock's
// signature from that impl, so a later mockImplementation reading a different
// argument stops typechecking. Learned the hard way in C1 PR7.
const onToggle = vi.fn();

beforeEach(() => {
  // Module-level mocks keep their call history across tests in the same file,
  // and a test that counts calls otherwise counts the previous test's.
  vi.clearAllMocks();
  onToggle.mockImplementation(async () => {});
});

const REACTIONS = [
  { emoji: "👍", count: 2, reactedByMe: false },
  { emoji: "🧱", count: 1, reactedByMe: true },
];

describe("MessageReactions", () => {
  it("carries the you-reacted state in WORDS, not only in the border", async () => {
    // The visual affordance is a terracotta border, which a screen reader
    // cannot perceive. If the state lived only there, the control would be
    // ambiguous to exactly the people who cannot see it.
    render(<MessageReactions reactions={REACTIONS} onToggle={onToggle} />);

    expect(
      screen.getByLabelText(copy.conversations.reactions.count("🧱", 1, true)),
    ).toBeTruthy();
    expect(
      screen.getByLabelText(copy.conversations.reactions.count("👍", 2, false)),
    ).toBeTruthy();
  });

  it("expresses the toggle with aria-pressed", () => {
    render(<MessageReactions reactions={REACTIONS} onToggle={onToggle} />);
    const mine = screen.getByLabelText(copy.conversations.reactions.count("🧱", 1, true));
    expect(mine.getAttribute("aria-pressed")).toBe("true");
    const theirs = screen.getByLabelText(copy.conversations.reactions.count("👍", 2, false));
    expect(theirs.getAttribute("aria-pressed")).toBe("false");
  });

  it("toggles an existing reaction", async () => {
    render(<MessageReactions reactions={REACTIONS} onToggle={onToggle} />);
    fireEvent.click(screen.getByLabelText(copy.conversations.reactions.count("👍", 2, false)));
    await waitFor(() => expect(onToggle).toHaveBeenCalledWith("👍"));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("opens the picker and adds a new reaction", async () => {
    render(<MessageReactions reactions={[]} onToggle={onToggle} />);

    const add = screen.getByLabelText(copy.conversations.reactions.add);
    expect(add.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(add);
    expect(add.getAttribute("aria-expanded")).toBe("true");

    fireEvent.click(screen.getByLabelText("❤️"));
    await waitFor(() => expect(onToggle).toHaveBeenCalledWith("❤️"));
  });

  it("says so when a reaction fails, rather than failing silently", async () => {
    onToggle.mockImplementation(async () => {
      throw new Error("network");
    });
    render(<MessageReactions reactions={REACTIONS} onToggle={onToggle} />);

    fireEvent.click(screen.getByLabelText(copy.conversations.reactions.count("👍", 2, false)));
    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toBe(
        copy.conversations.reactions.failed,
      ),
    );
  });

  it("hides the picker entirely when the viewer cannot react", () => {
    // A departed member. Disabled-but-present would invite a click that can
    // only ever fail.
    render(<MessageReactions reactions={REACTIONS} onToggle={onToggle} canReact={false} />);
    expect(screen.queryByLabelText(copy.conversations.reactions.add)).toBeNull();
  });

  it("renders no empty counts", () => {
    // A zero-count reaction is a row that used to exist. Rendering it would
    // show a member that someone un-reacted, which is not information the
    // product offers anywhere else.
    render(
      <MessageReactions
        reactions={[{ emoji: "👍", count: 0, reactedByMe: false }]}
        onToggle={onToggle}
      />,
    );
    expect(screen.queryByText("0")).toBeNull();
  });
});
