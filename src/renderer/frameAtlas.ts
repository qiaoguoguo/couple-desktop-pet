import {
  getActionDefinition as getBuiltInActionDefinitionFromManifest,
  type PetActionName,
} from "../assets/builtInPetManifest";

const petFrameUrls = import.meta.glob<string>("../assets/pets/star-sleeper/*.png", {
  eager: true,
  import: "default",
  query: "?url",
});

export function getBuiltInActionDefinition(action: PetActionName) {
  return getBuiltInActionDefinitionFromManifest(action);
}

export function getBuiltInFrameAssetUrl(framePath: string): string | null {
  return petFrameUrls[`../assets/${framePath}`] ?? null;
}

export function getActionDefinition(action: PetActionName) {
  return getBuiltInActionDefinitionFromManifest(action);
}

export function getFrameAssetUrl(framePath: string): string | null {
  return getBuiltInFrameAssetUrl(framePath);
}
