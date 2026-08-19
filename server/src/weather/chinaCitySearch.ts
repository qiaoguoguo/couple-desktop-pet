import type { CityLocationV1 } from "../../../shared/profileProtocol.js";
import {
  CHINA_CITY_INDEX,
  type ChinaCityIndexEntry,
} from "./data/chinaCityIndex.js";

export type { ChinaCityIndexEntry } from "./data/chinaCityIndex.js";

const MAX_RESULTS = 10;
const ADMINISTRATIVE_SUFFIXES =
  /维吾尔自治区|壮族自治区|回族自治区|特别行政区|自治州|地区|自治区|省|市|盟/gu;

interface RankedCity {
  entry: ChinaCityIndexEntry;
  score: number;
}

export function searchChinaCities(
  query: string,
  index: readonly ChinaCityIndexEntry[] = CHINA_CITY_INDEX,
): CityLocationV1[] {
  const compactQuery = compact(query);
  if (!containsHan(compactQuery) || containsLatin(compactQuery)) {
    return [];
  }

  const canonicalQuery = canonicalize(compactQuery);
  if (!canonicalQuery) {
    return [];
  }

  const ranked: RankedCity[] = [];
  for (const entry of index) {
    const score = rankCity(compactQuery, canonicalQuery, entry);
    if (score !== null) {
      ranked.push({ entry, score });
    }
  }

  ranked.sort(
    (left, right) =>
      left.score - right.score ||
      left.entry.providerLocationId - right.entry.providerLocationId,
  );

  const seenIds = new Set<number>();
  const seenPlaces = new Set<string>();
  const results: CityLocationV1[] = [];
  for (const { entry } of ranked) {
    const placeKey = `${canonicalize(entry.provinceZh)}\0${canonicalize(entry.nameZh)}`;
    if (seenIds.has(entry.providerLocationId) || seenPlaces.has(placeKey)) {
      continue;
    }

    seenIds.add(entry.providerLocationId);
    seenPlaces.add(placeKey);
    results.push(toLocation(entry));
    if (results.length === MAX_RESULTS) {
      break;
    }
  }

  return results;
}

function rankCity(
  compactQuery: string,
  canonicalQuery: string,
  entry: ChinaCityIndexEntry,
): number | null {
  const cityNames = uniqueNames([entry.nameZh, ...entry.aliasesZh]);
  const provinceNames = uniqueNames([
    entry.provinceZh,
    ...entry.provinceAliasesZh,
  ]);
  let bestScore: number | null = null;

  for (const city of cityNames) {
    const canonicalCity = canonicalize(city);
    bestScore = lowerScore(bestScore, scoreCity(compactQuery, canonicalQuery, city, canonicalCity));

    for (const province of provinceNames) {
      bestScore = lowerScore(
        bestScore,
        scoreProvinceAndCity(
          compactQuery,
          canonicalQuery,
          province,
          city,
          canonicalCity,
        ),
      );
    }
  }

  return bestScore;
}

function scoreCity(
  compactQuery: string,
  canonicalQuery: string,
  city: string,
  canonicalCity: string,
): number | null {
  if (compactQuery === city) return 0;
  if (canonicalQuery === canonicalCity) return 1;
  if (city.startsWith(compactQuery) || canonicalCity.startsWith(canonicalQuery)) return 3;
  if (city.includes(compactQuery) || canonicalCity.includes(canonicalQuery)) return 5;
  return null;
}

function scoreProvinceAndCity(
  compactQuery: string,
  canonicalQuery: string,
  province: string,
  city: string,
  canonicalCity: string,
): number | null {
  const provinceAndCity = `${province}${city}`;
  const canonicalProvinceAndCity = `${canonicalize(province)}${canonicalCity}`;
  if (compactQuery === provinceAndCity || canonicalQuery === canonicalProvinceAndCity) return 2;
  if (
    provinceAndCity.startsWith(compactQuery) ||
    canonicalProvinceAndCity.startsWith(canonicalQuery)
  ) return 4;
  if (
    provinceAndCity.includes(compactQuery) ||
    canonicalProvinceAndCity.includes(canonicalQuery)
  ) return 6;
  return null;
}

function lowerScore(current: number | null, candidate: number | null): number | null {
  if (candidate === null) return current;
  return current === null ? candidate : Math.min(current, candidate);
}

function uniqueNames(names: readonly string[]): string[] {
  return [...new Set(names.map(compact).filter(Boolean))];
}

function toLocation(entry: ChinaCityIndexEntry): CityLocationV1 {
  return {
    provider: "weatherapi",
    providerLocationId: entry.providerLocationId,
    name: entry.nameZh,
    region: entry.provinceZh,
    country: "中国",
    latitude: entry.latitude,
    longitude: entry.longitude,
  };
}

function canonicalize(value: string): string {
  return compact(value).replace(/^中国/u, "").replace(ADMINISTRATIVE_SUFFIXES, "");
}

function compact(value: string): string {
  return value.trim().replace(/[\s·•,，、/\\-]+/gu, "");
}

function containsHan(value: string): boolean {
  return /\p{Script=Han}/u.test(value);
}

function containsLatin(value: string): boolean {
  return /\p{Script=Latin}/u.test(value);
}
