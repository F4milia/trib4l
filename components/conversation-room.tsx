"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { copy } from "@/lib/copy";
import { cn } from "@/lib/utils";
import { Button, Label, Textarea } from "@/components/ui";
import {
  MESSAGE_MAX_LENGTH,
  markConversationRead,
  sendMessage,
  type Message,
} from "@/lib/conversations";
import {
  TYPING_THROTTLE_MS,
  TYPING_TIMEOUT_MS,
  sendTyping,
  subscribeToConversation,
} from "@/lib/conversations-realtime";
import {
  addMentions,
  addReaction,
  listReactions,
  removeReaction,
  type Reaction,
} from "@/lib/message-interactions";
import { MessageReactions } from "@/components/message-reactions";
import {
  MentionAutocomplete,
  filterCandidates,
  type MentionCandidate,
} from "@/components/mention-autocomplete";

/**
 * C1 PR 7. One open conversation.
 *
 * Hearth and Material: zero radius comes from the global reset, timestamps and
 * the character counter are monospace because they are Ledger-flavoured
 * metadata, Terracotta appears only on Send, and the loading state is the word
 * rather than a shimmer.
 *
 * The member list arrives from the server already resolved to display names,
 * so this component never queries profiles -- it renders what a page that went
 * through RLS handed it.
 */

export type RoomMember = {
  membershipId: string;
  displayName: string;
};

export type ConversationRoomProps = {
  orgId: string;
  conversationId: string;
  ownMembershipId: string;
  members: RoomMember[];
  initialMessages: Message[];
  isFamilyChannel: boolean;
};

