# f4milia Design System

**Extracted from:** `f4milia-design-system` (Next.js 16 · React 19 · Tailwind CSS v4 · shadcn `base-nova` · Base UI · lucide-react)
**Design language:** Editorial brutalism — warm paper ground, black ink structure, terracotta as the single act of heat. Zero radius, hard offset shadows, uppercase ultra-black display type, monospace micro-labels, visible grid seams.

---

## 1. Design Principles

| Principle | Rule in practice |
|---|---|
| **Nothing is round** | `border-radius: 0` globally and unconditionally. Enforced with `* { border-radius: 0 !important; }`. |
| **Structure is visible** | Borders and grid seams are content, not decoration. 1px hairlines for grouping, 2px for objects, 4px for section breaks. |
| **Light is physical** | No blurred shadows. Elevation is a hard offset block of ink or terracotta — a print registration mark, not a glow. |
| **Type does the shouting** | Display type is uppercase, weight 900, negative tracking, sub-1.0 line-height. Body copy stays quiet and lowercase. |
| **Terracotta is scarce** | `#BC472E` marks the one thing that is live, active, or urgent on a screen. Never a background wash. |
| **The surface has tooth** | A fixed multiply-blend noise layer sits over the whole app at 16% so nothing reads as flat digital white. |

---

## 2. Color Palette

### 2.1 Brand core

| Token | Hex | Role |
|---|---|---|
| `terracotta` | **`#BC472E`** | **Primary brand color.** Active state, primary action, confirmed presence, repair flag, accent rules. |
| `baked-clay` | `#A04729` | Primary hover / pressed. Eyebrow and micro-label text on paper. |
| `hearth-ochre` | `#E3B46B` | Accent and highlight. Completed states, money/record signals, dark-mode primary. |
| `parchment` | `#F7F4F0` | Page ground (light) and ink-on-dark text color. |
| `deep-slate` | `#1A1A1A` | Ink. Text, borders, shadows, inverted panels. |

```js
// tailwind.config.js
colors: {
  parchment:      '#F7F4F0',
  'deep-slate':   '#1A1A1A',
  terracotta:     '#BC472E',
  'baked-clay':   '#A04729',
  'hearth-ochre': '#E3B46B',
}
```

### 2.2 Semantic tokens — light (`:root`)

| CSS variable | Hex | Maps to |
|---|---|---|
| `--background` | `#F7F4F0` | parchment |
| `--foreground` | `#1A1A1A` | deep-slate |
| `--card` | `#F7F4F0` | parchment (cards are not lifted by tint) |
| `--card-foreground` | `#1A1A1A` | deep-slate |
| `--primary` | `#BC472E` | **terracotta** |
| `--primary-foreground` | `#F7F4F0` | parchment |
| `--muted` | `#E8E1D8` | warm paper shade |
| `--muted-foreground` | `#604E45` | warm brown-grey |
| `--border` | `#1A1A1A` | full-strength ink |
| `--input` | `#1A1A1A` | full-strength ink |
| `--ring` | `#BC472E` | terracotta |
| `--radius` | `0` | — |

### 2.3 Semantic tokens — dark (`.dark`)

| CSS variable | Hex | Note |
|---|---|---|
| `--background` | `#1A1A1A` | |
| `--foreground` | `#F7F4F0` | |
| `--card` | `#232323` | one step off the ground |
| `--card-foreground` | `#F7F4F0` | |
| `--primary` | `#E3B46B` | **primary flips to hearth-ochre** — terracotta lacks contrast on ink |
| `--primary-foreground` | `#1A1A1A` | |
| `--muted` | `#302B27` | |
| `--muted-foreground` | `#D1C2B3` | |
| `--border` | `#F7F4F0` | |
| `--input` | `#F7F4F0` | |
| `--ring` | `#E3B46B` | |

> **Porting rule:** in dark contexts, terracotta demotes from *primary* to *accent* (rules, icons, offset shadows) and hearth-ochre takes the primary slot.

### 2.4 Alpha ladder

Ink and paper are never used at partial-strength arbitrary values. Use this ladder:

| Alpha | Use |
|---|---|
| `/5` – `/10` | Tinted card fills (`bg-terracotta/5`, `bg-deep-slate/5`) |
| `/15` – `/20` | **Hairline borders and grid seams** — the most-used values in the system |
| `/30` – `/45` | Tertiary icons, ordinal numerals, disabled affordances |
| `/50` – `/60` | Mono micro-labels, timestamps, metadata |
| `/65` – `/70` | Body copy on paper |
| `/85` – `/90` | Body copy on ink (`text-parchment/85`) |

### 2.5 Status color mapping

| State | Color | Signal |
|---|---|---|
| Active / current / confirmed | `terracotta` | The live row, the held vow, "here tonight" |
| Complete / pending / value | `hearth-ochre` | Finished steps, "maybe", money and ledger entries |
| Inactive / away / archived | `deep-slate` at `/45`–full | Absent, quiet, filed |
| Warning / repair | `terracotta` + `.neon-repair` | The only place a glow is permitted |

### 2.6 Gaps to close on port

`components/ui/button.tsx` references `--secondary`, `--secondary-foreground`, and `--destructive`, but these are **not defined** in `globals.css`. Add before reuse:

```css
:root {
  --secondary: #E8E1D8;            /* muted paper */
  --secondary-foreground: #1A1A1A;
  --destructive: #BC472E;          /* terracotta doubles as destructive */
}
.dark {
  --secondary: #302B27;
  --secondary-foreground: #F7F4F0;
  --destructive: #BC472E;
}
```

---

### 2.7 Theme activation

§2.3 defines every dark token but not when they apply. Three states, in
precedence order:

| State | Root class | Meaning |
|---|---|---|
| **System** (default) | *none* | follow `prefers-color-scheme` |
| **Light** | `.light` | forced light, overrides a dark system |
| **Dark** | `.dark` | forced dark, overrides a light system |

**Pure CSS, no client script.** The dark token block is emitted twice — once
for the explicit class, once inside a media query guarded against the escape
hatch:

```css
:root        { /* light tokens (§2.2) */ }
.dark        { /* dark tokens  (§2.3) */ }
@media (prefers-color-scheme: dark) {
  :root:not(.light) { /* dark tokens (§2.3), repeated */ }
}
```

