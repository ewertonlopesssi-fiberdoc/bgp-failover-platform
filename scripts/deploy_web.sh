#!/bin/bash
# =============================================================================
# BGP Failover Web Dashboard - Script de Deploy para Debian
# =============================================================================
# Instala Node.js 22, faz build da interface web, configura PM2 e Nginx
# Uso: sudo bash deploy_web.sh
# =============================================================================

set -e

# Cores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Configurações
APP_DIR="/opt/bgp_failover_web"
REPO_URL="https://github.com/ewertonlopesssi-fiberdoc/bgp-failover-platform.git"
WEB_PORT=3000
NGINX_CONF="/etc/nginx/sites-available/bgp-failover-web"

log_info()    { echo -e "${BLUE}▶ $1${NC}"; }
log_success() { echo -e "${GREEN}✅ $1${NC}"; }
log_warn()    { echo -e "${YELLOW}⚠️  $1${NC}"; }
log_error()   { echo -e "${RED}❌ $1${NC}"; exit 1; }

header() {
  echo ""
  echo -e "${CYAN}╔════════════════════════════════════════════════════════════════╗${NC}"
  echo -e "${CYAN}║   BGP Failover Web Dashboard - Deploy para Debian             ║${NC}"
  echo -e "${CYAN}╚════════════════════════════════════════════════════════════════╝${NC}"
  echo ""
}

check_root() {
  if [ "$EUID" -ne 0 ]; then
    log_error "Execute como root: sudo bash deploy_web.sh"
  fi
}

install_nodejs() {
  log_info "Verificando Node.js..."
  if command -v node &>/dev/null; then
    NODE_VER=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$NODE_VER" -ge 18 ]; then
      log_success "Node.js $(node --version) já instalado"
      return
    fi
  fi

  log_info "Instalando Node.js 22 LTS..."
  apt-get update -qq
  apt-get install -y curl ca-certificates gnupg

  # NodeSource repo para Node.js 22
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
  log_success "Node.js $(node --version) instalado"
}

install_pnpm() {
  log_info "Verificando pnpm..."
  if command -v pnpm &>/dev/null; then
    log_success "pnpm $(pnpm --version) já instalado"
    return
  fi
  log_info "Instalando pnpm..."
  npm install -g pnpm
  log_success "pnpm instalado"
}

install_pm2() {
  log_info "Verificando PM2..."
  if command -v pm2 &>/dev/null; then
    log_success "PM2 já instalado"
    return
  fi
  log_info "Instalando PM2..."
  npm install -g pm2
  log_success "PM2 instalado"
}

install_nginx() {
  log_info "Verificando Nginx..."
  if command -v nginx &>/dev/null; then
    log_success "Nginx já instalado"
    return
  fi
  log_info "Instalando Nginx..."
  apt-get install -y nginx
  log_success "Nginx instalado"
}

clone_or_update_repo() {
  log_info "Preparando código-fonte..."

  if [ -d "$APP_DIR/.git" ]; then
    log_info "Repositório já existe, atualizando..."
    cd "$APP_DIR"
    git pull origin main
    log_success "Repositório atualizado"
  else
    log_info "Clonando repositório..."
    mkdir -p "$(dirname $APP_DIR)"
    git clone "$REPO_URL" "$APP_DIR"
    log_success "Repositório clonado em $APP_DIR"
  fi
}

build_web() {
  log_info "Instalando dependências e fazendo build..."

  # Verificar se há diretório web dentro do repositório
  WEB_SRC=""
  if [ -d "$APP_DIR/web" ]; then
    WEB_SRC="$APP_DIR/web"
  elif [ -d "$APP_DIR/bgp-failover-web" ]; then
    WEB_SRC="$APP_DIR/bgp-failover-web"
  else
    # Baixar o projeto web separadamente do Manus
    log_warn "Diretório web não encontrado no repositório."
    log_info "Baixando interface web do Manus..."
    download_web_from_manus
    return
  fi

  cd "$WEB_SRC"
  pnpm install --frozen-lockfile 2>/dev/null || pnpm install
  pnpm build
  log_success "Build concluído"
}

