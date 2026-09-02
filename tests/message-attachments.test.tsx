import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  MessageAttachments,
  displayNameOf,
} from "../components/message-attachments";
import { copy } from "../lib/copy";

const onDownload = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  onDownload.mockImplementation(async () => "https://signed.example/x");
  vi.stubGlobal("open", vi.fn());
});

const ATTACHMENTS = [
  {
    id: "a1",
    messageId: "m1",
    storagePath: "org/conv/8f14e45f-photo.jpg",
    mimeType: "image/jpeg",
    byteSize: 2 * 1024 * 1024,
  },
];

describe("displayNameOf", () => {
  it("strips the uuid the upload prefixes for uniqueness", () => {
    // Two members uploading photo.jpg in the same room must not collide, but
    // the member should still see "photo.jpg".
    expect(displayNameOf("org/conv/8f14e45f-photo.jpg")).toBe("photo.jpg");
  });

  it("survives a name with no prefix", () => {
    expect(displayNameOf("photo.jpg")).toBe("photo.jpg");
  });
});

describe("MessageAttachments", () => {
  it("renders nothing when there are none", () => {
    const { container } = render(
      <MessageAttachments attachments={[]} onDownload={onDownload} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("shows the filename and a monospace size", () => {
    render(<MessageAttachments attachments={ATTACHMENTS} onDownload={onDownload} />);
    expect(screen.getByText("photo.jpg")).toBeTruthy();
    expect(screen.getByText(copy.conversations.attachment.size(2 * 1024 * 1024))).toBeTruthy();
  });

  it("signs the URL on CLICK, not on render", () => {
    // The bucket is private. Signing every attachment up front would be one
    // request each just to paint the room, and would hand the browser live
    // credentials for files nobody opened.
    render(<MessageAttachments attachments={ATTACHMENTS} onDownload={onDownload} />);
    expect(onDownload).not.toHaveBeenCalled();
  });

  it("opens the signed URL when activated", async () => {
    render(<MessageAttachments attachments={ATTACHMENTS} onDownload={onDownload} />);
    fireEvent.click(
      screen.getByLabelText(copy.conversations.attachment.download("photo.jpg")),
    );
    await waitFor(() => expect(onDownload).toHaveBeenCalledWith(ATTACHMENTS[0]));
  });

  it("says so when the object is gone, rather than opening nothing", async () => {
    onDownload.mockImplementation(async () => null);
    render(<MessageAttachments attachments={ATTACHMENTS} onDownload={onDownload} />);
    fireEvent.click(
      screen.getByLabelText(copy.conversations.attachment.download("photo.jpg")),
    );
    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toBe(
        copy.conversations.attachment.failed,
      ),
    );
  });

  it("previews nothing inline", () => {
    // An inline image preview renders Family content into a room a shoulder
    // can see, for every attachment, whether or not anyone asked. That is a
    // product decision, not a default.
    const { container } = render(
      <MessageAttachments attachments={ATTACHMENTS} onDownload={onDownload} />,
    );
    expect(container.querySelector("img")).toBeNull();
  });
});
