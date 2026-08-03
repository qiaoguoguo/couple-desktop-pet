import type { ResolvedPetPackage } from "../assets/petPackageRegistry";

interface AppearancePanelProps {
  packages: readonly ResolvedPetPackage[];
  selectedPackageId: string;
  peerDeviceId: string | null;
  selectedPeerPackageId: string | null;
  error: string | null;
  onImportPackage(): void;
  onSelectPackage(packageId: string): void;
  onSelectPeerPackage(packageId: string): void;
  onDeletePackage(packageId: string): void;
}

export function AppearancePanel({
  packages,
  selectedPackageId,
  peerDeviceId,
  selectedPeerPackageId,
  error,
  onImportPackage,
  onSelectPackage,
  onSelectPeerPackage,
  onDeletePackage,
}: AppearancePanelProps) {
  const selectedPackage =
    packages.find((pkg) => pkg.id === selectedPackageId) ?? packages[0];
  const selectedValue = selectedPackage?.id ?? "builtin:star-sleeper";
  const deletablePackages = packages.filter(
    (pkg) =>
      pkg.source === "imported" &&
      pkg.id !== selectedValue &&
      pkg.id !== selectedPeerPackageId,
  );

  return (
    <section className="appearance-panel" aria-label="形象管理">
      <div className="appearance-panel-header">
        <div>
          <h2>形象管理</h2>
          <p>{selectedPackage?.name ?? "星星睡衣小星人"}</p>
        </div>
        {selectedPackage?.previewUrl ? (
          <img src={selectedPackage.previewUrl} alt={`${selectedPackage.name}预览`} />
        ) : null}
      </div>

      <label className="appearance-field">
        <span>当前形象</span>
        <select
          value={selectedValue}
          onChange={(event) => onSelectPackage(event.currentTarget.value)}
        >
          {packages.map((pkg) => (
            <option key={pkg.id} value={pkg.id}>
              {pkg.name}
            </option>
          ))}
        </select>
      </label>

      {peerDeviceId ? (
        <label className="appearance-field">
          <span>对方形象</span>
          <select
            value={selectedPeerPackageId ?? ""}
            onChange={(event) => onSelectPeerPackage(event.currentTarget.value)}
          >
            <option value="">未指定</option>
            {packages.map((pkg) => (
              <option key={pkg.id} value={pkg.id}>
                {pkg.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <div className="appearance-actions">
        <button type="button" onClick={onImportPackage}>
          导入形象资源包
        </button>
        <button type="button" disabled>
          删除当前导入形象
        </button>
      </div>

      {deletablePackages.length ? (
        <div className="appearance-package-list" aria-label="可删除形象">
          {deletablePackages.map((pkg) => (
            <button
              key={pkg.id}
              type="button"
              onClick={() => onDeletePackage(pkg.id)}
            >
              删除{pkg.name}
            </button>
          ))}
        </div>
      ) : null}

      {error ? <p className="sync-error">{error}</p> : null}
    </section>
  );
}
