const MESSAGE_COMPOSER_MODE = "message-composer";

interface RootModeInput {
  locationHash: string;
  readWindowLabel(): string;
}

export function shouldRenderMessageComposer({
  locationHash,
  readWindowLabel,
}: RootModeInput): boolean {
  if (locationHash.replace(/^#\/?/, "") === MESSAGE_COMPOSER_MODE) {
    return true;
  }

  try {
    return readWindowLabel() === MESSAGE_COMPOSER_MODE;
  } catch {
    return false;
  }
}
