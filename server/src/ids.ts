import { createHash, randomBytes, randomInt } from "node:crypto";
import { PAIR_CODE_LENGTH } from "../../shared/syncProtocol.js";

export function createPairId(): string {
  return `pair_${randomBytes(16).toString("hex")}`;
}

export function createServerMessageId(): string {
  return `msg_${randomBytes(16).toString("hex")}`;
}

export function createPairCode(): string {
  let code = "";
  for (let index = 0; index < PAIR_CODE_LENGTH; index += 1) {
    code += randomInt(0, 10).toString();
  }
  return code;
}

export function hashDeviceSecret(secret: string): string {
  return createHash("sha256").update(secret, "utf8").digest("hex");
}
