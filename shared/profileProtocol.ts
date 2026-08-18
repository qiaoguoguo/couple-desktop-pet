export const PROFILE_SYNC_CAPABILITY = "profile-v1" as const;
export type ProfileSyncCapability = typeof PROFILE_SYNC_CAPABILITY;

const NICKNAME_MAX_LENGTH = 20;
const CITY_TEXT_MAX_LENGTH = 80;

export interface CityLocationV1 {
  provider: "weatherapi";
  providerLocationId: number;
  name: string;
  region: string;
  country: string;
  latitude: number;
  longitude: number;
}

export interface ProfileUpdateV1 {
  version: 1;
  nickname: string;
  city: CityLocationV1;
}

export interface DeviceProfileV1 {
  version: 1;
  nickname: string;
  city: CityLocationV1 | null;
  updatedAt: string;
}

export type ProfileUpdateValidation =
  | { ok: true; profile: ProfileUpdateV1 }
  | { ok: false; message: string };

export function validateProfileUpdate(input: unknown): ProfileUpdateValidation {
  if (!isRecord(input) || input.version !== 1) {
    return invalidProfile("Profile version is unsupported");
  }

  const nickname = readNickname(input.nickname);
  if (nickname === null) {
    return invalidProfile("Nickname must contain 1 to 20 characters");
  }

  const city = readCityLocation(input.city);
  if (city === null) {
    return invalidProfile("City location is malformed");
  }

  return {
    ok: true,
    profile: { version: 1, nickname, city },
  };
}

export function readDeviceProfile(input: unknown): DeviceProfileV1 | null {
  if (
    !isRecord(input) ||
    input.version !== 1 ||
    typeof input.updatedAt !== "string" ||
    input.updatedAt.length === 0
  ) {
    return null;
  }

  const nickname = readNickname(input.nickname);
  if (nickname === null) {
    return null;
  }

  const city = input.city === null ? null : readCityLocation(input.city);
  if (city === null && input.city !== null) {
    return null;
  }

  return {
    version: 1,
    nickname,
    city,
    updatedAt: input.updatedAt,
  };
}

function readCityLocation(input: unknown): CityLocationV1 | null {
  if (
    !isRecord(input) ||
    input.provider !== "weatherapi" ||
    !Number.isInteger(input.providerLocationId) ||
    (input.providerLocationId as number) <= 0 ||
    !isBoundedText(input.name, 1) ||
    !isBoundedText(input.region, 0) ||
    !isBoundedText(input.country, 1) ||
    !isFiniteInRange(input.latitude, -90, 90) ||
    !isFiniteInRange(input.longitude, -180, 180)
  ) {
    return null;
  }

  return {
    provider: "weatherapi",
    providerLocationId: input.providerLocationId as number,
    name: input.name.trim(),
    region: input.region.trim(),
    country: input.country.trim(),
    latitude: input.latitude,
    longitude: input.longitude,
  };
}

function readNickname(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const nickname = value.trim();
  const length = Array.from(nickname).length;
  return length >= 1 && length <= NICKNAME_MAX_LENGTH ? nickname : null;
}

function isBoundedText(value: unknown, minimumLength: number): value is string {
  if (typeof value !== "string") {
    return false;
  }

  const length = Array.from(value.trim()).length;
  return length >= minimumLength && length <= CITY_TEXT_MAX_LENGTH;
}

function isFiniteInRange(value: unknown, minimum: number, maximum: number): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= minimum &&
    value <= maximum
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function invalidProfile(message: string): ProfileUpdateValidation {
  return { ok: false, message };
}
