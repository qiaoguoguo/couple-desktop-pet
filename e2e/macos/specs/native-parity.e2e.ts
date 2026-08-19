import { $, browser, expect } from "@wdio/globals";
import { openPetContextMenu } from "../../support/contextMenu";
import { openInteractionMenu } from "../../support/interactionMenu";
import {
  initializeNativeParityEvidenceSession,
  recordNativeParityEvent,
  saveNativeParityScreenshot,
  writeNativeParityLog,
} from "../../support/nativeEvidence";
import {
  clearE2eRealtimeOverride,
  setE2eRealtimeOverride,
} from "../../support/realtimeOverride";
import { invokeTauri } from "../../support/tauri";
import { chooseSafeDistinctWindowPosition } from "../../support/windowPosition";

type EdgeSide = "left" | "right" | "top" | "bottom";

interface WindowState {
  visible: boolean;
  focused: boolean;
  decorated: boolean;
  resizable: boolean;
  always_on_top: boolean;
  tray_exists: boolean;
  scale_factor: number;
  position: { x: number; y: number };
  size: { width: number; height: number };
  work_area: { x: number; y: number; width: number; height: number } | null;
}

interface SavedWindowPosition {
  x: number;
  y: number;
}

interface PetPackageFixture {
  source_path: string;
  package_id: string;
  name: string;
}

const surfaceSelector = 'section[aria-label="情侣桌宠 MVP"]';
const settingsSelector = 'section[aria-label="桌宠设置"]';
const appearanceSelector = 'section[aria-label="形象管理"]';
const currentPackageSelectSelector =
  '//section[@aria-label="形象管理"]//label[.//span[normalize-space(.)="当前形象"]]//select';
const builtInPackageName = "Q 版小人";
const edgeScreenshotFiles: Record<EdgeSide, string> = {
  left: "edge-left.png",
  right: "edge-right.png",
  top: "edge-top.png",
  bottom: "edge-bottom.png",
};

let originalSettings: Record<string, any> | null = null;
let originalWindowPosition: SavedWindowPosition | null = null;

describe("macOS native parity", () => {
  before(async () => {
    initializeNativeParityEvidenceSession();
    await expect($(surfaceSelector)).toBeDisplayed();
    originalSettings = await readSettings();
    const initialState = await invokeTauri<WindowState>("e2e_window_state");
    originalWindowPosition = { ...initialState.position };
  });

  afterEach(async () => {
    await resetNativeParityScenarioState();
  });

  after(async () => {
    await cleanupNativeParityState();
  });

  it("records shell and settings persistence evidence", async () => {
    await verifyWindowShell();
    await verifySettingsPersistence();
  });

  it("records tray and click-through recovery evidence", async () => {
    await verifyTrayAndClickThroughRecovery();
  });

  it("records position restart evidence", async () => {
    await verifyWindowPositionPersistence();
  });

  it("records scale and native auto-move evidence", async () => {
    await verifyScaleAndAutoMove();
  });

  it("records package lifecycle evidence", async () => {
    await verifyPackageImportSelectDelete();
  });

  it("records status card and composer evidence", async () => {
    await verifyStatusCardAndComposer();
  });

  it("records current edge parity evidence", async () => {
    await verifyCurrentEdgeBehavior();
  });
});

async function verifyWindowShell(): Promise<void> {
  const initialState = await invokeTauri<WindowState>("e2e_window_state");
  expect(initialState.visible).toBe(true);
  expect(initialState.decorated).toBe(false);
  expect(initialState.resizable).toBe(false);
  expect(initialState.always_on_top).toBe(true);
  expect(initialState.tray_exists).toBe(true);
  writeNativeParityLog("window-shell.log", {
    visible: initialState.visible,
    decorated: initialState.decorated,
    resizable: initialState.resizable,
    alwaysOnTop: initialState.always_on_top,
    trayExists: initialState.tray_exists,
    scaleFactor: initialState.scale_factor,
  });
  recordNativeParityEvent("window-shell-observed", {
    visible: initialState.visible,
    decorated: initialState.decorated,
    resizable: initialState.resizable,
    alwaysOnTop: initialState.always_on_top,
    trayExists: initialState.tray_exists,
  });
}

