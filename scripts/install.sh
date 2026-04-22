#!/bin/bash

###############################################################################
# BGP Failover Platform - One-Line Installer
# Baixa e executa o bootstrap automaticamente
# Uso: bash install.sh
###############################################################################

set -e

# Cores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_header() {
    clear
    echo -e "${BLUE}"
    echo "╔════════════════════════════════════════════════════════════════╗"
    echo "║  BGP Failover Platform - Instalador Automático                ║"
    echo "╚════════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

check_root() {
    if [ "$EUID" -ne 0 ]; then
        print_error "Este script deve ser executado com sudo!"
        print_info "Execute: sudo bash install.sh"
        exit 1
    fi
}

main() {
    print_header
    
    check_root
    
    print_info "Baixando bootstrap script..."
    
    # Baixar bootstrap
    curl -fsSL https://raw.githubusercontent.com/ewertonlopesssi-fiberdoc/bgp-failover-platform/main/scripts/bootstrap.sh -o /tmp/bootstrap.sh
    
    if [ ! -f /tmp/bootstrap.sh ]; then
        print_error "Erro ao baixar bootstrap script"
        exit 1
    fi
    
    print_success "Bootstrap baixado"
    
    print_info "Executando bootstrap..."
    bash /tmp/bootstrap.sh
    
    # Limpar
    rm -f /tmp/bootstrap.sh
    
    print_success "Instalação concluída!"
}

main
