/**
 * Verifies the Ed25519 signature of a Discord Interactions request.
 * Returns the request body if valid, otherwise null.
 */
export async function verifyDiscordRequest(
  request: Request,
  publicKey: string,
): Promise<string | null> {
  const signature = request.headers.get("X-Signature-Ed25519");
  const timestamp = request.headers.get("X-Signature-Timestamp");
  const body = await request.text();
  if (!signature || !timestamp) return null;

  const signatureBytes = hexToBytes(signature);
  const keyBytes = hexToBytes(publicKey);
  if (!signatureBytes || !keyBytes) return null;

  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "Ed25519" }, false, [
    "verify",
  ]);
  const valid = await crypto.subtle.verify(
    "Ed25519",
    key,
    signatureBytes,
    new TextEncoder().encode(timestamp + body),
  );
  return valid ? body : null;
}

function hexToBytes(hex: string): Uint8Array<ArrayBuffer> | null {
  if (hex.length === 0 || hex.length % 2 !== 0 || !/^[0-9a-f]+$/i.test(hex)) return null;
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}
