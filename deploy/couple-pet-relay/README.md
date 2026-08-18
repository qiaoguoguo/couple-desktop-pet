# Couple Pet Relay Deployment

Target: `159.75.175.47:8787`

## Deploy

Create a free WeatherAPI account, copy `.env.example` to `.env`, and set
`WEATHER_API_KEY` in `.env`. The free plan advertises `100,000` calls per month
as of 2026-08-18. The Relay has no paid provider fallback: when the key is
missing or unusable, pairing and messaging remain available while weather
requests return a stable unavailable state.

```powershell
ssh root@159.75.175.47 "mkdir -p /opt/couple-pet-relay"
scp -r server shared package.json pnpm-lock.yaml pnpm-workspace.yaml deploy/couple-pet-relay root@159.75.175.47:/opt/couple-pet-relay/
ssh root@159.75.175.47 "cd /opt/couple-pet-relay && docker compose --env-file deploy/couple-pet-relay/.env -f deploy/couple-pet-relay/compose.yaml up -d --build"
```

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
