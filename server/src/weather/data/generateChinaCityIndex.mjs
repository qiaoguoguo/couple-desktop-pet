import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { writeFile } from "node:fs/promises";
import { createInterface } from "node:readline";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE_URL = "https://download.geonames.org/export/dump/CN.zip";
const RETRIEVED_AT = "2026-08-19";
const ZIP_SHA256 =
  "B966A51547B3EC5A282B5F66FB756DAC94B7003497C89ED45A24A1A1005E4479";
const TEXT_SHA256 =
  "7EA2DB57F59CEDD23FEA553A2A80EDD4E9EC6E21557B0D063C2AB427701996C3";
const EXPECTED_ADM2_COUNT = 360;
const MUNICIPALITY_NAMES = new Set(["北京", "上海", "天津", "重庆"]);
const PROVINCE_DISPLAY_NAMES = new Set([
  "北京",
  "天津",
  "河北",
  "山西",
  "内蒙古",
  "辽宁",
  "吉林",
  "黑龙江",
  "上海",
  "江苏",
  "浙江",
  "安徽",
  "福建",
  "江西",
  "山东",
  "河南",
  "湖北",
  "湖南",
  "广东",
  "广西",
  "海南",
  "重庆",
  "四川",
  "贵州",
  "云南",
  "西藏",
  "陕西",
  "甘肃",
  "青海",
  "宁夏",
  "新疆",
]);
const ADMINISTRATIVE_SUFFIXES = [
  "维吾尔自治区",
  "壮族自治区",
  "回族自治区",
  "特别行政区",
  "自治州",
  "自治区",
  "地区",
  "省",
  "市",
  "盟",
];
const SEAT_PRIORITY = new Map([
  ["PPLC", 0],
  ["PPLA", 1],
  ["PPLA2", 2],
]);

const inputPath = process.argv[2];
if (!inputPath) {
  throw new Error("Usage: node generateChinaCityIndex.mjs <CN.txt> [output.ts]");
}

const outputPath = process.argv[3]
  ? resolve(process.argv[3])
  : fileURLToPath(new URL("./chinaCityIndex.ts", import.meta.url));
const resolvedInputPath = resolve(inputPath);
await assertInputHash(resolvedInputPath);
const records = await readRelevantRecords(resolvedInputPath);
const entries = buildIndex(records);
await writeFile(outputPath, renderIndex(entries), "utf8");
console.log(`Wrote ${entries.length} records to ${outputPath}`);

async function assertInputHash(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) {
    hash.update(chunk);
  }
  const actual = hash.digest("hex").toUpperCase();
  if (actual !== TEXT_SHA256) {
    throw new Error(`CN.txt SHA256 mismatch: expected ${TEXT_SHA256}, got ${actual}`);
  }
}

