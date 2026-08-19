import { describe, expect, it } from "vitest";
import {
  searchChinaCities,
  type ChinaCityIndexEntry,
} from "./chinaCitySearch.js";
import {
  CHINA_CITY_INDEX,
  CHINA_CITY_INDEX_SOURCE,
} from "./data/chinaCityIndex.js";

describe("searchChinaCities", () => {
  it("keeps the vendored city-level index unique and coordinate-valid", () => {
    expect(CHINA_CITY_INDEX).toHaveLength(364);
    expect(new Set(CHINA_CITY_INDEX.map((city) => city.providerLocationId)).size).toBe(
      CHINA_CITY_INDEX.length,
    );
    expect(
      CHINA_CITY_INDEX.every(
        (city) =>
          Number.isInteger(city.providerLocationId) &&
          city.providerLocationId > 0 &&
          city.latitude >= -90 &&
          city.latitude <= 90 &&
          city.longitude >= -180 &&
          city.longitude <= 180,
      ),
    ).toBe(true);
    expect(
      CHINA_CITY_INDEX.every(
        (city) => city.aliasesZh.length > 0 && city.provinceAliasesZh.length > 0,
      ),
    ).toBe(true);
    expect(CHINA_CITY_INDEX_SOURCE).toEqual({
      sourceUrl: "https://download.geonames.org/export/dump/CN.zip",
      retrievedAt: "2026-08-19",
      zipSha256:
        "B966A51547B3EC5A282B5F66FB756DAC94B7003497C89ED45A24A1A1005E4479",
      textSha256:
        "7EA2DB57F59CEDD23FEA553A2A80EDD4E9EC6E21557B0D063C2AB427701996C3",
      attribution: "GeoNames",
      license: "CC BY 4.0",
    });
  });

  it.each([
    ["长沙", "长沙", "湖南", 1815551],
    ["长沙市", "长沙", "湖南", 1815551],
    ["北京", "北京", "北京", 2038349],
    ["北京市", "北京", "北京", 2038349],
    ["广州", "广州", "广东", 1809857],
    ["广州市", "广州", "广东", 1809857],
    ["深圳", "深圳", "广东", 1795563],
    ["深圳市", "深圳", "广东", 1795563],
    ["乌鲁木齐市", "乌鲁木齐", "新疆", 1529101],
    ["呼和浩特市", "呼和浩特", "内蒙古", 2036891],
    ["拉萨市", "拉萨", "西藏", 1280735],
    ["大兴安岭地区", "大兴安岭", "黑龙江", 2037961],
    ["湘西自治州", "湘西", "湖南", 1790468],
    ["阿拉善盟", "阿拉善", "内蒙古", 1818128],
  ])(
    "matches %s to %s in %s",
    (query, name, region, providerLocationId) => {
      expect(searchChinaCities(query)[0]).toMatchObject({
        provider: "weatherapi",
        providerLocationId,
        name,
        region,
        country: "中国",
      });
    },
  );

  it("matches province and city keywords with administrative suffixes", () => {
    expect(searchChinaCities("湖南省 长沙市")[0]).toMatchObject({
      name: "长沙",
      region: "湖南",
    });
    expect(searchChinaCities("新疆维吾尔自治区 乌鲁木齐市")[0]).toMatchObject({
      name: "乌鲁木齐",
      region: "新疆",
    });
  });

  it.each([
    ["湘西土家族苗族自治州", "湘西", "湖南"],
    ["恩施土家族苗族自治州", "恩施", "湖北"],
    ["延边朝鲜族自治州", "延边", "吉林"],
    ["伊犁哈萨克自治州", "伊犁", "新疆"],
  ])("matches the full official autonomous-prefecture alias %s", (query, name, region) => {
    expect(searchChinaCities(query)[0]).toMatchObject({
      name,
      region,
      country: "中国",
    });
  });

  it("ranks exact and normalized exact names before partial names", () => {
    const index: ChinaCityIndexEntry[] = [
      city(2, "长沙镇", "湖南"),
      city(1, "长沙", "湖南"),
      city(3, "新长沙", "示例省"),
    ];

    expect(searchChinaCities("长沙市", index).map((location) => location.name)).toEqual([
      "长沙",
      "长沙镇",
      "新长沙",
    ]);
  });

  it("deduplicates stable IDs while preserving the highest-ranked record", () => {
    const exact = city(1, "长沙", "湖南");
    const duplicate = { ...exact };

    expect(searchChinaCities("长沙市", [duplicate, exact])).toEqual([
      expect.objectContaining({ providerLocationId: 1, name: "长沙" }),
    ]);
  });

  it("deduplicates equivalent city and region results from different admin levels", () => {
    expect(searchChinaCities("北京市").filter((city) => city.name === "北京")).toEqual([
      expect.objectContaining({ providerLocationId: 2038349, region: "北京" }),
    ]);
  });

  it.each(["Changsha", "Mars", "火星市"])(
    "returns no local result for fallback query %s",
    (query) => {
      expect(searchChinaCities(query)).toEqual([]);
    },
  );
});

function city(
  providerLocationId: number,
  nameZh: string,
  provinceZh: string,
): ChinaCityIndexEntry {
  return {
    providerLocationId,
    nameZh,
    aliasesZh: [nameZh],
    nameEn: nameZh,
    provinceZh,
    provinceAliasesZh: [provinceZh],
    provinceEn: provinceZh,
    latitude: 28.2,
    longitude: 113,
  };
}
