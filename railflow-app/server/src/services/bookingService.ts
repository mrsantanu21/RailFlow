import { randomBytes } from 'crypto';

/**
 * Generate a unique PNR in the format: XXXXXXXXXX (10 digits/alphanumeric)
 * Similar to IRCTC PNR format but clearly marked as demo-generated.
 */
export function generatePNR(): string {
  // Generate 10-character alphanumeric PNR
  const chars = '0123456789';
  let pnr = '';
  const bytes = randomBytes(10);
  for (let i = 0; i < 10; i++) {
    pnr += chars[bytes[i] % chars.length];
  }
  return pnr;
}

/**
 * Check if two journey segments overlap.
 * Returns true if [a_board, a_alight] overlaps with [b_board, b_alight].
 */
export function segmentsOverlap(
  aBoardSeq: number,
  aAlightSeq: number,
  bBoardSeq: number,
  bAlightSeq: number
): boolean {
  return aBoardSeq < bAlightSeq && aAlightSeq > bBoardSeq;
}
