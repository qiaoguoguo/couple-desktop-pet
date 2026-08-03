import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";

export function createPlatformPool(databaseUrl: string): Pool {
  return new Pool({
    connectionString: databaseUrl,
  });
}

export async function initializePlatformDatabase(pool: Pool): Promise<void> {
  const schemaPath = join(
    dirname(fileURLToPath(import.meta.url)),
    "schema.sql",
  );
  const schema = await readFile(schemaPath, "utf8");
  await pool.query(schema);
}
