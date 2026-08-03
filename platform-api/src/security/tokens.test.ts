import { describe, expect, it } from "vitest";
import { signAccessToken, verifyAccessToken } from "./tokens.js";

describe("tokens", () => {
  it("round-trips signed access token claims", () => {
    const token = signAccessToken(
      { userId: "usr_1", role: "admin", email: "a@example.com" },
      "test-secret",
      new Date("2026-08-03T12:00:00.000Z"),
    );

    expect(verifyAccessToken(token, "test-secret")).toEqual({
      userId: "usr_1",
      role: "admin",
      email: "a@example.com",
    });
    expect(verifyAccessToken(token, "wrong-secret")).toBeNull();
  });
});
