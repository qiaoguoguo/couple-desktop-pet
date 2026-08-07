import { resolve } from "node:path";
const appBinaryPath =
  process.env.MACOS_TAURI_APP_BINARY ??
  resolve(
    process.cwd(),
    "src-tauri/target/universal-apple-darwin/release/bundle/macos/情侣桌宠.app/Contents/MacOS/couple-desktop-pet",
  );

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
  specs: ["./specs/*.e2e.ts"],
  maxInstances: 1,
  logLevel: "info",
  framework: "mocha",
  reporters: ["spec"],
  services: [["tauri", { appBinaryPath, driverProvider: "embedded" }]],
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
    timeout: 60000,
  },
};
