import { readRelayConfig } from "./config.js";
import { createRelayServer } from "./server.js";
import { WeatherApiProvider } from "./weather/weatherApiProvider.js";

const config = readRelayConfig();
const relay = await createRelayServer({
  ...config,
  weatherProvider: new WeatherApiProvider({
    apiKey: config.weatherApiKey,
    timeoutMs: config.weatherRequestTimeoutMs,
  }),
  weatherConfigured: config.weatherApiKey !== null,
});

process.on("SIGINT", () => {
  void relay.close().finally(() => process.exit(0));
});

process.on("SIGTERM", () => {
  void relay.close().finally(() => process.exit(0));
});
