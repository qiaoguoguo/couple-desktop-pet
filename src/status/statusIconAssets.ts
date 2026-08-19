export interface StatusIconAsset {
  src: string;
  alt: string;
}

export const peerDefaultAvatarAsset: StatusIconAsset = {
  src: new URL("../assets/ui/status-icons/peer-avatar.png", import.meta.url)
    .href,
  alt: "对方头像",
};

export const peerPresenceSurfaceAsset: StatusIconAsset = {
  src: new URL(
    "../assets/ui/status-icons/presence-tag-surface.png",
    import.meta.url,
  ).href,
  alt: "",
};

export const activityStatusIconAssets = {
  online: {
    src: new URL("../assets/ui/status-icons/online.svg", import.meta.url).href,
    alt: "在线",
  },
  slacking: {
    src: new URL("../assets/ui/status-icons/slacking.svg", import.meta.url)
      .href,
    alt: "摸鱼中",
  },
  dazing: {
    src: new URL("../assets/ui/status-icons/dazing.svg", import.meta.url).href,
    alt: "发呆中",
  },
  overtime: {
    src: new URL("../assets/ui/status-icons/overtime.svg", import.meta.url)
      .href,
    alt: "加班中",
  },
} as const satisfies Record<string, StatusIconAsset>;

export const peerStatusIconAssets = {
  connecting: {
    src: new URL("../assets/ui/status-icons/connecting.svg", import.meta.url)
      .href,
    alt: "正在寻找TA",
  },
  offline: {
    src: new URL("../assets/ui/status-icons/offline.svg", import.meta.url)
      .href,
    alt: "离线",
  },
} as const satisfies Record<string, StatusIconAsset>;
