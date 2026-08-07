import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(join(repoRoot, path), "utf8")) as T;
}

function extractAtsExceptionDomains(plist: string): string[] {
  const domainsKey = "<key>NSExceptionDomains</key>";
  const start = plist.indexOf(domainsKey);
  if (start === -1) {
    return [];
  }

  const tokens = plist
    .slice(start + domainsKey.length)
    .matchAll(/<(\/?)dict>|<key>([^<]+)<\/key>/g);
  const domains: string[] = [];
  let depth = 0;
  let enteredDomainsDict = false;

  for (const token of tokens) {
    if (token[0] === "<dict>") {
      depth += 1;
      enteredDomainsDict = true;
      continue;
    }
    if (token[0] === "</dict>") {
      depth -= 1;
      if (enteredDomainsDict && depth === 0) {
        break;
      }
      continue;
    }
    if (enteredDomainsDict && depth === 1 && token[2]) {
      domains.push(token[2]);
    }
  }

  return domains;
}

function readPlistBoolean(plist: string, key: string): boolean | null {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = plist.match(
    new RegExp(`<key>${escapedKey}</key>\\s*<(true|false)\\s*/>`),
  );

  if (!match) {
    return null;
  }

  return match[1] === "true";
}

describe("macOS Tauri release config", () => {
  it("keeps platform overlay free of signing identity and plist injection keys", () => {
    const config = readJson<{
      app?: { macOSPrivateApi?: boolean };
      bundle?: {
        targets?: string[];
        icon?: string[];
        macOS?: {
          minimumSystemVersion?: string;
          signingIdentity?: string;
        };
      };
    }>("src-tauri/tauri.macos.conf.json");

    expect(config.app?.macOSPrivateApi).toBe(true);
    expect(config.bundle?.targets).toEqual(["app", "dmg"]);
    expect(config.bundle?.icon).toContain("icons/icon.icns");
    expect(config.bundle?.macOS?.minimumSystemVersion).toBe("12.0");
    expect(config.bundle?.macOS).not.toHaveProperty("signingIdentity");
    expect(config.bundle?.macOS).not.toHaveProperty("infoPlist");
  });

  it("keeps ad hoc signing only in the QA overlay", () => {
    const qaConfig = readJson<{
      bundle?: { macOS?: { signingIdentity?: string } };
    }>("src-tauri/tauri.macos.qa.conf.json");

    expect(qaConfig.bundle?.macOS?.signingIdentity).toBe("-");
  });

  it("uses src-tauri/Info.plist for Relay ATS compatibility on macOS 12", () => {
    const config = readJson<{
      bundle?: { macOS?: { minimumSystemVersion?: string } };
    }>("src-tauri/tauri.macos.conf.json");
    const plist = readFileSync(join(repoRoot, "src-tauri/Info.plist"), "utf8");

    expect(config.bundle?.macOS?.minimumSystemVersion).toBe("12.0");
    expect(readPlistBoolean(plist, "LSUIElement")).toBe(true);
    expect(plist).toContain("<key>NSAppTransportSecurity</key>");
    expect(plist).toContain("<key>NSAllowsArbitraryLoadsInWebContent</key>");
    expect(plist).toContain("<key>NSExceptionDomains</key>");
    expect(plist).toContain("<key>159.75.175.47</key>");
    expect(plist).toContain("<key>NSExceptionAllowsInsecureHTTPLoads</key>");
    expect(plist).not.toContain("<key>NSAllowsArbitraryLoads</key>");
    expect(extractAtsExceptionDomains(plist)).toEqual(["159.75.175.47"]);
  });

  it("exposes separate formal and QA build scripts", () => {
    const packageJson = readJson<{ scripts?: Record<string, string> }>(
      "package.json",
    );

    expect(packageJson.scripts?.["tauri:build:mac"]).toBe(
      "tauri build --target universal-apple-darwin --bundles app,dmg",
    );
    expect(packageJson.scripts?.["tauri:build:mac:qa"]).toBe(
      "tauri build --target universal-apple-darwin --bundles app,dmg --config src-tauri/tauri.macos.qa.conf.json",
    );
  });
});
