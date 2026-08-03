import { createServer, type Server } from "node:http";
import { initializeRelayDatabase, openRelayDatabase } from "./database.js";
import { createRelayRequestHandler } from "./pairingApi.js";
import { RelayRepository } from "./repository.js";

export interface RelayServerOptions {
  host: string;
  port: number;
  databasePath: string;
  now?: () => Date;
}

export interface RelayServer {
  server: Server;
  port: number;
  close(): Promise<void>;
}

export async function createRelayServer(options: RelayServerOptions): Promise<RelayServer> {
  const db = openRelayDatabase(options.databasePath);
  initializeRelayDatabase(db);
  const repository = new RelayRepository(db, options.now ?? (() => new Date()));
  const server = createServer(createRelayRequestHandler(repository));

  await new Promise<void>((resolve) => {
    server.listen(options.port, options.host, resolve);
  });

  const address = server.address();
  const port = typeof address === "object" && address ? address.port : options.port;

  return {
    server,
    port,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => {
          db.close();
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      }),
  };
}
