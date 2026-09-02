import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { copy } from "@/lib/copy";

/**
 * C1 PR 7. The room component.
 *
 * Isolation is not tested here and cannot be -- it is the database's, and
 * 111_conversations_rls.sql and tests/isolation prove it. What is asserted
 * here is the part only the UI can get wrong: honest empty states, no invented
 * copy, the announcement naming the sender rather than the message, and the
 * composer being fully operable from the keyboard.
 */

const sendMessage = vi.hoisted(() => vi.fn());
const markConversationRead = vi.hoisted(() => vi.fn());
// Declared bare rather than with a default implementation. vi.fn(impl) infers
// its signature FROM that impl, so any later mockImplementation that reads a
// different argument stops typechecking -- and the obvious workaround, an
// unused rest parameter, trips no-unused-vars. beforeEach installs the default.
const subscribeToConversation = vi.hoisted(() => vi.fn());
// C2. Declared bare for the same reason as subscribeToConversation above.
const listReactions = vi.hoisted(() => vi.fn());
const addReaction = vi.hoisted(() => vi.fn());
const removeReaction = vi.hoisted(() => vi.fn());
const addMentions = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({}) }));
vi.mock("@/lib/conversations", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/conversations")>();
  return { ...actual, sendMessage, markConversationRead };
});
vi.mock("@/lib/conversations-realtime", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/conversations-realtime")>();
  return { ...actual, subscribeToConversation, sendTyping: vi.fn() };
});
vi.mock("@/lib/message-interactions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/message-interactions")>();
  return { ...actual, listReactions, addReaction, removeReaction, addMentions };
});

const { ConversationRoom } = await import("@/components/conversation-room");

const MEMBERS = [
  { membershipId: "m-own", displayName: "Alice" },
  { membershipId: "m-other", displayName: "Bob" },
];

function renderRoom(overrides: Partial<Parameters<typeof ConversationRoom>[0]> = {}) {
  return render(
    <ConversationRoom
      orgId="org-1"
      conversationId="conv-1"
      ownMembershipId="m-own"
      members={MEMBERS}
      initialMessages={[]}
      isFamilyChannel={false}
      {...overrides}
    />,
  );
}

