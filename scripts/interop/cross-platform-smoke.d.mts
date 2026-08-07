export const requiredInteropEvents: string[];

export function createIsolatedAppEnv(args: {
  platform: "windows" | "macos";
  root: string;
}): Record<string, string>;

export function filterChildAppEnv(env?: Record<string, string | undefined>): Record<string, string>;

export function createInteropEventLogger(args: {
  logPath: string;
  role: string;
  platform: string;
  now?: () => Date;
}): {
  record(event: string, details?: Record<string, unknown>): {
    event: string;
    role: string;
    platform: string;
    at: string;
    details: unknown;
  };
};

export function readSanitizedJsonl(
  paths: string[],
  options?: { forbiddenPlaintext?: string[] },
): Array<{ event: string; [key: string]: unknown }>;

export function redactInteropEvent<T>(event: T): T;
export function validateInteropEvents(events: Array<{ event: string }>): {
  ok: boolean;
  missing: string[];
};
export function isMessageAnimationMotion(motionId: string | null): boolean;
