/**
 * EAN Barcode utilities — validation & generation using GS1 Modulo 10 algorithm.
 *
 * EAN-13: 13 digits (prefix 200 for internal use + 9 sequential + 1 check digit)
 * EAN-8:   8 digits (prefix 2 for internal use + 6 sequential + 1 check digit)
 */

// ---------------------------------------------------------------------------
// Check digit calculation (Modulo 10 — GS1 standard)
// ---------------------------------------------------------------------------

/**
 * Calculate EAN-13 check digit from 12 base digits.
 * Weights from left: 1,3,1,3,1,3,1,3,1,3,1,3
 */
export function calculateEAN13CheckDigit(twelveDigits: string): number {
  if (!/^\d{12}$/.test(twelveDigits)) throw new Error("Se requieren 12 digitos");
  const d = twelveDigits.split("").map(Number);
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += d[i] * (i % 2 === 0 ? 1 : 3);
  }
  return (10 - (sum % 10)) % 10;
}

/**
 * Calculate EAN-8 check digit from 7 base digits.
 * Weights from left: 3,1,3,1,3,1,3
 */
export function calculateEAN8CheckDigit(sevenDigits: string): number {
  if (!/^\d{7}$/.test(sevenDigits)) throw new Error("Se requieren 7 digitos");
  const d = sevenDigits.split("").map(Number);
  let sum = 0;
  for (let i = 0; i < 7; i++) {
    sum += d[i] * (i % 2 === 0 ? 3 : 1);
  }
  return (10 - (sum % 10)) % 10;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/** Validate a complete EAN code (8 or 13 digits) using Modulo 10 */
export function validateEAN(code: string): boolean {
  if (!/^(\d{8}|\d{13})$/.test(code)) return false;

  const digits = code.split("").map(Number);
  const checkDigit = digits.pop()!;
  const base = digits;

  let sum = 0;
  const reversed = [...base].reverse();
  for (let i = 0; i < reversed.length; i++) {
    sum += reversed[i] * (i % 2 === 0 ? 3 : 1);
  }

  const calculated = (10 - (sum % 10)) % 10;
  return calculated === checkDigit;
}

/** Detect barcode format by length */
export function detectBarcodeFormat(
  code: string
): "EAN-13" | "EAN-8" | null {
  if (/^\d{13}$/.test(code)) return "EAN-13";
  if (/^\d{8}$/.test(code)) return "EAN-8";
  return null;
}

// ---------------------------------------------------------------------------
// Generation (for client-side preview / fallback)
// ---------------------------------------------------------------------------

/** Generate EAN-13 code: prefix 200 + 9-digit sequence + check digit */
export function generateEAN13(sequence: number): string {
  const base = "200" + String(sequence).padStart(9, "0");
  const check = calculateEAN13CheckDigit(base);
  return base + check;
}

/** Generate EAN-8 code: prefix 2 + 6-digit sequence + check digit */
export function generateEAN8(sequence: number): string {
  const base = "2" + String(sequence).padStart(6, "0");
  const check = calculateEAN8CheckDigit(base);
  return base + check;
}

// ---------------------------------------------------------------------------
// bwip-js bcid helper
// ---------------------------------------------------------------------------

/** Map barcode string to bwip-js bcid */
export function getBwipBcid(code: string): "ean13" | "ean8" | "code128" {
  if (code.length === 13) return "ean13";
  if (code.length === 8) return "ean8";
  return "code128";
}
