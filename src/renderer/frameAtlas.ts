import {
  getActionDefinition as getBuiltInActionDefinitionFromManifest,
  type PetActionName,
} from "../assets/builtInPetManifest";

const builtInPetAssetUrls = import.meta.glob<string>(
  [
    "../assets/pets/q-girl/**/*.png",
    "../assets/pets/q-boy/**/*.png",
  ],
  {
    eager: true,
    import: "default",
    query: "?url",
  },
);

export function getBuiltInActionDefinition(action: PetActionName) {
  return getBuiltInActionDefinitionFromManifest(action);
}

export function getBuiltInPetAssetUrl(assetPath: string): string | null {
  return builtInPetAssetUrls[`../assets/${assetPath}`] ?? null;
}

export function getBuiltInFrameAssetUrl(framePath: string): string | null {
  return builtInPetAssetUrls[`../assets/${framePath}`] ?? null;
}

export function getActionDefinition(action: PetActionName) {
  return getBuiltInActionDefinitionFromManifest(action);
}

export function getFrameAssetUrl(framePath: string): string | null {
  return getBuiltInFrameAssetUrl(framePath);
}