async function verifySettingsPersistence(): Promise<void> {
  await openSettingsFromContextMenu();
  await setCheckbox("自动移动", false);
  await setCheckbox("气泡", false);
  await setCheckbox("置顶", true);
  await waitForSettings((settings) =>
    settings.autoMoveEnabled === false &&
    settings.bubblesEnabled === false &&
    settings.alwaysOnTop === true
  );
  await saveNativeParityScreenshot("settings.png", settingsSelector);
  writeNativeParityLog("settings.log", {
    autoMovePersisted: true,
    bubblesPersisted: true,
    alwaysOnTopPersisted: true,
  });
  recordNativeParityEvent("settings-persisted", {
    autoMovePersisted: true,
    bubblesPersisted: true,
    alwaysOnTopPersisted: true,
  });

  await setCheckbox("自动移动", true);
  await setCheckbox("气泡", true);
  await closeSettings();
}

async function verifyTrayAndClickThroughRecovery(): Promise<void> {
  await invokeTauri<void>("e2e_trigger_tray_hide");
  await waitForWindowState((state) => state.visible === false);

  await invokeTauri<void>("e2e_trigger_tray_show");
  const shown = await waitForWindowState((state) => state.visible === true);
  expect(shown.tray_exists).toBe(true);
  writeNativeParityLog("tray-show.log", {
    visible: shown.visible,
    focused: shown.focused,
    trayExists: shown.tray_exists,
  });
  recordNativeParityEvent("tray-show", {
    visible: shown.visible,
    trayExists: shown.tray_exists,
  });

  await invokeTauri<void>("e2e_trigger_tray_settings");
  await expect($(settingsSelector)).toBeDisplayed();
  const settingsState = await invokeTauri<WindowState>("e2e_window_state");
  expect(settingsState.tray_exists).toBe(true);
  writeNativeParityLog("tray-settings.log", { settingsVisible: true, trayExists: true });
  recordNativeParityEvent("tray-settings", { settingsVisible: true, trayExists: true });

  await setCheckbox("点击穿透", true);
  await waitForSettings((settings) => settings.clickThrough === true);
  writeNativeParityLog("click-through-enabled.log", { clickThrough: true });

  await invokeTauri<void>("e2e_trigger_tray_show");
  await waitForSettings((settings) => settings.clickThrough === true);
  const persistedAfterShow = await readSettings();
  expect(persistedAfterShow.clickThrough).toBe(true);
  await saveNativeParityScreenshot("click-through-recovered.png");
  writeNativeParityLog("click-through-recovered.log", {
    clickThrough: true,
    preferencePreserved: true,
    reason: "show",
  });
  recordNativeParityEvent("click-through-recovered", {
    clickThrough: true,
    preferencePreserved: true,
  });

  await invokeTauri<void>("e2e_trigger_tray_settings");
  await expect($(settingsSelector)).toBeDisplayed();
  const clickThroughToggle = await $(
    '//label[.//span[normalize-space(.)="点击穿透"]]//input[@type="checkbox"]',
  );
  await expect(clickThroughToggle).toBeSelected();
  await setCheckbox("点击穿透", false);
  await waitForSettings((settings) => settings.clickThrough === false);
  await closeSettings();

  await invokeTauri<void>("e2e_close_main_window");
  const hidden = await waitForWindowState((state) => state.visible === false);
  writeNativeParityLog("close-to-hide.log", { visible: hidden.visible });
  recordNativeParityEvent("close-to-hide", { visible: hidden.visible });

  await invokeTauri<void>("e2e_trigger_tray_show");
  await waitForWindowState((state) => state.visible === true);
}

