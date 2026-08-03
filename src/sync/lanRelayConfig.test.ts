import { describe, expect, it } from "vitest";
import rootPackageJsonRaw from "../../package.json?raw";
import serverPackageJsonRaw from "../../server/package.json?raw";
import tauriConfigRaw from "../../src-tauri/tauri.conf.json?raw";

interface PackageJson {
  scripts?: Record<string, string>;
}

interface TauriConfig {
  app: {
    security: {
      csp: string;
    };
  };
}

describe("LAN relay development configuration", () => {
  it("allows development relay HTTP and WebSocket connections on port 8787", () => {
    const tauriConfig = JSON.parse(tauriConfigRaw) as TauriConfig;
    const csp = tauriConfig.app.security.csp;

    expect(csp).toContain("connect-src");
    expect(csp).toContain("http://*:8787");
    expect(csp).toContain("ws://*:8787");
    expect(csp).toContain("http://127.0.0.1:8787");
    expect(csp).toContain("ws://127.0.0.1:8787");
  });

  it("exposes a Windows-compatible LAN relay dev command", () => {
    const rootPackageJson = JSON.parse(rootPackageJsonRaw) as PackageJson;
    const serverPackageJson = JSON.parse(serverPackageJsonRaw) as PackageJson;

    expect(rootPackageJson.scripts?.["server:dev:lan"]).toBe(
      "pnpm --dir server dev:lan",
    );
    expect(serverPackageJson.scripts?.["dev:lan"]).toBe("tsx watch src/devLan.ts");
  });
});
