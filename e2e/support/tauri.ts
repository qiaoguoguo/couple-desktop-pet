import { browser } from "@wdio/globals";

type TauriInternalWindow = Window & {
  __TAURI_INTERNALS__?: {
    invoke<T>(command: string, args?: Record<string, unknown>): Promise<T>;
  };
};

export async function invokeTauri<T>(
  command: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  return browser.execute(
    async (commandName, commandArgs) => {
      const tauri = (window as TauriInternalWindow).__TAURI_INTERNALS__;
      if (!tauri?.invoke) {
        throw new Error("Tauri internal invoke API is unavailable in this E2E build");
      }

      return tauri.invoke(commandName, commandArgs);
    },
    command,
    args,
  ) as Promise<T>;
}