**The `dark:` variant must move with the tokens.** A class-only variant —
`@custom-variant dark (&:is(.dark *))`, which is what ships today — will not
fire in the System state, because System deliberately has no class. Tokens
would flip while every `dark:` utility silently did not. The variant has to
match both forms:

```css
@custom-variant dark {
  &:is(.dark *) { @slot }
  @media (prefers-color-scheme: dark) { &:not(:is(.light *)) { @slot } }
}
```

**Land the variant and the token media block in the same change.** Either one
alone is a half-state: the variant alone makes `dark:` utilities fire against
light tokens; the tokens alone make `dark:` utilities dead. Neither is visible
today because nothing uses `dark:` yet, which is exactly why it would ship
unnoticed.

The duplication is deliberate. The alternative is a blocking inline script
that reads `matchMedia` and stamps a class before first paint, which trades a
maintained duplicate for a JS dependency and a flash risk on every page. This
system has no skeleton shimmer and no loading choreography; a theme that
needs JavaScript to paint correctly is the same category of thing.

**Rules**

- The explicit choice persists in a cookie and the class is stamped
  **server-side** from it, so a forced theme also paints with no flash and no
  script.
- Changing theme is a server action that sets the cookie and revalidates. It
  is not client state.
- `color-scheme` is declared for each state (§9), so form controls,
  scrollbars and the canvas behind the noise plate follow.
- `<meta name="theme-color">` is media-based, which is correct for System.
  Under a forced theme it can disagree with the page for one paint of browser
  chrome only — accepted rather than scripted around.
- **The dark theme-color entry lands with this section's token block, never
  before it.** Declaring one while the page is still light-only gives a
  dark-preference visitor dark browser chrome above a parchment page. Until
  §2.7 is implemented, `themeColor` is the single parchment value.
- The control belongs in the app shell's sidebar footer, as a mono
  micro-label group beside the communities link. Three explicit options, never
  a two-state toggle: "System" has to be reachable again once a user has left
  it.
- **Dark is a designed mode, not an inversion.** Terracotta demotes from
  primary to accent and hearth-ochre takes the primary slot (§2.3's porting
  rule). Never ship a dark surface that keeps terracotta as its primary fill:
  it measures 3.74:1 on ink, where hearth-ochre measures 9.12:1.

---

## 3. Typography

### 3.1 Font roles

The system runs on **three type voices**. Each has a fixed job — never mix them within one role.

| Role | Class | Stack (as shipped) | Recommended explicit stack |
|---|---|---|---|
| **Display** | `font-serif` | Tailwind default `ui-serif, Georgia, Cambria, 'Times New Roman', serif` | A high-contrast display serif at 900 weight, e.g. `'Playfair Display'`, `'Instrument Serif'`, or a grotesque-slab; fallback `Georgia, serif` |
| **Body** | *(inherited)* | `Arial, Helvetica, sans-serif` on `body` | A neutral grotesque, e.g. `Inter`, `'Helvetica Neue'`; fallback `Arial, sans-serif` |
| **Micro / label** | `font-mono` | Tailwind default `ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace` | `'JetBrains Mono'`, `'IBM Plex Mono'`; fallback `ui-monospace, monospace` |

> **Note:** the source repo loads **no webfonts** — `font-serif` and `font-mono` resolve to platform defaults. Usage is heavy and intentional (`font-mono` 71×, `font-serif` 44×). When porting, bind these two slots to real families via `next/font` and set `--font-serif` / `--font-mono` in `@theme`; the design depends on the serif/mono contrast.

### 3.2 Global heading rule

Every `h1`–`h6` is stamped by a single global rule. Do not restyle per-heading.

```css
h1, h2, h3, h4, h5, h6 {
  text-transform: uppercase;
  font-weight: 900;
  letter-spacing: -0.08em;
  line-height: 0.92;
}
```

### 3.3 Weights

| Weight | Class | Use |
|---|---|---|
| 900 | `font-black` | All headings (global), mono labels, numerals, stat values |
| 700 | `font-bold` | Inline emphasis in lists |
| 600 | `font-semibold` | Nav item labels, dense card titles |
| 400 | — | Body copy, descriptions, quotes |

### 3.4 Size scale

Tailwind's default scale, used in a deliberately bimodal way — very large or very small, little in between.

**Display tier** (always paired responsively, mobile → `sm:`):

| Class | Size | Use |
|---|---|---|
| `text-9xl` | 8rem | Ceremony / terminal-moment headline |
| `text-8xl` | 6rem | Page `h1` at `sm:` and up |
| `text-7xl` | 4.5rem | Editorial page `h1` at `sm:` |
| `text-6xl` | 3.75rem | Panel headline at `sm:` |
| `text-5xl` | 3rem | **Default page `h1` (mobile base)**, section headline at `sm:` |
| `text-4xl` | 2.25rem | Aside headline, large numerals |
| `text-3xl` | 1.875rem | Section `h2`, card title, stat value |
| `text-2xl` | 1.5rem | Sub-section `h2`, wordmark |

**Reading tier:**

| Class | Size | Use |
|---|---|---|
| `text-xl` | 1.25rem | Lead paragraph / pull quote (`font-serif`) |
| `text-lg` | 1.125rem | Card description (`font-serif`), list item title |
| `text-base` | 1rem | Body intro, nav item |
| `text-sm` | 0.875rem | Body copy, card body default |

**Micro tier** (always `font-mono` + `uppercase` + wide tracking):

| Class | Size | Use |
|---|---|---|
| `text-xs` | 0.75rem | Mono eyebrow, footer meta, button micro-label |
| `text-[11px]` | 11px | Turn counters |
| `text-[10px]` | 10px | **The workhorse micro-label** (46 uses) — nav descriptions, status, timestamps, ordinals |
| `text-[9px]` | 9px | "Now" pips and tightest badges |

**Canonical responsive pairs:** `text-5xl sm:text-8xl` (page title) · `text-5xl sm:text-7xl` (editorial title) · `text-6xl sm:text-9xl` (ceremony) · `text-3xl sm:text-5xl` (section) · `text-4xl sm:text-6xl` (panel).

### 3.5 Letter-spacing

