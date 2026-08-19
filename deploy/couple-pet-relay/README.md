# Couple Pet Relay Deployment

Target: `159.75.175.47:8787`

## Deploy

Create a free WeatherAPI account, copy `.env.example` to `.env`, and set
`WEATHER_API_KEY` in `.env`. The free plan advertises `100,000` calls per month
as of 2026-08-18. The Relay has no paid provider fallback: when the key is
missing or unusable, pairing and messaging remain available while weather
requests return a stable unavailable state.

Every pair-weather panel open still requests the Relay. Successful weather for
each city is considered fresh for one hour from `fetchedAt`; requests before
that boundary use the Relay cache, while requests at or after one hour refresh
the supplier.

```powershell
ssh root@159.75.175.47 "mkdir -p /opt/couple-pet-relay"
tar -czf relay-source.tar.gz --exclude='**/node_modules' --exclude='**/dist' --exclude='**/.data' --exclude='deploy/couple-pet-relay/.env' server shared platform-api/package.json platform-web/package.json package.json pnpm-lock.yaml pnpm-workspace.yaml deploy/couple-pet-relay .dockerignore
scp relay-source.tar.gz root@159.75.175.47:/opt/relay-source.tar.gz
ssh root@159.75.175.47 "test -f /opt/couple-pet-relay/deploy/couple-pet-relay/.env && docker volume inspect couple-pet-relay_relay-data >/dev/null && tar -xzf /opt/relay-source.tar.gz -C /opt/couple-pet-relay && rm /opt/relay-source.tar.gz && cd /opt/couple-pet-relay && docker compose --env-file deploy/couple-pet-relay/.env -f deploy/couple-pet-relay/compose.yaml up -d --build"
```

Never upload, replace, print, or delete the remote
`deploy/couple-pet-relay/.env`. The source archive deliberately excludes it.
The `couple-pet-relay_relay-data` named volume is the durable SQLite boundary;
an additive deployment must inspect and retain that volume and must not use
`docker compose down -v`.

## Health Check

```powershell
curl http://159.75.175.47:8787/health
```

A configured deployment returns:

```json
{"ok":true,"weatherConfigured":true}
```

`weatherConfigured` is `false` when `WEATHER_API_KEY` is empty. The health
endpoint never returns the key.

If the health check cannot connect, open TCP port `8787` in the cloud security group and the server firewall.

## Spark Additive Migration

Relay startup adds `pair_spark_activity_days`, `pair_spark_streaks`, and
`idx_pair_spark_active_ranking` with `IF NOT EXISTS`. Existing `devices` and
`pairs` rows remain in the named volume. After deployment, confirm the service
is running without restarts and inspect only schema names/counts, never row
identifiers or secrets:

```powershell
ssh root@159.75.175.47 "cd /opt/couple-pet-relay && docker compose --env-file deploy/couple-pet-relay/.env -f deploy/couple-pet-relay/compose.yaml ps"
curl http://159.75.175.47:8787/health
```

The expected configured health response remains
`{"ok":true,"weatherConfigured":true}`. Migration verification must also
confirm that pre-deployment `devices` and `pairs` counts did not decrease.

## Authenticated Spark Smoke

Use random, one-time in-memory credentials and never pass credentials on the
command line or write them to logs. The release smoke must:

1. Create and bind two temporary devices.
2. Confirm authenticated snapshot `0/unlit`.
3. Connect both `/ws` clients with capability `spark-v1`.
4. Deliver one plain message and confirm peer receipt, sender acknowledgement,
   and `spark.updated` for both clients.
5. Confirm snapshot `1/glimmer`, then send a same-day surprise and confirm the
   value remains `1`.
6. Confirm leaderboard `top20` shape and a positive self rank.
7. Unpair the temporary pair and confirm snapshot and leaderboard both return
   stable `pair_not_found` errors.

The controlled release workspace contains a non-production smoke harness that
generates credentials internally and prints only booleans and stable codes:

```powershell
node .superpowers/sdd/2026-08-19-couple-spark-streak-leaderboard/final-delivery-evidence/remote-spark-smoke.mjs
```
