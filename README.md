# BGP Failover Monitoring Platform

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Python 3.8+](https://img.shields.io/badge/python-3.8+-blue.svg)](https://www.python.org/downloads/)
[![Debian/Ubuntu](https://img.shields.io/badge/OS-Debian%2FUbuntu-red.svg)](https://www.debian.org/)

Plataforma modular e escalável para monitoramento de latência, tráfego e failover automático em redes com múltiplas operadoras.

## 🎯 Características Principais

- **Monitoramento de Latência** por operadora com NQA nativo do Huawei Ne8000
- **Failover Automático** com alteração dinâmica de AS-Path Prepend
- **Arquitetura Modular** - Adicione novos módulos de monitoramento facilmente
- **Autenticação JWT** - Segurança com usuários locais
- **API REST** - Integração com sistemas externos
- **Métricas Persistentes** - Banco de dados SQLite
- **Notificações Telegram** - Alertas em tempo real
- **Gráficos de Latência** - Visualização de tendências
- **Instalação Automática** - Script para Debian/Ubuntu

## 🚀 Quick Start

### Instalação em 3 Passos

```bash
# 1. Clonar repositório
git clone https://github.com/seu-usuario/bgp-failover-platform.git
cd bgp-failover-platform

# 2. Executar instalador (requer sudo)
sudo bash scripts/install_debian.sh

# 3. Editar configuração
sudo nano /etc/bgp_failover/nqa_config.json
```

### Primeiro Login

```bash
# Usuário padrão: admin / admin123
curl -X POST http://localhost:5000/api/v2/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'
```

## 📋 Requisitos

- **Sistema Operacional:** Debian 10+ ou Ubuntu 18.04+
- **Python:** 3.8+
- **Roteador:** Huawei Ne8000 M4 (com BGP e NQA)
- **Acesso SSH:** Ao Ne8000 para NQA

## 📦 Instalação Completa

### Opção 1: Instalação Automática (Recomendado)

```bash
sudo bash scripts/install_debian.sh
```

O script irá:
- ✅ Instalar dependências do sistema
- ✅ Criar usuário do serviço
- ✅ Configurar diretórios
- ✅ Instalar dependências Python
- ✅ Criar serviço systemd
- ✅ Iniciar plataforma

### Opção 2: Instalação Manual

```bash
# 1. Atualizar sistema
sudo apt-get update && sudo apt-get upgrade -y

# 2. Instalar dependências
sudo apt-get install -y python3 python3-pip git curl

# 3. Clonar repositório
git clone https://github.com/seu-usuario/bgp-failover-platform.git
cd bgp-failover-platform

# 4. Instalar dependências Python
pip3 install -r requirements.txt

# 5. Criar diretórios
sudo mkdir -p /etc/bgp_failover /var/lib/bgp_failover

# 6. Copiar configuração
sudo cp config/*.json /etc/bgp_failover/

# 7. Iniciar API
python3 src/bgp_failover_api_v2.py
```

## 🔧 Configuração

### Configurar Ne8000

Editar `/etc/bgp_failover/nqa_config.json`:

```json
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
```

### Configurar Telegram (Opcional)

Editar `/etc/bgp_failover/telegram.json`:

```json
{
  "bot_token": "SEU_BOT_TOKEN",
  "chat_id": "SEU_CHAT_ID",
  "enabled": true
}
```

## 📚 Documentação

- [Arquitetura Modular](docs/ARQUITETURA_MODULAR.md)
- [Desenvolvimento de Módulos](docs/MODULO_DESENVOLVIMENTO.md)
- [API REST](docs/API_DOCUMENTATION.md)
- [Autenticação](docs/AUTENTICACAO.md)
- [Monitoramento de Latência](docs/MONITORAMENTO_LATENCIA.md)

## 🔌 Módulos Disponíveis

### Latency Module (Incluído)

Monitora latência de destinos por operadora usando NQA e Probes distribuídas.

```bash
curl -X POST http://localhost:5000/api/v2/modules/latency/execute \
  -H "Authorization: Bearer $TOKEN"
```

### Traffic Module (Exemplo)

Monitora tráfego via SNMP. Veja [módulo de exemplo](modules/traffic/).

### Switches Module (Exemplo)

Monitora status de switches. Veja [módulo de exemplo](modules/switches/).

## 📊 API REST

### Autenticação

```bash
# Login
curl -X POST http://localhost:5000/api/v2/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'

# Resposta
{
  "status": "success",
  "token": "eyJ0eXAiOiJKV1QiLCJhbGc...",
  "expires_in": 86400
}
```

### Módulos

```bash
# Listar módulos
curl -X GET http://localhost:5000/api/v2/modules \
  -H "Authorization: Bearer $TOKEN"

# Executar módulo
curl -X POST http://localhost:5000/api/v2/modules/latency/execute \
  -H "Authorization: Bearer $TOKEN"

# Executar todos
curl -X POST http://localhost:5000/api/v2/modules/execute-all \
  -H "Authorization: Bearer $TOKEN"
```

### Métricas

```bash
# Obter métricas
curl -X GET "http://localhost:5000/api/v2/metrics/latency?hours=24" \
  -H "Authorization: Bearer $TOKEN"
```

### Admin

```bash
# Listar usuários
curl -X GET http://localhost:5000/api/v2/admin/users \
  -H "Authorization: Bearer $TOKEN"

# Criar usuário
curl -X POST http://localhost:5000/api/v2/admin/users \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "operador1",
    "password": "senha123",
    "email": "operador@example.com",
    "full_name": "Operador 1",
    "role": "user"
  }'

# Logs de auditoria
curl -X GET http://localhost:5000/api/v2/admin/audit-logs \
  -H "Authorization: Bearer $TOKEN"
```

## 🛠️ Gerenciamento

### Iniciar/Parar Serviço

```bash
# Iniciar
sudo systemctl start bgp-failover-api.service

# Parar
sudo systemctl stop bgp-failover-api.service

# Status
sudo systemctl status bgp-failover-api.service

# Logs
sudo journalctl -u bgp-failover-api.service -f
```

### CLI

```bash
# Listar clientes
bgp-failover list-clientes

# Adicionar cliente
bgp-failover add-cliente

# Gerenciar destinos
bgp-failover manage-destinos --id cliente_a

# Listar usuários
bgp-failover admin list-users
```

## 🔌 Criar Novo Módulo

### Estrutura

```
modules/seu_modulo/
├── module.py
├── config.json
└── README.md
```

### Código Mínimo

```python
from bgp_failover_platform import MonitoringModule

class SeuModulo(MonitoringModule):
    MODULE_NAME = "seu_modulo"
    MODULE_VERSION = "1.0.0"
    MODULE_DESCRIPTION = "Descrição"
    MODULE_CAPABILITIES = ['sua_capacidade']
    
    def initialize(self) -> bool:
        return True
    
    def execute(self) -> Dict[str, Any]:
        return {'status': 'success', 'data': {}}
    
    def cleanup(self):
        pass
```

Veja [Guia de Desenvolvimento](docs/MODULO_DESENVOLVIMENTO.md) para mais detalhes.

## 🐛 Troubleshooting

### Erro ao conectar ao Ne8000

```bash
# Testar SSH
ssh -i /etc/bgp_failover/ne8000_key.pem admin@192.168.0.1

# Verificar chave
ls -la /etc/bgp_failover/ne8000_key.pem
```

### Módulo não carrega

```bash
# Verificar sintaxe
python3 -m py_compile modules/seu_modulo/module.py

# Ver logs
sudo journalctl -u bgp-failover-api.service -n 50
```

### Erro de autenticação

```bash
# Resetar senha admin
sqlite3 /var/lib/bgp_failover/auth.db \
  "SELECT * FROM users;"
```

## 📈 Performance

- **Latência de teste:** ~2 segundos
- **Armazenamento de métricas:** ~1MB por 1000 medições
- **Conexões simultâneas:** 100+
- **Módulos:** Até 50 módulos simultâneos

## 🔒 Segurança

- ✅ Autenticação JWT em todos os endpoints
- ✅ Hashing de senhas com PBKDF2
- ✅ Auditoria de login
- ✅ Suporte a múltiplos roles
- ✅ Chave SSH para Ne8000
- ✅ Arquivo de configuração protegido (600)

## 📝 Licença

MIT License - veja [LICENSE](LICENSE) para detalhes.

## 🤝 Contribuindo

Contribuições são bem-vindas! Por favor:

1. Fork o projeto
2. Crie uma branch para sua feature (`git checkout -b feature/AmazingFeature`)
3. Commit suas mudanças (`git commit -m 'Add some AmazingFeature'`)
4. Push para a branch (`git push origin feature/AmazingFeature`)
5. Abra um Pull Request

## 📞 Suporte

- 📖 [Documentação](docs/)
- 🐛 [Issues](https://github.com/seu-usuario/bgp-failover-platform/issues)
- 💬 [Discussões](https://github.com/seu-usuario/bgp-failover-platform/discussions)

## 🙏 Agradecimentos

- Huawei por NQA nativo no Ne8000
- Comunidade open-source Python
- Todos os contribuidores

## 📊 Status

- ✅ v2.0.0 - Arquitetura modular com autenticação
- 🔄 v2.1.0 - Dashboard web
- 🔄 v2.2.0 - Módulo de tráfego
- 🔄 v2.3.0 - Módulo de switches

---

**Desenvolvido com ❤️ para ISPs e provedores de internet**
