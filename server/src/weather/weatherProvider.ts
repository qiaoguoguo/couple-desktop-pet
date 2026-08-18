import type { CityLocationV1 } from "../../../shared/profileProtocol.js";
import type { WeatherConditionV1 } from "../../../shared/weatherProtocol.js";

export interface ProviderWeather {
  condition: WeatherConditionV1;
  conditionText: string;
  currentTemperatureC: number;
  maxTemperatureC: number;
  minTemperatureC: number;
  rainChancePercent: number;
}

export interface WeatherProvider {
  searchLocations(query: string): Promise<CityLocationV1[]>;
  getCurrentDay(city: CityLocationV1): Promise<ProviderWeather>;
}

export type WeatherProviderErrorKind =
  | "not-configured"
  | "quota-exhausted"
  | "unavailable"
  | "invalid-response";

const ERROR_MESSAGES: Record<WeatherProviderErrorKind, string> = {
  "not-configured": "Weather provider is not configured",
  "quota-exhausted": "Weather provider quota is exhausted",
  unavailable: "Weather provider is unavailable",
  "invalid-response": "Weather provider returned an invalid response",
};

export class WeatherProviderError extends Error {
  readonly name = "WeatherProviderError";

  constructor(readonly kind: WeatherProviderErrorKind) {
    super(ERROR_MESSAGES[kind]);
  }
}
