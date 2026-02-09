const BASE62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

export function base62Encode(bytes: Uint8Array): string {
  let result = "";
  for (const byte of bytes) {
    result += BASE62[byte % 62];
  }
  return result;
}

export function generateApiKey(): { full: string; prefix: string } {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const encoded = base62Encode(bytes);
  const full = `lk_live_${encoded}`;
  const prefix = full.slice(0, 12);
  return { full, prefix };
}

export async function hashKey(key: string): Promise<string> {
  const encoded = new TextEncoder().encode(key);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
