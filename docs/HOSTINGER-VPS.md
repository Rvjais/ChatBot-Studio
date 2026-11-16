# Hosting on a Hostinger VPS with automatic deploys from GitHub

After this one-time setup, every `git push` to `main` is tested and, if everything passes,
deployed to your VPS automatically. One server runs everything:

```
 your PC ──git push──► GitHub ──► Actions: typecheck → tests → build → browser test
                                      │
                                      ▼ (only if all pass, only on main)
                         Docker image → GitHub Container Registry
                                      │
                                      ▼ SSH
 Hostinger VPS  /opt/chatbot:  caddy (HTTPS :443) → app (API + dashboard + widget.js) → mongo
```

- **app** — the API, the dashboard and `widget.js`, all on `https://your-domain`
- **mongo** — MongoDB with a password, reachable only by the app (never exposed to the internet)
- **caddy** — HTTPS with free, auto-renewing Let's Encrypt certificates

If a new version fails its health check after deploying, the server automatically rolls back to the previous version.

---

## What you need

- A Hostinger **VPS** (KVM) with **Ubuntu 24.04**. At least 2 GB RAM; **4 GB or more recommended** (MongoDB + the app).
- A domain or subdomain for the app, e.g. `chat.yourdomain.com`.
- A GitHub account. Git and OpenSSH are needed on your PC (both come with Git for Windows / Windows 10+).

## Step 1 — Create the VPS

1. In **hPanel → VPS**, choose the operating system **Ubuntu 24.04** (plain OS template).
2. Set a strong root password (or add your SSH key).
3. Note the VPS **IP address**.
4. If you enabled Hostinger's **VPS firewall** in hPanel, allow inbound **22, 80 and 443** (TCP; also UDP 443).

## Step 2 — Point your domain at the VPS

Create a DNS **A record** for your app's hostname pointing to the VPS IP — in hPanel under
**Domains → DNS / Nameservers** (or at your domain registrar):

| Type | Name | Points to |
|---|---|---|
| A | `chat` | `<your VPS IP>` |

Check it from PowerShell (may take a few minutes to an hour): `nslookup chat.yourdomain.com` should show the VPS IP.
HTTPS certificates can only be issued once this resolves.

## Step 3 — Put the code on GitHub

1. On github.com create a **new private repository** (no README, no .gitignore).
2. In PowerShell, in the project folder (`chat-widget`):

```powershell
git init -b main
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR-USERNAME/YOUR-REPO.git
git push -u origin main
```

Secrets are not committed: `.env` files and `server/.data/` are in `.gitignore`.

3. Open the repository's **Actions** tab. The first run tests and builds everything and pushes the Docker
image. The **Deploy** job is skipped for now — that is expected until Step 5.

## Step 4 — Prepare the VPS (once)

From PowerShell in the project folder, copy the setup script to the server and run it:

```powershell
scp deploy/setup-server.sh root@YOUR_VPS_IP:/root/
ssh root@YOUR_VPS_IP
```

Then, on the server:

```bash
bash /root/setup-server.sh chat.yourdomain.com you@example.com
```

The script installs Docker, creates a `deploy` user, enables the firewall, adds swap on small servers,
creates `/opt/chatbot/.env` with freshly generated secrets (database password, JWT secret, encryption key)
and prints the values GitHub needs. Keep that terminal open for Step 5.

## Step 5 — Connect GitHub to the VPS

In your repository: **Settings → Secrets and variables → Actions**.

**Secrets** tab → *New repository secret*, using the values the script printed:

