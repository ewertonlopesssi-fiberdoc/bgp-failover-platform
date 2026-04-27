#!/bin/bash

###############################################################################
# BGP Failover Platform - Quick Install (Minimal Dependencies)
# Funciona com wget, curl ou até sem eles
# Uso: bash quick_install.sh
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
    echo "║  BGP Failover Platform - Instalação Rápida                    ║"
    echo "╚════════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

print_section() {
    echo -e "\n${BLUE}▶ $1${NC}"
}

check_root() {
    if [ "$EUID" -ne 0 ]; then
        print_error "Este script deve ser executado com sudo!"
        print_info "Execute: sudo bash quick_install.sh"
        exit 1
    fi
}

# Função para baixar arquivo
download_file() {
    local url="$1"
    local output="$2"
    
    if command -v wget &> /dev/null; then
        wget -q "$url" -O "$output"
    elif command -v curl &> /dev/null; then
        curl -fsSL "$url" -o "$output"
    else
        print_error "wget ou curl não encontrado"
        return 1
    fi
}

install_essentials() {
    print_section "Instalando ferramentas essenciais"
    
    apt-get update
    apt-get install -y \
        wget \
        curl \
        ca-certificates
    
    print_success "Ferramentas instaladas"
}

install_dependencies() {
    print_section "Instalando dependências"
    
    apt-get install -y \
        python3 \
        python3-pip \
        git
    
    print_success "Dependências instaladas"
}

clone_and_install() {
    print_section "Clonando repositório e instalando"
    
    TEMP_DIR="/tmp/bgp_failover_$$"
    mkdir -p "$TEMP_DIR"
    cd "$TEMP_DIR"
    
    print_info "Clonando repositório..."
    git clone https://github.com/ewertonlopesssi-fiberdoc/bgp-failover-platform.git
    
    cd bgp-failover-platform
    
    print_info "Executando instalador..."
    bash scripts/install_debian.sh
    
    cd /
    rm -rf "$TEMP_DIR"
    
    print_success "Instalação concluída"
}

main() {
    print_header
    
    check_root
    
    install_essentials
    install_dependencies
    clone_and_install
    
    print_header
    print_success "Tudo pronto!"
    echo -e "\n${BLUE}Próximos passos:${NC}"
    echo "1. Configurar (menu interativo):"
    echo "   ${YELLOW}sudo bash /opt/bgp_failover/scripts/post_install.sh${NC}"
    echo ""
    echo "2. Ou iniciar o serviço:"
    echo "   ${YELLOW}sudo systemctl start bgp-failover-api.service${NC}"
    echo ""
}

main
