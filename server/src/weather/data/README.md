# Vendored China City Index

`chinaCityIndex.ts` is a modified, reduced subset of the official GeoNames
China country dump. It is bundled with Relay, so Chinese city search performs no
runtime download and requires no additional API key.

## Source And License

- Data source and attribution: [GeoNames](https://www.geonames.org/)
- Original snapshot: [CN.zip](https://download.geonames.org/export/dump/CN.zip)
- Retrieved: `2026-08-19`
- `CN.zip` SHA256: `B966A51547B3EC5A282B5F66FB756DAC94B7003497C89ED45A24A1A1005E4479`
- Extracted `CN.txt` SHA256: `7EA2DB57F59CEDD23FEA553A2A80EDD4E9EC6E21557B0D063C2AB427701996C3`
- License: [Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/)
- Official dump format and license statement: [readme.txt](https://download.geonames.org/export/dump/readme.txt)

GeoNames permits sharing and adaptation, including commercial use, under CC BY
4.0 with attribution. This project changes the source by filtering it to a
city-level China index, selecting display names and aliases, and projecting
administrative-seat coordinates. See `LICENSE.geonames-CC-BY-4.0.md` for the
bundled attribution notice.

## Deterministic Transformation

Run from the repository root:

```powershell
node server/src/weather/data/generateChinaCityIndex.mjs `
  "$env:TEMP\geonames-cn-codex\CN.txt"
```

The generator performs these steps:

1. Parse the UTF-8, tab-delimited `CN.txt` snapshot.
2. Keep all 360 `A/ADM2` administrative regions.
3. Add the Beijing, Shanghai, Tianjin, and Chongqing `A/ADM1` rows, identified
   by their Chinese alternate names.
4. Read Chinese display names and `aliasesZh` from the row's comma-separated
   `alternatenames` column. City display names use the shortest source-order
   Chinese alias after removing one trailing administrative suffix. Province
   names and aliases come from the parent `ADM1` row; the display name must be
   one of the 31 standard simplified province-level names present in those
   aliases, so one-character abbreviations and traditional variants cannot win.
5. For ADM2 coordinates, choose a `P/PPLA` then `P/PPLA2` record with identical
   `admin1` and `admin2` codes. For municipalities, choose `P/PPLC` then
   `P/PPLA` with identical `admin1`. Within a feature code, sort by population
   descending and GeoNames ID ascending. Fall back to the administrative row's
   coordinates when no seat exists.
6. Use the administrative row's GeoNames `geonameid` as the stable numeric
   `providerLocationId`, sort output by that ID, and reject duplicate IDs.

The generated index contains 364 records. Weather forecasts still use
WeatherAPI with the selected record's latitude and longitude. The existing
`provider: "weatherapi"` value remains unchanged for stored-profile and client
compatibility.

## Maintenance

Updates are manual. Download a reviewed GeoNames `CN.zip`, record its retrieval
date and hashes above and in the generator, regenerate from the matching
`CN.txt`, inspect the diff for administrative changes, and run the weather and
shared-profile test suites. Do not add the full dump or ZIP to the repository.
