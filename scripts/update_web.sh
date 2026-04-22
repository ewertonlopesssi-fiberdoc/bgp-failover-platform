#!/bin/bash
# =============================================================================
# BGP Failover Web Dashboard - Script de Atualização
# =============================================================================
# Atualiza o código, refaz o build e reinicia o serviço
# Uso: sudo bash update_web.sh
# =============================================================================

set -e

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

APP_DIR="/opt/bgp_failover_web"

log_info()    { echo -e "${BLUE}▶ $1${NC}"; }
log_success() { echo -e "${GREEN}✅ $1${NC}"; }

echo ""
echo -e "${GREEN}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║   BGP Failover Web - Atualização                              ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Detectar diretório do projeto web
if [ -d "$APP_DIR/web" ]; then
  WEB_DIR="$APP_DIR/web"
elif [ -d "$APP_DIR/bgp-failover-web" ]; then
  WEB_DIR="$APP_DIR/bgp-failover-web"
else
  WEB_DIR="$APP_DIR"
fi

log_info "Atualizando repositório..."
cd "$APP_DIR"
git pull origin main
log_success "Código atualizado"

log_info "Instalando dependências..."
cd "$WEB_DIR"
pnpm install --frozen-lockfile 2>/dev/null || pnpm install
log_success "Dependências instaladas"

log_info "Fazendo build..."
pnpm build
log_success "Build concluído"

log_info "Reiniciando serviço..."
pm2 restart bgp-failover-web
log_success "Serviço reiniciado"

echo ""
echo -e "${GREEN}✅ Atualização concluída!${NC}"
echo ""
pm2 status bgp-failover-web