async function verifyWindowPositionPersistence(): Promise<void> {
  const before = await invokeTauri<WindowState>("e2e_window_state");
  const target = chooseSafeDistinctWindowPosition(before);
  writeNativeParityLog("drag-position-before.log", {
    x: before.position.x,
    y: before.position.y,
  });

  await invokeTauri<WindowState>("e2e_move_window", { x: target.x, y: target.y });
  const saved = await waitForSavedWindowPosition(target.x, target.y);
  writeNativeParityLog("drag-position-after.log", { x: saved.x, y: saved.y });
  recordNativeParityEvent("position-persisted", { persisted: true });

  await browser.reloadSession();
  await expect($(surfaceSelector)).toBeDisplayed();
  const restored = await waitForWindowState(
    (state) => state.position.x === saved.x && state.position.y === saved.y,
  );
  expect(restored.position.x).toBe(saved.x);
  expect(restored.position.y).toBe(saved.y);
  writeNativeParityLog("restart-position.log", {
    restored: true,
    restoredX: restored.position.x,
    restoredY: restored.position.y,
  });
  recordNativeParityEvent("position-restored-after-restart", { restored: true });
}

async function verifyScaleAndAutoMove(): Promise<void> {
  await openSettingsFromContextMenu();
  await setRangeValue("#pet-scale", "1.2");
  await setCheckbox("自动移动", true);
  await waitForSettings((settings) => settings.scale === 1.2 && settings.autoMoveEnabled === true);
  await setCheckbox("自动移动", false);
  await waitForSettings((settings) => settings.scale === 1.2 && settings.autoMoveEnabled === false);
  await closeSettings();

  const before = await invokeTauri<WindowState>("e2e_window_state");
  await invokeTauri<WindowState>("e2e_trigger_auto_move", {
    movementRange: "free",
  });
  const after = await waitForWindowState(
    (state) => state.position.x !== before.position.x || state.position.y !== before.position.y,
  );
  expect(after.position.x !== before.position.x || after.position.y !== before.position.y).toBe(true);
  await saveNativeParityScreenshot("scale-auto-move.png");
  writeNativeParityLog("scale-auto-move.log", {
    scale: 1.2,
    moved: true,
    beforeX: before.position.x,
    beforeY: before.position.y,
    afterX: after.position.x,
    afterY: after.position.y,
    autoMoveSchedulerEnabledDuringCommand: false,
  });
  recordNativeParityEvent("scale-auto-move", {
    scale: 1.2,
    moved: true,
    trigger: "e2e-native-auto-move-command",
    schedulerEvidence: "frontend-regression",
    autoMoveSchedulerEnabledDuringCommand: false,
  });

  await openSettingsFromContextMenu();
  await setRangeValue("#pet-scale", "1.0");
  await closeSettings();
}

async function verifyPackageImportSelectDelete(): Promise<void> {
  const fixture = await invokeTauri<PetPackageFixture>("e2e_create_pet_package_fixture");
  try {
    await invokeTauri("import_pet_package", { sourcePath: fixture.source_path });
    await browser.refresh();
    await expect($(surfaceSelector)).toBeDisplayed();

    await openSettingsFromContextMenu();
    await expect($(appearanceSelector)).toBeDisplayed();
    const packageSelect = await waitForCurrentPackageSelectOption(fixture.name);
    await setSelectValue(packageSelect, fixture.package_id);
    await waitForSettings((settings) =>
      settings.appearance?.selectedPetPackageId === fixture.package_id
    );
    await saveNativeParityScreenshot("package-import.png", appearanceSelector);

    const builtInSelect = await waitForCurrentPackageSelectOption(builtInPackageName);
    await setSelectValue(builtInSelect, "builtin:q-girl");
    await waitForSettings((settings) =>
      settings.appearance?.selectedPetPackageId === "builtin:q-girl"
    );
    const deleteButton = await $(`//button[normalize-space(.)="删除${fixture.name}"]`);
    await expect(deleteButton).toBeDisplayed();
    await deleteButton.click();
    await browser.waitUntil(async () => {
      const packages = await invokeTauri<Array<{ id: string }>>("list_pet_packages");
      return !packages.some((pkg) => pkg.id === fixture.package_id);
    });
    writeNativeParityLog("package-import.log", { imported: true, selected: true, deleted: true });
    recordNativeParityEvent("package-import-select-delete", {
      imported: true,
      selected: true,
      deleted: true,
    });
  } finally {
    await invokeTauri<void>("e2e_remove_pet_package_fixture").catch(() => undefined);
    await invokeTauri<void>("delete_pet_package", { packageId: fixture.package_id }).catch(
      () => undefined,
    );
    await closeSettings().catch(() => undefined);
  }
}

