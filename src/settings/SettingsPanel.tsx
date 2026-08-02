import type { ChangeEvent } from "react";
import type { MovementRange, PetSettings } from "./settingsTypes";

interface SettingsPanelProps {
  settings: PetSettings;
  onChange(settings: Partial<PetSettings>): void;
  onResetPosition(): void;
}

const movementRanges: Array<{ value: MovementRange; label: string }> = [
  { value: "bottom", label: "底部" },
  { value: "active-screen", label: "当前屏幕" },
  { value: "free", label: "自由" },
];

export function SettingsPanel({
  settings,
  onChange,
  onResetPosition,
}: SettingsPanelProps) {
  function updateBoolean(key: keyof Pick<
    PetSettings,
    | "autoMoveEnabled"
    | "bubblesEnabled"
    | "alwaysOnTop"
    | "clickThrough"
  >) {
    return (event: ChangeEvent<HTMLInputElement>) => {
      onChange({ [key]: event.currentTarget.checked });
    };
  }

  return (
    <section className="settings-panel" aria-label="桌宠设置">
      <div className="settings-row settings-row-scale">
        <label htmlFor="pet-scale">缩放</label>
        <input
          id="pet-scale"
          type="range"
          min="0.5"
          max="2"
          step="0.1"
          value={settings.scale}
          onChange={(event) => onChange({ scale: Number(event.currentTarget.value) })}
        />
        <output htmlFor="pet-scale">{settings.scale.toFixed(1)}x</output>
      </div>

      <label className="settings-check">
        <input
          type="checkbox"
          checked={settings.autoMoveEnabled}
          onChange={updateBoolean("autoMoveEnabled")}
        />
        <span>自动移动</span>
      </label>

      <div className="settings-row">
        <label htmlFor="movement-range">活动范围</label>
        <select
          id="movement-range"
          value={settings.movementRange}
          onChange={(event) =>
            onChange({ movementRange: event.currentTarget.value as MovementRange })
          }
        >
          {movementRanges.map((movementRange) => (
            <option key={movementRange.value} value={movementRange.value}>
              {movementRange.label}
            </option>
          ))}
        </select>
      </div>

      <label className="settings-check">
        <input
          type="checkbox"
          checked={settings.bubblesEnabled}
          onChange={updateBoolean("bubblesEnabled")}
        />
        <span>气泡</span>
      </label>

      <label className="settings-check">
        <input
          type="checkbox"
          checked={settings.alwaysOnTop}
          onChange={updateBoolean("alwaysOnTop")}
        />
        <span>置顶</span>
      </label>

      <label className="settings-check">
        <input
          type="checkbox"
          checked={settings.clickThrough}
          onChange={updateBoolean("clickThrough")}
        />
        <span>点击穿透</span>
      </label>

      <button className="settings-reset" type="button" onClick={onResetPosition}>
        重置位置
      </button>
    </section>
  );
}