| Class | Value | Use |
|---|---|---|
| `tracking-tighter` | -0.05em | Display headings, large numerals, wordmark |
| `tracking-tight` | -0.025em | Mono button labels, uppercase stat labels |
| `tracking-wider` | 0.05em | Secondary mono metadata |
| `tracking-widest` | 0.1em | **Default mono label tracking** (35 uses) |
| `tracking-[0.15em]` | 0.15em | Form field labels |
| `tracking-[0.18em]` | 0.18em | Nav section headers |
| `tracking-[0.2em]` | 0.2em | Page eyebrows |
| `tracking-[0.22em]` | 0.22em | Widest — turn/step counters on ink |

### 3.6 Line-height

| Class | Use |
|---|---|
| `leading-none` / `leading-[0.86]` / `leading-[0.88]` / `leading-[0.92]` / `leading-[0.95]` | Display headings — always sub-1.0 |
| `leading-5` / `leading-6` | Micro and small body |
| `leading-7` | Lead paragraphs |
| `leading-8` / `leading-relaxed` | Serif pull quotes |

### 3.7 Type recipes

```html
<!-- Page eyebrow -->
<p class="font-mono text-xs font-black uppercase tracking-[0.2em] text-baked-clay">
  01 / People &amp; rhythms
</p>

<!-- Page title -->
<h1 class="max-w-3xl font-serif text-5xl font-black uppercase leading-[0.86] tracking-tighter sm:text-7xl">
  The house gathers.
</h1>

<!-- Lead -->
<p class="mt-5 max-w-xl text-base leading-6 text-deep-slate/70">…</p>

<!-- Serif pull quote on ink -->
<div class="border-l-4 border-terracotta pl-5 font-serif text-xl leading-8 text-parchment/90">“…”</div>

<!-- Micro label -->
<p class="font-mono text-[10px] font-black uppercase tracking-widest text-deep-slate/70">Convener / Mara</p>
```

---

## 4. Spacing & Layout

### 4.1 Base unit

**4px** (`--spacing: 0.25rem`, Tailwind v4 default). Every value is a multiple of 4.

| Step | Value | Primary use |
|---|---|---|
| `gap-px` | 1px | **Grid seam** — hairline gutters over a `bg-deep-slate/20` grid parent |
| `1` | 4px | Nav item stack |
| `2` | 8px | Icon↔label, label↔input (most-used gap) |
| `3` | 12px | Avatar↔name, inline chip rows |
| `4` | 16px | Card row internals, list item columns |
| `5` | 20px | **Card padding (mobile), form field stack, page padding (mobile)** |
| `6` | 24px | **Card / panel padding (default)**, aside stacks |
| `8` | 32px | Major column gap, section vertical rhythm, sidebar padding |
| `10` | 40px | Card padding at `sm:`, header bottom margin |
| `12` | 48px | Page padding at `lg:`, large section breaks |
| `16` | 64px | Page horizontal padding at `lg:` (editorial pages) |

### 4.2 Page container

| Container | Value |
|---|---|
| Standard content max-width | `max-w-6xl` (72rem / 1152px) |
| Narrow form page | `max-w-3xl` |
| Measure for body copy | `max-w-xl` |
| Measure for lead / description | `max-w-2xl` |
| Measure for display headline | `max-w-3xl` – `max-w-4xl` |
| Centering | `mx-auto` |

### 4.3 Page padding ramp

Two established ramps — pick one per surface and keep it:

```html
<!-- A. Editorial / dashboard -->
<div class="min-h-screen px-5 py-8 sm:px-8 lg:px-12 lg:py-12">
<div class="min-h-screen px-6 py-10 sm:px-10 lg:px-16 lg:py-16">

<!-- B. Form / ceremony (uniform inset) -->
<div class="mx-auto max-w-6xl p-5 sm:p-10">
```

### 4.4 Breakpoints

Only three are used: base (mobile) → `sm:` (640px) → `lg:` (1024px). `md:` appears only for 3-up card grids. Do not introduce `xl:`/`2xl:` — the `max-w-6xl` cap makes them redundant.

### 4.5 App shell

| Element | Value |
|---|---|
| Sidebar width | `w-72` (18rem) — `fixed inset-y-0 left-0 z-20`, `hidden lg:flex` |
| Content offset | `lg:pl-72` |
| Sidebar brand block height | `h-24` |
| Mobile header height | `h-20`, `lg:hidden` |
| Sidebar internal dividers | `border-b border-deep-slate/15` |
| Noise overlay | `z-50`, `pointer-events-none` |
| Sidebar | `z-20` · fixed overlays `z-10` |

### 4.6 Grids

| Pattern | Class | Use |
|---|---|---|
| Asymmetric two-column | `lg:grid-cols-[1.5fr_1fr]`, `lg:grid-cols-[1.35fr_0.85fr]`, `lg:grid-cols-[1.1fr_.9fr]` | Main + aside. **Never 50/50** — the imbalance is the style. |
| Timeline | `md:grid-cols-[170px_1fr]` | Fixed date rail + entry |
| List row | `grid-cols-[4.5rem_1fr_auto]` | Date block · content · status |
| Seamed card row | `grid gap-px bg-deep-slate/20 sm:grid-cols-3` with `bg-parchment` children | Hairline-separated tiles with no visible border on the tiles themselves |
| Card set | `grid gap-5 md:grid-cols-3` | Choice / option cards |

**Which ratio, and when.** The imbalance tracks how much the aside genuinely
competes with the main column for attention — the more clearly secondary the
aside, the wider the gap between the two numbers.

| Ratio | Archetype | The aside is | Surfaces |
|---|---|---|---|
| `lg:grid-cols-[1.5fr_1fr]` | **Subject + reference rail** | consulted, not worked in | Org home (composer + feed / org rail) · video watch · live watch · Tower and Keepsake pages |
| `lg:grid-cols-[1.35fr_0.85fr]` | **Work surface + inventory** | a list of what already exists | every settings surface — "form to create" beside "what is already there" |
| `lg:grid-cols-[1.1fr_.9fr]` | **Two peers** | a second subject of near-equal weight | Members (roster / safety) · Mentorship (pairings / requests) |

