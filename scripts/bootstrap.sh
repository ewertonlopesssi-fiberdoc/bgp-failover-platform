#!/bin/bash

###############################################################################
# BGP Failover Platform - Bootstrap Script
# Instala tudo do zero, incluindo Git
# Uso: bash bootstrap.sh
###############################################################################

set -e

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configurações
REPO_URL="https://github.com/ewertonlopesssi-fiberdoc/bgp-failover-platform.git"
INSTALL_DIR="/opt/bgp_failover"
TEMP_DIR="/tmp/bgp_failover_install"

###############################################################################
# Funções Auxiliares
###############################################################################

print_header() {
    clear
    echo -e "${BLUE}"
    echo "╔════════════════════════════════════════════════════════════════╗"
    echo "║  BGP Failover Platform - Bootstrap (Instalação Completa)      ║"
    echo "╚════════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
}

print_section() {
    echo -e "\n${BLUE}▶ $1${NC}"
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

check_root() {
    if [ "$EUID" -ne 0 ]; then
        print_error "Este script deve ser executado com sudo!"
        exit 1
    fi
}

###############################################################################
# Instalação
###############################################################################

install_git() {
    print_section "Instalando Git"
    
    if command -v git &> /dev/null; then
        print_success "Git já está instalado"
        return
    fi
    
    apt-get update
    apt-get install -y git
    print_success "Git instalado"
}

install_dependencies() {
    print_section "Instalando dependências do sistema"
    
    apt-get update
    apt-get install -y \
        python3 \
        python3-pip \
        python3-venv \
        curl \
        wget \
        openssh-client \
        sqlite3 \
        nano \
        htop \
        ca-certificates
    
    print_success "Dependências instaladas"
}

clone_repository() {
    print_section "Clonando repositório"
    
    if [ -d "$INSTALL_DIR" ]; then
        print_warning "Diretório $INSTALL_DIR já existe"
        read -p "Deseja remover e clonar novamente? (s/n): " response
        if [ "$response" = "s" ]; then
            rm -rf "$INSTALL_DIR"
        else
            print_info "Usando diretório existente"
            return
        fi
    fi
    
    mkdir -p "$TEMP_DIR"
    cd "$TEMP_DIR"
    
    git clone "$REPO_URL" bgp-failover-platform
    
    print_success "Repositório clonado"
}

run_installer() {
    print_section "Executando instalador"
    
    cd "$TEMP_DIR/bgp-failover-platform"
    
    # Copiar para local final
    mkdir -p "$INSTALL_DIR"
    cp -r . "$INSTALL_DIR/"
    
    # Executar script de instalação
    bash "$INSTALL_DIR/scripts/install_debian.sh"
}

cleanup() {
    print_section "Limpando arquivos temporários"
    
    rm -rf "$TEMP_DIR"
    print_success "Limpeza concluída"
}

###############################################################################
# Main
###############################################################################

main() {
    print_header
    
    check_root
    
    install_git
    install_dependencies
    clone_repository
    run_installer
    cleanup
    
    print_header
    print_success "Bootstrap concluído com sucesso!"
    echo -e "\n${BLUE}Próximos passos:${NC}"
    echo "1. Executar configuração interativa:"
    echo "   ${YELLOW}sudo bash $INSTALL_DIR/scripts/post_install.sh${NC}"
    echo ""
    echo "2. Ou iniciar o serviço:"
    echo "   ${YELLOW}sudo systemctl start bgp-failover-api.service${NC}"
    echo ""
}

# Executar
main
