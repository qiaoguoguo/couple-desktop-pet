import { describe, expect, it } from "vitest";
import {
  validateInvitationCode,
  validatePlatformEmail,
  validatePlatformPassword,
} from "./platformProtocol";

describe("platformProtocol", () => {
  it("normalizes valid email addresses", () => {
    expect(validatePlatformEmail(" Test@Example.COM ")).toEqual({
      ok: true,
      email: "test@example.com",
    });
  });

  it("rejects invalid email addresses", () => {
    expect(validatePlatformEmail("not-email")).toEqual({
      ok: false,
      message: "邮箱格式不正确",
    });
  });

  it("requires passwords with at least 8 characters", () => {
    expect(validatePlatformPassword("1234567")).toEqual({
      ok: false,
      message: "密码至少需要 8 位",
    });
    expect(validatePlatformPassword("12345678")).toEqual({
      ok: true,
      password: "12345678",
    });
  });

  it("normalizes invitation codes and rejects unsafe characters", () => {
    expect(validateInvitationCode(" abc-123 ")).toEqual({
      ok: true,
      code: "ABC-123",
    });
    expect(validateInvitationCode("../secret")).toEqual({
      ok: false,
      message: "邀请码格式不正确",
    });
  });
});
