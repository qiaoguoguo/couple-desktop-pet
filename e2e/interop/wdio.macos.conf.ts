import { resolve } from "node:path";
import { createIsolatedAppEnv, filterChildAppEnv } from "./support/env";

const appBinaryPath =
  process.env.INTEROP_APP_BINARY ??
  resolve(
    process.cwd(),
    "src-tauri/target/universal-apple-darwin/release/bundle/macos/情侣桌宠.app/Contents/MacOS/couple-desktop-pet",
  );
const isolatedRoot =
  process.env.INTEROP_APP_DATA_ROOT ?? resolve(process.cwd(), ".tmp/interop/macos");
const childAppEnv = {
  ...filterChildAppEnv(process.env),
  ...createIsolatedAppEnv({ platform: "macos", root: isolatedRoot }),
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
    timeout: 300000,
  },
};
