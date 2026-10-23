export type Disability = "Yes" | "No";

export type DisabilityValue =
  | { kind: "blank" }
  | { kind: "value"; value: Disability }
  | { kind: "invalid"; raw: string };

export type MoneyValue =
  | { kind: "blank" }
  | { kind: "amount"; cents: number; rands: number }
  | { kind: "invalid"; raw: string };

const YES_WORDS = new Set(["y", "yes", "true", "t", "1", "disabled"]);
const NO_WORDS = new Set(["n", "no", "false", "f", "0", "none", "not disabled"]);

/**
 * Read a disability cell. A blank cell stays blank: the import decides whether
 * that means "keep the value on record" or "No" for a new employee.
 */
export function parseDisability(value: unknown): DisabilityValue {
  if (value === undefined || value === null) return { kind: "blank" };
  if (typeof value === "boolean") return { kind: "value", value: value ? "Yes" : "No" };
  if (typeof value === "number") {
    if (value === 1) return { kind: "value", value: "Yes" };
    if (value === 0) return { kind: "value", value: "No" };
    return { kind: "invalid", raw: String(value) };
  }
  if (typeof value !== "string") return { kind: "invalid", raw: String(value) };

  const trimmed = value.trim();
  if (trimmed === "") return { kind: "blank" };
  const word = trimmed.toLowerCase().replace(/\s+/g, " ");
  if (YES_WORDS.has(word)) return { kind: "value", value: "Yes" };
  if (NO_WORDS.has(word)) return { kind: "value", value: "No" };
  return { kind: "invalid", raw: trimmed };
}

/** Read a monthly CTC cell. Spaces, commas and a leading R are allowed. */
export function parseMonthlyCtc(value: unknown): MoneyValue {
  if (value === undefined || value === null) return { kind: "blank" };
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value < 0) return { kind: "invalid", raw: String(value) };
    const cents = Math.round(value * 100);
    return { kind: "amount", cents, rands: cents / 100 };
  }
  if (typeof value !== "string") return { kind: "invalid", raw: String(value) };

  const trimmed = value.trim();
  if (trimmed === "") return { kind: "blank" };
  const cleaned = trimmed.replace(/[\s\u00a0]/g, "").replace(/[Rr]/g, "").replace(/,/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return { kind: "invalid", raw: trimmed };
  const cents = Math.round(Number(cleaned) * 100);
  return { kind: "amount", cents, rands: cents / 100 };
}

export function blankText(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

export function idText(value: string | number | null | undefined): string | null {
  if (value == null) return null;
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value) || value < 0) return null;
    return String(value);
  }
  return blankText(value);
}

export function employeeKey(empNo: string | null): string | null {
  return empNo === null ? null : empNo.toUpperCase();
}

export function idKey(idNumber: string | null): string | null {
  if (idNumber === null) return null;
  const compact = idNumber.replace(/[\s-]/g, "");
  return compact === "" ? null : compact;
}
