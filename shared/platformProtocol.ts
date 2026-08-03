export const PLATFORM_EMAIL_MAX_LENGTH = 254;
export const PLATFORM_PASSWORD_MIN_LENGTH = 8;
export const INVITATION_CODE_MIN_LENGTH = 6;
export const INVITATION_CODE_MAX_LENGTH = 32;

export type PlatformRole = "user" | "admin";
export type PlatformDevicePlatform = "windows" | "macos" | "linux";
export type PlatformReleaseChannel = "internal" | "stable";

export type EmailValidation =
  | { ok: true; email: string }
  | { ok: false; message: string };

export type PasswordValidation =
  | { ok: true; password: string }
  | { ok: false; message: string };

export type InvitationCodeValidation =
  | { ok: true; code: string }
  | { ok: false; message: string };

export function validatePlatformEmail(input: unknown): EmailValidation {
  if (typeof input !== "string") {
    return { ok: false, message: "邮箱格式不正确" };
  }

  const email = input.trim().toLowerCase();
  if (
    email.length === 0 ||
    email.length > PLATFORM_EMAIL_MAX_LENGTH ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  ) {
    return { ok: false, message: "邮箱格式不正确" };
  }

  return { ok: true, email };
}

export function validatePlatformPassword(input: unknown): PasswordValidation {
  if (typeof input !== "string" || input.length < PLATFORM_PASSWORD_MIN_LENGTH) {
    return { ok: false, message: "密码至少需要 8 位" };
  }

  return { ok: true, password: input };
}

export function validateInvitationCode(
  input: unknown,
): InvitationCodeValidation {
  if (typeof input !== "string") {
    return { ok: false, message: "邀请码格式不正确" };
  }

  const code = input.trim().toUpperCase();
  if (
    code.length < INVITATION_CODE_MIN_LENGTH ||
    code.length > INVITATION_CODE_MAX_LENGTH ||
    !/^[A-Z0-9-]+$/.test(code)
  ) {
    return { ok: false, message: "邀请码格式不正确" };
  }

  return { ok: true, code };
}