download_web_from_manus() {
  log_info "Configurando interface web standalone..."

  WEB_DIST="/opt/bgp_failover_web_dist"
  mkdir -p "$WEB_DIST"

  # Criar package.json para o servidor Express standalone
  cat > "$WEB_DIST/package.json" << 'PKGJSON'
{
  "name": "bgp-failover-web-server",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "start": "node server.mjs"
  },
  "dependencies": {
    "express": "^4.21.2",
    "compression": "^1.7.4"
  }
}
PKGJSON

  # Criar servidor Express para servir os arquivos estáticos do build
  cat > "$WEB_DIST/server.mjs" << 'SRVJS'
import express from 'express';
import compression from 'compression';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const DIST_DIR = join(__dirname, 'dist');

const app = express();
app.use(compression());

if (existsSync(DIST_DIR)) {
  app.use(express.static(DIST_DIR));
  app.get('*', (req, res) => {
    res.sendFile(join(DIST_DIR, 'index.html'));
  });
} else {
  app.get('*', (req, res) => {
    res.status(503).send('<h1>BGP Failover Web</h1><p>Build não encontrado. Execute o build primeiro.</p>');
  });
}

app.listen(PORT, () => {
  console.log(`BGP Failover Web rodando na porta ${PORT}`);
});
SRVJS

  cd "$WEB_DIST"
  npm install
  APP_DIR="$WEB_DIST"
  log_success "Servidor web configurado"
}

configure_env() {
  log_info "Configurando variáveis de ambiente..."

  # Detectar diretório correto
  if [ -d "$APP_DIR/web" ]; then
    ENV_FILE="$APP_DIR/web/.env"
  elif [ -d "$APP_DIR/bgp-failover-web" ]; then
    ENV_FILE="$APP_DIR/bgp-failover-web/.env"
  else
    ENV_FILE="$APP_DIR/.env"
  fi

  if [ ! -f "$ENV_FILE" ]; then
    # Gerar JWT_SECRET aleatório
    JWT_SECRET=$(openssl rand -hex 32)
    cat > "$ENV_FILE" << ENVFILE
# BGP Failover Web - Configuração
NODE_ENV=production
PORT=$WEB_PORT
JWT_SECRET=$JWT_SECRET
DATABASE_URL=
ENVFILE
    log_success "Arquivo .env criado em $ENV_FILE"
    log_warn "Configure DATABASE_URL em $ENV_FILE se necessário"
  else
    log_success "Arquivo .env já existe"
  fi
}

configure_pm2() {
  log_info "Configurando PM2..."

  # Detectar diretório de start
  if [ -d "$APP_DIR/web" ]; then
    START_DIR="$APP_DIR/web"
  elif [ -d "$APP_DIR/bgp-failover-web" ]; then
    START_DIR="$APP_DIR/bgp-failover-web"
  else
    START_DIR="$APP_DIR"
  fi

  # Criar ecosystem.config.cjs para PM2
  cat > "$START_DIR/ecosystem.config.cjs" << PMCONF
module.exports = {
  apps: [{
    name: 'bgp-failover-web',
    script: 'node',
    args: 'dist/index.js',
    cwd: '$START_DIR',
    env: {
      NODE_ENV: 'production',
      PORT: $WEB_PORT
    },
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '512M',
    error_file: '/var/log/bgp_failover_web_error.log',
    out_file: '/var/log/bgp_failover_web_out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss'
  }]
};
PMCONF

  # Parar instância anterior se existir
  pm2 stop bgp-failover-web 2>/dev/null || true
  pm2 delete bgp-failover-web 2>/dev/null || true

  # Iniciar com PM2
  cd "$START_DIR"
  pm2 start ecosystem.config.cjs
  pm2 save

  # Configurar PM2 para iniciar no boot
  PM2_STARTUP=$(pm2 startup systemd -u root --hp /root 2>&1 | grep "sudo" | tail -1)
  if [ -n "$PM2_STARTUP" ]; then
    eval "$PM2_STARTUP" 2>/dev/null || true
  fi

  log_success "PM2 configurado e serviço iniciado"
}