**Single column is a legitimate answer.** A surface with no second subject —
sign-in, sign-up, report, create-organization — takes §4.3 ramp B and no grid
at all. Never manufacture an aside to fill a ratio; an invented sidebar is the
layout equivalent of invented placeholder copy.

**List and tile surfaces do not take a two-column split.** A collection with
no detail panel (videos index, live index, shop, meetups) uses the list-row
grid or the seamed card row above. The rhythm comes from the rows, not from a
column break.


### 4.7 Section rhythm

```
Page header      → border-b-4 border-deep-slate pb-5|pb-8   (heavy rule closes a header)
Section header   → border-b-2 border-deep-slate pb-3        (medium rule closes a section)
Subtle group     → border-b border-deep-slate/15|/20 pb-8   (hairline groups content)
Header → body    → mb-10
Eyebrow → title  → mb-3
Title → lead     → mt-5
Body → CTA       → mt-8
```

---

## 5. Shape, Borders & Elevation

### 5.1 Radius: zero, absolutely

```css
--radius: 0;
--radius-sm: 0; --radius-md: 0; --radius-lg: 0;
--radius-xl: 0; --radius-2xl: 0; --radius-3xl: 0;
* { border-radius: 0 !important; }
```

The `!important` reset is deliberate: it lets unmodified shadcn/Base UI primitives (which ship `rounded-lg`, `rounded-xl`) drop into the system without editing every variant string. Keep it when porting.

### 5.2 Border weight scale

| Weight | Class | Meaning |
|---|---|---|
| **4px** | `border-b-4 border-deep-slate` | Section/page break — the strongest horizontal rule |
| **4px (left)** | `border-l-4 border-terracotta` | Pull-quote and emphasis marker |
| **2px** | `border-2 border-deep-slate` | Object outline — cards, panels, avatars, status boxes, masonry bricks |
| **2px (edge)** | `border-b-2`, `border-r-2`, `border-l-2` | Internal card dividers, active-nav indicator |
| **1px** | `border border-deep-slate/15` or `/20` | Grouping hairline — the quiet default |
| **1px on ink** | `border-parchment/20` | Same role, inverted surface |

`--border` and `--input` are full-strength ink (`#1A1A1A`) so any unmodified primitive lands at maximum contrast; hairlines are applied explicitly per component.

### 5.3 Elevation — hard offset shadows

No blur, no spread. Ever.

| Token | Value | Use |
|---|---|---|
| `shadow-[3px_3px_0px_0px_rgba(26,26,26,1)]` | 3px ink | Resting/upcoming list rows |
| `shadow-[4px_4px_0_#1a1a1a]` | 4px ink | Small badges, icon medallions |
| `shadow-[5px_5px_0px_0px_rgba(26,26,26,1)]` | 5px ink | **Default panel elevation** (`.panel-ink`) |
| `shadow-[5px_5px_0px_0px_rgba(188,71,46,1)]` | 5px terracotta | Active / current row on ink (`.panel-dark`) |
| `shadow-[8px_8px_0px_0px_rgba(188,71,46,0.75)]` | 8px terracotta @75% | Hero panel, maximum lift |
| `shadow-none` | — | **Pressed state** (paired with `translate-x-1 translate-y-1`) |

**Shadow color rule:** ink shadow on paper surfaces; terracotta shadow on ink surfaces.

### 5.4 Surface texture

A single fixed noise plate over the entire viewport. Ship it verbatim — it is what keeps the palette feeling like stock, not screen.

```css
body::before {
  content: '';
  position: fixed;
  inset: 0;
  pointer-events: none;
  opacity: 0.16;
  z-index: 50;
  mix-blend-mode: multiply;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 180 180' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.28'/%3E%3C/svg%3E");
}
```

---

## 6. Utility Classes (the system's own primitives)

These five classes carry the visual identity. Port them as-is.

```css
/* Elevated panel on paper — the default container treatment */
.panel-ink   { border: 2px solid currentColor; box-shadow: 5px 5px 0 #1a1a1a; }

/* Elevated panel on ink — terracotta registration shadow */
.panel-dark  { border: 2px solid #f7f4f0; box-shadow: 5px 5px 0 #bc472e; }

/* The only glow in the system — reserved for repair / conflict entries */
.neon-repair { border: 2px solid #bc472e;
               box-shadow: 0 0 20px rgba(188,71,46,.8),
                           inset 0 0 16px rgba(188,71,46,.18); }

/* Inline uppercase badge — inherits currentColor for its border */
.stamp       { border: 2px solid currentColor; padding: .2rem .45rem;
               font-size: .65rem; font-weight: 900; letter-spacing: .08em;
               text-transform: uppercase; }

/* Progress-as-brickwork — the signature data display */
.masonry     { display: grid; grid-template-columns: repeat(8, 1fr);
               gap: 3px; align-items: end; }
.masonry > span            { min-height: 2rem; border: 2px solid #1a1a1a;
                             background: #bc472e; }
.masonry > span:nth-child(3n) { background: #e3b46b; }
.masonry > span:nth-child(4n) { background: #a04729; }
@media (max-width: 640px) { .masonry { grid-template-columns: repeat(6, 1fr); } }
```

> **Missing definition:** `panel-paper` is referenced in `vow-rotation.tsx` but never defined. Add it as the un-elevated counterpart to `.panel-ink`:
> ```css
> .panel-paper { border: 2px solid #1a1a1a; background: #f7f4f0; }
> ```

---

## 7. Component Guidelines

### 7.1 Button

A plain `<button>` + CVA in `components/ui.tsx` — **not** Base UI. The shadcn
`base-nova` stack this document was written against was not adopted (§13); the
specs below describe what ships. Radius is neutralized by the global reset, so
no variant string here thinks about it.

**Base:** `inline-flex h-11 shrink-0 select-none items-center justify-center gap-2 whitespace-nowrap border-2 border-transparent px-4 text-sm font-medium transition-colors active:translate-y-px focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta disabled:pointer-events-none disabled:opacity-50 [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4`

Three deliberate differences from the original: `border-2` not `border` (§5.2's
object outline weight), `transition-colors` not `transition-all` (§8 — things
shift, they do not ease), and §9's `outline` focus form rather than the `ring`
form, which §9 reserves for Base UI primitives.

