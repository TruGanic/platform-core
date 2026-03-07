# Deploying Platform Core to a DigitalOcean Droplet

This guide deploys the TruGanic Platform Core (Gateway + Security, and optionally Registry + Lifecycle) on an Ubuntu droplet. PostgreSQL and Redis are assumed to be external (e.g. AWS RDS, Upstash).

**Target server**: Ubuntu 24.04 LTS (e.g. `root@truganic-platform-core`).

---

## 1. Prerequisites on the droplet

SSH into the droplet, then install Node.js 20+ and Git:

```bash
# Update system
apt update && apt upgrade -y

# Install Node.js 20.x (LTS)
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

# Verify
node -v   # v20.x.x
npm -v    # 9.x or higher

# Install Git if not present
apt install -y git
```

---

## 2. Deploy the application

### Option A: Clone from Git (recommended)

```bash
cd /opt
git clone <your-platform-core-repo-url> platform-core
cd platform-core
```

If the repo is private, use a deploy key or personal access token.

### Option B: Copy from your machine (rsync)

From your **local machine** (PowerShell or WSL):

```bash
rsync -avz --exclude node_modules --exclude .git --exclude "*/logs" C:\Users\HP\Desktop\TruGanic\platform-core root@129.212.238.68:/opt/
```

Then on the droplet:

```bash
cd /opt/platform-core
```

---

## 3. Install dependencies and build

On the droplet:

```bash
cd /opt/platform-core

# Install all workspace dependencies
npm install

# Build shared types first (required by other services)
npm run build:shared

# Build all services (tsc + tsc-alias rewrites @/ to relative paths in dist)
npm run build:all
```

---

## 4. Environment configuration

Create production `.env` files. **Do not commit real secrets to Git.**

### Gateway – `core/gateway/.env`

```env
NODE_ENV=production
PORT=3000
REDIS_URL=<your-redis-url>
SECURITY_SERVICE_URL=http://127.0.0.1:3001
AUTH_REQUIRED=true
FARMER_SERVICE_URL=https://truganic-farmer-app-2k88s.ondigitalocean.app
CERTIFICATION_BODY_SERVICE_URL=https://truganic-certbody-app-r3ygv.ondigitalocean.app
```

### Security – `core/security/.env`

```env
NODE_ENV=production
PORT=3001
DB_HOST=<your-postgres-host>
DB_PORT=5432
DB_USER=<your-db-user>
DB_PASSWORD=<your-db-password>
DB_NAME=security_service_db
REDIS_URL=<your-redis-url>
CORE_DID=did:web:truganic.github.io:did-documents:core
CORE_PRIVATE_KEY=<your-core-private-key>
LOG_LEVEL=info
```

Use your production PostgreSQL (e.g. RDS) and Redis (e.g. Upstash) values. Keep `CORE_PRIVATE_KEY` secret and consistent with your DID setup.

If you run **Registry** or **Lifecycle**, add `core/registry/.env` and `core/lifecycle/.env` with their required variables (see each service’s config/README).

---

## 5. Process manager (PM2)

Install and use PM2 so the services restart on reboot and stay running.

```bash
# Install PM2 globally
npm install -g pm2

# From repo root
cd /opt/platform-core
```

Create `ecosystem.config.cjs` in the repo root:

```javascript
// ecosystem.config.cjs
module.exports = {
  apps: [
    { name: 'gateway',   cwd: './core/gateway',   script: 'dist/server.js', node_args: '-r tsconfig-paths/register', env: { NODE_ENV: 'production' } },
    { name: 'security',  cwd: './core/security',  script: 'dist/server.js', node_args: '-r tsconfig-paths/register', env: { NODE_ENV: 'production' } },
    // Optional: uncomment if you use them
    // { name: 'registry',  cwd: './core/registry',  script: 'dist/server.js', node_args: '-r tsconfig-paths/register', env: { NODE_ENV: 'production' } },
    // { name: 'lifecycle', cwd: './core/lifecycle', script: 'dist/server.js', node_args: '-r tsconfig-paths/register', env: { NODE_ENV: 'production' } },
  ],
};
```

