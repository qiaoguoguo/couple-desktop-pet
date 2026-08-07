import { describe, expect, it } from "vitest";
import { config as macosWdioConfig } from "../wdio.macos.conf";
import { config as windowsWdioConfig } from "../wdio.windows.conf";
import {
  resolveInteropMochaTimeoutMs,
  resolveInteropRendezvousTimeoutMs,
} from "./rendezvous";

describe("interop rendezvous timeouts", () => {
  it("keeps the local rendezvous default at two minutes", () => {
    expect(resolveInteropRendezvousTimeoutMs({})).toBe(120_000);
  });

  it("extends the CI rendezvous default for cold cross-runner builds", () => {
    expect(resolveInteropRendezvousTimeoutMs({ CI: "true" })).toBe(20 * 60_000);
  });

  it("accepts an explicit positive integer rendezvous timeout override", () => {
    expect(
      resolveInteropRendezvousTimeoutMs({
        CI: "true",
        INTEROP_RENDEZVOUS_TIMEOUT_MS: "45000",
      }),
    ).toBe(45_000);
  });

  it("rejects invalid rendezvous timeout overrides", () => {
    for (const value of ["0", "-1", "1.5", "abc", ""]) {
      expect(() =>
        resolveInteropRendezvousTimeoutMs({
          INTEROP_RENDEZVOUS_TIMEOUT_MS: value,
        }),
      ).toThrow(/INTEROP_RENDEZVOUS_TIMEOUT_MS must be a positive integer/);
    }
  });

  it("keeps local and CI mocha suite timeouts aligned with rendezvous waits", () => {
    expect(resolveInteropMochaTimeoutMs({})).toBe(300_000);
    expect(resolveInteropMochaTimeoutMs({ CI: "true" })).toBe(30 * 60_000);
    expect(
      resolveInteropMochaTimeoutMs({
        INTEROP_MOCHA_TIMEOUT_MS: "900000",
      }),
    ).toBe(900_000);
  });

  it("uses the same resolved mocha timeout for both platform WDIO configs", () => {
    expect(windowsWdioConfig.mochaOpts?.timeout).toBe(resolveInteropMochaTimeoutMs());
    expect(macosWdioConfig.mochaOpts?.timeout).toBe(resolveInteropMochaTimeoutMs());
    expect(windowsWdioConfig.mochaOpts?.timeout).toBe(macosWdioConfig.mochaOpts?.timeout);
  });
});
