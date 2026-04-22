#!/bin/bash

###############################################################################
# BGP Failover Platform - Instalador Corrigido
# Versão que funciona corretamente com caminhos relativos
###############################################################################

set -e

# Cores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configurações
INSTALL_DIR="/opt/bgp_failover"
CONFIG_DIR="/etc/bgp_failover"
DATA_DIR="/var/lib/bgp_failover"
USER="bgp_failover"
GROUP="bgp_failover"

# Detectar diretório do script
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
SOURCE_DIR="$(dirname "$SCRIPT_DIR")"

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_section() {
    echo -e "\n${BLUE}▶ $1${NC}"
}

check_root() {
    if [[ $EUID -ne 0 ]]; then
        log_error "Este script deve ser executado como root"
        exit 1
    fi
}

main() {
    log_section "BGP Failover Platform - Instalador"
    
    check_root
    
    log_info "Diretório de origem: $SOURCE_DIR"
    log_info "Diretório de instalação: $INSTALL_DIR"
    
    # 1. Criar usuário do serviço
    log_section "Criando usuário do serviço"
    if ! id "$USER" &>/dev/null; then
        useradd -r -s /bin/bash -d "$INSTALL_DIR" -m "$USER"
        log_info "Usuário '$USER' criado"
    else
        log_warn "Usuário '$USER' já existe"
    fi
    
    # 2. Criar diretórios
    log_section "Criando diretórios"
    mkdir -p "$INSTALL_DIR"
    mkdir -p "$CONFIG_DIR"
    mkdir -p "$DATA_DIR"
    mkdir -p "$INSTALL_DIR/modules"
    mkdir -p "$INSTALL_DIR/logs"
    mkdir -p "$INSTALL_DIR/docs"
    
    # 3. Copiar arquivos do repositório
    log_section "Copiando arquivos"
    
    # Copiar código-fonte
    if [ -d "$SOURCE_DIR/src" ]; then
        cp "$SOURCE_DIR/src"/*.py "$INSTALL_DIR/" 2>/dev/null || true
        log_info "Código-fonte copiado"
    else
        log_error "Diretório src não encontrado em $SOURCE_DIR"
        exit 1
    fi
    
    # Copiar módulos
    if [ -d "$SOURCE_DIR/modules" ]; then
        cp -r "$SOURCE_DIR/modules"/* "$INSTALL_DIR/modules/" 2>/dev/null || true
        log_info "Módulos copiados"
    fi
    
    # Copiar documentação
    if [ -d "$SOURCE_DIR/docs" ]; then
        cp "$SOURCE_DIR/docs"/*.md "$INSTALL_DIR/docs/" 2>/dev/null || true
        log_info "Documentação copiada"
    fi
    
    # Copiar README
    if [ -f "$SOURCE_DIR/README.md" ]; then
        cp "$SOURCE_DIR/README.md" "$INSTALL_DIR/"
        log_info "README copiado"
    fi
    
    # 4. Copiar configurações
    log_section "Copiando configurações"
    if [ -d "$SOURCE_DIR/config" ]; then
        cp "$SOURCE_DIR/config"/*.json "$CONFIG_DIR/" 2>/dev/null || true
        log_info "Configurações copiadas"
    fi
    
    # 5. Instalar dependências Python
    log_section "Instalando dependências Python"
    if [ -f "$SOURCE_DIR/requirements.txt" ]; then
        pip3 install --upgrade pip
        pip3 install -r "$SOURCE_DIR/requirements.txt"
        log_info "Dependências Python instaladas"
    else
        log_warn "requirements.txt não encontrado"
    fi
    
    # 6. Definir permissões
    log_section "Definindo permissões"
    chown -R "$USER:$GROUP" "$INSTALL_DIR"
    chown -R "$USER:$GROUP" "$CONFIG_DIR"
    chown -R "$USER:$GROUP" "$DATA_DIR"
    
    chmod 750 "$INSTALL_DIR"
    chmod 750 "$CONFIG_DIR"
    chmod 750 "$DATA_DIR"
    chmod 600 "$CONFIG_DIR"/*.json
    
    # 7. Criar serviço systemd
    log_section "Criando serviço systemd"
    cat > "/etc/systemd/system/bgp-failover-api.service" << EOF
[Unit]
Description=BGP Failover Monitoring Platform API
After=network.target

[Service]
Type=simple
User=$USER
Group=$GROUP
WorkingDirectory=$INSTALL_DIR
Environment="PYTHONUNBUFFERED=1"
ExecStart=/usr/bin/python3 $INSTALL_DIR/bgp_failover_api_v2.py
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF
    
    systemctl daemon-reload
    systemctl enable bgp-failover-api.service
    log_info "Serviço systemd criado"
    
    # 8. Criar CLI
    log_section "Criando CLI"
    cat > "/usr/local/bin/bgp-failover" << 'EOF'
#!/bin/bash
cd /opt/bgp_failover
python3 bgp_failover_cli_v2.py "$@"
EOF
    chmod +x "/usr/local/bin/bgp-failover"
    log_info "CLI criado"
    
    # Sucesso
    log_section "Instalação concluída com sucesso!"
    echo ""
    echo -e "${BLUE}Próximos passos:${NC}"
    echo "1. Executar configuração interativa (RECOMENDADO):"
    echo "   ${YELLOW}sudo bash $INSTALL_DIR/scripts/post_install.sh${NC}"
    echo ""
    echo "2. Ou iniciar o serviço:"
    echo "   ${YELLOW}sudo systemctl start bgp-failover-api.service${NC}"
    echo ""
    echo "3. Verificar status:"
    echo "   ${YELLOW}sudo systemctl status bgp-failover-api.service${NC}"
    echo ""
}

main "$@"