Start and save the process list:

```bash
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
# Run the command that pm2 startup prints (e.g. for systemd)
```

Useful PM2 commands:

```bash
pm2 status
pm2 logs
pm2 restart all
pm2 stop all
```

---

## 6. Firewall and ports

Expose only the Gateway (e.g. 3000) if clients hit the droplet directly:

```bash
ufw allow 22
ufw allow 3000
ufw enable
ufw status
```

Security (3001), Registry (3002), and Lifecycle (3003) can stay bound to `127.0.0.1` or be blocked by the firewall so only the Gateway talks to them.

---

## 7. Reverse proxy and SSL (optional)

To serve over HTTPS and port 80/443, install Nginx and point it at the Gateway:

```bash
apt install -y nginx certbot python3-certbot-nginx
```

Create a vhost, e.g. `/etc/nginx/sites-available/platform-core`:

```nginx
server {
    listen 80;
    server_name your-domain.com;  # or droplet IP for testing

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Enable and reload:

```bash
ln -s /etc/nginx/sites-available/platform-core /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
```

Then get a certificate:

```bash
certbot --nginx -d your-domain.com
```

---

## 8. Quick checklist

| Step | Command / action |
|------|-------------------|
| 1 | Node 20 + Git on droplet |
| 2 | Clone or rsync `platform-core` to `/opt/platform-core` |
| 3 | `npm install` then `npm run build:shared` then `npm run build:all` |
| 4 | Add production `core/gateway/.env` and `core/security/.env` |
| 5 | Add `ecosystem.config.cjs` and run `pm2 start ecosystem.config.cjs` |
| 6 | `pm2 save` and `pm2 startup` |
| 7 | Open port 3000 (and 80/443 if using Nginx) |

---

## 9. Updating after code changes

```bash
cd /opt/platform-core
git pull   # or rsync again
npm install
npm run build:shared
npm run build:all
pm2 restart all
```

---

## 10. CI/CD: Deploy on release tag

A GitHub Actions workflow deploys to the droplet when you **push a tag** matching `v*` (e.g. `v1.0.0`).

### Setup (once)

1. **GitHub repo** → Settings → Secrets and variables → Actions.
2. Add these **secrets**:
   - **`DEPLOY_HOST`** – Droplet IP or hostname (e.g. `129.212.238.68`).
   - **`SSH_PRIVATE_KEY`** – Full contents of the private key that can SSH into the droplet (e.g. the key you use with Termius/OpenSSH).
3. Optional:
   - **`DEPLOY_USER`** – SSH user (default: `root`).
   - **`DEPLOY_PATH`** – Path to the repo on the server (default: `~/platform-core`; use `/opt/platform-core` if you cloned there).

### How to deploy

From your machine (with the repo and latest `main` merged):

```bash
git tag v1.0.0
git push origin v1.0.0
```

The workflow will:

1. SSH into the droplet.
2. `cd` to the deploy path, `git fetch --tags` and `git checkout <tag>`.
3. Run `npm ci`, `npm run build:shared`, `npm run build:all`.
4. Run `pm2 restart all` and `pm2 save`.

Check the **Actions** tab in the repo for run status and logs.

### Workflow file

- [.github/workflows/deploy-on-release-tag.yml](../.github/workflows/deploy-on-release-tag.yml)

---

## Troubleshooting

- **Gateway can’t reach Security**: Ensure `SECURITY_SERVICE_URL=http://127.0.0.1:3001` and Security is running (`pm2 status`).
- **DB/Redis connection errors**: Check `core/security/.env` (and gateway if it uses Redis) and that the droplet’s IP is allowed in RDS/Upstash security groups or allowlists.
- **Port in use**: `ss -tlnp | grep 3000` (or 3001) to see what is bound; stop that process or change `PORT` in `.env`.

For more on each service’s config, see [Gateway README](../core/gateway/README.md) and [Security README](../core/security/README.md).
