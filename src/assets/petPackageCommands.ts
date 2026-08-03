import { convertFileSrc } from "@tauri-apps/api/core";
import { invokeCommand } from "../desktop/desktopApi";
import type { ImportedPetPackageSummary } from "./petPackageContract";

export interface PetPackageApi {
  listPetPackages(): Promise<ImportedPetPackageSummary[]>;
  importPetPackage(sourcePath: string): Promise<ImportedPetPackageSummary>;
  deletePetPackage(packageId: string): Promise<void>;
  convertFileSrc(path: string): string;
}

type InvokeFn = <T>(
  command: string,
  args?: Record<string, unknown>,
) => Promise<T>;

export function createPetPackageCommands(
  invoke: InvokeFn = invokeCommand,
): PetPackageApi {
  return {
    listPetPackages: () =>
      invoke<ImportedPetPackageSummary[]>("list_pet_packages"),
    importPetPackage: (sourcePath) =>
      invoke<ImportedPetPackageSummary>("import_pet_package", { sourcePath }),
    deletePetPackage: (packageId) =>
      invoke<void>("delete_pet_package", { packageId }),
    convertFileSrc,
  };
}
