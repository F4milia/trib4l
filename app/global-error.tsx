"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";
import { copy } from "@/lib/copy";
import "./globals.css";

/**
 * global-error replaces the root layout, so it renders its own <html> and
 * <body> -- which means it never picked up globals.css and rendered as the
 * unstyled Next.js default. Importing the token layer here is what puts it in
 * the design system at all.
 *
 * No skeleton, no invented status: CLAUDE.md's honest-empty-states rule, and
 * the App Router exposes no status code to this component, so the copy does
 * not claim one.
 */
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en" className="h-full bg-parchment antialiased">
      <body className="flex min-h-full flex-col bg-parchment text-deep-slate">
        <main className="mx-auto flex w-full max-w-3xl flex-col justify-center px-5 py-10 sm:px-10">
          <p className="mb-3 font-mono text-xs font-black uppercase tracking-[0.2em] text-baked-clay">
            {copy.globalError.eyebrow}
          </p>
          <h1 className="max-w-3xl font-serif text-5xl leading-[0.86] tracking-tighter sm:text-7xl">
            {copy.globalError.title}
          </h1>
          <p className="mt-5 max-w-xl text-base leading-6 text-deep-slate/70">{copy.globalError.body}</p>
          {error.digest ? (
            <p className="mt-8 font-mono text-[10px] uppercase tracking-widest text-deep-slate/70">
              {error.digest}
            </p>
          ) : null}
          <div className="mt-8">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex h-11 items-center justify-center border-2 border-transparent bg-terracotta px-4 text-sm font-medium text-parchment transition-colors hover:bg-baked-clay active:translate-y-px focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta"
            >
              {copy.globalError.reload}
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