async function waitForCurrentPackageSelectOption(optionText: string) {
  const packageSelect = await $(currentPackageSelectSelector);
  await browser.waitUntil(
    async () => {
      try {
        if (!(await packageSelect.isDisplayed())) {
          return false;
        }
        const options = await packageSelect.$$("option");
        for (const option of options) {
          if ((await option.getText()) === optionText) {
            return true;
          }
        }
        return false;
      } catch {
        return false;
      }
    },
    {
      timeout: 10000,
      timeoutMsg: `current package option did not appear: ${optionText}`,
    },
  );
  return packageSelect;
}

async function setSelectValue(select: ReturnType<typeof $>, value: string): Promise<void> {
  await browser.execute(
    (target, nextValue) => {
      if (!(target instanceof HTMLSelectElement)) {
        throw new Error("Current package select was not an HTMLSelectElement");
      }
      const valueSetter = Object.getOwnPropertyDescriptor(
        HTMLSelectElement.prototype,
        "value",
      )?.set;
      if (!valueSetter) {
        throw new Error("HTMLSelectElement value setter is unavailable");
      }
      valueSetter.call(target, nextValue);
      target.dispatchEvent(new Event("input", { bubbles: true }));
      target.dispatchEvent(new Event("change", { bubbles: true }));
    },
    select,
    value,
  );
}

async function verifyStatusCardAndComposer(): Promise<void> {
  const settings = await readSettings();
  await invokeTauri("write_settings", {
    settings: {
      ...settings,
      appearance: {
        ...settings.appearance,
        selectedPetPackageId: "builtin:q-girl",
      },
      sync: {
        ...settings.sync,
        enabled: true,
        pairId: "e2e-native-parity-pair",
        peerDeviceId: "e2e-native-parity-peer",
      },
    },
  });
  await browser.refresh();
  await expect($(surfaceSelector)).toBeDisplayed();
  await setE2eRealtimeOverride({
    status: "connected",
    peerPresence: "online",
    peerActivityStatus: "slacking",
    peerPresenceChangedAt: new Date().toISOString(),
    peerLastSeenAt: null,
    lastError: null,
  });
  const statusCard = await $('[aria-label="对方状态"]');
  await expect(statusCard).toBeDisplayed();
  await saveNativeParityScreenshot("status-card.png", '[aria-label="对方状态"]');
  writeNativeParityLog("status-card.log", { visible: true });
  recordNativeParityEvent("status-card-opened", {
    visible: true,
    source: "paired-state-ui-injection",
    pairingEvidence: "interop-workflow",
  });

  const interactionMenu = await openInteractionMenu();
  await interactionMenu.$('//button[@role="menuitem" and normalize-space(.)="发消息"]').click();
  const composer = await $('section[aria-label="发送消息"]');
  await expect(composer).toBeDisplayed();
  await saveNativeParityScreenshot("message-composer.png", 'section[aria-label="发送消息"]');
  writeNativeParityLog("message-composer.log", { visible: true });
  recordNativeParityEvent("message-composer-opened", {
    visible: true,
    source: "paired-state-ui-injection",
    pairingEvidence: "interop-workflow",
    realtimeStateSource: "e2e-runtime-override",
  });
  await browser.keys("Escape");
  await expect(composer).not.toBeDisplayed();

  await clearE2eRealtimeOverride();
  await invokeTauri("write_settings", {
    settings: {
      ...settings,
      appearance: {
        ...settings.appearance,
        selectedPetPackageId: "builtin:q-girl",
      },
      sync: {
        ...settings.sync,
        pairId: null,
        peerDeviceId: null,
      },
    },
  });
  await browser.refresh();
  await expect($(surfaceSelector)).toBeDisplayed();
}

