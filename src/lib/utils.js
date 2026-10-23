import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/** Joins class names and lets later Tailwind classes win over earlier ones (used by shadcn/ui components). */
export function cn(...inputs) {
  return twMerge(clsx(inputs));
}
