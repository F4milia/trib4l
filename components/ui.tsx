import { cva, type VariantProps } from "class-variance-authority";
import { ChevronDown } from "lucide-react";
import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  LabelHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
import { cn } from "@/lib/utils";

/**
 * Hearth & Material primitives. Source of truth: f4milia-design-system.md §7
 * (docs/design-system.md is SUPERSEDED).
 *
 * Every prop signature here is unchanged from the previous implementation, so
 * none of the ~238 existing call sites needed editing -- the exceptions are
 * additive and optional (Card's `treatment`, PageHeading's `eyebrow`).
 *
 * Shape, radius and elevation come from the token layer: the global
 * `* { border-radius: 0 !important }` reset means no variant string here has
 * to think about radius, and the offset-shadow utilities carry elevation.
 */

/* -------------------------------------------------------------------------- */
/* Card — §7.3                                                                */
/* -------------------------------------------------------------------------- */

const cardTreatments = {
  /** Ink panel on paper. The default. Border draws from currentColor. */
  panel: "panel-ink bg-parchment p-6 sm:p-8",
  /** Inverted panel, terracotta registration shadow. */
  dark: "panel-dark bg-deep-slate text-parchment p-6 sm:p-8",
  /** Flat / quiet — forms and dense lists. */
  flat: "border border-deep-slate/15 bg-transparent shadow-none p-6",
} as const;

export function Card({
  children,
  className = "",
  treatment = "panel",
}: {
  children: ReactNode;
  className?: string;
  treatment?: keyof typeof cardTreatments;
}) {
  return <div className={cn(cardTreatments[treatment], className)}>{children}</div>;
}

/* -------------------------------------------------------------------------- */
/* Button — §7.1                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Height is h-11, not §7.1's h-8 default: the doc notes "the default h-8 is
 * too quiet for a primary action, so real CTAs are lifted", and h-11 matches
 * Input so a button and a field sit level in the same row.
 *
 * Focus uses the outline form §9 specifies for hand-rolled buttons rather than
 * the ring form for Base UI primitives. With zero radius and 2px borders, a
 * visible focus affordance is the only one there is.
 */
const button = cva(
  "inline-flex h-11 shrink-0 select-none items-center justify-center gap-2 whitespace-nowrap " +
    "border-2 border-transparent px-4 text-sm font-medium transition-colors " +
    "active:translate-y-px " +
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta " +
    "disabled:pointer-events-none disabled:opacity-50 " +
    "[&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        // §7.1: primary hover is always terracotta -> baked-clay. Never lighten.
        primary: "bg-terracotta text-parchment hover:bg-baked-clay",
        // Terracotta doubles as destructive (§2.6); §7.1 destructive is a tinted fill.
        danger: "border-terracotta bg-terracotta/10 text-terracotta hover:bg-terracotta/20",
        ghost: "text-deep-slate hover:bg-muted",
      },
    },
    defaultVariants: { variant: "primary" },
  },
);

export function Button({
  variant,
  className,
  ...props
}: VariantProps<typeof button> & ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button className={cn(button({ variant }), className)} {...props} />;
}

/* -------------------------------------------------------------------------- */
/* Input / Select — §7.2                                                      */
/* -------------------------------------------------------------------------- */

/** Background is always transparent — fields are drawn, not filled. */
const field =
  "h-11 w-full min-w-0 border border-deep-slate/20 bg-transparent px-3 text-base " +
  "transition-colors outline-none placeholder:text-deep-slate/50 " +
  "focus-visible:border-terracotta focus-visible:ring-3 focus-visible:ring-terracotta " +
  "disabled:cursor-not-allowed disabled:opacity-50 " +
  "aria-invalid:border-terracotta aria-invalid:ring-3 aria-invalid:ring-terracotta/20 " +
  "md:text-sm";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(field, className)} {...props} />;
}

/**
 * className lands on the wrapper, not the <select>: every call site passes a
 * width constraint (max-w-56), and the chevron is positioned against the
 * wrapper's right edge, so constraining the select alone would leave the
 * chevron stranded.
 */
export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className={cn("relative w-full", className)}>
      <select className={cn(field, "appearance-none pr-10")} {...props} />
      <ChevronDown
        aria-hidden="true"
        className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-deep-slate/60"
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Label / ErrorText / PageHeading                                            */
/* -------------------------------------------------------------------------- */

