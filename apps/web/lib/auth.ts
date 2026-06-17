// Shared auth helper for the custom login (replaces the browser Basic Auth popup).
// Used by both the edge middleware and the Node route handler — both have Web
// Crypto + TextEncoder.

export const AUTH_COOKIE = "ts_auth";

/** Opaque cookie token derived from the password (raw password never stored). */
export async function authToken(password: string): Promise<string> {
  const data = new TextEncoder().encode(`trading-system::${password}`);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
