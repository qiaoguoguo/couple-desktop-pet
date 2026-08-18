import { resolve } from "node:path";
import { mkdirSync } from "node:fs";
import { createIsolatedAppEnv, filterChildAppEnv } from "./support/env";
import { resolveInteropMochaTimeoutMs } from "./support/rendezvous";

const appBinaryPath =
  process.env.INTEROP_APP_BINARY ??
  resolve(process.cwd(), "src-tauri/target/release/couple-desktop-pet.exe");
const isolatedRoot =
  process.env.INTEROP_APP_DATA_ROOT ?? resolve(process.cwd(), ".tmp/interop/windows");
const isolatedAppEnv = createIsolatedAppEnv({
  platform: "windows",
  root: isolatedRoot,
});
for (const directory of Object.values(isolatedAppEnv)) {
  mkdirSync(directory, { recursive: true });
}
const useHostProfile = process.env.INTEROP_USE_HOST_PROFILE === "1";
const childAppEnv = useHostProfile
  ? filterChildAppEnv(process.env)
  : {
      ...filterChildAppEnv(process.env),
      ...isolatedAppEnv,
    };

declare global {
  namespace WebdriverIO {
    interface Capabilities {
      "tauri:options"?: {
        application: string;
      };
    }
  }
}

export const config: WebdriverIO.Config = {
  runner: "local",
  suites: {
    interop: ["./specs/cross-platform.e2e.ts"],
    restart: ["./specs/restart-unpaired.e2e.ts"],
    weather: ["./specs/couple-weather.e2e.ts"],
  },
  maxInstances: 1,
  logLevel: "error",
  framework: "mocha",
  reporters: ["spec"],
  services: [["tauri", { appBinaryPath, driverProvider: "embedded", env: childAppEnv }]],
  capabilities: [
    {
      browserName: "tauri",
      "tauri:options": {
        application: appBinaryPath,
      },
    },
  ],
  waitforTimeout: 10000,
  mochaOpts: {
    timeout: resolveInteropMochaTimeoutMs(),
  },
};
