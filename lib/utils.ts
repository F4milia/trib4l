import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merges class lists so a caller's className wins over a component's base
 * without the two fighting -- twMerge resolves conflicts within a Tailwind
 * group (h-11 vs h-8, bg-transparent vs bg-parchment) rather than emitting
 * both and leaving the outcome to source order.
 *
 * This exists because the previous primitives spread {...props} after their
 * own className, so any caller passing className replaced the base styling
 * outright. See the regression tests in tests/ui-primitives.test.tsx.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
