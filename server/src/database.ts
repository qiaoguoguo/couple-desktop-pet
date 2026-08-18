import Database from "better-sqlite3";

export function openRelayDatabase(filename: string): Database.Database {
  const db = new Database(filename);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  return db;
}

export function initializeRelayDatabase(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS devices (
      device_id TEXT PRIMARY KEY,
      device_secret_hash TEXT NOT NULL,
      display_name TEXT,
      created_at TEXT NOT NULL,
      last_seen_at TEXT
    );

    CREATE TABLE IF NOT EXISTS device_locations (
      device_id TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      provider_location_id INTEGER NOT NULL,
      city_name TEXT NOT NULL,
      region_name TEXT NOT NULL,
      country_name TEXT NOT NULL,
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (device_id) REFERENCES devices(device_id)
    );

    CREATE TABLE IF NOT EXISTS pair_codes (
      code TEXT PRIMARY KEY,
      creator_device_id TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      consumed_at TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (creator_device_id) REFERENCES devices(device_id)
    );

    CREATE TABLE IF NOT EXISTS pairs (
      pair_id TEXT PRIMARY KEY,
      device_a_id TEXT NOT NULL,
      device_b_id TEXT NOT NULL,
      pair_code TEXT,
      created_at TEXT NOT NULL,
      disabled_at TEXT,
      FOREIGN KEY (device_a_id) REFERENCES devices(device_id),
      FOREIGN KEY (device_b_id) REFERENCES devices(device_id)
    );
  `);
  ensurePairsPairCodeColumn(db);
}

function ensurePairsPairCodeColumn(db: Database.Database): void {
  const columns = db.prepare("PRAGMA table_info(pairs)").all() as Array<{
    name: string;
  }>;

  if (!columns.some((column) => column.name === "pair_code")) {
    db.exec("ALTER TABLE pairs ADD COLUMN pair_code TEXT");
  }
}
