import { timingSafeEqual } from 'crypto';

/**
 * Constant-time comparison for shared extension secrets.
 * Returns false when either value is missing or lengths differ.
 */
export function verifyExtensionSecret(
  provided: string | undefined,
  expected: string | undefined,
): boolean {
  if (!provided || !expected) {
    return false;
  }

  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);

  if (providedBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(providedBuffer, expectedBuffer);
}
