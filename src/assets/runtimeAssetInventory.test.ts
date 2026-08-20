import { existsSync, readdirSync, type Dirent } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const moduleDirectoryReference = "./";
const assetsRoot = fileURLToPath(
  new URL(moduleDirectoryReference, import.meta.url),
);
const petsRoot = join(assetsRoot, "pets");
const qGirlRoot = join(petsRoot, "q-girl");
const uiRoot = join(assetsRoot, "ui");

function listInventoryEntries(root: string, recursive = true): string[] {
  function visit(currentPath: string): string[] {
    return readdirSync(currentPath, { withFileTypes: true }).flatMap((entry) => {
      const entryPath = join(currentPath, entry.name);
      const relativePath = relative(root, entryPath).replaceAll("\\", "/");
      const kind = inventoryEntryKind(entry);

      if (kind === "directory") {
        return recursive
          ? [`${relativePath}/`, ...visit(entryPath)]
          : [`${relativePath}/`];
      }

      return [relativePath];
    });
  }

  return visit(root).sort();
}

function inventoryEntryKind(
  entry: Pick<Dirent, "name" | "isDirectory" | "isFile" | "isSymbolicLink">,
) {
  if (entry.isSymbolicLink()) {
    throw new Error(`Unsupported runtime asset entry type: ${entry.name}`);
  }

  if (entry.isDirectory()) {
    return "directory";
  }

  if (entry.isFile()) {
    return "file";
  }

  throw new Error(`Unsupported runtime asset entry type: ${entry.name}`);
}

describe("runtime asset inventory", () => {
  it("contains only the two supported built-in pet roots", () => {
    expect(listInventoryEntries(petsRoot, false)).toEqual([
      "q-boy/",
      "q-girl/",
    ]);
  });

  it("keeps the complete edge interaction tree closed", () => {
    expect(listInventoryEntries(join(qGirlRoot, "edge-interaction"))).toEqual([
      "top/",
      "top/idle/",
      "top/idle/0001.png",
    ]);
  });

  it("keeps the complete edge companion tree closed", () => {
    expect(listInventoryEntries(join(qGirlRoot, "edge-companion"))).toEqual([
      "bottom/",
      "bottom/idle.png",
      "side/",
      "side/idle.png",
    ]);
  });

  it("keeps exactly the four current interaction buttons", () => {
    expect(listInventoryEntries(join(uiRoot, "interaction-buttons"))).toEqual([
      "new-tea-focus.png",
      "new-tea-message.png",
      "new-tea-status.png",
      "new-tea-weather.png",
    ]);
  });

  it("keeps surprise, all spark tiers, and all status icons", () => {
    expect(
      existsSync(join(uiRoot, "surprise", "heart-surprise.png")),
    ).toBe(true);
    expect(listInventoryEntries(join(uiRoot, "surprise"))).toEqual([
      "heart-surprise.png",
    ]);
    expect(listInventoryEntries(join(uiRoot, "spark"))).toEqual([
      "blaze.png",
      "everbright.png",
      "glimmer.png",
      "heartflame.png",
      "stellar.png",
      "unlit.png",
      "warm.png",
    ]);
    expect(listInventoryEntries(join(uiRoot, "status-icons"))).toEqual([
      "connecting.svg",
      "dazing.svg",
      "offline.svg",
      "online.svg",
      "overtime.svg",
      "peer-avatar.png",
      "presence-tag-surface.png",
      "slacking.svg",
    ]);
  });

  it("rejects symlinks, junctions, and other unsupported entry types", () => {
    const unsupportedEntries = [
      {
        name: "linked-directory",
        isDirectory: () => false,
        isFile: () => false,
        isSymbolicLink: () => true,
      },
      {
        name: "unknown-entry",
        isDirectory: () => false,
        isFile: () => false,
        isSymbolicLink: () => false,
      },
    ];

    for (const entry of unsupportedEntries) {
      expect(() => inventoryEntryKind(entry)).toThrow(
        `Unsupported runtime asset entry type: ${entry.name}`,
      );
    }
  });
});
