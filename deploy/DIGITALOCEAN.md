# DigitalOcean deployment (Droplet)

This project uses SQLite via `better-sqlite3` (native module). For easiest production stability, use Node.js 20 LTS.

## 1) Install Node via nvm (recommended)

```bash
curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
nvm install 20
nvm use 20
node -v
```

## 2) Deploy code

```bash
cd /root
git clone https://github.com/lazizxaitov/muhtashamadmin muhtashamadmin
cd /root/muhtashamadmin
npm ci
npm run build
```

## 3) Create production env

```bash
cp deploy/env.production.local.template .env.production.local
nano .env.production.local
```

Fill at least:
- `ADMIN_LOGIN`
- `ADMIN_PASSWORD_SALT` + `ADMIN_PASSWORD_HASH`
- `ADMIN_SESSION_SECRET`
- `CLIENT_JWT_SECRET`
- `DATABASE_URL` (absolute path, e.g. `/root/muhtashamadmin/data.sqlite`)

Generate admin hash:
```bash
node scripts/gen-admin-hash.js admin123
```

## 4) Start with PM2

```bash
npm i -g pm2
cd /root/muhtashamadmin
pm2 start ecosystem.config.js --update-env
pm2 save
pm2 startup
```

Check logs:
```bash
pm2 logs muhtasham-admin --lines 100
```

## 5) Persistence / backups

Files to back up:
- `.env.production.local` (secrets)
- `data.sqlite` (+ `data.sqlite-wal` / `data.sqlite-shm` when running)
- `public/uploads/` (images)

## Notes

- If you move the project folder, update `DATABASE_URL` and restart PM2 with `--update-env`.
- For a custom domain without `:3000`, set up Nginx reverse-proxy to `127.0.0.1:3000` and use HTTPS (recommended).
