/** PostgreSQL numeric values travel as decimal text; rendering does no arithmetic. */
export function formatAccountAmount(value: string | null): string {
  if (value === null) return "—";
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(value);
  if (!match) return "—";
  const integer = match[2].replace(/^0+(?=\d)/, "");
  const cents = (match[3] ?? "").padEnd(2, "0");
  const sign = match[1] && /[1-9]/.test(integer + cents) ? "-" : "";
  return sign + integer.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + "." + cents;
}

export function accountAmountIsNegative(value: string | null): boolean {
  return value !== null && value.startsWith("-") && /[1-9]/.test(value);
}
