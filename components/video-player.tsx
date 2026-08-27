"use client";

import MuxPlayer from "@mux/mux-player-react";

// A plain <video src="....m3u8"> only plays HLS natively in Safari --
// every other browser needs a player that can demux HLS itself
// (mux-player, under the hood, uses hls.js for exactly this). Shared
// between the Session 11 VOD watch page and Session 12's live/archived
// stream watch page rather than duplicated -- the only real difference
// between the two is `streamType`, which the caller already knows.
export function VideoPlayer({
  playbackId,
  token,
  live = false,
}: {
  playbackId: string;
  token: string;
  live?: boolean;
}) {
  return (
    <MuxPlayer
      playbackId={playbackId}
      tokens={{ playback: token }}
      streamType={live ? "live" : "on-demand"}
      className="w-full"
    />
  );
}
