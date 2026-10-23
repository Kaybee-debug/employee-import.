export type IdValidation =
  | { ok: true; idNumber: string }
  | { ok: false; reasons: string[] };

/**
 * Check a South African ID number.
 *
 * The 13 digits are YYMMDD GGGG C A Z:
 * - YYMMDD is the date of birth
 * - GGGG is a sequence number
 * - C (digit 11) is citizenship: 0 = citizen, 1 = permanent resident
 * - A used to record race and is not checked
 * - Z is the Luhn check digit
 *
 * A two-digit year is read as 2000-2099 when that date is real and not in the
 * future, otherwise as 1900-1999. So 050615 is 15 June 2005.
 */
export function validateSaIdNumber(input: string): IdValidation {
  const digits = input.replace(/[\s-]/g, "");
  if (!/^\d{13}$/.test(digits)) {
    return { ok: false, reasons: ["ID number must be 13 digits"] };
  }

  const reasons: string[] = [];
  if (!isRealDateOfBirth(digits.slice(0, 6))) {
    reasons.push("ID number has an impossible date of birth");
  }
  const citizenship = digits[10];
  if (citizenship !== "0" && citizenship !== "1") {
    reasons.push("ID number citizenship digit must be 0 or 1");
  }
  if (luhnCheckDigit(digits.slice(0, 12)) !== Number(digits[12])) {
    reasons.push("ID number check digit is wrong");
  }

  if (reasons.length > 0) return { ok: false, reasons };
  return { ok: true, idNumber: digits };
}

/**
 * Department of Home Affairs check digit (Luhn):
 * 1. Add the digits in odd positions of the first 12 digits (1st, 3rd, ... 11th).
 * 2. Join the even positions into one number and multiply by 2.
 * 3. Add the digits of that product.
 * 4. The check digit is the amount needed to reach the next multiple of 10.
 */
export function luhnCheckDigit(first12: string): number {
  let oddSum = 0;
  for (let index = 0; index < 12; index += 2) {
    oddSum += Number(first12[index]);
  }

  let evenDigits = "";
  for (let index = 1; index < 12; index += 2) {
    evenDigits += first12[index];
  }
  const doubled = String(Number(evenDigits) * 2);
  let evenSum = 0;
  for (const character of doubled) {
    evenSum += Number(character);
  }

  const total = oddSum + evenSum;
  return (10 - (total % 10)) % 10;
}

function isRealDateOfBirth(yymmdd: string, today = new Date()): boolean {
  const yearTwoDigits = Number(yymmdd.slice(0, 2));
  const month = Number(yymmdd.slice(2, 4));
  const day = Number(yymmdd.slice(4, 6));
  const todayUtc = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());

  for (const year of [2000 + yearTwoDigits, 1900 + yearTwoDigits]) {
    if (!isRealCalendarDate(year, month, day)) continue;
    if (Date.UTC(year, month - 1, day) <= todayUtc) return true;
  }
  return false;
}

function isRealCalendarDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}
