/**
 * IATA Resolution 600b Check Digit Validation & Modulo-7 Engine
 *
 * Standard Formula:
 *   Check Digit = Serial (first 7 digits) mod 7
 *
 * Wire format  (Cargo-IMP / e-AWB):  09872418992   (11 digits, no dash)
 * Display format (printed AWB / UI):  098-72418992 (dash after prefix)
 *
 * ⚠ Pick ONE canonical format for `fullAwbNumber` and use it EVERYWHERE:
 *   - AwbStock.fullAwbNumber
 *   - MawbItem.mawbNumber
 *   - Docket.assignedAwb
 *   - Api responses / UI table
 * The version below uses the DISPLAY format ("098-72418992") because it is
 * what the UI table and MawbSheet already render.
 */

/**
 * Modulo-7 check digit for the first 7 digits of an AWB serial.
 *
 * NOTE: This intentionally returns `number` in 0..6 (never 7).
 * Example: "7241899" → 7241899 % 7 = 2  →  check digit "2"
 */
export function calculateIataMod7CheckDigit(
  sevenDigits: string | number,
): number {
  const clean = String(sevenDigits).replace(/[^0-9]/g, "");
  if (clean.length === 0) return 0;
  const num = parseInt(clean.slice(0, 7), 10);
  if (isNaN(num)) return 0;
  return num % 7;
}

/**
 * Validate an 8-digit serial (7 digits + Mod-7 check digit).
 * Returns the same shape you already use in the route + UI tester.
 */
export function validateIataAwbNumber(eightDigitSerial: string): {
  isValid: boolean;
  expectedCheckDigit: number;
  actualCheckDigit: number;
} {
  const clean = String(eightDigitSerial).replace(/[^0-9]/g, "");
  if (clean.length !== 8) {
    return { isValid: false, expectedCheckDigit: -1, actualCheckDigit: -1 };
  }
  const firstSeven = clean.slice(0, 7);
  const actualCheckDigit = parseInt(clean.slice(7), 10);
  const expectedCheckDigit = calculateIataMod7CheckDigit(firstSeven);
  return {
    isValid: expectedCheckDigit === actualCheckDigit,
    expectedCheckDigit,
    actualCheckDigit,
  };
}

/**
 * Generate a contiguous series of AWB numbers for a 3-digit airline prefix.
 *
 * Range is bounded to 0 … 9,999,999 so that padStart(7, '0') always yields a
 * valid 7-digit serial. The route already rejects out-of-bounds input, but
 * we re-check here defensively.
 */
export function generateAwbSeries(
  airlinePrefix: string,
  fromSerial7: number,
  toSerial7: number,
): Array<{
  airlinePrefix: string;
  airlineNumber: string; // 8 chars: 7 digits + check digit
  fullAwbNumber: string; // "<prefix>-<8-digit>"
}> {
  // Normalize prefix → exactly 3 digits, e.g. "98" → "098"
  const prefix = String(airlinePrefix)
    .replace(/[^0-9]/g, "")
    .padStart(3, "0")
    .slice(0, 3);

  // Defensive bounds — the route already validates, but keep the util safe.
  const from = Math.max(0, Math.min(9_999_999, Math.trunc(fromSerial7)));
  const to = Math.max(0, Math.min(9_999_999, Math.trunc(toSerial7)));

  const results: Array<{
    airlinePrefix: string;
    airlineNumber: string;
    fullAwbNumber: string;
  }> = [];

  for (let s = from; s <= to; s++) {
    const serial7Str = s.toString().padStart(7, "0");
    const checkDigit = calculateIataMod7CheckDigit(serial7Str);
    const eightDigit = `${serial7Str}${checkDigit}`;
    const fullAwbNumber = `${prefix}-${eightDigit}`;

    results.push({
      airlinePrefix: prefix,
      airlineNumber: eightDigit,
      fullAwbNumber,
    });
  }

  return results;
}