/** Mono, per the Ledger metadata rule. Time only -- the date rail is the page. */
function timeOf(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function ConversationRoom({
  orgId,
  conversationId,
  ownMembershipId,
  members,
  initialMessages,
  isFamilyChannel,
}: ConversationRoomProps) {
  const supabase = useMemo(() => createClient(), []);
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [typing, setTyping] = useState<Record<string, number>>({});
  const [announcement, setAnnouncement] = useState("");

  /**
   * Reaction counts, per message.
   *
   * One request per message, on purpose rather than by oversight.
   * message_reaction_counts() is SECURITY INVOKER and takes a single message
   * id -- which is what keeps a blocked member out of the NUMBER as well as
   * the list. Batching would mean selecting rows and counting them here, and
   * the count would then be "rows this client happened to fetch" rather than
   * "rows the caller's policies admit". The N requests are the price of the
   * count being the database's answer. Revisit with a set-returning function
   * if a room ever renders enough messages for it to show.
   */
  const [reactions, setReactions] = useState<Record<string, Reaction[]>>({});

  // Mention state. `mentionAnchor` is the index of the "@" being completed, or
  // null when no mention is in progress.
  const [mentionAnchor, setMentionAnchor] = useState<number | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);

  /**
   * Threading.
   *
   * `replyingTo` is the parent id the composer is currently aimed at, or null
   * for a top-level message. `expanded` is the set of parents whose replies are
   * shown -- replies are COLLAPSED BY DEFAULT, because a thread that expands
   * itself turns the room into a wall on the first busy day, and the whole
   * point of a reply is that it is subordinate to something.
   */
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const channelRef = useRef<RealtimeChannel | null>(null);
  const lastTypingSentAt = useRef(0);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  /**
   * Replies grouped by parent, and the top-level list.
   *
   * Derived rather than stored: a reply can arrive over the socket at any
   * moment, and a second copy of the tree would be one more thing to keep in
   * step with `messages`. A reply whose parent is not in the window renders at
   * top level rather than vanishing -- losing a message to keep a shape tidy is
   * the wrong trade.
   */
  const repliesByParent = useMemo(() => {
    const map = new Map<string, Message[]>();
    for (const message of messages) {
      if (!message.parentMessageId) continue;
      const list = map.get(message.parentMessageId) ?? [];
      list.push(message);
      map.set(message.parentMessageId, list);
    }
    return map;
  }, [messages]);

  const topLevel = useMemo(
    () =>
      messages.filter(
        (m) => !m.parentMessageId || !messages.some((p) => p.id === m.parentMessageId),
      ),
    [messages],
  );

  const nameFor = useCallback(
    (membershipId: string) =>
      membershipId === ownMembershipId
        ? copy.conversations.you
        : (members.find((m) => m.membershipId === membershipId)?.displayName ??
          copy.conversations.unknownMember),
    [members, ownMembershipId],
  );

  useEffect(() => {
    const channel = subscribeToConversation(supabase, conversationId, {
      onMessage: (message) => {
        setMessages((prev) =>
          prev.some((m) => m.id === message.id) ? prev : [...prev, message],
        );
        if (message.authorMembershipId !== ownMembershipId) {
          // Names the sender, never the body: invariant 3 is about outbound
          // messages, but a screen reader announcement is read aloud in a room
          // that may have other people in it. Same reasoning, same answer.
          setAnnouncement(copy.conversations.announceNew(nameFor(message.authorMembershipId)));
          void markConversationRead(supabase, conversationId);
        }
      },
      onMessageChanged: (message, deleted) => {
        setMessages((prev) =>
          deleted
            ? prev.filter((m) => m.id !== message.id)
            : prev.map((m) => (m.id === message.id ? message : m)),
        );
      },
      onTyping: (membershipId) => {
        if (membershipId === ownMembershipId) return;
        setTyping((prev) => ({ ...prev, [membershipId]: Date.now() }));
      },
    });
    channelRef.current = channel;

    void markConversationRead(supabase, conversationId);

    return () => {
      channelRef.current = null;
      void channel.unsubscribe();
    };
  }, [supabase, conversationId, ownMembershipId, nameFor]);

  // Expire typing indicators. An interval rather than a timer per person:
  // one timer, however many people are typing.
  useEffect(() => {
    const id = setInterval(() => {
      setTyping((prev) => {
        const cutoff = Date.now() - TYPING_TIMEOUT_MS;
        const next = Object.fromEntries(
          Object.entries(prev).filter(([, at]) => at > cutoff),
        );
        return Object.keys(next).length === Object.keys(prev).length ? prev : next;
      });
    }, 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    // Optional-called: scrollIntoView is not implemented in every DOM the
    // component renders in (jsdom has no layout), and a missing scroll must
    // not take the whole room down with it.
    bottomRef.current?.scrollIntoView?.({ block: "end" });
  }, [messages.length]);

  // Reaction counts follow the message list. Refetched whenever it changes,
  // which includes a realtime arrival -- a message that appears live must not
  // render a reaction bar built from a stale map keyed by a different id.
  useEffect(() => {
    let cancelled = false;
    const ids = messages.map((m) => m.id);
    void Promise.all(
      ids.map(async (id) => [id, await listReactions(supabase, id)] as const),
    )
      .then((entries) => {
        if (cancelled) return;
        setReactions(Object.fromEntries(entries));
      })
      // A failed count must not take the room down. The bar renders empty and
      // the messages stay readable, which is the right trade: reactions are
      // decoration on top of the thing people came for.
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [messages, supabase]);

  async function toggleReaction(messageId: string, emoji: string) {
    const current = reactions[messageId] ?? [];
    const mine = current.find((r) => r.emoji === emoji && r.reactedByMe);

    if (mine) {
      await removeReaction(supabase, { messageId, membershipId: ownMembershipId, emoji });
    } else {
      await addReaction(supabase, {
        orgId,
        messageId,
        membershipId: ownMembershipId,
        emoji,
      });
    }

    // Re-read rather than adjusting the number locally. An optimistic count is
    // a second source of truth for a value whose whole point is that the
    // database decides what the caller may count.
    const fresh = await listReactions(supabase, messageId);
    setReactions((prev) => ({ ...prev, [messageId]: fresh }));
  }

  /**
   * The "@..." currently being typed, or null.
   *
   * Anchored to the LAST "@" before the caret that is at a word boundary, so
   * an email address in the middle of a sentence does not open the list.
   */
  const mentionQuery = useMemo(() => {
    if (mentionAnchor === null) return null;
    const after = draft.slice(mentionAnchor + 1);
    // A space ends the mention. Names with spaces are chosen from the list
    // rather than typed through, which is also what stops "@ana ruiz said" from
    // keeping the list open for the rest of the sentence.
    if (/\s/.test(after)) return null;
    return after;
  }, [draft, mentionAnchor]);

  const mentionCandidates: MentionCandidate[] = useMemo(
    () =>
      members
        .filter((m) => m.membershipId !== ownMembershipId)
        .map((m) => ({ membershipId: m.membershipId, displayName: m.displayName })),
    [members, ownMembershipId],
  );

  const mentionMatches = useMemo(
    () => (mentionQuery === null ? [] : filterCandidates(mentionCandidates, mentionQuery)),
    [mentionCandidates, mentionQuery],
  );

  function chooseMention(candidate: MentionCandidate) {
    if (mentionAnchor === null) return;
    const before = draft.slice(0, mentionAnchor);
    const after = draft.slice(mentionAnchor + 1 + (mentionQuery?.length ?? 0));
    setDraft(`${before}@${candidate.displayName} ${after}`);
    setMentionAnchor(null);
    setMentionIndex(0);
    composerRef.current?.focus();
  }

  /**
   * Resolves "@Name" occurrences in the sent body back to membership ids.
   *
   * Matched against the member list the server already scoped to this Family,
   * so a name that is not in this room resolves to nothing rather than to
   * someone else's membership. Doing it at send time rather than tracking
   * chosen mentions in state means editing the draft by hand cannot leave a
   * mention pointing at a name that is no longer written.
   */
  function mentionedMembershipIds(body: string): string[] {
    const found = new Set<string>();
    for (const candidate of mentionCandidates) {
      if (body.includes(`@${candidate.displayName}`)) found.add(candidate.membershipId);
    }
    return [...found];
  }

  function trackMentionAnchor(value: string, caret: number) {
    const before = value.slice(0, caret);
    const at = before.lastIndexOf("@");
    // Only at a word boundary, so an email address mid-sentence does not open
    // the list.
    const boundary = at === 0 || (at > 0 && /\s/.test(before[at - 1] ?? ""));
    if (at === -1 || !boundary || /\s/.test(before.slice(at + 1))) {
      setMentionAnchor(null);
      return;
    }
    setMentionAnchor(at);
    setMentionIndex(0);
  }

  function onDraftChange(value: string) {
    setDraft(value);
    setError(null);
    const now = Date.now();
    if (value.length > 0 && now - lastTypingSentAt.current > TYPING_THROTTLE_MS) {
      lastTypingSentAt.current = now;
      if (channelRef.current) sendTyping(channelRef.current, ownMembershipId);
    }
  }

  function renderMessage(message: Message) {
    const mine = message.authorMembershipId === ownMembershipId;
    return (
      <div className="grid grid-cols-[4.5rem_1fr] gap-3">
        <time className="font-mono text-xs text-deep-slate/60" dateTime={message.createdAt}>
          {timeOf(message.createdAt)}
        </time>
        <div>
          <p
            className={cn(
              "text-xs uppercase tracking-wide",
              mine ? "text-baked-clay" : "text-deep-slate/70",
            )}
          >
            {nameFor(message.authorMembershipId)}
          </p>
          <p className="whitespace-pre-wrap break-words text-sm text-deep-slate">
            {message.body}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <MessageReactions
              reactions={reactions[message.id] ?? []}
              onToggle={(emoji) => toggleReaction(message.id, emoji)}
            />
            {/* Replies to replies are not offered. One level is a thread; two
                is a forum, and nothing in the product asked for one. */}
            {!message.parentMessageId ? (
              <button
                type="button"
                onClick={() => {
                  setReplyingTo(message.id);
                  setExpanded((prev) => new Set(prev).add(message.id));
                  composerRef.current?.focus();
                }}
                className="font-mono text-xs text-deep-slate underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta"
              >
                {copy.conversations.thread.reply}
              </button>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  async function submit() {
    const body = draft.trim();
    if (body.length === 0 || sending) return;
    if (body.length > MESSAGE_MAX_LENGTH) {
      setError(copy.conversations.tooLong);
      return;
    }

    setSending(true);
    setError(null);
    try {
      const sent = await sendMessage(supabase, {
        orgId,
        conversationId,
        body,
        parentMessageId: replyingTo ?? undefined,
      });

      // Mentions are attached AFTER the message exists, and a failure here does
      // not fail the send. The message is the thing the member wrote; a mention
      // that did not attach costs a notification, and re-raising would discard
      // a message that is already in the room for everyone else.
      const mentioned = mentionedMembershipIds(body);
      if (mentioned.length > 0) {
        try {
          await addMentions(supabase, {
            orgId,
            messageId: sent.id,
            mentionedMembershipIds: mentioned,
          });
        } catch {
          // Deliberately silent. See above.
        }
      }

      // The realtime echo may arrive first or not at all if the socket
      // dropped; dedupe on id rather than trusting either path.
      setMessages((prev) => (prev.some((m) => m.id === sent.id) ? prev : [...prev, sent]));
      setDraft("");
      setMentionAnchor(null);
      setReplyingTo(null);
    } catch {
      // The message text is deliberately not echoed into the error, and
      // nothing is sent to Sentry from here: invariant 12.
      setError(copy.conversations.tooLong);
    } finally {
      setSending(false);
    }
  }

  const typingNames = Object.keys(typing).map(nameFor);
  const remaining = MESSAGE_MAX_LENGTH - draft.trim().length;

  return (
    <div className="flex min-h-0 flex-col gap-5">
      <div
        className="min-h-0 flex-1 space-y-4 overflow-y-auto"
        role="log"
        aria-live="polite"
        aria-relevant="additions"
      >
        {messages.length === 0 ? (
          <p className="text-sm text-deep-slate/70">
            {isFamilyChannel
              ? copy.conversations.emptyRoomChannel
              : copy.conversations.emptyRoom}
          </p>
        ) : (
          <ul className="space-y-4">
            {topLevel.map((message) => {
              const replies = repliesByParent.get(message.id) ?? [];
              const isExpanded = expanded.has(message.id);
              return (
                <li
                  key={message.id}
                  className="border-b border-deep-slate/15 pb-3 last:border-b-0"
                >
                  {renderMessage(message)}

                  {replies.length > 0 ? (
                    <button
                      type="button"
                      aria-expanded={isExpanded}
                      onClick={() =>
                        setExpanded((prev) => {
                          const next = new Set(prev);
                          if (next.has(message.id)) next.delete(message.id);
                          else next.add(message.id);
                          return next;
                        })
                      }
                      className="ml-[5.25rem] mt-2 font-mono text-xs text-deep-slate underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta"
                    >
                      {isExpanded
                        ? copy.conversations.thread.hideReplies
                        : copy.conversations.thread.showReplies(replies.length)}
                    </button>
                  ) : null}

                  {isExpanded ? (
                    <ul className="ml-[5.25rem] mt-2 space-y-3 border-l-2 border-deep-slate/20 pl-3">
                      {replies.map((reply) => (
                        <li key={reply.id}>{renderMessage(reply)}</li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Screen-reader only: the visible log already shows the message. */}
      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>

      <p className="min-h-5 font-mono text-xs text-deep-slate/60" aria-live="polite">
        {typingNames.length > 0 ? copy.conversations.typing(typingNames) : ""}
      </p>

      <form
        className="space-y-2"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        {replyingTo ? (
          <div className="flex items-center justify-between gap-3 border-2 border-deep-slate/20 px-3 py-2">
            <p className="font-mono text-xs text-deep-slate">
              {copy.conversations.thread.replyingTo(
                nameFor(
                  messages.find((m) => m.id === replyingTo)?.authorMembershipId ?? "",
                ),
              )}
            </p>
            <button
              type="button"
              onClick={() => setReplyingTo(null)}
              className="font-mono text-xs text-deep-slate underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta"
            >
              {copy.conversations.thread.cancelReply}
            </button>
          </div>
        ) : null}

        <Label htmlFor="conversation-composer">
          {replyingTo
            ? copy.conversations.thread.composerLabel
            : copy.conversations.composerLabel}
        </Label>
        <div className="relative">
          <Textarea
            id="conversation-composer"
            ref={composerRef}
            name="body"
            rows={3}
            value={draft}
            maxLength={MESSAGE_MAX_LENGTH}
            placeholder={
              replyingTo
                ? copy.conversations.thread.composerPlaceholder
                : copy.conversations.composerPlaceholder
            }
            role="combobox"
            aria-expanded={mentionMatches.length > 0}
            aria-controls="conversation-mentions"
            aria-activedescendant={
              mentionMatches.length > 0
                ? `conversation-mentions-option-${mentionIndex}`
                : undefined
            }
            onChange={(event) => {
              onDraftChange(event.target.value);
              trackMentionAnchor(event.target.value, event.target.selectionStart ?? 0);
            }}
            onKeyDown={(event) => {
              // The mention list owns the arrow keys and Enter WHILE IT IS
              // OPEN. Without this, Enter sends the message mid-mention, which
              // is the single most annoying thing an autocomplete can do.
              if (mentionMatches.length > 0) {
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  setMentionIndex((i) => (i + 1) % mentionMatches.length);
                  return;
                }
                if (event.key === "ArrowUp") {
                  event.preventDefault();
                  setMentionIndex((i) => (i - 1 + mentionMatches.length) % mentionMatches.length);
                  return;
                }
                if (event.key === "Enter" || event.key === "Tab") {
                  event.preventDefault();
                  chooseMention(mentionMatches[mentionIndex]);
                  return;
                }
                if (event.key === "Escape") {
                  // Dismisses the list without clearing the draft. Escape that
                  // ate what someone had typed would be worse than no Escape.
                  event.preventDefault();
                  setMentionAnchor(null);
                  return;
                }
              }
              // Enter sends, Shift+Enter is a newline. Both reachable by
              // keyboard alone, which is the point.
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void submit();
              }
            }}
          />
          {mentionQuery !== null ? (
            <MentionAutocomplete
              className="absolute bottom-full left-0 z-10 mb-1 w-64"
              query={mentionQuery}
              candidates={mentionCandidates}
              activeIndex={mentionIndex}
              onChoose={chooseMention}
              listboxId="conversation-mentions"
            />
          ) : null}
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="font-mono text-xs text-deep-slate/60">
            {remaining <= 100 ? copy.conversations.remaining(remaining) : ""}
          </span>
          <Button type="submit" disabled={sending || draft.trim().length === 0}>
            {sending ? copy.conversations.sending : copy.conversations.send}
          </Button>
        </div>
        {error ? <p className="text-sm text-baked-clay">{error}</p> : null}
      </form>
    </div>
  );
}
