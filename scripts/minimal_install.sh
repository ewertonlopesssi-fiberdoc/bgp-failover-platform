#!/bin/bash

###############################################################################
# BGP Failover Platform - Minimal Install
# Para Debian completamente limpo (apenas SSH)
# Uso: bash minimal_install.sh
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
    echo "║  BGP Failover Platform - Instalação Minimal                   ║"
    echo "║  (Para Debian completamente limpo)                            ║"
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

print_section() {
    echo -e "\n${BLUE}▶ $1${NC}"
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

main() {
    print_header
    check_root
    
    # 1. Atualizar repositórios
    print_section "Atualizando repositórios"
    apt-get update
    print_success "Repositórios atualizados"
    
    # 2. Instalar wget (essencial para baixar)
    print_section "Instalando wget"
    apt-get install -y wget
    print_success "wget instalado"
    
    # 3. Instalar git
    print_section "Instalando git"
    apt-get install -y git
    print_success "git instalado"
    
    # 4. Instalar Python
    print_section "Instalando Python 3"
    apt-get install -y python3 python3-pip
    print_success "Python 3 instalado"
    
    # 5. Instalar dependências do sistema
    print_section "Instalando dependências do sistema"
    apt-get install -y \
        curl \
        openssh-client \
        sqlite3 \
        nano \
        ca-certificates
    print_success "Dependências instaladas"
    
    # 6. Clonar repositório
    print_section "Clonando repositório"
    cd /tmp
    git clone https://github.com/ewertonlopesssi-fiberdoc/bgp-failover-platform.git
    cd bgp-failover-platform
    print_success "Repositório clonado"
    
    # 7. Executar instalador
    print_section "Executando instalador"
    bash scripts/install_debian.sh
    
    print_header
    print_success "Instalação concluída!"
    echo -e "\n${BLUE}Próximos passos:${NC}"
    echo "1. Configurar (menu interativo):"
    echo "   ${YELLOW}sudo bash /opt/bgp_failover/scripts/post_install.sh${NC}"
    echo ""
    echo "2. Ou iniciar o serviço:"
    echo "   ${YELLOW}sudo systemctl start bgp-failover-api.service${NC}"
    echo ""
}

main
