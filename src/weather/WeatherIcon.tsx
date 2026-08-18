import {
  Cloud,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  Sun,
  type LucideIcon,
} from "lucide-react";
import type { WeatherConditionV1 } from "../../shared/weatherProtocol";

const ICONS: Record<WeatherConditionV1, LucideIcon> = {
  clear: Sun,
  "partly-cloudy": CloudSun,
  cloudy: Cloud,
  fog: CloudFog,
  rain: CloudRain,
  snow: CloudSnow,
  thunder: CloudLightning,
  other: Cloud,
};

export interface WeatherIconProps {
  condition: WeatherConditionV1;
  className?: string;
}

export function WeatherIcon({ condition, className }: WeatherIconProps) {
  const Icon = ICONS[condition];

  return (
    <Icon
      className={className}
      aria-hidden="true"
      focusable="false"
      strokeWidth={1.8}
    />
  );
}
