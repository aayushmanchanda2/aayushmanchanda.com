/**
 * The one rule every private read passes: the signed-in email is exactly
 * ALLOWED_EMAIL (case and surrounding space aside). An unset ALLOWED_EMAIL
 * lets nobody in, so a deployment that has not been set up fails closed.
 */
export function isOwner(email: string | undefined, allowed: string | undefined): boolean {
  const want = allowed?.trim().toLowerCase();
  return Boolean(want) && email?.trim().toLowerCase() === want;
}

/**
 * Constant-time equality for the ingest secret: both sides are hashed first,
 * so the comparison never depends on where they differ or on their lengths.
 */
export async function sameSecret(given: string, expected: string): Promise<boolean> {
  const hash = async (s: string) => new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
  const [a, b] = await Promise.all([hash(given), hash(expected)]);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return expected.length > 0 && diff === 0;
}