async function verifyCurrentEdgeBehavior(): Promise<void> {
  for (const side of ["left", "right", "top", "bottom"] as const) {
    await invokeTauri<WindowState>("e2e_move_near_edge", { side });
    await dispatchDragReleaseOnPetStage();
    if (side === "top") {
      const edgeStage = await $(`.edge-pet-stage[data-edge-phase="idle"]`);
      await expect(edgeStage).toBeDisplayed();
      await saveNativeParityScreenshot(
        edgeScreenshotFiles[side],
        '.edge-pet-stage[data-edge-phase="idle"]',
      );
    } else {
      const companionSelector = `.edge-companion-stage[data-edge-side="${side}"]`;
      const companionStage = await $(companionSelector);
      await expect(companionStage).toBeDisplayed();
      const companionFrame = await companionStage.$(
        '.edge-companion-frame[data-frame-kind="idle"]',
      );
      await expect(companionFrame).toBeDisplayed();
      await saveNativeParityScreenshot(edgeScreenshotFiles[side], companionSelector);
    }
    writeNativeParityLog(`edge-${side}.log`, { side, idle: true });
    recordNativeParityEvent(`edge-${side}`, { idle: true });
    await invokeTauri<WindowState>("e2e_restore_edge", { side });
    await browser.refresh();
    await expect($(surfaceSelector)).toBeDisplayed();
  }
}

async function openSettingsFromContextMenu(): Promise<void> {
  const existing = await $(settingsSelector);
  if (await existing.isDisplayed().catch(() => false)) {
    return;
  }

  const menu = await openPetContextMenu();
  await menu.$('//button[@role="menuitem" and normalize-space(.)="设置"]').click();
  await expect($(settingsSelector)).toBeDisplayed();
}

async function closeSettings(): Promise<void> {
  const panel = await $(settingsSelector);
  if (!(await panel.isDisplayed().catch(() => false))) {
    return;
  }

  await $('button[aria-label="关闭设置"]').click();
  await expect(panel).not.toBeDisplayed();
}

async function setCheckbox(label: string, checked: boolean): Promise<void> {
  const input = await $(`//label[.//span[normalize-space(.)="${label}"]]//input[@type="checkbox"]`);
  await expect(input).toBeDisplayed();
  if ((await input.isSelected()) !== checked) {
    await input.click();
  }
}

async function setRangeValue(selector: string, value: string): Promise<void> {
  await browser.execute(
    (inputSelector, nextValue) => {
      const input = document.querySelector(inputSelector);
      if (!(input instanceof HTMLInputElement)) {
        throw new Error(`Range input not found: ${inputSelector}`);
      }
      const valueSetter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set;
      if (!valueSetter) {
        throw new Error("HTMLInputElement value setter is unavailable");
      }
      valueSetter.call(input, nextValue);
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    },
    selector,
    value,
  );
}

