import { describe, expect, it, vi } from "vitest";
import {
  createEncryptedEvent,
  createGitHubRendezvousClient,
  createInteropKeyPair,
  decryptEncryptedEvent,
  deriveSharedKey,
  exportPublicKey,
  parseRendezvousArgs,
  redactRendezvousLog,
  runRendezvousCli,
  tamperEncryptedEventForTest,
} from "./github-rendezvous.mjs";

describe("GitHub encrypted rendezvous", () => {
  it("derives the same shared key with X25519 and decrypts AES-GCM payloads", () => {
    const windowsKeys = createInteropKeyPair();
    const macosKeys = createInteropKeyPair();
    const windowsKey = deriveSharedKey({
      privateKey: windowsKeys.privateKey,
      peerPublicKey: exportPublicKey(macosKeys.publicKey),
      issueNumber: 42,
      sessionId: "main",
    });
    const macosKey = deriveSharedKey({
      privateKey: macosKeys.privateKey,
      peerPublicKey: exportPublicKey(windowsKeys.publicKey),
      issueNumber: 42,
      sessionId: "main",
    });

    expect(windowsKey.equals(macosKey)).toBe(true);

    const event = createEncryptedEvent({
      role: "windows",
      event: "windows-pair-code-created",
      payload: { pairCode: "123456", message: "hello from windows" },
      key: windowsKey,
      sessionId: "main",
    });

    expect(JSON.stringify(event)).not.toContain("123456");
    expect(JSON.stringify(event)).not.toContain("hello from windows");
    expect(decryptEncryptedEvent({ encryptedEvent: event, key: macosKey, sessionId: "main" })).toEqual({
      role: "windows",
      event: "windows-pair-code-created",
      payload: { pairCode: "123456", message: "hello from windows" },
    });
  });

  it("rejects tampered encrypted payloads", () => {
    const windowsKeys = createInteropKeyPair();
    const macosKeys = createInteropKeyPair();
    const key = deriveSharedKey({
      privateKey: windowsKeys.privateKey,
      peerPublicKey: exportPublicKey(macosKeys.publicKey),
      issueNumber: 7,
      sessionId: "main",
    });
    const encryptedEvent = createEncryptedEvent({
      role: "macos",
      event: "macos-pair-accepted",
      payload: { pairCode: "123456" },
      key,
      sessionId: "main",
    });

    expect(() =>
      decryptEncryptedEvent({
        encryptedEvent: tamperEncryptedEventForTest(encryptedEvent),
        key,
        sessionId: "main",
      }),
    ).toThrow();
  });

  it("authenticates outer role and event metadata through AES-GCM AAD", () => {
    const windowsKeys = createInteropKeyPair();
    const macosKeys = createInteropKeyPair();
    const key = deriveSharedKey({
      privateKey: windowsKeys.privateKey,
      peerPublicKey: exportPublicKey(macosKeys.publicKey),
      issueNumber: 9,
      sessionId: "main",
    });
    const encryptedEvent = createEncryptedEvent({
      role: "windows",
      event: "windows-message-sent",
      payload: { message: "secret message" },
      key,
      sessionId: "main",
    });

    expect(() =>
      decryptEncryptedEvent({
        encryptedEvent: { ...encryptedEvent, event: "windows-message-received" },
        key,
        sessionId: "main",
      }),
    ).toThrow();
    expect(() =>
      decryptEncryptedEvent({
        encryptedEvent: { ...encryptedEvent, role: "macos" },
        key,
        sessionId: "main",
      }),
    ).toThrow();
    expect(() =>
      decryptEncryptedEvent({
        encryptedEvent,
        key,
        expectedEvent: "windows-message-received",
        expectedRole: "windows",
        sessionId: "main",
      }),
    ).toThrow(/expected event/);
  });

  it("posts only hello public keys and encrypted event bodies to GitHub", async () => {
    const bodies = [];
    const fetchImpl = vi.fn(async (_url, init = {}) => {
      if (init.body) {
        bodies.push(JSON.parse(String(init.body)).body ?? String(init.body));
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ number: 314, id: 2718, comments: 0 }),
        text: async () => "ok",
      };
    });
    const client = createGitHubRendezvousClient({
      owner: "owner",
      repo: "repo",
      token: "ghs_secret",
      fetchImpl,
    });
    const key = Buffer.alloc(32, 1);

    await client.createIssue({ title: "interop test" });
    await client.postHello({
      issueNumber: 314,
      role: "windows",
      publicKey: "public-key-only",
    });
    await client.postEncryptedEvent({
      issueNumber: 314,
      encryptedEvent: createEncryptedEvent({
        role: "windows",
        event: "windows-pair-code-created",
        payload: { pairCode: "123456", message: "secret message" },
        key,
        sessionId: "main",
      }),
    });

    expect(bodies.join("\n")).toContain("public-key-only");
    expect(bodies.join("\n")).not.toContain("123456");
    expect(bodies.join("\n")).not.toContain("secret message");
  });

  it("waits for peer hello and encrypted comments through injectable fetch", async () => {
    const fetchImpl = vi.fn(async (url) => {
      if (String(url).includes("/comments")) {
        return {
          ok: true,
          status: 200,
          json: async () => [
            { id: 1, body: JSON.stringify({ marker: "wrong", kind: "hello", role: "windows", publicKey: "old-key", sessionId: "main" }) },
            { id: 2, body: JSON.stringify({ kind: "hello", role: "windows", publicKey: "missing-marker", sessionId: "main" }) },
            { id: 3, body: JSON.stringify({ marker: "couple-pet-interop-v1", kind: "hello", role: "windows", publicKey: "win-key", sessionId: "main" }) },
            { id: 4, body: JSON.stringify({ marker: "couple-pet-interop-v1", kind: "encrypted-event", role: "windows", event: "windows-message-sent", sessionId: "main", nonce: "n", ciphertext: "c", tag: "t" }) },
          ],
          text: async () => "ok",
        };
      }
      return { ok: true, status: 200, json: async () => ({}), text: async () => "ok" };
    });
    const client = createGitHubRendezvousClient({
      owner: "owner",
      repo: "repo",
      token: "token",
      fetchImpl,
    });

    await expect(
      client.waitForPeerHello({
        issueNumber: 1,
        selfRole: "macos",
        sessionId: "main",
        timeoutMs: 1,
        intervalMs: 0,
      }),
    ).resolves.toEqual({ id: 3, role: "windows", publicKey: "win-key", sessionId: "main" });
    await expect(
      client.waitForEncryptedEvent({
        issueNumber: 1,
        selfRole: "macos",
        sessionId: "main",
        timeoutMs: 1,
        intervalMs: 0,
      }),
    ).resolves.toMatchObject({ id: 4, role: "windows", kind: "encrypted-event", event: "windows-message-sent", sessionId: "main" });
  });

  it("filters peer hello by session id so restart runs do not reuse old keys", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => [
        { id: 1, body: JSON.stringify({ marker: "couple-pet-interop-v1", kind: "hello", role: "windows", publicKey: "old-key", sessionId: "main" }) },
        { id: 2, body: JSON.stringify({ marker: "couple-pet-interop-v1", kind: "hello", role: "windows", publicKey: "restart-key", sessionId: "restart" }) },
      ],
      text: async () => "ok",
    }));
    const client = createGitHubRendezvousClient({ owner: "owner", repo: "repo", token: "token", fetchImpl });

    await expect(
      client.waitForPeerHello({
        issueNumber: 1,
        selfRole: "macos",
        sessionId: "restart",
        timeoutMs: 1,
        intervalMs: 0,
      }),
    ).resolves.toEqual({ id: 2, role: "windows", publicKey: "restart-key", sessionId: "restart" });
  });

  it("paginates comments and supports 204 delete responses during cleanup", async () => {
    const calls = [];
    const pageOne = Array.from({ length: 30 }, (_value, index) => ({
      id: index + 1,
      body: JSON.stringify({ marker: "couple-pet-interop-v1", kind: "hello", role: "windows", publicKey: `old-${index}`, sessionId: "main" }),
    }));
    const fetchImpl = vi.fn(async (url, init = {}) => {
      calls.push({ url: String(url), method: init.method });
      if (String(url).includes("/comments") && init.method === "GET") {
        const page = String(url).includes("page=2") ? 2 : 1;
        return {
          ok: true,
          status: 200,
          headers: {
            get: (name) =>
              name.toLowerCase() === "link" && page === 1
                ? '<https://api.github.com/repos/owner/repo/issues/1/comments?per_page=100&page=2>; rel="next"'
                : null,
          },
          json: async () =>
            page === 1
              ? pageOne
              : [
                  { id: 31, body: JSON.stringify({ marker: "couple-pet-interop-v1", kind: "hello", role: "windows", publicKey: "new-key", sessionId: "restart" }) },
                ],
          text: async () => "ok",
        };
      }
      if (init.method === "DELETE") {
        return { ok: true, status: 204, headers: { get: () => null }, json: async () => { throw new Error("no json"); }, text: async () => "" };
      }
      return { ok: true, status: 200, headers: { get: () => null }, json: async () => ({}), text: async () => "{}" };
    });
    const client = createGitHubRendezvousClient({ owner: "owner", repo: "repo", token: "token", fetchImpl });

    await expect(
      client.waitForPeerHello({
        issueNumber: 1,
        selfRole: "macos",
        sessionId: "restart",
        timeoutMs: 1,
        intervalMs: 0,
      }),
    ).resolves.toMatchObject({ id: 31, publicKey: "new-key" });
    await expect(client.cleanup(1)).resolves.toBeUndefined();
    expect(calls.some((call) => call.url.includes("per_page=100"))).toBe(true);
    expect(calls.some((call) => call.url.includes("page=2"))).toBe(true);
    expect(calls.some((call) => call.method === "DELETE")).toBe(true);
    expect(calls.some((call) => call.method === "PATCH")).toBe(true);
  });

  it("parses create and cleanup CLIs without printing sensitive payloads", () => {
    expect(
      parseRendezvousArgs([
        "create",
        "--repo",
        "owner/repo",
        "--title",
        "interop",
      ], { INTEROP_GITHUB_TOKEN: "ghs_secret" }),
    ).toEqual({
      command: "create",
      owner: "owner",
      repo: "repo",
      token: "ghs_secret",
      title: "interop",
    });
    expect(
      parseRendezvousArgs([
        "cleanup",
        "--repo",
        "owner/repo",
        "--issue",
        "123",
      ], { INTEROP_GITHUB_TOKEN: "ghs_secret" }),
    ).toEqual({
      command: "cleanup",
      owner: "owner",
      repo: "repo",
      token: "ghs_secret",
      issueNumber: 123,
    });
    expect(
      redactRendezvousLog("GITHUB_TOKEN=ghs_secret pairCode=123456 message=hello deviceSecret=abc", {
        GITHUB_TOKEN: "ghs_secret",
        pairCode: "123456",
        message: "hello",
        deviceSecret: "abc",
      }),
    ).toBe(
      "GITHUB_TOKEN=<redacted> pairCode=<redacted> message=<redacted> deviceSecret=<redacted>",
    );
  });

  it("reads CLI token from the environment and redacts token errors", async () => {
    expect(() =>
      parseRendezvousArgs(["create", "--repo", "owner/repo", "--title", "interop"], {}),
    ).toThrow(/INTEROP_GITHUB_TOKEN/);

    const stderr = { error: vi.fn() };
    const exitCode = await runRendezvousCli(
      ["create", "--repo", "owner/repo", "--title", "interop"],
      {
        env: { INTEROP_GITHUB_TOKEN: "ghs_secret" },
        stderr,
        stdout: { log: vi.fn() },
        fetchImpl: async () => ({
          ok: false,
          status: 401,
          text: async () => "bad token ghs_secret",
          json: async () => ({}),
        }),
      },
    );

    expect(exitCode).toBe(1);
    expect(stderr.error.mock.calls[0][0]).not.toContain("ghs_secret");
    expect(stderr.error.mock.calls[0][0]).toContain("<redacted>");
  });
});
