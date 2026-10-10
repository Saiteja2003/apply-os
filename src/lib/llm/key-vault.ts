import "server-only";

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

import type { ProviderId } from "./models";

/**
 * Encryption for BYOK keys at rest (`user_api_keys.encrypted_key`).
 *
 * AES-256-GCM with a server-held key from BYOK_ENCRYPTION_KEY. The user id
 * and provider are bound in as additional authenticated data, so a
 * ciphertext copied onto another row fails to decrypt.
 */

const VERSION = "v1";
const IV_BYTES = 12;

export interface KeyOwner {
  userId: string;
  providerId: ProviderId;
}

function encryptionKey(): Buffer {
  const encoded = process.env.BYOK_ENCRYPTION_KEY;
  if (!encoded) {
    throw new Error("BYOK_ENCRYPTION_KEY is not set.");
  }
  const value = encoded.trim();
  const key = /^[0-9a-f]{64}$/i.test(value)
    ? Buffer.from(value, "hex")
    : Buffer.from(value, "base64");
  if (key.length !== 32) {
    throw new Error(
      "BYOK_ENCRYPTION_KEY must be 32 bytes, encoded as 64 hex characters or base64.",
    );
  }
  return key;
}

function aad(owner: KeyOwner): Buffer {
  return Buffer.from(`${owner.userId}:${owner.providerId}`, "utf8");
}

export function encryptApiKey(plaintext: string, owner: KeyOwner): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  cipher.setAAD(aad(owner));
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);

  return [VERSION, iv, cipher.getAuthTag(), ciphertext]
    .map((part) =>
      typeof part === "string" ? part : part.toString("base64url"),
    )
    .join(".");
}

export function decryptApiKey(encrypted: string, owner: KeyOwner): string {
  const [version, iv, tag, ciphertext] = encrypted.split(".");
  if (version !== VERSION || !iv || !tag || !ciphertext) {
    throw new Error("Stored API key has an unrecognised format.");
  }

  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(iv, "base64url"),
  );
  decipher.setAAD(aad(owner));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));

  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

/** Last four characters, for showing which key is stored. */
export function keyHint(plaintext: string): string {
  return plaintext.slice(-4);
}
