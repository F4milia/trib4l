"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui";
import { MAX_VIDEO_FILE_SIZE_BYTES } from "@/lib/mux";

// The one place in this app a file has to leave the browser without
// going through a Server Action: Mux's signed upload URL is a direct
// PUT target (Google Cloud Storage under the hood), not our own server,
// so this step genuinely needs client-side JS rather than a form post.
export function VideoFileUploader({
  uploadUrl,
  orgSlug,
  videosPath,
}: {
  uploadUrl: string;
  orgSlug: string;
  videosPath: string;
}) {
  const [status, setStatus] = useState<"idle" | "uploading" | "done" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > MAX_VIDEO_FILE_SIZE_BYTES) {
      setStatus("error");
      setErrorMessage(`That file is larger than the ${Math.round(MAX_VIDEO_FILE_SIZE_BYTES / (1024 * 1024))} MB limit.`);
      return;
    }

    setStatus("uploading");
    setErrorMessage(null);
    try {
      const response = await fetch(uploadUrl, { method: "PUT", body: file });
      if (!response.ok) {
        throw new Error(`Upload failed (${response.status})`);
      }
      setStatus("done");
    } catch (err) {
      setStatus("error");
      setErrorMessage(err instanceof Error ? err.message : "Upload failed.");
    }
  }

  if (status === "done") {
    return (
      <p className="text-sm text-primary-dark">
        Uploaded. Mux is processing it now — this can take a few minutes. Check{" "}
        <Link href={videosPath} className="underline">
          your videos
        </Link>{" "}
        for when it&apos;s ready.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <input type="file" accept="video/*" onChange={handleChange} disabled={status === "uploading"} />
      {status === "uploading" && <p className="text-sm text-ink-soft">Uploading…</p>}
      {status === "error" && errorMessage && <p className="text-sm text-danger">{errorMessage}</p>}
      <Link href={`/o/${orgSlug}/videos`}>
        <Button type="button" variant="ghost">
          Back to my videos
        </Button>
      </Link>
    </div>
  );
}