| Variant | Treatment |
|---|---|
| `primary` *(default)* | `bg-terracotta text-parchment hover:bg-baked-clay` — terracotta on parchment, 4.70:1 |
| `danger` | `border-terracotta text-terracotta hover:bg-terracotta/10 hover:text-baked-clay` — **drawn, not filled.** A terracotta label on a terracotta/10 tint measures 4.11:1 at rest and 3.55:1 on hover; drawn measures 4.70:1 and 4.89:1. |
| `ghost` | `text-deep-slate hover:bg-muted` |

| Surface | Effect |
|---|---|
| `paper` *(default)* | as above |
| `ink` | `danger` demotes to hearth-ochre (9.12:1) · `ghost` takes `text-parchment` (15.87:1) · `primary` unchanged, it carries its own fill |

**There is no `size` prop.** Height is a fixed `h-11`, matching `Input` so a
button and a field sit level in the same row. The original document listed an
`xs`/`sm`/`default`/`lg` scale plus four icon sizes; none of it ships, and
nothing has needed it.

**`outline`, `secondary` and `link` do not exist.** They were shadcn's stock
variants, not this system's. `default` and `destructive` are named `primary`
and `danger` here. Do not write `variant="outline"` — TypeScript will reject
it, which is the intended outcome.

**House overrides in use** — the default `h-8` is too quiet for a primary action, so real CTAs are lifted:

```html
<!-- Standard brand CTA -->
<Button class="gap-2 bg-terracotta text-parchment hover:bg-baked-clay">
  Set the foundation <ArrowRight data-icon="inline-end" />
</Button>

<!-- Hero / commitment CTA -->
<Button class="h-14 gap-3 bg-terracotta px-8 text-base font-black uppercase
               tracking-tight text-parchment hover:bg-baked-clay disabled:opacity-40">
  Mark this chapter <ArrowRight data-icon="inline-end" />
</Button>

<!-- Unstyled bordered button (nav / toolbar) -->
<button class="flex items-center gap-2 border border-deep-slate/20 px-4 py-3
               font-mono text-[10px] uppercase tracking-widest hover:border-terracotta">
```

**Rules**
- **An ink surface is not the dark theme.** A `Card` with `treatment="dark"`
  is a dark context inside a light page, so the semantic tokens do not flip.
  Any variant that draws its colour from the page ground must be given the ink
  treatment explicitly — measured on `bg-deep-slate`, `danger`'s terracotta
  label is 3.38:1 and `ghost`'s ink label is **1.00:1**, invisible. On ink,
  `danger` demotes to hearth-ochre (9.12:1) and `ghost` takes
  `text-parchment` (15.87:1), per §2.3's porting rule. `primary` needs no
  override: it carries its own fill, so the surface behind it is irrelevant.
- Primary hover is always `terracotta → baked-clay`. Never lighten terracotta.
- Icons use `data-icon="inline-start" | "inline-end"`; the base style tightens the matching side automatically.
- Disabled: `opacity-50` (`opacity-40` on hero CTAs).
- Press: `translate-y-px`.
- Icon size 16px default; nav/feature icons `size-5`; header icons `size-7`–`size-8`.

### 7.2 Input

A plain `<input>` in `components/ui.tsx` — **not** Base UI. One variant only.
`Select` shares the same base plus `appearance-none pr-10` and a drawn
`ChevronDown`.

**Base:** `h-11 w-full min-w-0 border border-deep-slate/20 bg-transparent px-3 text-base transition-colors outline-none placeholder:text-deep-slate/70 focus-visible:border-terracotta focus-visible:ring-3 focus-visible:ring-terracotta disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-terracotta aria-invalid:ring-3 aria-invalid:ring-terracotta/20 md:text-sm`

`h-11` is the base, not a house override — the original documented an `h-8`
default with every form overriding it, which is a default nobody used. The
placeholder is `/70`: a placeholder is text, and `/50` measures 3.26:1.

**Field pattern** — mono label above, hairline-bordered input, small helper below:

```html
<div class="flex flex-col gap-2">
  <label for="name"
    class="font-mono text-[10px] uppercase tracking-[0.15em] text-deep-slate/70">
    Full name
  </label>
  <Input id="name" class="h-11 border-deep-slate/20 bg-transparent
                          focus-visible:ring-terracotta" />
  <p class="text-xs leading-5 text-deep-slate/70">The name used across the household.</p>
</div>
```

Alternate label style inside `.panel-ink` cards: `font-mono text-xs font-black uppercase tracking-tight`, with required fields marked by a trailing ` *`.

**Rules**
- Background is always `bg-transparent` — inputs are drawn, not filled.
- Field stack gap `gap-2`; form vertical rhythm `gap-5` (dense) or `gap-6` (spacious).
- Focus: `ring-3` at 50% of ring color; forms override the ring to solid `terracotta`.
- Error: `aria-invalid` drives border + ring; never a separate class.

### 7.3 Card

A single `<div>` in `components/ui.tsx` with a `treatment` prop — **not**
shadcn's slot-driven card. **`CardHeader`, `CardTitle`, `CardDescription`,
`CardAction`, `CardContent` and `CardFooter` do not exist**, and neither does
`--card-spacing` or `size="sm"`. Those were shadcn's API; the stack was not
adopted (§13). Compose card internals with plain markup and the type recipes in
§3.7.

| `treatment` | Classes | Use |
|---|---|---|
| `panel` *(default)* | `panel-ink bg-parchment p-6 sm:p-8` | ink panel on paper — the default container |
| `dark` | `panel-dark bg-deep-slate text-parchment p-6 sm:p-8` | inverted panel, terracotta registration shadow. **Pass `surface="ink"` to any Button inside it** (§7.1) |
| `flat` | `border-deep-slate/15 bg-transparent shadow-none p-6` | quiet — forms and dense lists |

The hero treatment is not a `treatment` value: it is `dark` plus
`shadow-[8px_8px_0px_0px_rgba(188,71,46,0.75)]` via `className`.

`className` merges over the treatment through `cn()`, so any of the three can
be overridden per instance without a specificity fight — which is why the house
utilities live in `@layer components` rather than as `@utility` (§6).

**The three house card treatments** — always apply one:

