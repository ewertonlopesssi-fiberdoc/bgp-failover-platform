#!/bin/bash

###############################################################################
# BGP Failover Platform - Post Installation Setup
# Menu interativo para configuração pós-instalação
###############################################################################

set -e

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configurações
CONFIG_DIR="/etc/bgp_failover"
NQA_CONFIG="$CONFIG_DIR/nqa_config.json"
TELEGRAM_CONFIG="$CONFIG_DIR/telegram.json"
SERVICE_NAME="bgp-failover-api.service"

###############################################################################
# Funções Auxiliares
###############################################################################

print_header() {
    clear
    echo -e "${BLUE}"
    echo "╔════════════════════════════════════════════════════════════════╗"
    echo "║   BGP Failover Monitoring Platform - Configuração Pós-Inst.   ║"
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

pause_continue() {
    echo ""
    read -p "Pressione ENTER para continuar..."
}

###############################################################################
# Verificações Iniciais
###############################################################################

check_installation() {
    print_section "Verificando instalação..."
    
    if ! command -v python3 &> /dev/null; then
        print_error "Python 3 não encontrado!"
        exit 1
    fi
    print_success "Python 3 encontrado"
    
    if [ ! -d "$CONFIG_DIR" ]; then
        print_error "Diretório de configuração não encontrado: $CONFIG_DIR"
        exit 1
    fi
    print_success "Diretório de configuração encontrado"
    
    if [ ! -f "$NQA_CONFIG" ]; then
        print_error "Arquivo de configuração NQA não encontrado: $NQA_CONFIG"
        exit 1
    fi
    print_success "Arquivo de configuração NQA encontrado"
}

###############################################################################
# Menu Principal
###############################################################################

show_main_menu() {
    print_header
    echo -e "${YELLOW}Escolha uma opção:${NC}\n"
    echo "  1) 🔧 Configurar Ne8000 (NQA)"
    echo "  2) 💬 Configurar Telegram (Notificações)"
    echo "  3) ▶️  Iniciar Serviço"
    echo "  4) 📊 Verificar Status"
    echo "  5) 🧪 Testar Conexão API"
    echo "  6) 👤 Gerenciar Usuários"
    echo "  7) 📖 Ver Documentação"
    echo "  8) 🚀 Executar Tudo (Recomendado)"
    echo "  9) ❌ Sair"
    echo ""
    read -p "Opção: " option
}

###############################################################################
# Configuração do Ne8000
###############################################################################

configure_ne8000() {
    print_header
    print_section "Configuração do Ne8000 (NQA)"
    
    echo -e "\n${YELLOW}Preencha os dados de conexão ao Ne8000:${NC}\n"
    
    read -p "IP do Ne8000 (padrão: 192.168.0.1): " ne8000_host
    ne8000_host=${ne8000_host:-192.168.0.1}
    
    read -p "Usuário SSH (padrão: admin): " ne8000_user
    ne8000_user=${ne8000_user:-admin}
    
    read -p "Caminho da chave SSH (padrão: /etc/bgp_failover/ne8000_key.pem): " ne8000_key
    ne8000_key=${ne8000_key:-/etc/bgp_failover/ne8000_key.pem}
    
    if [ ! -f "$ne8000_key" ]; then
        print_warning "Arquivo de chave SSH não encontrado: $ne8000_key"
        read -p "Deseja gerar uma nova chave? (s/n): " gen_key
        if [ "$gen_key" = "s" ]; then
            ssh-keygen -t ed25519 -f "$ne8000_key" -N ""
            print_success "Chave SSH gerada: $ne8000_key"
            print_warning "Adicione a chave pública ao Ne8000:"
            cat "$ne8000_key.pub"
            pause_continue
        fi
    else
        print_success "Chave SSH encontrada"
    fi
    
    echo -e "\n${YELLOW}Configurar Operadoras:${NC}\n"
    
    # Operadora 1
    read -p "IP de origem Operadora 1 (padrão: 192.168.1.2): " op1_ip
    op1_ip=${op1_ip:-192.168.1.2}
    
    read -p "Interface Operadora 1 (padrão: GigabitEthernet0/0/0): " op1_iface
    op1_iface=${op1_iface:-GigabitEthernet0/0/0}
    
    # Operadora 2
    read -p "IP de origem Operadora 2 (padrão: 192.168.2.2): " op2_ip
    op2_ip=${op2_ip:-192.168.2.2}
    
    read -p "Interface Operadora 2 (padrão: GigabitEthernet0/0/1): " op2_iface
    op2_iface=${op2_iface:-GigabitEthernet0/0/1}
    
    # Operadora 3
    read -p "IP de origem Operadora 3 (padrão: 192.168.3.2): " op3_ip
    op3_ip=${op3_ip:-192.168.3.2}
    
    read -p "Interface Operadora 3 (padrão: GigabitEthernet0/0/2): " op3_iface
    op3_iface=${op3_iface:-GigabitEthernet0/0/2}
    
    # Atualizar arquivo de configuração
    python3 << EOF
import json

config = {
    "ne8000": {
        "host": "$ne8000_host",
        "username": "$ne8000_user",
        "password": "",
        "key_filename": "$ne8000_key",
        "port": 22
    },
    "operadoras": {
        "operadora_1": {
            "source_ip": "$op1_ip",
            "interface": "$op1_iface",
            "bgp_peer": "$op1_ip"
        },
        "operadora_2": {
            "source_ip": "$op2_ip",
            "interface": "$op2_iface",
            "bgp_peer": "$op2_ip"
        },
        "operadora_3": {
            "source_ip": "$op3_ip",
            "interface": "$op3_iface",
            "bgp_peer": "$op3_ip"
        }
    }
}

with open("$NQA_CONFIG", "w") as f:
    json.dump(config, f, indent=2)
EOF
    
    print_success "Configuração do Ne8000 salva!"
    pause_continue
}

###############################################################################
# Configuração do Telegram
###############################################################################

configure_telegram() {
    print_header
    print_section "Configuração do Telegram (Notificações)"
    
    echo -e "\n${YELLOW}Para habilitar notificações via Telegram:${NC}\n"
    echo "1. Abra o Telegram e procure por @BotFather"
    echo "2. Envie /newbot e siga as instruções"
    echo "3. Copie o TOKEN fornecido"
    echo "4. Abra um chat com seu bot"
    echo "5. Envie uma mensagem"
    echo "6. Acesse: https://api.telegram.org/bot<TOKEN>/getUpdates"
    echo "7. Copie o 'chat_id' da resposta"
    echo ""
    
    read -p "Deseja configurar Telegram agora? (s/n): " setup_telegram
    
    if [ "$setup_telegram" = "s" ]; then
        read -p "TOKEN do Bot: " bot_token
        read -p "Chat ID: " chat_id
        
        python3 << EOF
import json

config = {
    "bot_token": "$bot_token",
    "chat_id": "$chat_id",
    "enabled": true
}

with open("$TELEGRAM_CONFIG", "w") as f:
    json.dump(config, f, indent=2)
EOF
        
        print_success "Configuração do Telegram salva!"
    else
        print_info "Telegram desabilitado"
    fi
    
    pause_continue
}

###############################################################################
# Iniciar Serviço
###############################################################################

start_service() {
    print_header
    print_section "Iniciando Serviço"
    
    echo -e "\n${YELLOW}Iniciando bgp-failover-api...${NC}\n"
    
    if sudo systemctl start "$SERVICE_NAME" 2>/dev/null; then
        print_success "Serviço iniciado com sucesso!"
        sleep 2
    else
        print_error "Erro ao iniciar serviço"
        pause_continue
        return
    fi
    
    # Aguardar API estar pronta
    echo -e "\n${BLUE}Aguardando API ficar pronta...${NC}"
    for i in {1..10}; do
        if curl -s http://localhost:5000/api/v2/health &>/dev/null; then
            print_success "API está pronta!"
            break
        fi
        echo -n "."
        sleep 1
    done
    
    pause_continue
}

###############################################################################
# Verificar Status
###############################################################################

check_status() {
    print_header
    print_section "Status do Serviço"
    
    echo ""
    sudo systemctl status "$SERVICE_NAME" --no-pager
    
    echo -e "\n${BLUE}Verificando API...${NC}"
    if curl -s http://localhost:5000/api/v2/health &>/dev/null; then
        print_success "API está respondendo"
        
        echo -e "\n${BLUE}Testando login...${NC}"
        response=$(curl -s -X POST http://localhost:5000/api/v2/auth/login \
            -H "Content-Type: application/json" \
            -d '{"username":"admin","password":"admin123"}')
        
        if echo "$response" | grep -q "token"; then
            print_success "Login funcionando"
        else
            print_error "Erro ao fazer login"
        fi
    else
        print_error "API não está respondendo"
    fi
    
    pause_continue
}

###############################################################################
# Testar Conexão API
###############################################################################

test_api() {
    print_header
    print_section "Teste de Conexão API"
    
    echo -e "\n${BLUE}Testando endpoints...${NC}\n"
    
    # Health check
    echo -n "Health check... "
    if curl -s http://localhost:5000/api/v2/health &>/dev/null; then
        print_success "OK"
    else
        print_error "FALHOU"
    fi
    
    # Login
    echo -n "Login... "
    TOKEN=$(curl -s -X POST http://localhost:5000/api/v2/auth/login \
        -H "Content-Type: application/json" \
        -d '{"username":"admin","password":"admin123"}' | grep -o '"token":"[^"]*' | cut -d'"' -f4)
    
    if [ -n "$TOKEN" ]; then
        print_success "OK"
    else
        print_error "FALHOU"
        pause_continue
        return
    fi
    
    # Listar módulos
    echo -n "Listar módulos... "
    if curl -s -X GET http://localhost:5000/api/v2/modules \
        -H "Authorization: Bearer $TOKEN" | grep -q "latency"; then
        print_success "OK"
    else
        print_error "FALHOU"
    fi
    
    # Executar módulo
    echo -n "Executar módulo de latência... "
    if curl -s -X POST http://localhost:5000/api/v2/modules/latency/execute \
        -H "Authorization: Bearer $TOKEN" | grep -q "success"; then
        print_success "OK"
    else
        print_error "FALHOU"
    fi
    
    echo -e "\n${GREEN}Testes concluídos!${NC}"
    pause_continue
}

###############################################################################
# Gerenciar Usuários
###############################################################################

manage_users() {
    print_header
    print_section "Gerenciar Usuários"
    
    echo -e "\n${YELLOW}Opções:${NC}\n"
    echo "1) Criar novo usuário"
    echo "2) Alterar senha do admin"
    echo "3) Listar usuários"
    echo "4) Voltar"
    echo ""
    read -p "Opção: " user_option
    
    case $user_option in
        1)
            print_section "Criar Novo Usuário"
            
            TOKEN=$(curl -s -X POST http://localhost:5000/api/v2/auth/login \
                -H "Content-Type: application/json" \
                -d '{"username":"admin","password":"admin123"}' | grep -o '"token":"[^"]*' | cut -d'"' -f4)
            
            read -p "Username: " username
            read -p "Email: " email
            read -p "Nome completo: " fullname
            read -s -p "Senha: " password
            echo ""
            
            curl -s -X POST http://localhost:5000/api/v2/admin/users \
                -H "Authorization: Bearer $TOKEN" \
                -H "Content-Type: application/json" \
                -d "{\"username\":\"$username\",\"email\":\"$email\",\"full_name\":\"$fullname\",\"password\":\"$password\",\"role\":\"user\"}"
            
            print_success "Usuário criado!"
            ;;
        2)
            print_section "Alterar Senha do Admin"
            
            TOKEN=$(curl -s -X POST http://localhost:5000/api/v2/auth/login \
                -H "Content-Type: application/json" \
                -d '{"username":"admin","password":"admin123"}' | grep -o '"token":"[^"]*' | cut -d'"' -f4)
            
            read -s -p "Senha atual: " old_pass
            echo ""
            read -s -p "Nova senha: " new_pass
            echo ""
            
            curl -s -X POST http://localhost:5000/api/v2/auth/change-password \
                -H "Authorization: Bearer $TOKEN" \
                -H "Content-Type: application/json" \
                -d "{\"old_password\":\"$old_pass\",\"new_password\":\"$new_pass\"}"
            
            print_success "Senha alterada!"
            ;;
        3)
            print_section "Listar Usuários"
            
            TOKEN=$(curl -s -X POST http://localhost:5000/api/v2/auth/login \
                -H "Content-Type: application/json" \
                -d '{"username":"admin","password":"admin123"}' | grep -o '"token":"[^"]*' | cut -d'"' -f4)
            
            curl -s -X GET http://localhost:5000/api/v2/admin/users \
                -H "Authorization: Bearer $TOKEN" | python3 -m json.tool
            ;;
    esac
    
    pause_continue
}

