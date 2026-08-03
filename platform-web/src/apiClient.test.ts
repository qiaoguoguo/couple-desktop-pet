import { afterEach, describe, expect, it, vi } from "vitest";
import { createPlatformApiClient } from "./apiClient";

describe("platform api client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("downloads releases with the current bearer token instead of a public URL", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response("windows-build", {
        status: 200,
        headers: { "content-type": "application/octet-stream" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const client = createPlatformApiClient({
      baseUrl: "http://api.example",
      getToken: () => "token_user",
    });

    const blob = await client.downloadRelease("rel_1");

    expect(await blob.text()).toBe("windows-build");
    expect(fetchMock).toHaveBeenCalledWith(
      "http://api.example/releases/rel_1/download",
      expect.objectContaining({
        method: "GET",
        headers: expect.any(Headers),
      }),
    );
    const headers = fetchMock.mock.calls[0][1].headers as Headers;
    expect(headers.get("authorization")).toBe("Bearer token_user");
  });
});