```html
<!-- 1. Ink panel on paper — the default -->
<Card class="panel-ink bg-parchment">

<!-- 2. Inverted panel — terracotta registration shadow -->
<Card class="panel-dark bg-deep-slate text-parchment">
<Card class="panel-ink bg-deep-slate text-parchment
             shadow-[8px_8px_0px_0px_rgba(188,71,46,0.75)]">   <!-- hero -->

<!-- 3. Flat / quiet — forms and dense lists -->
<Card class="border-deep-slate/15 bg-transparent shadow-none">
```

**Rules**
- Card titles inherit the global heading rule when rendered as headings — expect uppercase 900. In-card display titles override upward: `text-3xl sm:text-5xl`, up to `text-5xl sm:text-8xl` for ceremony moments.
- Card descriptions switch to `font-serif text-lg|text-xl leading-relaxed` at full ink strength (`text-deep-slate`) rather than muted grey — descriptions are content here, not chrome.
- Header dividers are explicit, on whatever element opens the card: `border-b-2 border-deep-slate` (panel) or `border-b border-deep-slate/15` (flat). There is no header slot to carry them.
- Padding overrides: `p-6 sm:p-8` on panels; `py-8` on form content.
- Footer is `justify-between` with a mono status string on the left and the action on the right.

### 7.4 Stamp / Badge

```html
<div class="stamp w-fit text-baked-clay">Definition recorded</div>
<span class="stamp flex items-center gap-2"><Hammer data-icon="inline-start" /> Start here</span>
```

Border color comes from `currentColor` — set the text color and the frame follows.

### 7.5 Avatar / Initials chip

Squares, never circles.

```html
<span class="flex size-10 items-center justify-center border-2 border-deep-slate
             font-mono text-xs font-black bg-terracotta">MA</span>
```

Accent rotation: `bg-terracotta` → `bg-hearth-ochre text-deep-slate` → `bg-baked-clay` → `bg-deep-slate`. Sizes `size-8` / `size-10` / `size-16`.

### 7.6 Status pip

```html
<span class="size-3 border-2 border-deep-slate bg-terracotta" aria-label="Mara: Confirmed" />
```

`size-2` (on ink) or `size-3` (on paper). Always bordered, always square, always carries an `aria-label`.

### 7.7 Navigation item

```html
<Link href="/table" aria-current={active ? 'page' : undefined}
  class="group flex items-center gap-4 border-l-2 px-3 py-3 transition-colors
         {active
           ? 'border-terracotta bg-deep-slate text-parchment'
           : 'border-transparent text-deep-slate hover:border-hearth-ochre hover:bg-hearth-ochre/20'}">
  <Icon class="size-5" aria-hidden="true" />
  <span>
    <span class="block font-serif text-base font-semibold">Table</span>
    <span class="block font-mono text-[10px] uppercase tracking-wider
                 text-deep-slate/70">Shared space</span>
  </span>
</Link>
```

Active = terracotta left rule + full ink fill inversion. Hover = ochre left rule + 20% ochre wash.

### 7.8 Timeline entry

```html
<div class="grid gap-5 md:grid-cols-[170px_1fr] md:items-start">
  <div class="font-mono font-black uppercase">
    <p class="text-3xl tracking-tighter text-hearth-ochre">OCT 26</p>
    <p class="text-xs">14:32 PST</p>
  </div>
  <Card class="panel-dark bg-deep-slate text-parchment">…</Card>
</div>
```

Repair/conflict entries swap `.panel-dark` for `.neon-repair`.

### 7.9 Masonry progress

The signature progress display — completion drawn as brickwork rather than a bar.

```html
<div class="masonry" aria-label="Definition completeness preview">
  {Array.from({ length: 24 }, (_, i) => (
    <span key={i} style={{
      opacity: i < filledCount * 4.8 ? 1 : 0.2,
      minHeight: `${25 + (i % 3) * 7}px`,
    }} />
  ))}
</div>
```

24 bricks · `minHeight` varies `25/32/39px` on `i % 3` · incomplete bricks at `opacity 0.2`–`0.28`. Always give the container an `aria-label`; the bricks themselves are decorative.

---

## 8. Motion

Restrained and mechanical — things shift, they do not ease or bounce.

| Interaction | Implementation |
|---|---|
| Color change | `transition-colors` |
| Button press | `active:translate-y-px` |
| Card hover lift | `hover:-translate-y-1 transition-transform` |
| Card selected/pressed | `translate-x-1 translate-y-1 shadow-none ring-4 ring-terracotta` — the card physically sits down into its own shadow |
| Nav hover | `transition-colors` only, no transform |

No durations or easings are declared — Tailwind's default 150ms applies throughout. Keep it. `tw-animate-css` is available but unused; if you add entrance animation, keep it to opacity and short translations.

---

## 9. Accessibility

Patterns already established in the codebase — hold to them.

- **Focus:** `focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:border-ring` on primitives; `focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta` on hand-rolled buttons. Never remove focus styling — with zero radius and 2px borders, a visible ring is the only affordance.
- **Icons:** decorative icons carry `aria-hidden="true"`; meaningful icons carry `aria-label` (e.g. `<Check aria-label="Complete" />`).
- **Landmarks:** `<aside>` nav gets `aria-label="Main navigation"`; sections use `aria-labelledby` pointing at their own `h2` id.
- **State:** active nav = `aria-current="page"`; toggle cards = `aria-pressed`; save confirmations = `role="status"`.
- **Decorative graphics:** `.masonry` containers get an `aria-label` describing what they represent; `img` used as ornament gets `alt=""`.
- **Color-independence:** every status color is paired with an icon or text label (`Check` / `Clock3` / `ChevronRight`), never color alone.
- **Contrast is not a judgement call — it is measured.** `deep-slate` over
  parchment: `/45` = 2.83:1 · `/50` = 3.26:1 · `/55` = 3.80:1 · `/60` = 4.44:1
  — **all four fail AA.** `/70` = 6.18:1 is the first passing step; `/80` =
  8.62:1. Any text conveying information uses `/70` or darker, with no
  exception for "redundant" metadata: a second line under a nav label is doing
  work, not decoration. On ink the equivalent is `text-parchment/70` (8.32:1).
