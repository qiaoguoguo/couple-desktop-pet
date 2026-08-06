export type CompanionPresence = "hidden" | "online" | "offline";
export type CompanionSide = "left" | "right";

export interface CompanionSceneContentState {
  presence: CompanionPresence;
  portraitUrl: string | null;
  offlinePortraitUrl: string | null;
  sceneScale: number;
  suspended: boolean;
}

export interface CompanionSceneViewState extends CompanionSceneContentState {
  side: CompanionSide;
  compact: boolean;
  revision: number;
}
