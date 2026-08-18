import { createServer, type Server } from "node:http";
import type { WebSocketServer } from "ws";
import { initializeRelayDatabase, openRelayDatabase } from "./database.js";
import { createRelayRequestHandler } from "./pairingApi.js";
import { ProfileEventHub } from "./profileEvents.js";
import { FixedWindowRateLimiter } from "./requestRateLimiter.js";
import { RelayRepository } from "./repository.js";
import { WeatherApiProvider } from "./weather/weatherApiProvider.js";
import type { WeatherProvider } from "./weather/weatherProvider.js";
import { WeatherService } from "./weather/weatherService.js";
import { attachWebSocketRelay } from "./websocketRelay.js";

export interface RelayServerOptions {
  host: string;
  port: number;
  databasePath: string;
  now?: () => Date;
  weatherProvider?: WeatherProvider;
  weatherConfigured?: boolean;
}

export interface RelayServer {
  server: Server;
  port: number;
  profileEvents: ProfileEventHub;
  close(): Promise<void>;
}

export async function createRelayServer(options: RelayServerOptions): Promise<RelayServer> {
  const db = openRelayDatabase(options.databasePath);
  initializeRelayDatabase(db);
  const now = options.now ?? (() => new Date());
  const repository = new RelayRepository(db, now);
  const weatherProvider =
    options.weatherProvider ??
    new WeatherApiProvider({
      apiKey: null,
      timeoutMs: 5_000,
    });
  const profileEvents = new ProfileEventHub();
  const server = createServer(
    createRelayRequestHandler(repository, {
      weatherService: new WeatherService(weatherProvider, () => now().getTime()),
      rateLimiter: new FixedWindowRateLimiter(() => now().getTime()),
      profileEvents,
      weatherConfigured:
        options.weatherConfigured ?? options.weatherProvider !== undefined,
    }),
  );
  const webSocketServer = attachWebSocketRelay(
    server,
    repository,
    profileEvents,
    options.now,
  );

  await new Promise<void>((resolve) => {
    server.listen(options.port, options.host, resolve);
  });

  const address = server.address();
  const port = typeof address === "object" && address ? address.port : options.port;

  return {
    server,
    port,
    profileEvents,
    close: () =>
      new Promise<void>((resolve, reject) => {
        closeWebSocketServer(webSocketServer)
          .then(() => {
            server.close((error) => {
              db.close();
              if (error) {
                reject(error);
                return;
              }

              resolve();
            });
          })
          .catch((error: unknown) => {
            db.close();
            reject(error);
          });
      }),
  };
}

function closeWebSocketServer(webSocketServer: WebSocketServer): Promise<void> {
  for (const client of webSocketServer.clients) {
    client.close();
  }

  return new Promise((resolve, reject) => {
    webSocketServer.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}