- **No value printed in this document may fail AA at its rendered size.** Where
  a value here was corrected for that reason, §13 records what it was and why.
  A correction to the palette is never resolved by exempting the element that
  uses it.
- **Theme:** `color-scheme` is declared per theme and `<meta name="theme-color">` is set for both.

---

## 10. Icons

**Library:** `lucide-react`. Stroke-based, matches the drawn-not-filled aesthetic.

| Size | Use |
|---|---|
| `size-3` / `size-3.5` | Inside `xs`/`sm` buttons, inline back-links |
| `size-4` | **Default** — buttons, status cells, list affordances |
| `size-5` | Nav items, section affordances |
| `size-7` / `size-8` | Section headers, feature cards, medallions |

Icon color follows meaning: `text-terracotta` (active/alert) · `text-hearth-ochre` (value/complete) · `text-baked-clay` (tertiary navigation) · `currentColor` (structural).

### 10.1 Navigation icon map

§7.7 puts an icon on every nav item; this is which one. **The icon depicts the
item's own title, literally** — not a category, not a mood. A reader who
covers the label should still know where the row goes.

**Community**

| Item | Icon | Reads as |
|---|---|---|
| Home | `House` | the shared roof |
| Mentorship | `HeartHandshake` | two parties paired |
| Meetups | `CalendarDays` | dated gatherings |
| Videos | `Video` | recorded footage |
| Live | `Radio` | a broadcast in progress |
| Members | `Users` | the people here |
| Shop | `ShoppingBag` | goods for sale |

**Manage** — a Manage item **reuses the icon of the subject it configures.**
Mentorship settings takes `HeartHandshake`, Meetups settings `CalendarDays`,
Videos settings `Video`, Live settings `Radio`. The section heading already
says these are settings; giving each a second, gear-flavoured icon would say
it twice and lose the subject. Items with no public counterpart get their own:

| Item | Icon | Reads as |
|---|---|---|
| Invitations | `Mail` | an invitation sent |
| Products | `Package` | a thing that ships |
| Cohorts | `UsersRound` | a smaller group of people |
| Stages | `Milestone` | a point along a progression |
| Reports | `Flag` | flagged content |
| Member reports | `ShieldAlert` | flagged people, a safety matter |
| Commerce | `CreditCard` | money moving |

**Footer**

| Item | Icon | Reads as |
|---|---|---|
| All communities | `LayoutGrid` | every space at once |

**Rules**

- Nav icons are `size-5` (§10) and `aria-hidden="true"` — the label carries
  the meaning, so the icon is decorative and must not be announced twice.
- Icon color is `currentColor`, so it inherits the nav item's state: ink when
  resting, parchment on the inverted active row. Never color a nav icon
  independently of its row.
- `Users` and `UsersRound` sit in different sections on purpose. Members and
  Cohorts are adjacent concepts and their labels disambiguate them; §9 asks
  for color-independence, not icon-uniqueness.
- Adding a nav item means adding its icon here first. An item with no entry in
  this table is not finished.


---

## 11. Implementation Reference

### 11.1 Stack

```
next          16.3.0
react         ^19
tailwindcss   ^4.3.3   (@tailwindcss/postcss)
@base-ui/react ^1.5.0
shadcn        ^4.8.0   (style: base-nova, baseColor: neutral, cssVariables: true)
lucide-react  ^1.16.0
cva + clsx + tailwind-merge   (cn() in lib/utils.ts)
tw-animate-css ^1.4.0
```

### 11.2 CSS entry order

```css
@config '../tailwind.config.js';
@import 'tailwindcss';
@import 'tw-animate-css';
@import 'shadcn/tailwind.css';
@custom-variant dark (&:is(.dark *));
@theme inline { /* brand + semantic color aliases, radius zeroes */ }
:root  { /* light tokens */ }
.dark  { /* dark tokens */ }
/* global resets: radius, border-border, heading rule, noise plate */
/* house utilities: .panel-ink .panel-dark .neon-repair .stamp .masonry */
```

### 11.3 Port checklist

- [ ] Copy the five brand colors into `tailwind.config.js` (or `@theme` in v4).
- [ ] Copy `:root` and `.dark` semantic token blocks verbatim.
- [ ] **Add the missing `--secondary` / `--secondary-foreground` / `--destructive` tokens** (§2.6).
- [ ] Copy the radius zeroing, including `* { border-radius: 0 !important; }`.
- [ ] Copy the global `h1–h6` uppercase/900/-0.08em/0.92 rule.
- [ ] Copy the `body::before` noise plate.
- [ ] Copy `.panel-ink`, `.panel-dark`, `.neon-repair`, `.stamp`, `.masonry`, **and add `.panel-paper`** (§6).
- [ ] Bind real families to `font-serif` and `font-mono` via `next/font` — the design depends on the serif/mono contrast and currently falls back to platform defaults.
- [ ] Set `bg-parchment` on `<html>` and `antialiased` on `<body>`.
- [ ] Adopt the shadow scale as literal arbitrary values, or promote them to `--shadow-*` theme tokens.

### 11.4 Suggested token promotions

Not present in the source, but worth adding so shadows and type stop living as arbitrary values:

```css
@theme inline {
  --shadow-panel:      5px 5px 0 #1a1a1a;
  --shadow-panel-sm:   3px 3px 0 #1a1a1a;
  --shadow-panel-xs:   4px 4px 0 #1a1a1a;
  --shadow-panel-warm: 5px 5px 0 #bc472e;
  --shadow-panel-hero: 8px 8px 0 rgba(188, 71, 46, 0.75);

  --font-serif: var(--font-display), Georgia, Cambria, serif;
  --font-mono:  var(--font-micro), ui-monospace, Menlo, monospace;
  --font-sans:  var(--font-body), Arial, Helvetica, sans-serif;
}
```

---

## 12. Do / Don't

