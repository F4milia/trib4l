# QA — PWA-SHELL · the installable shell N1 and W2 both need

Preview URL: <filled by dev from the PR>
Fixtures used: `dual@f4milia.test` (the dual-Family user) — sign-in only, no
Family content is exercised by this shell.

## Primary check

The shell must be installable, and it must contain **no** push behaviour and
**no** offline caching — both are later sessions' work, and a shell that
already had them would mean W2 building on a moving file.

Chrome desktop, DevTools open, on the preview URL:

1. Load the preview URL signed out. Open **Application → Manifest**.
   **Expect:** name `F4milia`, display `standalone`, start URL `/`, and **no
   errors or warnings** listed under the manifest.
2. In the same panel, look at the icon list.
   **Expect:** two icons, `192x192` and `512x512`. Both render as a dark
   masonry wall — parchment blocks on near-black, one terracotta block in the
   second course. **Square corners, no rounding of the artwork itself.**
3. Open **Application → Service Workers**.
   **Expect:** `sw.js` listed, status **activated and running**. Source shows
   `install` and `activate` listeners and nothing else.
4. Still in Service Workers, tick **Offline**, then reload the page.
   **Expect:** the browser's own offline error page. **This is the pass
   condition** — the shell caches nothing on purpose, so an app that still
   renders here means a fetch handler was added that nobody specified.
5. Untick Offline. Open **Application → Storage → Cache storage**.
   **Expect:** empty. No caches created.
6. Click the install icon in the address bar (or ⋮ → Cast, save and share →
   Install page as app).
   **Expect:** an install prompt appears showing the masonry icon and the name
   `F4milia`. Install it.
7. In the installed window, confirm there is no browser address bar.
   **Expect:** a standalone window. The page renders exactly as it did in the
   tab — the shell changes no layout.
8. Sign in as `dual@f4milia.test` inside the installed window.
   **Expect:** sign-in works normally and lands on the same page it does in a
   browser tab.
9. Uninstall the app when finished (⋮ → Uninstall) so the next run starts clean.

iOS Safari, if a device is to hand (steps 10–11; skip and note if not):

10. Open the preview URL, then Share → Add to Home Screen.
    **Expect:** the tile preview shows the **masonry icon**, not a screenshot
    of the page. A screenshot means the apple-touch-icon is not being read.
11. Open the installed tile.
    **Expect:** it opens without Safari chrome.

## Regression (previous two sessions)

- [ ] `#103` Sentry: the app still boots with no `SENTRY_DSN` set — no console
      error about a missing DSN, no crash on first render.
- [ ] `#106` definer functions: sign in as `dual@f4milia.test` and open each
      Family in turn. Each shows only its own Family's data. (`is_org_member()`
      and `has_org_role()` were altered; every policy calls them.)
- [ ] D1 home dashboard still renders for a signed-in member — `app/layout.tsx`
      changed, and every page renders through it.

## Result

- [ ] All pass
- Failures → issue links:
- Loom:
- Executed by / at:

---

**Do not improvise extra checks.** If something obvious is missing, that is a
note for this template, not for this run.
