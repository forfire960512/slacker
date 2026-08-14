import { afterEach, describe, expect, it, vi } from "vitest";
import { requestLoginToken } from "./auth.js";

describe("requestLoginToken", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("POSTs the username as JSON and resolves with the parsed response on success", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ token: "signed.jwt.token", username: "alice" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await requestLoginToken("http://localhost:8080/auth/login", "alice");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8080/auth/login");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({ "content-type": "application/json" });
    expect(JSON.parse(init.body as string)).toEqual({ username: "alice" });

    expect(result).toEqual({ token: "signed.jwt.token", username: "alice" });
  });

  it("throws an Error including the status when the response is not ok", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
      }),
    );

    await expect(requestLoginToken("http://localhost:8080/auth/login", "alice")).rejects.toThrow(
      /401.*Unauthorized/,
    );
  });
});
