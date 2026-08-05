# Couple Pet Relay Deployment

Target: `159.75.175.47:8787`

## Deploy

```powershell
ssh root@159.75.175.47 "mkdir -p /opt/couple-pet-relay"
scp -r server shared package.json pnpm-lock.yaml pnpm-workspace.yaml deploy/couple-pet-relay root@159.75.175.47:/opt/couple-pet-relay/
ssh root@159.75.175.47 "cd /opt/couple-pet-relay && docker compose -f deploy/couple-pet-relay/compose.yaml up -d --build"
```

## Health Check

```powershell
curl http://159.75.175.47:8787/health
```

If the health check cannot connect, open TCP port `8787` in the cloud security group and the server firewall.
