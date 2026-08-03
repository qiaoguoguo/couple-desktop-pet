export type PlatformErrorCode =
  | "invalid_request"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "internal_error";

export class PlatformApiError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: PlatformErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export function createErrorPayload(error: PlatformApiError) {
  return {
    error: {
      code: error.code,
      message: error.message,
    },
  };
}
