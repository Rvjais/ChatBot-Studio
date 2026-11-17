#!/usr/bin/env bash
# One-time setup of a fresh Ubuntu VPS (Hostinger or any provider). Run as root:
#   bash setup-server.sh <domain> <email>
#   e.g. bash setup-server.sh chat.example.com you@example.com
#
# Installs Docker, creates the "deploy" user used by GitHub Actions, enables the firewall,
# adds swap on small servers, generates secrets into /opt/chatbot/.env and creates the
# SSH key for GitHub Actions. Safe to re-run: existing secrets and keys are kept.
set -euo pipefail

DOMAIN="${1:-}"
EMAIL="${2:-}"
if [ -z "$DOMAIN" ] || [ -z "$EMAIL" ]; then
  echo "usage: bash setup-server.sh <domain> <email>   (e.g. chat.example.com you@example.com)" >&2
  exit 1
fi
if [ "$(id -u)" -ne 0 ]; then
  echo "Run this script as root (e.g. sudo bash setup-server.sh ...)" >&2
  exit 1
fi

APP_DIR=/opt/chatbot
DEPLOY_USER=deploy
KEY_FILE=/root/chatbot-github-deploy-key

port_of() { sed -E 's/.*:([0-9]+)$/\1/'; }

# Caddy (inside Docker) needs ports 80 and 443. Stop safely if another web server already uses them
# (e.g. a control panel from a VPS template), instead of breaking the existing setup.
WEB_LISTENERS="$(ss -ltnpH '( sport = :80 or sport = :443 )' 2> /dev/null || true)"
if [ -n "$WEB_LISTENERS" ] && ! echo "$WEB_LISTENERS" | grep -q docker-proxy; then
  echo "STOP: ports 80/443 are already used by another web server on this VPS:" >&2
  echo "$WEB_LISTENERS" | grep -oE 'users:\(\("[^"]+"' | sort -u | sed 's/users:(("/   - /' >&2
  echo "Nothing was changed. This usually means the VPS was created with a control-panel template." >&2
  echo "Either reinstall the VPS with plain Ubuntu 24.04 (hPanel -> VPS -> OS), or put the app behind" >&2
  echo "the existing web server (reverse proxy to 127.0.0.1:4000) - see docs/HOSTINGER-VPS.md." >&2
  exit 1
fi

echo "==> Installing system updates and Docker"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y ca-certificates curl openssl ufw
if ! command -v docker > /dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
fi
systemctl enable --now docker

echo "==> Creating the '$DEPLOY_USER' user"
if ! id "$DEPLOY_USER" > /dev/null 2>&1; then
  adduser --disabled-password --gecos "" "$DEPLOY_USER"
fi
usermod -aG docker "$DEPLOY_USER"
install -d -m 700 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "/home/$DEPLOY_USER/.ssh"
touch "/home/$DEPLOY_USER/.ssh/authorized_keys"
chown "$DEPLOY_USER:$DEPLOY_USER" "/home/$DEPLOY_USER/.ssh/authorized_keys"
chmod 600 "/home/$DEPLOY_USER/.ssh/authorized_keys"

echo "==> Configuring the firewall (SSH, HTTP, HTTPS)"
# Always allow every port sshd actually listens on, so a custom SSH port can never be locked out.
SSH_PORTS="$(ss -ltnpH 2> /dev/null | awk '/"sshd"/ {print $4}' | port_of | sort -un)"
OTHER_PORTS="$(ss -ltnH 2> /dev/null | awk '{print $4}' | grep -vE '^(127\.|\[::1\]|\[::ffff:127\.)' | port_of \
  | grep -vxE "22|80|443${SSH_PORTS:+|$(echo "$SSH_PORTS" | paste -sd'|')}" | sort -un | paste -sd' ' || true)"
ufw allow OpenSSH > /dev/null
for p in $SSH_PORTS; do ufw allow "$p/tcp" > /dev/null; done
ufw allow 80/tcp > /dev/null
ufw allow 443/tcp > /dev/null
ufw allow 443/udp > /dev/null
if ufw status | grep -q "Status: active"; then
  echo "    firewall already active - rules added"
elif [ -n "$OTHER_PORTS" ]; then
  echo "    NOTE: not enabling the firewall because other services listen publicly on: $OTHER_PORTS"
  echo "          (enabling it would block them). Rules were added; run 'ufw enable' yourself if that is fine."
else
  ufw --force enable > /dev/null
  echo "    firewall enabled (SSH${SSH_PORTS:+ on $SSH_PORTS}, 80, 443)"
fi

MEM_MB="$(awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo)"
if [ "$MEM_MB" -lt 4000 ] && ! swapon --show | grep -q .; then
  echo "==> Adding a 2 GB swap file (server has ${MEM_MB} MB RAM)"
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile > /dev/null
  swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

echo "==> Preparing $APP_DIR"
install -d -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$APP_DIR" "$APP_DIR/backups"
if [ ! -f "$APP_DIR/.env" ]; then
  cat > "$APP_DIR/.env" << EOF
# Production configuration. Keep this file private and back it up:
# losing ENCRYPTION_KEY makes stored AI provider keys unreadable.
DOMAIN=$DOMAIN
ACME_EMAIL=$EMAIL
MONGO_USER=chatbot
MONGO_PASSWORD=$(openssl rand -hex 24)
JWT_SECRET=$(openssl rand -hex 48)
ENCRYPTION_KEY=$(openssl rand -hex 32)
# Optional: MongoDB memory cache in GB (default 1). Use 0.5 on a 2 GB server.
MONGO_CACHE_GB=1
# Optional overrides (see server/.env.example), e.g. MAX_UPLOAD_MB=20
# Managed by the deploy pipeline:
APP_IMAGE=
APP_TAG=latest
EOF
  echo "    created $APP_DIR/.env with new random secrets"
else
  sed -i "s|^DOMAIN=.*|DOMAIN=$DOMAIN|; s|^ACME_EMAIL=.*|ACME_EMAIL=$EMAIL|" "$APP_DIR/.env"
  echo "    kept existing $APP_DIR/.env (secrets unchanged)"
fi
chown "$DEPLOY_USER:$DEPLOY_USER" "$APP_DIR/.env"
chmod 600 "$APP_DIR/.env"

if [ ! -f "$KEY_FILE" ]; then
  echo "==> Creating the SSH key GitHub Actions will use to deploy"
  ssh-keygen -t ed25519 -N "" -C "github-actions-deploy" -f "$KEY_FILE" > /dev/null
  echo "no-port-forwarding,no-agent-forwarding,no-X11-forwarding $(cat "$KEY_FILE.pub")" >> "/home/$DEPLOY_USER/.ssh/authorized_keys"
fi

SERVER_IP="$(hostname -I | awk '{print $1}')"
cat << EOF

================================================================================
 Server ready. Now add these in GitHub: repository → Settings →
 Secrets and variables → Actions.

 Secrets ("New repository secret"):
   VPS_HOST         $SERVER_IP
   VPS_USER         $DEPLOY_USER
   VPS_KNOWN_HOSTS  $SERVER_IP $(cut -d' ' -f1,2 /etc/ssh/ssh_host_ed25519_key.pub)
   VPS_SSH_KEY      (the whole private key below, including the BEGIN/END lines)

$(cat "$KEY_FILE")

 Variables ("Variables" tab → "New repository variable"):
   DEPLOY_ENABLED   true
   APP_DOMAIN       $DOMAIN

 After saving VPS_SSH_KEY in GitHub, delete the private key from this server:
   rm $KEY_FILE
================================================================================
EOF
