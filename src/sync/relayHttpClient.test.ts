import { describe, expect, it, vi } from "vitest";
import { RelayHttpClient } from "./relayHttpClient";

describe("RelayHttpClient", () => {
  it("creates pair codes", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({ code: "123456", expiresAt: "2026-08-03T12:10:00.000Z" }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      ),
    );
    const client = new RelayHttpClient("http://127.0.0.1:8787", fetchMock as typeof fetch);

    await expect(
      client.createPairCode({
        deviceId: "dev_a",
        deviceSecret: "secret_a",
        displayName: "星星桌宠",
      }),
    ).resolves.toEqual({
      ok: true,
      code: "123456",
      expiresAt: "2026-08-03T12:10:00.000Z",
    });

    expect(fetchMock).toHaveBeenCalledWith("http://127.0.0.1:8787/pair-codes", expect.any(Object));
  });

  it("does not call injected fetch with the client instance as this", async () => {
    let observedThis: unknown = null;
    const fetchMock = vi.fn(function (this: unknown) {
      observedThis = this;
      return Promise.resolve(
        new Response(
          JSON.stringify({ code: "123456", expiresAt: "2026-08-03T12:10:00.000Z" }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        ),
      );
    });
    const client = new RelayHttpClient("http://127.0.0.1:8787", fetchMock as typeof fetch);

    await client.createPairCode({
      deviceId: "dev_a",
      deviceSecret: "secret_a",
      displayName: "星星桌宠",
    });

    expect(observedThis).toBeUndefined();
    expect(observedThis).not.toBe(client);
  });

  it("maps relay errors", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          error: { code: "invalid_code", message: "Pair code is invalid" },
        }),
        {
          status: 404,
          headers: { "content-type": "application/json" },
        },
      ),
    );
    const client = new RelayHttpClient("http://127.0.0.1:8787", fetchMock as typeof fetch);

    await expect(
      client.acceptPairCode({
        deviceId: "dev_b",
        deviceSecret: "secret_b",
        displayName: "星星桌宠",
        code: "000000",
      }),
    ).resolves.toEqual({
      ok: false,
      code: "invalid_code",
      message: "Pair code is invalid",
    });
  });

  it("rejects unknown relay error codes", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          error: { code: "not_a_code", message: "Bad relay error" },
        }),
        {
          status: 500,
          headers: { "content-type": "application/json" },
        },
      ),
    );
    const client = new RelayHttpClient("http://127.0.0.1:8787", fetchMock as typeof fetch);

    await expect(
      client.createPairCode({
        deviceId: "dev_a",
        deviceSecret: "secret_a",
        displayName: "星星桌宠",
      }),
    ).resolves.toEqual({
      ok: false,
      code: "relay_unavailable",
      message: "Relay unavailable",
    });
  });
});
