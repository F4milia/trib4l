import { serve } from "inngest/next";

import { inngest } from "@/lib/inngest/client";
import { functions } from "@/lib/inngest/functions";

/**
 * Inngest's handshake endpoint. Mounted so N1 arrives to a route that already
 * works rather than to one it has to invent.
 *
 * MOUNTS WITH NO KEYS. Without INNGEST_SIGNING_KEY the route still responds --
 * Inngest simply cannot register the functions -- so the app boots and the
 * suite passes in every environment that has not been wired up.
 *
 * This route is deliberately outside the account gate. It is called by
 * Inngest's servers, not by a member, and it authenticates by signature rather
 * than by session.
 */
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions,
});
