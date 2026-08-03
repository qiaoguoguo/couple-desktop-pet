import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./passwords.js";

describe("passwords", () => {
  it("hashes and verifies passwords without storing plain text", async () => {
    const hash = await hashPassword("12345678");

    expect(hash).not.toContain("12345678");
    expect(await verifyPassword("12345678", hash)).toBe(true);
    expect(await verifyPassword("wrong-password", hash)).toBe(false);
  });
});