async function readRelevantRecords(path) {
  const records = [];
  const lines = createInterface({
    input: createReadStream(path, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });

  for await (const line of lines) {
    const columns = line.split("\t");
    if (columns.length < 19) {
      continue;
    }

    const featureClass = columns[6];
    const featureCode = columns[7];
    const isAdministrative =
      featureClass === "A" && (featureCode === "ADM1" || featureCode === "ADM2");
    const isSeat = featureClass === "P" && SEAT_PRIORITY.has(featureCode);
    if (!isAdministrative && !isSeat) {
      continue;
    }

    records.push({
      geonameId: parseInteger(columns[0], "geonameid"),
      name: columns[1],
      aliases: columns[3].split(",").map((alias) => alias.trim()).filter(Boolean),
      latitude: parseNumber(columns[4], "latitude"),
      longitude: parseNumber(columns[5], "longitude"),
      featureClass,
      featureCode,
      admin1Code: columns[10],
      admin2Code: columns[11],
      population: parseInteger(columns[14] || "0", "population"),
    });
  }

  return records;
}

function buildIndex(records) {
  const administrativeLevel1 = records.filter(
    (record) => record.featureClass === "A" && record.featureCode === "ADM1",
  );
  const administrativeLevel2 = records.filter(
    (record) => record.featureClass === "A" && record.featureCode === "ADM2",
  );
  if (administrativeLevel2.length !== EXPECTED_ADM2_COUNT) {
    throw new Error(
      `Expected ${EXPECTED_ADM2_COUNT} ADM2 rows, got ${administrativeLevel2.length}`,
    );
  }

  const provincesByCode = new Map(
    administrativeLevel1.map((record) => [record.admin1Code, record]),
  );
  const municipalities = administrativeLevel1.filter((record) =>
    chineseAliases(record).some((alias) => MUNICIPALITY_NAMES.has(stripSuffix(alias))),
  );
  if (municipalities.length !== MUNICIPALITY_NAMES.size) {
    throw new Error(`Expected four municipalities, got ${municipalities.length}`);
  }

  const seats = records.filter((record) => record.featureClass === "P");
  const boundaries = [
    ...administrativeLevel2.map((record) => ({ record, municipality: false })),
    ...municipalities.map((record) => ({ record, municipality: true })),
  ];
  const entries = boundaries.map(({ record, municipality }) => {
    const province = municipality ? record : provincesByCode.get(record.admin1Code);
    if (!province) {
      throw new Error(`Missing ADM1 ${record.admin1Code} for ${record.geonameId}`);
    }

    const aliasesZh = chineseAliases(record);
    const provinceAliasesZh = chineseAliases(province);
    if (aliasesZh.length === 0 || provinceAliasesZh.length === 0) {
      throw new Error(`Missing Chinese aliases for ${record.geonameId}`);
    }

    const seat = selectSeat(record, municipality, seats);
    return {
      providerLocationId: record.geonameId,
      nameZh: selectDisplayName(aliasesZh),
      aliasesZh,
      nameEn: record.name,
      provinceZh: selectProvinceDisplayName(provinceAliasesZh),
      provinceAliasesZh,
      provinceEn: province.name,
      latitude: seat?.latitude ?? record.latitude,
      longitude: seat?.longitude ?? record.longitude,
    };
  });

  entries.sort((left, right) => left.providerLocationId - right.providerLocationId);
  const uniqueIds = new Set(entries.map((entry) => entry.providerLocationId));
  if (uniqueIds.size !== entries.length) {
    throw new Error("Generated duplicate GeoNames IDs");
  }
  return entries;
}

function selectSeat(boundary, municipality, seats) {
  const allowedCodes = municipality ? new Set(["PPLC", "PPLA"]) : new Set(["PPLA", "PPLA2"]);
  return seats
    .filter(
      (seat) =>
        allowedCodes.has(seat.featureCode) &&
        seat.admin1Code === boundary.admin1Code &&
        (municipality || seat.admin2Code === boundary.admin2Code),
    )
    .sort(
      (left, right) =>
        SEAT_PRIORITY.get(left.featureCode) - SEAT_PRIORITY.get(right.featureCode) ||
        right.population - left.population ||
        left.geonameId - right.geonameId,
    )[0];
}

function chineseAliases(record) {
  return stableUnique(record.aliases.filter((alias) => /^[\p{Script=Han}·]+$/u.test(alias)));
}

function selectDisplayName(aliases) {
  const candidates = aliases
    .map((alias, index) => ({ value: stripSuffix(alias), index }))
    .filter(({ value }) => Array.from(value).length >= 2)
    .sort(
      (left, right) =>
        Array.from(left.value).length - Array.from(right.value).length ||
        left.index - right.index,
    );
  if (!candidates[0]) {
    throw new Error(`No usable Chinese display name in ${aliases.join(",")}`);
  }
  return candidates[0].value;
}

function selectProvinceDisplayName(aliases) {
  const match = aliases
    .map(stripSuffix)
    .find((alias) => PROVINCE_DISPLAY_NAMES.has(alias));
  if (!match) {
    throw new Error(`No standard province name in ${aliases.join(",")}`);
  }
  return match;
}

function stripSuffix(value) {
  for (const suffix of ADMINISTRATIVE_SUFFIXES) {
    if (value.endsWith(suffix)) {
      return value.slice(0, -suffix.length);
    }
  }
  return value;
}

function stableUnique(values) {
  return [...new Set(values)];
}

function parseInteger(value, field) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed)) {
    throw new Error(`Invalid ${field}: ${value}`);
  }
  return parsed;
}

function parseNumber(value, field) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid ${field}: ${value}`);
  }
  return parsed;
}

function renderIndex(entries) {
  const rows = entries.map((entry) => `  ${JSON.stringify(entry)},`).join("\n");
  return `export interface ChinaCityIndexEntry {
  providerLocationId: number;
  nameZh: string;
  aliasesZh: readonly string[];
  nameEn: string;
  provinceZh: string;
  provinceAliasesZh: readonly string[];
  provinceEn: string;
  latitude: number;
  longitude: number;
}

export const CHINA_CITY_INDEX_SOURCE = {
  sourceUrl: "${SOURCE_URL}",
  retrievedAt: "${RETRIEVED_AT}",
  zipSha256: "${ZIP_SHA256}",
  textSha256: "${TEXT_SHA256}",
  attribution: "GeoNames",
  license: "CC BY 4.0",
} as const;

// Generated by generateChinaCityIndex.mjs from the GeoNames CN country dump.
export const CHINA_CITY_INDEX = [
${rows}
] as const satisfies readonly ChinaCityIndexEntry[];
`;
}
