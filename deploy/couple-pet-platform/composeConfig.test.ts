import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

describe("couple pet platform compose config", () => {
  it("isolates platform services and exposes only web/api ports", () => {
    const source = readFileSync(
      "deploy/couple-pet-platform/compose.yaml",
      "utf8",
    );
    const compose = parse(source) as {
      services: Record<string, { image?: string; ports?: string[]; volumes?: string[] }>;
    };

    expect(Object.keys(compose.services).sort()).toEqual([
      "platform-api",
      "platform-web",
      "postgres",
    ]);
    expect(compose.services["platform-web"].ports).toEqual(["19080:80"]);
    expect(compose.services["platform-api"].ports).toEqual(["19081:3000"]);
    expect(compose.services.postgres.ports ?? []).toEqual([]);
    expect(compose.services.postgres.image).toBe("postgres:17-alpine");
    expect(source).not.toContain("/opt/qherp");
  });

  it("does not expose release storage through the web container", () => {
    const composeSource = readFileSync(
      "deploy/couple-pet-platform/compose.yaml",
      "utf8",
    );
    const nginxSource = readFileSync("platform-web/nginx.conf", "utf8");
    const compose = parse(composeSource) as {
      services: Record<string, { volumes?: string[] }>;
    };

    expect(compose.services["platform-web"].volumes ?? []).toEqual([]);
    expect(nginxSource).not.toContain("location /releases/");
    expect(nginxSource).not.toContain("alias /usr/share/nginx/html/releases/");
  });
});