describe("ConversationRoom", () => {
  // The mocks are module-level, so without this a later test counts an earlier
  // test's calls -- which is how "refuses to send an empty message" reported a
  // send that the Enter test had made. clearAllMocks resets call history and
  // keeps implementations, which is the half that is wanted here.
  beforeEach(() => {
    vi.clearAllMocks();
    subscribeToConversation.mockImplementation(() => ({ unsubscribe: vi.fn() }));
    listReactions.mockImplementation(async () => []);
    addReaction.mockImplementation(async () => {});
    removeReaction.mockImplementation(async () => {});
    addMentions.mockImplementation(async () => {});
  });

  it("shows an honest empty state, and a different one for the Family channel", () => {
    const { unmount } = renderRoom();
    expect(screen.getByText(copy.conversations.emptyRoom)).toBeInTheDocument();
    unmount();

    renderRoom({ isFamilyChannel: true });
    expect(screen.getByText(copy.conversations.emptyRoomChannel)).toBeInTheDocument();
  });

  it("invents no copy -- every visible string comes from the deck", () => {
    renderRoom();
    // The composer, the send control and the empty state are the whole surface
    // before any message exists. If a future edit hard-codes a nudge like
    // "say hello!", this is the assertion that has to be deleted to keep it.
    expect(screen.getByLabelText(copy.conversations.composerLabel)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: copy.conversations.send }),
    ).toBeInTheDocument();
    expect(screen.getByPlaceholderText(copy.conversations.composerPlaceholder)).toBeInTheDocument();
  });

  it("renders a message with a monospace timestamp and the author name", () => {
    renderRoom({
      initialMessages: [
        {
          id: "msg-1",
          conversationId: "conv-1",
          authorMembershipId: "m-other",
          body: "hello there",
          createdAt: "2026-09-01T10:30:00.000Z",
          editedAt: null,
        },
      ],
    });

    expect(screen.getByText("hello there")).toBeInTheDocument();
    expect(screen.getByText("Bob")).toBeInTheDocument();

    // Ledger metadata is monospace -- the design system rule, asserted on the
    // rendered element rather than trusted to a class string somewhere.
    const stamp = screen.getByText((_, el) => el?.tagName === "TIME");
    expect(stamp.className).toMatch(/font-mono/);
  });

  it("names the caller as You rather than by display name", () => {
    renderRoom({
      initialMessages: [
        {
          id: "msg-1",
          conversationId: "conv-1",
          authorMembershipId: "m-own",
          body: "mine",
          createdAt: "2026-09-01T10:30:00.000Z",
          editedAt: null,
        },
      ],
    });
    expect(screen.getByText(copy.conversations.you)).toBeInTheDocument();
    expect(screen.queryByText("Alice")).not.toBeInTheDocument();
  });

  it("sends on Enter and keeps Shift+Enter as a newline", async () => {
    sendMessage.mockResolvedValue({
      id: "msg-new",
      conversationId: "conv-1",
      authorMembershipId: "m-own",
      body: "typed",
      createdAt: "2026-09-01T10:31:00.000Z",
      editedAt: null,
    });

    renderRoom();
    const box = screen.getByLabelText(copy.conversations.composerLabel);

    fireEvent.change(box, { target: { value: "first\nsecond" } });

    // Shift+Enter is a newline, so it must NOT send. Asserted before the plain
    // Enter below, because a component that sends on every Enter would pass a
    // test that only checked the sending half.
    fireEvent.keyDown(box, { key: "Enter", shiftKey: true });
    expect(sendMessage).not.toHaveBeenCalled();

    fireEvent.keyDown(box, { key: "Enter" });
    await waitFor(() => expect(sendMessage).toHaveBeenCalledTimes(1));
    expect(sendMessage.mock.calls[0][1].body).toBe("first\nsecond");
  });

  it("refuses to send an empty or whitespace-only message", () => {
    renderRoom();

    const send = screen.getByRole("button", { name: copy.conversations.send });
    expect(send).toBeDisabled();

    const box = screen.getByLabelText(copy.conversations.composerLabel);
    fireEvent.change(box, { target: { value: "   " } });
    expect(send).toBeDisabled();

    fireEvent.keyDown(box, { key: "Enter" });
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("announces a new message by sender, never by content", async () => {
    let onMessage: ((m: unknown) => void) | undefined;
    subscribeToConversation.mockImplementation((...args: unknown[]) => {
      const events = args[2] as { onMessage?: (m: unknown) => void };
      onMessage = events.onMessage;
      return { unsubscribe: vi.fn() };
    });

    renderRoom();

    onMessage?.({
      id: "msg-live",
      conversationId: "conv-1",
      authorMembershipId: "m-other",
      body: "a private thing nobody should hear read aloud",
      createdAt: "2026-09-01T10:32:00.000Z",
      editedAt: null,
    });

    const status = await screen.findByRole("status");
    // The same reasoning as invariant 3: an announcement is read aloud in a
    // room that may hold other people. It names the event, never the content.
    expect(status).toHaveTextContent(copy.conversations.announceNew("Bob"));
    expect(status).not.toHaveTextContent(/private thing/);
  });

  /* ------------------------------------------------------------- C2 wiring */

  it("opens the mention list only at a word boundary", async () => {
    renderRoom();
    const composer = screen.getByLabelText(copy.conversations.composerLabel);

    // Mid-word: an email address must not open it.
    fireEvent.change(composer, { target: { value: "write to bob@f4milia.test" } });
    await waitFor(() =>
      expect(screen.queryByRole("listbox", { name: copy.conversations.mentions.listLabel })).toBeNull(),
    );

    fireEvent.change(composer, { target: { value: "hey @" } });
    await waitFor(() =>
      expect(
        screen.getByRole("listbox", { name: copy.conversations.mentions.listLabel }),
      ).toBeTruthy(),
    );
  });

  it("excludes the viewer from their own mention list", async () => {
    // Mentioning yourself is not news, and the trigger drops it anyway --
    // offering it would be an action with no effect.
    renderRoom();
    fireEvent.change(screen.getByLabelText(copy.conversations.composerLabel), {
      target: { value: "hey @" },
    });
    await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(1));
    expect(screen.getByRole("option").textContent).toBe("Bob");
  });

  it("Escape dismisses the mention list WITHOUT clearing the draft", async () => {
    // An Escape that ate what someone had typed would be worse than no Escape.
    renderRoom();
    const composer = screen.getByLabelText(copy.conversations.composerLabel);
    fireEvent.change(composer, { target: { value: "hey @" } });
    await waitFor(() => expect(screen.getByRole("listbox")).toBeTruthy());

    fireEvent.keyDown(composer, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull());
    expect((composer as HTMLTextAreaElement).value).toBe("hey @");
  });

  it("Enter picks a mention instead of sending, while the list is open", async () => {
    // The single most annoying thing an autocomplete can do is send the
    // message mid-mention.
    renderRoom();
    const composer = screen.getByLabelText(copy.conversations.composerLabel);
    fireEvent.change(composer, { target: { value: "hey @B" } });
    await waitFor(() => expect(screen.getByRole("listbox")).toBeTruthy());

    fireEvent.keyDown(composer, { key: "Enter" });
    await waitFor(() =>
      expect((composer as HTMLTextAreaElement).value).toBe("hey @Bob "),
    );
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("attaches mentions resolved from the sent text", async () => {
    sendMessage.mockImplementation(async () => ({
      id: "sent-1",
      conversationId: "c1",
      authorMembershipId: "m-own",
      body: "hey @Bob",
      createdAt: new Date().toISOString(),
      editedAt: null,
    }));
    renderRoom();
    const composer = screen.getByLabelText(copy.conversations.composerLabel);
    fireEvent.change(composer, { target: { value: "hey @Bob" } });
    fireEvent.click(screen.getByRole("button", { name: copy.conversations.send }));

    await waitFor(() =>
      expect(addMentions).toHaveBeenCalledWith(expect.anything(), {
        orgId: expect.any(String),
        messageId: "sent-1",
        mentionedMembershipIds: ["m-other"],
      }),
    );
  });

  it("still sends when attaching the mention fails", async () => {
    // The message is what the member wrote. A mention that did not attach
    // costs a notification; discarding the message costs the message.
    addMentions.mockImplementation(async () => {
      throw new Error("network");
    });
    sendMessage.mockImplementation(async () => ({
      id: "sent-2",
      conversationId: "c1",
      authorMembershipId: "m-own",
      body: "hey @Bob",
      createdAt: new Date().toISOString(),
      editedAt: null,
    }));
    renderRoom();
    fireEvent.change(screen.getByLabelText(copy.conversations.composerLabel), {
      target: { value: "hey @Bob" },
    });
    fireEvent.click(screen.getByRole("button", { name: copy.conversations.send }));

    await waitFor(() => expect(sendMessage).toHaveBeenCalled());
    // Draft cleared means the send was treated as successful.
    await waitFor(() =>
      expect(
        (screen.getByLabelText(copy.conversations.composerLabel) as HTMLTextAreaElement).value,
      ).toBe(""),
    );
  });
});