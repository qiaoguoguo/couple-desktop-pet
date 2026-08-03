import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { basename, isAbsolute, relative, resolve } from "node:path";
import { PlatformApiError } from "../errors.js";

export interface ReleaseFileMetadata {
  fileName: string;
  filePath: string;
  fileSize: number;
  sha256: string;
}

export async function readReleaseFileMetadata({
  releaseStoragePath,
  fileReference,
  fileName,
  expectedSha256,
}: {
  releaseStoragePath: string;
  fileReference: string;
  fileName?: string | null;
  expectedSha256?: string | null;
}): Promise<ReleaseFileMetadata> {
  const filePath = resolveReleaseStorageReference(
    releaseStoragePath,
    fileReference,
  );
  const safeFileName = validateReleaseFileName(fileName ?? basename(filePath));
  let fileStat;
  try {
    fileStat = await stat(filePath);
  } catch {
    throw new PlatformApiError(400, "invalid_request", "发布文件不存在");
  }

  if (!fileStat.isFile()) {
    throw new PlatformApiError(400, "invalid_request", "发布文件不存在");
  }

  const fileBuffer = await readFile(filePath);
  const sha256 = createHash("sha256").update(fileBuffer).digest("hex");
  if (expectedSha256?.trim() && expectedSha256.trim().toLowerCase() !== sha256) {
    throw new PlatformApiError(400, "invalid_request", "sha256 与文件不一致");
  }

  return {
    fileName: safeFileName,
    filePath,
    fileSize: fileStat.size,
    sha256,
  };
}

export async function resolveDownloadFilePath(
  releaseStoragePath: string,
  storedFilePath: string,
): Promise<string> {
  const filePath = resolve(storedFilePath);
  if (!isPathInside(resolve(releaseStoragePath), filePath)) {
    throw new PlatformApiError(404, "not_found", "版本不存在");
  }

  try {
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) {
      throw new Error("not a file");
    }
  } catch {
    throw new PlatformApiError(404, "not_found", "版本文件不存在");
  }

  return filePath;
}

export function validateReleaseFileName(input: string): string {
  const fileName = input.trim();
  if (
    !fileName ||
    fileName === "." ||
    fileName === ".." ||
    fileName.includes("..") ||
    fileName.includes("/") ||
    fileName.includes("\\")
  ) {
    throw new PlatformApiError(400, "invalid_request", "文件名不正确");
  }

  return fileName;
}

function resolveReleaseStorageReference(
  releaseStoragePath: string,
  input: string,
): string {
  const reference = input.trim();
  const parts = reference.split(/[\\/]/);
  if (
    !reference ||
    isAbsolute(reference) ||
    reference.includes("..") ||
    parts.some((part) => !part.trim() || part === "." || part === "..")
  ) {
    throw new PlatformApiError(400, "invalid_request", "文件路径不正确");
  }

  const storagePath = resolve(releaseStoragePath);
  const filePath = resolve(storagePath, reference);
  if (!isPathInside(storagePath, filePath)) {
    throw new PlatformApiError(400, "invalid_request", "文件路径不正确");
  }

  return filePath;
}

function isPathInside(parentPath: string, candidatePath: string): boolean {
  const childPath = relative(parentPath, candidatePath);
  return Boolean(childPath) && !childPath.startsWith("..") && !isAbsolute(childPath);
}
