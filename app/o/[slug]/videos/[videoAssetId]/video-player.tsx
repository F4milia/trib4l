"use client";

import MuxPlayer from "@mux/mux-player-react";

// A plain <video src="....m3u8"> only plays HLS natively in Safari --
// every other browser needs a player that can demux HLS itself
// (mux-player, under the hood, uses hls.js for exactly this). This is
// the second piece of client-side JS this app has needed, after the
// upload file-picker -- a Web Component needs a real browser to mount.
export function VideoPlayer({ playbackId, token }: { playbackId: string; token: string }) {
  return (
    <MuxPlayer
      playbackId={playbackId}
      tokens={{ playback: token }}
      streamType="on-demand"
      className="w-full rounded-md"
    />
  );
}
