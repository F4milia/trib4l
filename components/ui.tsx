import type { ButtonHTMLAttributes, InputHTMLAttributes, LabelHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`bg-canvas-raised border border-line rounded-lg p-6 shadow-sm ${className}`}>{children}</div>
  );
}

const buttonVariants = {
  primary: "bg-primary text-white hover:bg-primary-dark",
  danger: "border border-danger text-danger hover:bg-danger/10",
  ghost: "text-primary hover:bg-primary-soft",
} as const;

export function Button({
  variant = "primary",
  className = "",
  ...props
}: { variant?: keyof typeof buttonVariants } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={`inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50 ${buttonVariants[variant]} ${className}`}
      {...props}
    />
  );
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className="w-full rounded-md border border-line bg-white px-3 py-2 text-ink placeholder:text-ink-soft focus:border-primary focus:outline-none"
      {...props}
    />
  );
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className="w-full rounded-md border border-line bg-white px-3 py-2 text-ink focus:border-primary focus:outline-none"
      {...props}
    />
  );
}

export function Label(props: LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className="block text-sm font-medium text-ink-soft mb-1" {...props} />;
}

export function ErrorText({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="rounded-md bg-danger/10 border border-danger/30 text-danger px-3 py-2 text-sm">
      {children}
    </p>
  );
}

export function PageHeading({ children }: { children: ReactNode }) {
  return <h1 className="text-3xl font-display text-primary-dark">{children}</h1>;
}
