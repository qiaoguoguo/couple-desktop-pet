import type { SyncErrorCode } from "../../shared/syncProtocol.js";

export class RelayError extends Error {
  constructor(
    public readonly code: SyncErrorCode,
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "RelayError";
  }
}