async function resetNativeParityScenarioState(): Promise<void> {
  await invokeTauri<void>("e2e_trigger_tray_show").catch(() => undefined);
  await clearE2eRealtimeOverride();
  await browser.keys("Escape").catch(() => undefined);
  await closeSettings().catch(() => undefined);
  for (const side of ["left", "right", "top", "bottom"] as const) {
    await invokeTauri<WindowState>("e2e_restore_edge", { side }).catch(() => undefined);
  }
  await invokeTauri<void>("delete_pet_package", { packageId: "imported:e2e-native-parity" }).catch(
    () => undefined,
  );
  await invokeTauri<void>("e2e_remove_pet_package_fixture").catch(() => undefined);
  if (originalWindowPosition) {
    await restoreOriginalWindowPosition(originalWindowPosition).catch(() => undefined);
  }
  if (originalSettings) {
    await invokeTauri("write_settings", { settings: originalSettings }).catch(() => undefined);
    await browser.refresh().catch(() => undefined);
    await expect($(surfaceSelector)).toBeDisplayed().catch(() => undefined);
  }
}

async function cleanupNativeParityState(): Promise<void> {
  await resetNativeParityScenarioState();
}

async function restoreOriginalWindowPosition(
  originalWindowPosition: SavedWindowPosition,
): Promise<void> {
  await invokeTauri<WindowState>("e2e_move_window", {
    x: originalWindowPosition.x,
    y: originalWindowPosition.y,
  });
  const restored = await waitForSavedWindowPosition(
    originalWindowPosition.x,
    originalWindowPosition.y,
  );
  writeNativeParityLog("cleanup-position-restored.log", {
    x: restored.x,
    y: restored.y,
  });
}

async function waitForSettings(predicate: (settings: Record<string, any>) => boolean): Promise<void> {
  await browser.waitUntil(async () => predicate(await readSettings()), {
    timeout: 10000,
    timeoutMsg: "settings did not reach the expected persisted state",
  });
}

async function readSettings(): Promise<Record<string, any>> {
  return invokeTauri<Record<string, any>>("read_settings");
}

async function waitForWindowState(
  predicate: (state: WindowState) => boolean,
): Promise<WindowState> {
  let latest = await invokeTauri<WindowState>("e2e_window_state");
  await browser.waitUntil(
    async () => {
      latest = await invokeTauri<WindowState>("e2e_window_state");
      return predicate(latest);
    },
    {
      timeout: 10000,
      timeoutMsg: "native window state did not reach the expected value",
    },
  );
  return latest;
}

async function waitForSavedWindowPosition(
  x: number,
  y: number,
): Promise<SavedWindowPosition> {
  let latest: SavedWindowPosition | null = null;
  await browser.waitUntil(
    async () => {
      latest = await invokeTauri<SavedWindowPosition | null>("e2e_read_window_position");
      return latest?.x === x && latest?.y === y;
    },
    {
      timeout: 10000,
      timeoutMsg: "window position file did not persist the moved coordinates",
    },
  );
  if (!latest) {
    throw new Error("window position was not persisted");
  }
  return latest;
}

async function dispatchDragReleaseOnPetStage(): Promise<void> {
  const stage = await $(".pet-frame-stage");
  await expect(stage).toBeDisplayed();
  await browser.execute((target) => {
    if (!(target instanceof HTMLElement)) {
      throw new Error("pet frame stage not found for edge drag release");
    }

    const rect = target.getBoundingClientRect();
    const startX = Math.round(rect.left + rect.width / 2);
    const startY = Math.round(rect.top + rect.height / 2);
    const eventInit = {
      bubbles: true,
      cancelable: true,
      composed: true,
      pointerId: 1,
      pointerType: "mouse",
      isPrimary: true,
      clientX: startX,
      clientY: startY,
      screenX: startX,
      screenY: startY,
      view: window,
    };
    const makePointerEvent = (type: string, x: number, y: number) =>
      typeof PointerEvent === "function"
        ? new PointerEvent(type, { ...eventInit, clientX: x, clientY: y, screenX: x, screenY: y })
        : new MouseEvent(type, { ...eventInit, clientX: x, clientY: y, screenX: x, screenY: y });

    target.dispatchEvent(makePointerEvent("pointerdown", startX, startY));
    target.dispatchEvent(makePointerEvent("pointermove", startX + 32, startY));
    target.dispatchEvent(makePointerEvent("pointerup", startX + 32, startY));
  }, stage);
}