| Name | Value |
|---|---|
| `VPS_HOST` | the VPS IP |
| `VPS_USER` | `deploy` |
| `VPS_SSH_KEY` | the whole private key, from `-----BEGIN OPENSSH PRIVATE KEY-----` to `-----END OPENSSH PRIVATE KEY-----` |
| `VPS_KNOWN_HOSTS` | the line starting with the IP (pins the server's identity) |
| `VPS_PORT` | *(optional)* only if SSH is not on port 22 |

**Variables** tab → *New repository variable*:

| Name | Value |
|---|---|
| `DEPLOY_ENABLED` | `true` |
| `APP_DOMAIN` | `chat.yourdomain.com` |

Then delete the private key from the server (GitHub now holds it):

```bash
rm /root/chatbot-github-deploy-key
```

## Step 6 — First deploy

**Actions → CI/CD → Run workflow** (branch `main`), or push any commit. The first deploy takes a few
minutes longer while the server downloads MongoDB and Caddy and obtains the HTTPS certificate.

Open **https://chat.yourdomain.com** → **Create an account**. This is a fresh production database:
accounts from your local development database are not copied.

Your embed snippets now use `https://chat.yourdomain.com/widget.js` automatically.

## Step 7 — Turn on daily backups

On the server (as root):

```bash
(crontab -u deploy -l 2>/dev/null; echo "30 2 * * * bash /opt/chatbot/backup.sh >> /opt/chatbot/backups/backup.log 2>&1") | crontab -u deploy -
```

Backups (database + uploaded files, 14 days kept) go to `/opt/chatbot/backups/`. Copy them off the server
regularly (e.g. `scp root@YOUR_VPS_IP:/opt/chatbot/backups/* .`) or enable Hostinger's VPS snapshots too.

**Also back up `/opt/chatbot/.env` somewhere safe** — without its `ENCRYPTION_KEY`, the AI provider keys
stored in the database cannot be decrypted.

---

## Everyday workflow

| You do | What happens |
|---|---|
| `git push` to `main` | Tests run; if they pass, the new version is live in ~5–10 minutes |
| Open a pull request | Tests run; nothing is deployed |
| Push breaks a test | Nothing is deployed; the production site keeps running |
| New version fails its health check | Automatic rollback to the previous version |

**Roll back on purpose:** Actions → open the last good run → **Re-run all jobs** (redeploys that exact version).

## Useful commands on the server

```bash
ssh root@YOUR_VPS_IP
cd /opt/chatbot
docker compose ps                    # status of app, mongo, caddy
docker compose logs -f app           # live application logs
docker compose logs caddy            # HTTPS / certificate issues
docker compose restart app
nano .env && docker compose up -d    # change settings (e.g. MAX_UPLOAD_MB=50), then apply
```

Restore a database backup (replaces current data):

```bash
cd /opt/chatbot && set -a && . ./.env && set +a
docker compose exec -T mongo mongorestore --username "$MONGO_USER" --password "$MONGO_PASSWORD" \
  --authenticationDatabase admin --drop --archive --gzip < backups/mongo-YYYYMMDD-HHMMSS.archive.gz
```

## Troubleshooting

| Symptom | Fix |
|---|---|
| Deploy job says secrets are missing | Re-check the secret names in Step 5 (they are case-sensitive). |
| `Permission denied (publickey)` in the deploy job | `VPS_SSH_KEY` must contain the entire private key including the BEGIN/END lines. Re-run the setup script to print a new key if needed. |
| `Host key verification failed` | `VPS_KNOWN_HOSTS` is wrong — copy the line again from the setup script output. |
| "Check the public site" fails, the site shows a certificate error | DNS doesn't point at the VPS yet, or ports 80/443 are blocked (hPanel firewall). See `docker compose logs caddy`. |
| App keeps restarting | `docker compose logs app` — in production the server refuses to start with missing or weak secrets and says which one. |
| `mongo` exits with "Illegal instruction" | The CPU lacks AVX (rare on KVM). Change the image in `deploy/docker-compose.yml` to `mongo:4.4` and push. |
| Out of memory on a 2 GB VPS | Set `MONGO_CACHE_GB=0.5` in `/opt/chatbot/.env`, then `docker compose up -d`. |

## Notes

- **Image storage:** each deploy pushes a new image version to GitHub Container Registry (your repo's
  *Packages*). Private repositories have limited free package storage — delete old versions from the
  package's settings page occasionally. The server itself keeps only the current and previous image.
- **GitHub Actions minutes:** a full run takes roughly 8–12 minutes; private repositories include a
  monthly free allowance.
- **Security:** only ports 22/80/443 are open; MongoDB is not exposed; the `deploy` user's key cannot open
  tunnels. For extra hardening, disable SSH password login once you use SSH keys for root as well.
