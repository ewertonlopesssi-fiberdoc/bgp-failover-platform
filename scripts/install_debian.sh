#!/bin/bash

################################################################################
# BGP Failover Monitoring Platform - Instalador Debian
# Instalação completa em servidor Debian 10+
################################################################################

set -e

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configurações
INSTALL_DIR="/opt/bgp_failover"
CONFIG_DIR="/etc/bgp_failover"
DATA_DIR="/var/lib/bgp_failover"
USER="bgp_failover"
GROUP="bgp_failover"

################################################################################
# FUNÇÕES
################################################################################

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

check_root() {
    if [[ $EUID -ne 0 ]]; then
        log_error "Este script deve ser executado como root"
        exit 1
    fi
}

check_debian() {
    if ! grep -q "Debian\|Ubuntu" /etc/os-release; then
        log_error "Este script é para Debian/Ubuntu"
        exit 1
    fi
}

################################################################################
# INSTALAÇÃO
################################################################################

main() {
    log_info "BGP Failover Monitoring Platform - Instalador"
    log_info "=============================================="
    
    check_root
    check_debian
    
    # 1. Atualizar sistema
    log_info "Atualizando sistema..."
    apt-get update
    apt-get upgrade -y
    
    # 2. Instalar dependências
    log_info "Instalando dependências..."
    apt-get install -y \
        python3 \
        python3-pip \
        python3-venv \
        git \
        curl \
        wget \
        openssh-client \
        sqlite3 \
        systemd \
        sudo
    
    # 3. Criar usuário do serviço
    log_info "Criando usuário do serviço..."
    if ! id "$USER" &>/dev/null; then
        useradd -r -s /bin/bash -d "$INSTALL_DIR" -m "$USER"
        log_info "Usuário '$USER' criado"
    else
        log_warn "Usuário '$USER' já existe"
    fi
    
    # 4. Criar diretórios
    log_info "Criando diretórios..."
    mkdir -p "$INSTALL_DIR"
    mkdir -p "$CONFIG_DIR"
    mkdir -p "$DATA_DIR"
    mkdir -p "$INSTALL_DIR/modules"
    mkdir -p "$INSTALL_DIR/logs"
    
    # 5. Copiar arquivos
    log_info "Copiando arquivos..."
    cp bgp_failover_platform.py "$INSTALL_DIR/"
    cp auth_manager.py "$INSTALL_DIR/"
    cp bgp_failover_api_v2.py "$INSTALL_DIR/"
    cp ne8000_nqa_integration.py "$INSTALL_DIR/"
    cp distributed_probes.py "$INSTALL_DIR/"
    cp telegram_notifier.py "$INSTALL_DIR/"
    cp latency_graphs.py "$INSTALL_DIR/"
    cp bgp_failover_cli_v2.py "$INSTALL_DIR/"
    
    # 6. Criar módulo de latência
    log_info "Instalando módulo de latência..."
    mkdir -p "$INSTALL_DIR/modules/latency"
    cp latency_module_example.py "$INSTALL_DIR/modules/latency/module.py"
    cat > "$INSTALL_DIR/modules/latency/config.json" << 'EOF'
{
  "enabled": true,
  "destinos": [
    {
      "nome": "AWS_SAO_PAULO",
      "ip": "52.67.0.1",
      "operadoras": ["operadora_1", "operadora_2", "operadora_3"]
    }
  ],
  "nqa": {
    "enabled": true,
    "frequency": 30
  },
  "probes": {
    "enabled": true,
    "timeout": 5
  }
}
EOF
    
    # 7. Instalar dependências Python
    log_info "Instalando dependências Python..."
    pip3 install --upgrade pip
    pip3 install \
        Flask==3.0.0 \
        Flask-CORS==4.0.0 \
        Paramiko==3.4.0 \
        requests==2.31.0 \
        prometheus-client==0.19.0 \
        matplotlib==3.8.0 \
        python-telegram-bot==20.3 \
        PyJWT==2.8.0 \
        tabulate==0.9.0
    
    # 8. Criar arquivo de configuração principal
    log_info "Criando configuração..."
    cat > "$CONFIG_DIR/platform_config.json" << 'EOF'
{
  "platform": {
    "name": "BGP Failover Monitoring Platform",
    "version": "2.0.0",
    "debug": false
  },
  "database": {
    "metrics_db": "/var/lib/bgp_failover/metrics.db",
    "auth_db": "/var/lib/bgp_failover/auth.db"
  },
  "modules": {
    "enabled": ["latency"],
    "disabled": []
  },
  "api": {
    "host": "0.0.0.0",
    "port": 5000,
    "debug": false
  }
}
EOF
    
    # 9. Criar arquivo de configuração NQA
    cat > "$CONFIG_DIR/nqa_config.json" << 'EOF'
{
  "ne8000": {
    "host": "192.168.0.1",
    "username": "admin",
    "key_filename": "/etc/bgp_failover/ne8000_key.pem"
  },
  "operadoras": {
    "operadora_1": {
      "source_ip": "192.168.1.2",
      "interface": "GigabitEthernet0/0/0"
    },
    "operadora_2": {
      "source_ip": "192.168.2.2",
      "interface": "GigabitEthernet0/0/1"
    },
    "operadora_3": {
      "source_ip": "192.168.3.2",
      "interface": "GigabitEthernet0/0/2"
    }
  }
}
EOF
    
    # 10. Criar arquivo de configuração de Probes
    cat > "$CONFIG_DIR/probes_config.json" << 'EOF'
{
  "local_probes": [
    {
      "name": "local_op1",
      "source_ip": "192.168.1.2"
    },
    {
      "name": "local_op2",
      "source_ip": "192.168.2.2"
    },
    {
      "name": "local_op3",
      "source_ip": "192.168.3.2"
    }
  ],
  "remote_probes": []
}
EOF
    
    # 11. Criar arquivo de configuração Telegram
    cat > "$CONFIG_DIR/telegram.json" << 'EOF'
{
  "bot_token": "SEU_BOT_TOKEN_AQUI",
  "chat_id": "SEU_CHAT_ID_AQUI",
  "enabled": false
}
EOF
    
    # 12. Definir permissões
    log_info "Definindo permissões..."
    chown -R "$USER:$GROUP" "$INSTALL_DIR"
    chown -R "$USER:$GROUP" "$CONFIG_DIR"
    chown -R "$USER:$GROUP" "$DATA_DIR"
    
    chmod 750 "$INSTALL_DIR"
    chmod 750 "$CONFIG_DIR"
    chmod 750 "$DATA_DIR"
    chmod 600 "$CONFIG_DIR"/*.json
    
    # 13. Criar serviço systemd
    log_info "Criando serviço systemd..."
    cat > "/etc/systemd/system/bgp-failover-api.service" << EOF
[Unit]
Description=BGP Failover Monitoring Platform API
After=network.target

[Service]
Type=simple
User=$USER
Group=$GROUP
WorkingDirectory=$INSTALL_DIR
ExecStart=/usr/bin/python3 $INSTALL_DIR/bgp_failover_api_v2.py
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF
    
    # 14. Habilitar e iniciar serviço
    log_info "Habilitando serviço..."
    systemctl daemon-reload
    systemctl enable bgp-failover-api.service
    
    # 15. Criar script CLI
    log_info "Criando CLI..."
    cat > "/usr/local/bin/bgp-failover" << 'EOF'
#!/bin/bash
cd /opt/bgp_failover
python3 bgp_failover_cli_v2.py "$@"
EOF
    chmod +x "/usr/local/bin/bgp-failover"
    
    # 16. Criar arquivo de log
    log_info "Criando arquivo de log..."
    touch "$INSTALL_DIR/logs/bgp_failover.log"
    chown "$USER:$GROUP" "$INSTALL_DIR/logs/bgp_failover.log"
    
    # Sucesso
    log_info "=============================================="
    log_info "Instalação concluída com sucesso!"
    log_info ""
    log_info "Próximos passos:"
    log_info "1. Editar configuração:"
    log_info "   sudo nano $CONFIG_DIR/nqa_config.json"
    log_info "   sudo nano $CONFIG_DIR/telegram.json"
    log_info ""
    log_info "2. Iniciar serviço:"
    log_info "   sudo systemctl start bgp-failover-api.service"
    log_info ""
    log_info "3. Verificar status:"
    log_info "   sudo systemctl status bgp-failover-api.service"
    log_info ""
    log_info "4. Acessar API:"
    log_info "   http://localhost:5000/api/v2/health"
    log_info ""
    log_info "5. Usar CLI:"
    log_info "   bgp-failover --help"
    log_info ""
    log_info "Documentação: /opt/bgp_failover/docs/"
}

# Executar
main "$@"