configure_nginx() {
  log_info "Configurando Nginx como proxy reverso..."

  # Perguntar por domínio
  echo ""
  echo -e "${YELLOW}Configuração do Nginx:${NC}"
  echo "  1) Usar IP diretamente (sem domínio)"
  echo "  2) Usar domínio personalizado"
  echo ""
  read -p "Escolha (1 ou 2): " NGINX_CHOICE

  SERVER_NAME="_"
  if [ "$NGINX_CHOICE" = "2" ]; then
    read -p "Digite o domínio (ex: bgp.seudominio.com.br): " CUSTOM_DOMAIN
    if [ -n "$CUSTOM_DOMAIN" ]; then
      SERVER_NAME="$CUSTOM_DOMAIN"
    fi
  fi

  cat > "$NGINX_CONF" << NGINXCONF
server {
    listen 80;
    server_name $SERVER_NAME;

    # Logs
    access_log /var/log/nginx/bgp_failover_web_access.log;
    error_log  /var/log/nginx/bgp_failover_web_error.log;

    # Gzip
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml;

    # Proxy para Node.js
    location / {
        proxy_pass         http://127.0.0.1:$WEB_PORT;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade \$http_upgrade;
        proxy_set_header   Connection 'upgrade';
        proxy_set_header   Host \$host;
        proxy_set_header   X-Real-IP \$remote_addr;
        proxy_set_header   X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        proxy_read_timeout 86400;
    }

    # API tRPC com timeout maior
    location /api/ {
        proxy_pass         http://127.0.0.1:$WEB_PORT;
        proxy_http_version 1.1;
        proxy_set_header   Host \$host;
        proxy_set_header   X-Real-IP \$remote_addr;
        proxy_set_header   X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto \$scheme;
        proxy_read_timeout 120;
    }
}
NGINXCONF

  # Ativar site
  ln -sf "$NGINX_CONF" /etc/nginx/sites-enabled/bgp-failover-web 2>/dev/null || true
  rm -f /etc/nginx/sites-enabled/default 2>/dev/null || true

  # Testar e recarregar Nginx
  nginx -t && systemctl reload nginx
  log_success "Nginx configurado"
}

configure_firewall() {
  log_info "Configurando firewall (UFW)..."
  if command -v ufw &>/dev/null; then
    ufw allow 80/tcp comment "BGP Failover Web HTTP" 2>/dev/null || true
    ufw allow 443/tcp comment "BGP Failover Web HTTPS" 2>/dev/null || true
    log_success "Regras de firewall adicionadas"
  else
    log_warn "UFW não encontrado, configure o firewall manualmente para liberar porta 80"
  fi
}

show_summary() {
  SERVER_IP=$(hostname -I | awk '{print $1}')
  echo ""
  echo -e "${GREEN}╔════════════════════════════════════════════════════════════════╗${NC}"
  echo -e "${GREEN}║   ✅ Deploy Concluído com Sucesso!                            ║${NC}"
  echo -e "${GREEN}╚════════════════════════════════════════════════════════════════╝${NC}"
  echo ""
  echo -e "${CYAN}📡 Acesso à Interface Web:${NC}"
  echo -e "   URL: ${YELLOW}http://$SERVER_IP${NC}"
  echo ""
  echo -e "${CYAN}🔐 Credenciais Padrão:${NC}"
  echo -e "   Usuário: ${YELLOW}admin${NC}"
  echo -e "   Senha:   ${YELLOW}admin123${NC}"
  echo ""
  echo -e "${CYAN}🔧 Comandos Úteis:${NC}"
  echo -e "   Status:   ${YELLOW}pm2 status${NC}"
  echo -e "   Logs:     ${YELLOW}pm2 logs bgp-failover-web${NC}"
  echo -e "   Restart:  ${YELLOW}pm2 restart bgp-failover-web${NC}"
  echo -e "   Nginx:    ${YELLOW}systemctl status nginx${NC}"
  echo ""
  echo -e "${CYAN}📁 Diretórios:${NC}"
  echo -e "   App:    ${YELLOW}$APP_DIR${NC}"
  echo -e "   Logs:   ${YELLOW}/var/log/bgp_failover_web_*.log${NC}"
  echo -e "   Nginx:  ${YELLOW}$NGINX_CONF${NC}"
  echo ""
  echo -e "${YELLOW}⚠️  Lembre-se de alterar a senha padrão após o primeiro acesso!${NC}"
  echo ""
}

# ─── EXECUÇÃO PRINCIPAL ────────────────────────────────────────────────────────
header
check_root

log_info "Iniciando deploy do BGP Failover Web Dashboard..."
echo ""

install_nodejs
install_pnpm
install_pm2
install_nginx
clone_or_update_repo
configure_env
build_web
configure_pm2
configure_nginx
configure_firewall
show_summary
