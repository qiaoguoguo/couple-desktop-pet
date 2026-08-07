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
    });
    const macosKey = deriveSharedKey({
      privateKey: macosKeys.privateKey,
      peerPublicKey: exportPublicKey(windowsKeys.publicKey),
      issueNumber: 42,
    });

    expect(windowsKey.equals(macosKey)).toBe(true);

    const event = createEncryptedEvent({
      role: "windows",
      event: "windows-pair-code-created",
      payload: { pairCode: "123456", message: "hello from windows" },
      key: windowsKey,
    });

    expect(JSON.stringify(event)).not.toContain("123456");
    expect(JSON.stringify(event)).not.toContain("hello from windows");
    expect(decryptEncryptedEvent({ encryptedEvent: event, key: macosKey })).toEqual({
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
    });
    const encryptedEvent = createEncryptedEvent({
      role: "macos",
      event: "macos-pair-accepted",
      payload: { pairCode: "123456" },
      key,
    });

    expect(() =>
      decryptEncryptedEvent({
        encryptedEvent: tamperEncryptedEventForTest(encryptedEvent),
        key,
      }),
    ).toThrow();
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
      }),
    });

    expect(bodies.join("\n")).toContain("public-key-only");
    expect(bodies.join("\n")).not.toContain("123456");
    expect(bodies.join("\n")).not.toContain("secret message");
  });

  it("waits for peer hello and encrypted comments through injectable fetch", async () => {
    const fetchImpl = vi.fn(async (url) => {
      if (String(url).endsWith("/comments")) {
        return {
          ok: true,
          status: 200,
          json: async () => [
            {
              id: 1,
              body: JSON.stringify({
                kind: "hello",
                role: "windows",
                publicKey: "win-key",
              }),
            },
            {
              id: 2,
              body: JSON.stringify({
                kind: "encrypted-event",
                role: "windows",
                nonce: "n",
                ciphertext: "c",
                tag: "t",
              }),
            },
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
        timeoutMs: 1,
        intervalMs: 0,
      }),
    ).resolves.toEqual({ id: 1, role: "windows", publicKey: "win-key" });
    await expect(
      client.waitForEncryptedEvent({
        issueNumber: 1,
        selfRole: "macos",
        timeoutMs: 1,
        intervalMs: 0,
      }),
    ).resolves.toMatchObject({ id: 2, role: "windows", kind: "encrypted-event" });
  });

  it("parses create and cleanup CLIs without printing sensitive payloads", () => {
    expect(
      parseRendezvousArgs([
        "create",
        "--repo",
        "owner/repo",
        "--token",
        "ghs_secret",
        "--title",
        "interop",
      ]),
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
        "--token",
        "ghs_secret",
        "--issue",
        "123",
      ]),
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
});
