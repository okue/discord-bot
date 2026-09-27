import { beforeAll, describe, expect, it } from "vitest";
import { verifyDiscordRequest } from "../src/core/verify";

let keyPair: CryptoKeyPair;
let publicKeyHex: string;

beforeAll(async () => {
  keyPair = (await crypto.subtle.generateKey({ name: "Ed25519" }, true, [
    "sign",
    "verify",
  ])) as CryptoKeyPair;
  publicKeyHex = toHex((await crypto.subtle.exportKey("raw", keyPair.publicKey)) as ArrayBuffer);
});

function toHex(buffer: ArrayBuffer): string {
  return Buffer.from(buffer).toString("hex");
}

async function signedRequest(body: string, timestamp = "1700000000"): Promise<Request> {
  const signature = await crypto.subtle.sign(
    "Ed25519",
    keyPair.privateKey,
    new TextEncoder().encode(timestamp + body),
  );
  return new Request("https://example.com/interactions", {
    method: "POST",
    body,
    headers: { "X-Signature-Ed25519": toHex(signature), "X-Signature-Timestamp": timestamp },
  });
}

describe("verifyDiscordRequest", () => {
  it("returns the body for a valid signature", async () => {
    const body = JSON.stringify({ type: 1 });
    expect(await verifyDiscordRequest(await signedRequest(body), publicKeyHex)).toBe(body);
  });

  it("returns null for a tampered body", async () => {
    const original = await signedRequest('{"type":1}');
    const tampered = new Request(original.url, {
      method: "POST",
      body: '{"type":2}',
      headers: original.headers,
    });
    expect(await verifyDiscordRequest(tampered, publicKeyHex)).toBeNull();
  });

  it("returns null without signature headers", async () => {
    const request = new Request("https://example.com/interactions", { method: "POST", body: "{}" });
    expect(await verifyDiscordRequest(request, publicKeyHex)).toBeNull();
  });

  it("returns null for a non-hex signature", async () => {
    const request = new Request("https://example.com/interactions", {
      method: "POST",
      body: "{}",
      headers: { "X-Signature-Ed25519": "zz", "X-Signature-Timestamp": "1" },
    });
    expect(await verifyDiscordRequest(request, publicKeyHex)).toBeNull();
  });
});
