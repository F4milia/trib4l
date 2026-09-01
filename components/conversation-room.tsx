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

  const channelRef = useRef<RealtimeChannel | null>(null);
  const lastTypingSentAt = useRef(0);
  const bottomRef = useRef<HTMLDivElement | null>(null);

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

  function onDraftChange(value: string) {
    setDraft(value);
    setError(null);
    const now = Date.now();
    if (value.length > 0 && now - lastTypingSentAt.current > TYPING_THROTTLE_MS) {
      lastTypingSentAt.current = now;
      if (channelRef.current) sendTyping(channelRef.current, ownMembershipId);
    }
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
      const sent = await sendMessage(supabase, { orgId, conversationId, body });
      // The realtime echo may arrive first or not at all if the socket
      // dropped; dedupe on id rather than trusting either path.
      setMessages((prev) => (prev.some((m) => m.id === sent.id) ? prev : [...prev, sent]));
      setDraft("");
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
            {messages.map((message) => {
              const mine = message.authorMembershipId === ownMembershipId;
              return (
                <li
                  key={message.id}
                  className="grid grid-cols-[4.5rem_1fr] gap-3 border-b border-deep-slate/15 pb-3 last:border-b-0"
                >
                  <time
                    className="font-mono text-xs text-deep-slate/60"
                    dateTime={message.createdAt}
                  >
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
                  </div>
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
        <Label htmlFor="conversation-composer">{copy.conversations.composerLabel}</Label>
        <Textarea
          id="conversation-composer"
          name="body"
          rows={3}
          value={draft}
          maxLength={MESSAGE_MAX_LENGTH}
          placeholder={copy.conversations.composerPlaceholder}
          onChange={(event) => onDraftChange(event.target.value)}
          onKeyDown={(event) => {
            // Enter sends, Shift+Enter is a newline. Both reachable by
            // keyboard alone, which is the point.
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void submit();
            }
          }}
        />
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
