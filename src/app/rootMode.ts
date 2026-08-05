const MESSAGE_COMPOSER_MODE = "message-composer";

interface RootModeInput {
  windowLabel: string;
  locationSearch: string;
  locationHash: string;
}

export function shouldRenderMessageComposer({
  windowLabel,
  locationSearch,
  locationHash,
}: RootModeInput): boolean {
  if (windowLabel === MESSAGE_COMPOSER_MODE) {
    return true;
  }

  const params = new URLSearchParams(locationSearch);
  if (params.get("window") === MESSAGE_COMPOSER_MODE) {
    return true;
  }

  return locationHash.replace(/^#\/?/, "") === MESSAGE_COMPOSER_MODE;
}
