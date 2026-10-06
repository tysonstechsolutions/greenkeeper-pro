/**
 * Sign-in PINs: a new random one nobody has, and whether a typed one can be
 * used. Pure, for the PIN Management page.
 */

/** A random 4-digit PIN nobody else is using. */
export function generatePin(taken: Set<string> = new Set()): string {
  for (;;) {
    const pin = String(Math.floor(1000 + Math.random() * 9000));
    if (!taken.has(pin)) return pin;
  }
}

/** Why a PIN can't be used, or null when it can. */
export function pinProblem(pin: string, taken: Set<string>): string | null {
  if (!/^\d{4,6}$/.test(pin)) return "A PIN is 4 to 6 digits.";
  if (taken.has(pin)) return "Someone else already has that PIN. Pick another.";
  return null;
}
