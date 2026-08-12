import type { LoginRequest, LoginResponse } from "./protocol.js";

/**
 * Exchanges a nickname for a session token via the server's REST login
 * endpoint. Uses the global `fetch` so it works unmodified in browsers and
 * in Node 22+ (relevant once apps/cli reuses this).
 */
export async function requestLoginToken(authUrl: string, username: string): Promise<LoginResponse> {
  const body: LoginRequest = { username };
  const res = await fetch(authUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`login failed: ${res.status} ${res.statusText}`);
  }

  return (await res.json()) as LoginResponse;
}
