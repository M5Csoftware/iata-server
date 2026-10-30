/**
 * IATA Resolution 600b Check Digit Validation & Modulo-7 Engine
 * 
 * Standard Formula:
 * Check Digit = Serial (1..7) mod 7
 */

export function calculateIataMod7CheckDigit(sevenDigits: string | number): number {
  const clean = String(sevenDigits).replace(/[^0-9]/g, '');
  const num = parseInt(clean.slice(0, 7), 10);
  if (isNaN(num)) return 0;
  return num % 7;
}

export function validateIataAwbNumber(eightDigitSerial: string): { isValid: boolean; expectedCheckDigit: number; actualCheckDigit: number } {
  const clean = String(eightDigitSerial).replace(/[^0-9]/g, '');
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

export function generateAwbSeries(
  airlinePrefix: string,
  fromSerial7: number,
  toSerial7: number
): Array<{
  airlinePrefix: string;
  airlineNumber: string;
  fullAwbNumber: string;
}> {
  const results: Array<{
    airlinePrefix: string;
    airlineNumber: string;
    fullAwbNumber: string;
  }> = [];

  for (let s = fromSerial7; s <= toSerial7; s++) {
    const serial7Str = s.toString().padStart(7, '0');
    const checkDigit = calculateIataMod7CheckDigit(serial7Str);
    const eightDigit = `${serial7Str}${checkDigit}`;
    const fullAwbNumber = `${airlinePrefix}-${eightDigit}`;

    results.push({
      airlinePrefix,
      airlineNumber: eightDigit,
      fullAwbNumber,
    });
  }

  return results;
}