| Do | Don't |
|---|---|
| Zero radius on every element | Add `rounded-*` anywhere |
| Hard offset shadows in ink or terracotta | Use blurred or spread shadows (except `.neon-repair`) |
| Reserve terracotta for the one live thing | Use terracotta as a large background field on paper |
| Flip primary to hearth-ochre on ink | Put terracotta text on `#1A1A1A` |
| Pair mono + uppercase + wide tracking for every micro-label | Set micro-labels in the body sans |
| Use asymmetric column ratios | Split main/aside 50/50 |
| Keep hairlines at `/15`–`/20` | Invent new alpha values mid-scale |
| Jump the type scale (10px ↔ 5xl) | Fill the middle with 6 near-identical sizes |
| Ship the noise plate | Let a flat `#F7F4F0` field render bare |

---

## 13. Amendments

Append-only, same discipline as CLAUDE.md's learned constraints. This document
was ported from another repo; every place the shipped system knowingly departs
from the text above is recorded here rather than left as a contradiction
between the doc and the code.

Format: `YYYY-MM-DD · what changed · why`.

**Standing rule, set 2026-08-27:** where a value in this document conflicts
with WCAG AA, **WCAG wins and the document body is corrected** — the entries
below are the record of what the body used to say, not a list of live
divergences. Earlier entries have now been folded into the body; the values
printed above are the values that ship.

- **2026-08-27 · §7.7 nav description and §9's contrast note** · §7.7's
  example printed `text-deep-slate/45` (2.83:1) and §9 sanctioned `/45` and
  `/50` as "acceptable for redundant metadata". Both corrected in the body:
  §7.7 now prints `/70`, and §9 carries the measured alpha ladder plus the rule
  that any text conveying information uses `/70` or darker. `/60` also fails,
  at 4.44:1, which the original note did not mention.
- **2026-08-27 · §2.1/§2.2 terracotta is `#BC472E`, not `#C84B31`** · the
  original value measures 4.25:1 against its own parchment label, below AA's
  4.5:1 for normal text. `#BC472E` measures 4.70:1. Darkened globally rather
  than exempting the button, per CLAUDE.md's seeded learned constraint.
  `baked-clay #A04729` is unchanged, so the mandated terracotta → baked-clay
  hover still darkens. Offset shadows and `.masonry` fills move with it.
- **2026-08-28 · §7.1, §7.2 and §7.3 rewritten to describe what ships** ·
  all three documented the shadcn `base-nova` / Base UI API, which §11.1's
  amendment already recorded as not adopted — but the section bodies still
  specified it in detail, so a session reading them would write
  `variant="outline"`, `size="sm"` or `<CardHeader>` and hit a confusing
  failure. §7.1 now lists the three variants and the `surface` prop and states
  plainly that there is no `size` prop; §7.2 documents `h-11` as the base
  rather than a house override nobody skipped; §7.3 documents the `treatment`
  prop and says the six card slots do not exist. Raised by CodeRabbit on PR #1
  as a variant-name mismatch; the size scale and the card slots were the larger
  half of the same problem.
- **2026-08-28 · placeholder and two doc examples raised off failing alphas** ·
  `Input`'s placeholder shipped at `text-deep-slate/50` (3.26:1) — a
  placeholder is text. §7.2's helper-text example used `/50` and §3.7's
  micro-label recipe used `/55` (3.80:1). All three now `/70`. The `Select`
  chevron stays at `/60` (4.44:1): it is a graphical object, which WCAG holds
  to 3:1, not 4.5:1 — the distinction now noted in the code.
- **2026-08-28 · §7.1 gains an ink-surface rule** · `danger` and `ghost` both
  drew their colour from the page ground, so inside a `treatment="dark"` Card
  they measured 3.38:1 and 1.00:1 respectively. `Button` now takes
  `surface="ink"`. The document had no rule for this because §2.3's porting
  rule reads as being about the dark *theme*; a dark surface inside a light
  page is the same problem and §7.1 now says so. CodeRabbit flagged `danger`;
  `ghost` — the worse of the two — was found by measuring every variant
  against ink rather than only the one reported.
- **2026-08-28 · §9's theme-color instruction is conditional** · §9 asks for
  `theme-color` on both themes, but nothing activates the dark tokens and the
  run doc schedules no dark-mode session in any wave. A dark entry without a
  dark theme gave dark-preference visitors dark browser chrome above a
  parchment page (Greptile P1 on PR #1). `themeColor` is a single parchment
  value until §2.7 ships; §2.7 now carries the sequencing rule. Dark mode is
  specified in this document but **unscheduled** — no wave requires it.
- **2026-08-27 · §7.1 destructive is drawn, not filled** · the specified
  `bg-destructive/10 text-destructive hover:bg-destructive/20` measures 4.11:1
  at rest and 3.55:1 on hover against parchment — both below AA. Ships as a
  terracotta rule with the label on parchment (4.70:1), hover adding the tint
  and darkening the label to baked-clay (4.89:1), which also preserves §7.1's
  "primary hover always darkens" rule. Found by CodeRabbit on PR #1; the token
  guards did not catch it because they check the token layer, not composed
  alpha-over-alpha pairs. **Any new tinted-fill-plus-same-hue-label pair needs
  measuring before it ships.**
- **2026-08-27 · §2.7 added** · §2.3 defined the dark tokens but nothing said
  when they apply. Resolved as three states with a pure-CSS activation and no
  client script. Amended the same day: the shipped
  `@custom-variant dark (&:is(.dark *))` is class-only and would not fire in
  the System state, so §2.7 now specifies the two-form variant and requires it
  to land in the same change as the token media block.
- **2026-08-27 · §4.6 ratio mapping added** · the three column ratios were
  listed without being mapped to surface types, so every page was an
  independent judgment call. Mapped by how secondary the aside is, with single
  column made an explicit legitimate answer.
- **2026-08-27 · §10.1 added** · §10 gave icon sizes and color meanings but no
  per-item mapping, which left 19 undecided choices in one nav. Mapped
  literally to each item's title, with Manage items reusing their subject's
  icon.
- **2026-08-27 · §11.1 stack not adopted** · the shadcn `base-nova` / Base UI
  stack this document assumes is not installed. §7's specs were ported onto
  the repo's existing hand-rolled primitives in `components/ui.tsx` plus
  `lucide-react`, `clsx`, `tailwind-merge` and `cva`. The visual contract is
  the same; the component library underneath is not. §7.3's slot-based card
  (`CardHeader` / `CardTitle` / `--card-spacing`) is therefore not implemented
  — `Card` takes a `treatment` prop instead.
