"use client";

import { useState } from "react";

import { copy } from "@/lib/copy";
import { cn } from "@/lib/utils";
import type { Attachment } from "@/lib/message-interactions";

/**
 * C2. The attachments on one message.
 *
 * THE BUCKET IS PRIVATE, so there is no URL to render. A download is a SIGNED
 * URL minted on demand, which is why this is a button rather than an anchor --
 * and why the signing happens on CLICK rather than on render. Signing every
 * attachment up front would mean one request per attachment per message just to
 * paint the room, and would hand the browser a pile of live credentials for
 * files nobody opened.
 *
 * The filename is shown, the size is monospace per the Ledger metadata rule,
 * and nothing is previewed inline. An inline image preview would render Family
 * content into a room a shoulder can see, and would do it for every attachment
 * whether or not anyone asked -- that is a product decision, not a default.
 */

export type MessageAttachmentsProps = {
  attachments: Attachment[];
  /** Mints a signed URL. Returns null when the object is gone. */
  onDownload: (attachment: Attachment) => Promise<string | null>;
  className?: string;
};

/** The last path segment, minus the uuid the upload prefixes for uniqueness. */
export function displayNameOf(storagePath: string): string {
  const last = storagePath.split("/").pop() ?? storagePath;
  const dash = last.indexOf("-");
  return dash === -1 ? last : last.slice(dash + 1);
}

export function MessageAttachments({
  attachments,
  onDownload,
  className,
}: MessageAttachmentsProps) {
  const [failed, setFailed] = useState<string | null>(null);

  if (attachments.length === 0) return null;

  async function download(attachment: Attachment) {
    setFailed(null);
    try {
      const url = await onDownload(attachment);
      if (!url) {
        setFailed(attachment.id);
        return;
      }
      window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      setFailed(attachment.id);
    }
  }

  return (
    <ul className={cn("mt-2 space-y-1", className)}>
      {attachments.map((attachment) => {
        const name = displayNameOf(attachment.storagePath);
        return (
          <li key={attachment.id}>
            <button
              type="button"
              aria-label={copy.conversations.attachment.download(name)}
              onClick={() => void download(attachment)}
              className={cn(
                "inline-flex max-w-full items-center gap-2 border-2 border-deep-slate/20 px-2 py-1",
                "text-left text-sm text-deep-slate transition-colors active:translate-y-px",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta",
              )}
            >
              <span className="truncate">{name}</span>
              <span className="shrink-0 font-mono text-xs text-deep-slate/70">
                {copy.conversations.attachment.size(attachment.byteSize)}
              </span>
            </button>
            {failed === attachment.id ? (
              <p role="status" className="text-xs text-terracotta">
                {copy.conversations.attachment.failed}
              </p>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