###############################################################################
# Ver Documentação
###############################################################################

show_documentation() {
    print_header
    print_section "Documentação"
    
    echo -e "\n${YELLOW}Documentos disponíveis:${NC}\n"
    echo "1) README - Visão geral do projeto"
    echo "2) Arquitetura Modular - Como o sistema funciona"
    echo "3) Desenvolvimento de Módulos - Como criar novos módulos"
    echo "4) API REST - Referência de endpoints"
    echo "5) Voltar"
    echo ""
    read -p "Opção: " doc_option
    
    case $doc_option in
        1)
            less /opt/bgp_failover/README.md
            ;;
        2)
            less /opt/bgp_failover/docs/ARQUITETURA_MODULAR.md
            ;;
        3)
            less /opt/bgp_failover/docs/MODULO_DESENVOLVIMENTO.md
            ;;
        4)
            echo "Documentação de API em breve..."
            pause_continue
            ;;
    esac
}

###############################################################################
# Executar Tudo
###############################################################################

run_all() {
    print_header
    print_section "Configuração Completa"
    
    echo -e "\n${YELLOW}Isso vai executar todas as etapas de configuração.${NC}\n"
    read -p "Continuar? (s/n): " confirm
    
    if [ "$confirm" != "s" ]; then
        return
    fi
    
    configure_ne8000
    configure_telegram
    start_service
    check_status
    test_api
    
    print_header
    print_success "Configuração concluída com sucesso!"
    echo -e "\n${BLUE}Próximos passos:${NC}"
    echo "1. Acessar API: http://localhost:5000"
    echo "2. Usuário: admin"
    echo "3. Senha: admin123"
    echo ""
    echo "Documentação: /opt/bgp_failover/README.md"
    echo ""
    pause_continue
}

###############################################################################
# Loop Principal
###############################################################################

main() {
    check_installation
    
    while true; do
        show_main_menu
        
        case $option in
            1) configure_ne8000 ;;
            2) configure_telegram ;;
            3) start_service ;;
            4) check_status ;;
            5) test_api ;;
            6) manage_users ;;
            7) show_documentation ;;
            8) run_all ;;
            9) 
                print_header
                print_success "Até logo!"
                exit 0
                ;;
            *)
                print_error "Opção inválida!"
                pause_continue
                ;;
        esac
    done
}

# Executar
main
