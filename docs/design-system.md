# Design system

> ## ⚠️ SUPERSEDED — August 27, 2026
>
> **`f4milia-design-system.md` (repo root) is the single source of truth for
> all design work from this date forward.** Decided by James, 2026-08-27.
>
> This document describes the palette actually implemented in
> `app/globals.css` today (canvas/ink/teal/amber, ported from the sibling
> BrandLamb `loving-new-home` property). It is retained as the historical
> record of what is currently shipped and why — not as guidance.
>
> Do not use it for new work. Screens still on this palette need a retrofit
> to Hearth & Material (parchment `#F7F4F0`, deep-slate `#1A1A1A`,
> terracotta `#C84B31`, zero border-radius), tracked as pre-flight item 3
> in [`preflight-audit.md`](./preflight-audit.md).

The build plan never schedules a dedicated design/frontend session across
its 19 sessions — checked directly against the plan text, not assumed (see
the conversation that led here). This was a gap, not a deferral, until this
pass.

**Decided with the user (August 22, 2026):** style now, in parallel with
backend sessions, rather than waiting; retrofit all pages already built
rather than leaving old ones plain while new ones ship styled.

## Source of the palette and type system

Not invented for this project — copied from
`C:\Users\Ferenz\Documents\BrandLamb\loving-new-home\client\app\globals.css`,
a sibling BrandLamb property, per direct instruction to follow that
project's color palette. Same Next.js version (16.3.1) and same Tailwind
v4 CSS-first config approach (`@theme inline`, not `tailwind.config.js`),
so it dropped in without adaptation.

- **Canvas** `#f5f5f0` / **canvas-raised** `#ffffff` — warm off-white
  background, white for cards.
- **Ink** `#1e2e2c` / **ink-soft** `#4a5a57` — near-black-green text,
  muted secondary text.
- **Primary** `#2f5d56` / **primary-dark** `#1e3f3a` / **primary-soft**
  `#e3ebe8` — deep teal, the main brand color.
- **Accent** `#c98a3e` / **accent-soft** `#f3e3c5` — warm amber, used for
  emphasis (e.g. the signup consent notice) and focus rings.
- **Line** `#ddd9cd` — borders/dividers.
- **Danger** `#b3432b` — errors, revoke actions.
- **Display font**: Iowan Old Style / Palatino / Georgia serif stack, for
  headings — a system font stack, not a hosted webfont, matching the
  reference project exactly (no font files to self-host).
- **Body font**: system-ui sans stack.

No F4milia-specific logo exists yet anywhere checked (the reference
project has no logo file either, just a hero video) — headings currently
render as a styled text wordmark ("F4milia" in the display font), not an
image mark.

## Shared components (`components/ui.tsx`)

`Button` (primary/danger/ghost variants), `Input`, `Select`, `Label`,
`Card`, `ErrorText`, `PageHeading`. Created because the same form patterns
(label + input, primary submit button, error banner) repeated across at
least 8 pages — a justified shared abstraction, not premature; there's no
behavior in these, purely consistent styling in one place so a future
palette or spacing change doesn't need touching every page.

## What got restyled

Every page that existed before this pass: home (signed-in and signed-out
states), login, signup (including the consent notice), the org shell
layout + switcher, the org home page, members settings, cohorts settings,
and the admin org-creation page.

## Verification

Confirmed the actual compiled CSS output contains the real hex values
(`grep`-checked `.next/static/chunks/*.css` for `--color-primary:#2f5d56`
etc.), not just that the build succeeded. Then re-ran every functional
flow from Sessions 3 and 5 against the restyled pages via the real dev
server (same curl-as-a-form-post method as those sessions) to catch any
regression the visual changes might have introduced: login, the org
shell/switcher, the member invite flow, cohort creation and assignment,
and the platform_admin page correctly still blocking a non-admin. All
passed, plus the full automated test suite (9 unit + 21 isolation tests) —
this was a styling pass, not a functional one, but regressions from a
find-and-replace across every page are exactly the kind of thing worth
checking for rather than assuming away.

## Not done

- No actual logo/image mark — text wordmark only, since none exists yet.
- Responsive/mobile-specific polish beyond what Tailwind's defaults give
  for free.
- Dark mode (the reference project doesn't have one either).
