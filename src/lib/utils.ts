import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatChipValue(valueInCents: number): string {
  // All chip/pot values are stored as integer cents in the backend.
  // Convert to dollars for display.
  const dollars = valueInCents / 100;
  const absDollars = Math.abs(dollars);

  // Compact thousands (in dollars)
  if (absDollars >= 1000) {
    const k = dollars / 1000;
    return Number.isInteger(k) ? `${k}K` : `${k.toFixed(1)}K`;
  }

  // Show up to 2 decimals, trim trailing zeros
  return dollars
    .toFixed(2)
    .replace(/\.00$/, '')
    .replace(/(\.\d)0$/, '$1');
}
