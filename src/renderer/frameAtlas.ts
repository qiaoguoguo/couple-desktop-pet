import {
  getActionDefinition as getBuiltInActionDefinition,
  type PetActionName,
} from "../assets/builtInPetManifest";

const petFrameUrls = import.meta.glob<string>("../assets/pets/star-sleeper/*.png", {
  eager: true,
  import: "default",
  query: "?url",
});

export function getActionDefinition(action: PetActionName) {
  return getBuiltInActionDefinition(action);
}

export function getFrameAssetUrl(framePath: string): string | null {
  return petFrameUrls[`../assets/${framePath}`] ?? null;
}
