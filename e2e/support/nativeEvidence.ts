import { randomUUID } from "node:crypto";
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";
import { $, expect } from "@wdio/globals";

type EvidenceDetails = Record<string, boolean | number | string | null>;
type NativeParityEvidenceEnv = Record<string, string | undefined>;
type NativeParityLogger = Pick<Console, "log">;

export interface NativeParityEvidenceSession {
  sessionId: string;
  githubRunId: string;
  githubRunAttempt: string;
  githubSha: string;
}

interface InitializeNativeParityEvidenceSessionOptions {
  env?: NativeParityEvidenceEnv;
  logger?: NativeParityLogger;
  sessionId?: string;
}

const githubNativeEvidenceRelativeDir =
  ".superpowers/sdd/2026-08-07-macos-cross-platform/native";
const nativeParityEventsFileName = "native-parity-events.jsonl";
const nativeParitySessionMarkerPrefix = "NATIVE_PARITY_EVIDENCE_SESSION";
let activeNativeParitySession: NativeParityEvidenceSession | null = null;

export function resolveNativeParityEvidenceDir(
  env: NativeParityEvidenceEnv = process.env,
): string | undefined {
  if (env.MACOS_NATIVE_PARITY_EVIDENCE_DIR) {
    return env.MACOS_NATIVE_PARITY_EVIDENCE_DIR;
  }
  if (
    env.GITHUB_ACTIONS === "true" &&
    env.GITHUB_WORKSPACE &&
    isWorkspaceAbsolute(env.GITHUB_WORKSPACE)
  ) {
    return joinWorkspacePath(env.GITHUB_WORKSPACE, githubNativeEvidenceRelativeDir);
  }
  return undefined;
}

function isWorkspaceAbsolute(workspace: string): boolean {
  return isAbsolute(workspace) || workspace.startsWith("/");
}

function joinWorkspacePath(workspace: string, relativePath: string): string {
  const separator = workspace.includes("\\") ? "\\" : "/";
  const trimmedWorkspace = workspace.replace(/[\\/]+$/, "");
  return [trimmedWorkspace, ...relativePath.split("/")].join(separator);
}

function currentEvidenceDir(): string | undefined {
  return resolveNativeParityEvidenceDir(process.env);
}

export function hasNativeParityEvidenceDir(): boolean {
  return Boolean(currentEvidenceDir());
}

export function createNativeParityEvidenceSession(
  env: NativeParityEvidenceEnv = process.env,
  sessionId: string = randomUUID(),
): NativeParityEvidenceSession {
  return {
    sessionId,
    githubRunId: nonEmptyEnv(env.GITHUB_RUN_ID, "local-run"),
    githubRunAttempt: nonEmptyEnv(env.GITHUB_RUN_ATTEMPT, "local-attempt"),
    githubSha: nonEmptyEnv(env.GITHUB_SHA, "local-sha"),
  };
}

export function nativeParitySessionMarker(session: NativeParityEvidenceSession): string {
  return `${nativeParitySessionMarkerPrefix} ${JSON.stringify(session)}`;
}

export function initializeNativeParityEvidenceSession({
  env = process.env,
  logger = console,
  sessionId,
}: InitializeNativeParityEvidenceSessionOptions = {}): NativeParityEvidenceSession {
  const session = createNativeParityEvidenceSession(env, sessionId);
  activeNativeParitySession = session;
  const evidenceDir = resolveNativeParityEvidenceDir(env);
  if (evidenceDir) {
    const path = join(evidenceDir, nativeParityEventsFileName);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, "");
  }
  logger.log(nativeParitySessionMarker(session));
  return session;
}

export function nativeEvidencePath(fileName: string): string {
  const evidenceDir = currentEvidenceDir();
  if (!evidenceDir) {
    throw new Error("MACOS_NATIVE_PARITY_EVIDENCE_DIR is not set");
  }
  return join(evidenceDir, fileName);
}

export function recordNativeParityEvent(event: string, details: EvidenceDetails = {}): void {
  const evidenceDir = currentEvidenceDir();
  if (!evidenceDir) {
    return;
  }

  const path = nativeEvidencePath(nativeParityEventsFileName);
  mkdirSync(dirname(path), { recursive: true });
  const session = activeNativeParitySession ?? createNativeParityEvidenceSession(process.env);
  appendFileSync(
    path,
    `${JSON.stringify({
      event,
      platform: "macos",
      role: "macos-native-parity",
      at: new Date().toISOString(),
      ...session,
      details,
    })}\n`,
  );
}

export function writeNativeParityLog(fileName: string, details: EvidenceDetails): void {
  const evidenceDir = currentEvidenceDir();
  if (!evidenceDir) {
    return;
  }

  const path = nativeEvidencePath(fileName);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(
    path,
    `exit=0\n--- json ---\n${JSON.stringify({
      at: new Date().toISOString(),
      session: activeNativeParitySession,
      details,
    }, null, 2)}\n`,
  );
}

export async function saveNativeParityScreenshot(
  fileName: string,
  selector = 'section[aria-label="情侣桌宠 MVP"]',
): Promise<void> {
  const evidenceDir = currentEvidenceDir();
  if (!evidenceDir) {
    return;
  }

  const target = await $(selector);
  await expect(target).toBeDisplayed();
  const path = nativeEvidencePath(fileName);
  mkdirSync(dirname(path), { recursive: true });
  await target.saveScreenshot(path);
}

function nonEmptyEnv(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : fallback;
}