/**
 * §7.2's field-label pattern. /70 measures 6.18:1 on parchment; §9 cautions
 * that /45 and /50 fall below 4.5:1 at this size and are for redundant
 * metadata only — a field label is never redundant.
 */
export function Label({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn(
        "mb-2 block font-mono text-[10px] font-black uppercase tracking-[0.15em] text-deep-slate/70",
        className,
      )}
      {...props}
    />
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="border-2 border-terracotta bg-terracotta/10 px-4 py-3 text-sm text-terracotta">
      {children}
    </p>
  );
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(field, "min-h-28 h-auto py-2", className)} {...props} />;
}

/* -------------------------------------------------------------------------- */
/* Figures — §7.4-7.9                                                        */
/* -------------------------------------------------------------------------- */

/** §7.4. Border comes from currentColor, so set the text color and the frame follows. */
export function Stamp({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn("stamp w-fit", className)}>{children}</span>;
}

/**
 * §7.5. Squares, never circles. The fill rotates through the four accents;
 * on hearth-ochre the label flips to ink, because ochre measures 1.74:1
 * against parchment and cannot carry parchment text.
 */
const avatarFills = [
  "bg-terracotta text-parchment",
  "bg-hearth-ochre text-deep-slate",
  "bg-baked-clay text-parchment",
  "bg-deep-slate text-parchment",
] as const;

const avatarSizes = { sm: "size-8", md: "size-10", lg: "size-16" } as const;

export function Avatar({
  initials,
  index = 0,
  size = "md",
  className,
}: {
  initials: string;
  index?: number;
  size?: keyof typeof avatarSizes;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "flex items-center justify-center border-2 border-deep-slate font-mono text-xs font-black",
        avatarSizes[size],
        avatarFills[index % avatarFills.length],
        className,
      )}
    >
      {initials}
    </span>
  );
}

/**
 * §7.6. Always bordered, always square, always carries a label — which is why
 * `label` is required rather than optional.
 *
 * §9 also requires color-independence: a pip must never be the only carrier of
 * a status for sighted users either. Pair it with the text it qualifies.
 */
export function StatusPip({
  label,
  surface = "paper",
  className,
}: {
  label: string;
  surface?: "paper" | "ink";
  className?: string;
}) {
  return (
    <span
      aria-label={label}
      className={cn(
        "border-2 border-deep-slate bg-terracotta",
        surface === "ink" ? "size-2" : "size-3",
        className,
      )}
    />
  );
}

/**
 * §7.9, and the mechanism behind CLAUDE.md's rule that Tower progress renders
 * as stacked masonry blocks, never a smooth bar. 24 bricks; height varies
 * 25/32/39px on i % 3; incomplete bricks dim rather than disappear.
 *
 * role="img" plus the label is an addition to §7.9, which asks for an
 * aria-label on the container but does not say how it is exposed: a bare div
 * with aria-label is not reliably announced, and the role makes the bricks
 * inside it correctly opaque to assistive tech.
 */
const MASONRY_BRICKS = 24;

export function Masonry({
  filled,
  total = MASONRY_BRICKS,
  label,
  className,
}: {
  filled: number;
  total?: number;
  label: string;
  className?: string;
}) {
  const lit = Math.max(0, Math.min(filled, total));
  return (
    <div role="img" aria-label={label} className={cn("masonry", className)}>
      {Array.from({ length: total }, (_, i) => (
        <span key={i} style={{ opacity: i < lit ? 1 : 0.2, minHeight: `${25 + (i % 3) * 7}px` }} />
      ))}
    </div>
  );
}

/** §3.7's page eyebrow. */
export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cn("font-mono text-xs font-black uppercase tracking-[0.2em] text-baked-clay", className)}>
      {children}
    </p>
  );
}

/**
 * §4.7's page header: a heavy 4px rule closes it, mb-10 to the body, mb-3 from
 * eyebrow to title. `actions` exists so a surface with a header-right link does
 * not have to rebuild the flex row itself.
 */
export function PageHeader({
  title,
  eyebrow,
  actions,
  className,
}: {
  title: ReactNode;
  eyebrow?: string;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("mb-10 border-b-4 border-deep-slate pb-5", className)}>
      {eyebrow ? <Eyebrow className="mb-3">{eyebrow}</Eyebrow> : null}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="max-w-3xl font-serif text-5xl leading-[0.86] tracking-tighter sm:text-7xl">{title}</h1>
        {actions ? <div className="flex shrink-0 items-center gap-4">{actions}</div> : null}
      </div>
    </header>
  );
}
