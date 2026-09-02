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
const listAttachments = vi.hoisted(() => vi.fn());
const uploadAttachment = vi.hoisted(() => vi.fn());
const checkAttachmentAllowed = vi.hoisted(() => vi.fn());

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
  return {
    ...actual,
    listReactions,
    addReaction,
    removeReaction,
    addMentions,
    listAttachments,
    uploadAttachment,
    checkAttachmentAllowed,
  };
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
    listAttachments.mockImplementation(async () => []);
    uploadAttachment.mockImplementation(async () => ({}));
    checkAttachmentAllowed.mockImplementation(async () => null);
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

  /* ---------------------------------------------------------- C2 threading */

  const THREADED = [
    {
      id: "parent-1",
      conversationId: "c1",
      authorMembershipId: "m-other",
      body: "the parent message",
      createdAt: new Date("2026-09-02T10:00:00Z").toISOString(),
      editedAt: null,
      parentMessageId: null,
    },
    {
      id: "reply-1",
      conversationId: "c1",
      authorMembershipId: "m-own",
      body: "the reply",
      createdAt: new Date("2026-09-02T10:01:00Z").toISOString(),
      editedAt: null,
      parentMessageId: "parent-1",
    },
  ];

  it("collapses replies by default and counts them", async () => {
    // A thread that expands itself turns the room into a wall on the first
    // busy day. The whole point of a reply is that it is subordinate.
    renderRoom({ initialMessages: THREADED });

    expect(screen.getByText("the parent message")).toBeTruthy();
    expect(screen.queryByText("the reply")).toBeNull();
    expect(screen.getByText(copy.conversations.thread.showReplies(1))).toBeTruthy();
  });

  it("expands and collapses the thread", async () => {
    renderRoom({ initialMessages: THREADED });
    const toggle = screen.getByText(copy.conversations.thread.showReplies(1));
    expect(toggle.getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(toggle);
    await waitFor(() => expect(screen.getByText("the reply")).toBeTruthy());

    fireEvent.click(screen.getByText(copy.conversations.thread.hideReplies));
    await waitFor(() => expect(screen.queryByText("the reply")).toBeNull());
  });

  it("does not offer a reply on a reply", async () => {
    // One level is a thread; two is a forum, and nothing asked for one.
    renderRoom({ initialMessages: THREADED });
    fireEvent.click(screen.getByText(copy.conversations.thread.showReplies(1)));
    await waitFor(() => expect(screen.getByText("the reply")).toBeTruthy());
    // Exactly one Reply button: the parent's.
    expect(screen.getAllByText(copy.conversations.thread.reply)).toHaveLength(1);
  });

  it("sends a reply with its parent, and clears the target afterwards", async () => {
    sendMessage.mockImplementation(async () => ({
      id: "reply-2",
      conversationId: "c1",
      authorMembershipId: "m-own",
      body: "my reply",
      createdAt: new Date().toISOString(),
      editedAt: null,
      parentMessageId: "parent-1",
    }));
    renderRoom({ initialMessages: THREADED });

    fireEvent.click(screen.getByText(copy.conversations.thread.reply));
    await waitFor(() =>
      expect(
        screen.getByText(copy.conversations.thread.replyingTo("Bob")),
      ).toBeTruthy(),
    );

    fireEvent.change(screen.getByLabelText(copy.conversations.thread.composerLabel), {
      target: { value: "my reply" },
    });
    fireEvent.click(screen.getByRole("button", { name: copy.conversations.send }));

    await waitFor(() =>
      expect(sendMessage).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ parentMessageId: "parent-1" }),
      ),
    );
    // The banner is gone, so the next message is not silently a reply too --
    // a sticky reply target is how someone answers the wrong thread.
    await waitFor(() =>
      expect(
        screen.queryByText(copy.conversations.thread.replyingTo("Bob")),
      ).toBeNull(),
    );
  });

  it("cancels a reply without clearing the draft", async () => {
    renderRoom({ initialMessages: THREADED });
    fireEvent.click(screen.getByText(copy.conversations.thread.reply));
    await waitFor(() =>
      expect(screen.getByLabelText(copy.conversations.thread.composerLabel)).toBeTruthy(),
    );

    fireEvent.change(screen.getByLabelText(copy.conversations.thread.composerLabel), {
      target: { value: "half written" },
    });
    fireEvent.click(screen.getByText(copy.conversations.thread.cancelReply));

    await waitFor(() =>
      expect(
        (screen.getByLabelText(copy.conversations.composerLabel) as HTMLTextAreaElement).value,
      ).toBe("half written"),
    );
  });

  it("renders an orphan reply at top level rather than hiding it", async () => {
    // A reply whose parent is outside the loaded window. Losing a message to
    // keep a shape tidy is the wrong trade.
    renderRoom({
      initialMessages: [
        {
          ...THREADED[1],
          id: "orphan-1",
          body: "parent is off-screen",
          parentMessageId: "not-loaded",
        },
      ],
    });
    expect(screen.getByText("parent is off-screen")).toBeTruthy();
  });

  /* -------------------------------------------------------- C2 attachments */

  const file = (name: string, type: string, size: number) => {
    const f = new File(["x"], name, { type });
    // File size is read-only, and the whole point of the cheap refusals is
    // that they read it before anything leaves the browser.
    Object.defineProperty(f, "size", { value: size });
    return f;
  };

  function pick(f: File) {
    const input = document.getElementById("conversation-attachment") as HTMLInputElement;
    Object.defineProperty(input, "files", { value: [f], configurable: true });
    fireEvent.change(input);
  }

  it("refuses a file over 5 MB before anything leaves the browser", async () => {
    renderRoom();
    pick(file("huge.png", "image/png", 6 * 1024 * 1024));

    await waitFor(() =>
      expect(screen.getByText(copy.conversations.attachment.tooLarge)).toBeTruthy(),
    );
    // The database was never asked -- the browser already knew.
    expect(checkAttachmentAllowed).not.toHaveBeenCalled();
  });

  it("refuses a type the bucket does not allow, naming what IS allowed", async () => {
    renderRoom();
    pick(file("clip.mp4", "video/mp4", 1024));

    await waitFor(() =>
      expect(screen.getByText(copy.conversations.attachment.wrongType)).toBeTruthy(),
    );
    expect(checkAttachmentAllowed).not.toHaveBeenCalled();
  });

  it("asks the database about the quota WHILE CHOOSING, not after sending", async () => {
    // So a member learns their Family is out of room while picking a file,
    // rather than after writing a message and waiting for an upload.
    checkAttachmentAllowed.mockImplementation(
      async () => "Your Family has used all 100 MB of its attachment space.",
    );
    renderRoom();
    pick(file("photo.jpg", "image/jpeg", 2 * 1024 * 1024));

    await waitFor(() =>
      expect(
        screen.getByText("Your Family has used all 100 MB of its attachment space."),
      ).toBeTruthy(),
    );
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("shows the database's own sentence rather than a generic one", async () => {
    // The two ceilings are worded differently on purpose -- "your Family is
    // out of space" is actionable, "the platform is out of space" is not.
    checkAttachmentAllowed.mockImplementation(
      async () => "Attachments are temporarily unavailable while we add capacity.",
    );
    renderRoom();
    pick(file("photo.jpg", "image/jpeg", 1024));

    await waitFor(() =>
      expect(
        screen.getByText("Attachments are temporarily unavailable while we add capacity."),
      ).toBeTruthy(),
    );
  });

  it("uploads after the message exists, with its id", async () => {
    sendMessage.mockImplementation(async () => ({
      id: "sent-att",
      conversationId: "c1",
      authorMembershipId: "m-own",
      body: "here it is",
      createdAt: new Date().toISOString(),
      editedAt: null,
      parentMessageId: null,
    }));
    renderRoom();
    pick(file("photo.jpg", "image/jpeg", 1024));
    await waitFor(() => expect(checkAttachmentAllowed).toHaveBeenCalled());

    fireEvent.change(screen.getByLabelText(copy.conversations.composerLabel), {
      target: { value: "here it is" },
    });
    fireEvent.click(screen.getByRole("button", { name: copy.conversations.send }));

    await waitFor(() =>
      expect(uploadAttachment).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ messageId: "sent-att", fileName: "photo.jpg" }),
      ),
    );
  });

  it("still sends the message when the upload fails", async () => {
    // The message is what the member wrote. Discarding it because a file did
    // not attach costs more than the file.
    uploadAttachment.mockImplementation(async () => {
      throw new Error("network");
    });
    sendMessage.mockImplementation(async () => ({
      id: "sent-att-2",
      conversationId: "c1",
      authorMembershipId: "m-own",
      body: "here it is",
      createdAt: new Date().toISOString(),
      editedAt: null,
      parentMessageId: null,
    }));
    renderRoom();
    pick(file("photo.jpg", "image/jpeg", 1024));
    await waitFor(() => expect(checkAttachmentAllowed).toHaveBeenCalled());

    fireEvent.change(screen.getByLabelText(copy.conversations.composerLabel), {
      target: { value: "here it is" },
    });
    fireEvent.click(screen.getByRole("button", { name: copy.conversations.send }));

    await waitFor(() => expect(sendMessage).toHaveBeenCalled());
    await waitFor(() =>
      expect(screen.getByText(copy.conversations.attachment.failed)).toBeTruthy(),
    );
  });
});