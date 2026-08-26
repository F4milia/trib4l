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
| **Terracotta is scarce** | `#C84B31` marks the one thing that is live, active, or urgent on a screen. Never a background wash. |
| **The surface has tooth** | A fixed multiply-blend noise layer sits over the whole app at 16% so nothing reads as flat digital white. |

---

## 2. Color Palette

### 2.1 Brand core

| Token | Hex | Role |
|---|---|---|
| `terracotta` | **`#C84B31`** | **Primary brand color.** Active state, primary action, confirmed presence, repair flag, accent rules. |
| `baked-clay` | `#A04729` | Primary hover / pressed. Eyebrow and micro-label text on paper. |
| `hearth-ochre` | `#E3B46B` | Accent and highlight. Completed states, money/record signals, dark-mode primary. |
| `parchment` | `#F7F4F0` | Page ground (light) and ink-on-dark text color. |
| `deep-slate` | `#1A1A1A` | Ink. Text, borders, shadows, inverted panels. |

```js
// tailwind.config.js
colors: {
  parchment:      '#F7F4F0',
  'deep-slate':   '#1A1A1A',
  terracotta:     '#C84B31',
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
| `--primary` | `#C84B31` | **terracotta** |
| `--primary-foreground` | `#F7F4F0` | parchment |
| `--muted` | `#E8E1D8` | warm paper shade |
| `--muted-foreground` | `#604E45` | warm brown-grey |
| `--border` | `#1A1A1A` | full-strength ink |
| `--input` | `#1A1A1A` | full-strength ink |
| `--ring` | `#C84B31` | terracotta |
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
  --destructive: #C84B31;          /* terracotta doubles as destructive */
}
.dark {
  --secondary: #302B27;
  --secondary-foreground: #F7F4F0;
  --destructive: #C84B31;
}
```

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
<p class="font-mono text-[10px] font-black uppercase tracking-widest text-deep-slate/55">Convener / Mara</p>
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
| `shadow-[5px_5px_0px_0px_rgba(200,75,49,1)]` | 5px terracotta | Active / current row on ink (`.panel-dark`) |
| `shadow-[8px_8px_0px_0px_rgba(200,75,49,0.75)]` | 8px terracotta @75% | Hero panel, maximum lift |
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
.panel-dark  { border: 2px solid #f7f4f0; box-shadow: 5px 5px 0 #c84b31; }

/* The only glow in the system — reserved for repair / conflict entries */
.neon-repair { border: 2px solid #c84b31;
               box-shadow: 0 0 20px rgba(200,75,49,.8),
                           inset 0 0 16px rgba(200,75,49,.18); }

/* Inline uppercase badge — inherits currentColor for its border */
.stamp       { border: 2px solid currentColor; padding: .2rem .45rem;
               font-size: .65rem; font-weight: 900; letter-spacing: .08em;
               text-transform: uppercase; }

/* Progress-as-brickwork — the signature data display */
.masonry     { display: grid; grid-template-columns: repeat(8, 1fr);
               gap: 3px; align-items: end; }
.masonry > span            { min-height: 2rem; border: 2px solid #1a1a1a;
                             background: #c84b31; }
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

Base UI `<Button>` + CVA. Radius classes in the variant strings are neutralized by the global reset.

**Base:** `inline-flex shrink-0 items-center justify-center border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:translate-y-px disabled:pointer-events-none disabled:opacity-50 [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4`

| Variant | Treatment |
|---|---|
| `default` | `bg-primary text-primary-foreground` — terracotta on parchment |
| `outline` | `border-border bg-background hover:bg-muted` |
| `secondary` | `bg-secondary text-secondary-foreground hover:bg-secondary/80` |
| `ghost` | `hover:bg-muted hover:text-foreground` |
| `destructive` | `bg-destructive/10 text-destructive hover:bg-destructive/20` |
| `link` | `text-primary underline-offset-4 hover:underline` |

| Size | Height | Padding | Icon |
|---|---|---|---|
| `xs` | `h-6` | `px-2` | `size-3` |
| `sm` | `h-7` | `px-2.5` | `size-3.5` |
| `default` | `h-8` | `px-2.5` | `size-4` |
| `lg` | `h-9` | `px-2.5` | `size-4` |
| `icon-xs` / `icon-sm` / `icon` / `icon-lg` | `size-6` / `size-7` / `size-8` / `size-9` | — | — |

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
- Primary hover is always `terracotta → baked-clay`. Never lighten terracotta.
- Icons use `data-icon="inline-start" | "inline-end"`; the base style tightens the matching side automatically.
- Disabled: `opacity-50` (`opacity-40` on hero CTAs).
- Press: `translate-y-px`.
- Icon size 16px default; nav/feature icons `size-5`; header icons `size-7`–`size-8`.

### 7.2 Input

Base UI `<Input>`. One variant only.

**Base:** `h-8 w-full min-w-0 border border-input bg-transparent px-2.5 py-1 text-base transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm`

**House override for forms** — the `h-8` default is too tight for a labelled field:

```html
<Input class="h-11 border-deep-slate/20 bg-transparent focus-visible:ring-terracotta" />
```

**Field pattern** — mono label above, hairline-bordered input, small helper below:

```html
<div class="flex flex-col gap-2">
  <label for="name"
    class="font-mono text-[10px] uppercase tracking-[0.15em] text-deep-slate/70">
    Full name
  </label>
  <Input id="name" class="h-11 border-deep-slate/20 bg-transparent
                          focus-visible:ring-terracotta" />
  <p class="text-xs leading-5 text-deep-slate/50">The name used across the household.</p>
</div>
```

Alternate label style inside `.panel-ink` cards: `font-mono text-xs font-black uppercase tracking-tight`, with required fields marked by a trailing ` *`.

**Rules**
- Background is always `bg-transparent` — inputs are drawn, not filled.
- Field stack gap `gap-2`; form vertical rhythm `gap-5` (dense) or `gap-6` (spacious).
- Focus: `ring-3` at 50% of ring color; forms override the ring to solid `terracotta`.
- Error: `aria-invalid` drives border + ring; never a separate class.

### 7.3 Card

shadcn card with a `--card-spacing` custom property and slot-driven layout.

| Slot | Base classes |
|---|---|
| `Card` | `flex flex-col gap-(--card-spacing) overflow-hidden bg-card py-(--card-spacing) text-sm text-card-foreground ring-1 ring-foreground/10 [--card-spacing:--spacing(4)]` |
| `CardHeader` | `grid auto-rows-min items-start gap-1 px-(--card-spacing)` |
| `CardTitle` | `text-base leading-snug font-medium` |
| `CardDescription` | `text-sm text-muted-foreground` |
| `CardAction` | `col-start-2 row-span-2 row-start-1 self-start justify-self-end` |
| `CardContent` | `px-(--card-spacing)` |
| `CardFooter` | `flex items-center border-t bg-muted/50 p-(--card-spacing)` |

`size="sm"` sets `--card-spacing: --spacing(3)` (12px) instead of `--spacing(4)` (16px).

**The three house card treatments** — always apply one:

```html
<!-- 1. Ink panel on paper — the default -->
<Card class="panel-ink bg-parchment">

<!-- 2. Inverted panel — terracotta registration shadow -->
<Card class="panel-dark bg-deep-slate text-parchment">
<Card class="panel-ink bg-deep-slate text-parchment
             shadow-[8px_8px_0px_0px_rgba(200,75,49,0.75)]">   <!-- hero -->

<!-- 3. Flat / quiet — forms and dense lists -->
<Card class="border-deep-slate/15 bg-transparent shadow-none">
```

**Rules**
- Card titles inherit the global heading rule when rendered as headings — expect uppercase 900. In-card display titles override upward: `text-3xl sm:text-5xl`, up to `text-5xl sm:text-8xl` for ceremony moments.
- Card descriptions switch to `font-serif text-lg|text-xl leading-relaxed` at full ink strength (`text-deep-slate`) rather than muted grey — descriptions are content here, not chrome.
- Header dividers are explicit: `CardHeader class="border-b-2 border-deep-slate"` (panel) or `border-b border-deep-slate/15` (flat).
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
                 text-deep-slate/45">Shared space</span>
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
- **Contrast caution:** `text-deep-slate/45` and `/50` on parchment fall below 4.5:1 at 10px. Acceptable for redundant metadata; **never** for the only copy conveying a fact.
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
  --shadow-panel-warm: 5px 5px 0 #c84b31;
  --shadow-panel-hero: 8px 8px 0 rgba(200, 75, 49, 0.75);

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
