import { describe, expect, it } from "vitest";
import {
  ACCESS_TOKEN_TTL_SECONDS,
  signAccessToken,
  verifyAccessToken,
} from "./tokens.js";

describe("tokens", () => {
  it("round-trips signed access token claims", () => {
    const issuedAt = new Date("2026-08-03T12:00:00.000Z");
    const token = signAccessToken(
      { userId: "usr_1", role: "admin", email: "a@example.com" },
      "test-secret",
      issuedAt,
    );

    expect(verifyAccessToken(token, "test-secret", issuedAt)).toEqual({
      userId: "usr_1",
      role: "admin",
      email: "a@example.com",
    });
  });

  it("rejects tokens signed with a different secret", () => {
    const issuedAt = new Date("2026-08-03T12:00:00.000Z");
    const token = signAccessToken(
      { userId: "usr_1", role: "user", email: "a@example.com" },
      "test-secret",
      issuedAt,
    );

    expect(verifyAccessToken(token, "wrong-secret", issuedAt)).toBeNull();
  });

  it("rejects expired access tokens", () => {
    const issuedAt = new Date("2026-08-03T12:00:00.000Z");
    const token = signAccessToken(
      { userId: "usr_1", role: "user", email: "a@example.com" },
      "test-secret",
      issuedAt,
    );

    expect(
      verifyAccessToken(
        token,
        "test-secret",
        new Date(issuedAt.getTime() + ACCESS_TOKEN_TTL_SECONDS * 1000 - 1000),
      ),
    ).toEqual({
      userId: "usr_1",
      role: "user",
      email: "a@example.com",
    });
    expect(
      verifyAccessToken(
        token,
        "test-secret",
        new Date(issuedAt.getTime() + ACCESS_TOKEN_TTL_SECONDS * 1000),
      ),
    ).toBeNull();
  });
});
