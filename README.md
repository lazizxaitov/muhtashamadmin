This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Notes

- Loyalty cards, discounts, and bonus balances are managed in Poster and must be retrieved from Poster APIs. The admin panel only provides user access (login/password) and does not store loyalty data.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy to DigitalOcean (SQLite)

### 1) Server setup (Ubuntu 22.04/24.04)

```bash
sudo apt update
sudo apt install -y git nginx
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm i -g pm2
```

### 2) Create persistent data dirs

```bash
sudo mkdir -p /var/lib/muhtasham/uploads
sudo touch /var/lib/muhtasham/data.sqlite
sudo chown -R $USER:$USER /var/lib/muhtasham
```

### 3) Clone & configure env

```bash
git clone <your-repo-url>
cd my-app
cp .env.example .env
```

Set `.env` (no secrets in client code, no `NEXT_PUBLIC_*` for secrets):

```
DATABASE_URL=file:/var/lib/muhtasham/data.sqlite
UPLOAD_DIR=/var/lib/muhtasham/uploads
ADMIN_LOGIN=...
ADMIN_PASSWORD_SALT=...
ADMIN_PASSWORD_HASH=...
ADMIN_SESSION_SECRET=...
APP_API_KEY=...
CLIENT_JWT_SECRET=...
```

Generate `ADMIN_PASSWORD_SALT` / `ADMIN_PASSWORD_HASH`:

```bash
npm run admin:hash
# or update an env file in-place:
npm run admin:hash -- --write .env
```

### 4) Install, init DB (one-time), build

```bash
npm ci
npm run db:init
npm run build
```

SQLite WAL and busy timeout are enabled in `lib/db.ts`. Tune as needed for your workload.

### 5) Run with PM2

```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup systemd
```

Logging:

```bash
pm2 logs muhtasham-admin
```

### 6) Nginx reverse proxy

Create `/etc/nginx/sites-available/muhtasham`:

```
server {
  server_name example.com;

  client_max_body_size 20M;

  location /uploads/ {
    alias /var/lib/muhtasham/uploads/;
    access_log off;
    expires 30d;
  }

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-Host $host;
    proxy_set_header X-Forwarded-Port $server_port;
  }
}
```

Enable:

```bash
sudo ln -s /etc/nginx/sites-available/muhtasham /etc/nginx/sites-enabled/muhtasham
sudo nginx -t
sudo systemctl reload nginx
```

### 7) SSL (Let's Encrypt)

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d example.com
```

### 8) Updates

```bash
git pull
npm ci
npm run build
pm2 restart muhtasham-admin
```

### 9) SQLite backups (cron)

```bash
mkdir -p /var/lib/muhtasham/backups
sqlite3 /var/lib/muhtasham/data.sqlite ".backup '/var/lib/muhtasham/backups/data-$(date +%F).sqlite'"
```

Example cron (daily at 02:15):

```bash
15 2 * * * sqlite3 /var/lib/muhtasham/data.sqlite ".backup '/var/lib/muhtasham/backups/data-$(date +\%F).sqlite'"
```
