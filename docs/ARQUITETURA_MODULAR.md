# Arquitetura Modular - BGP Failover Monitoring Platform

## 🏗️ Visão Geral

A plataforma foi refatorada para uma **arquitetura modular e escalável**, permitindo adicionar novos módulos de monitoramento sem modificar o código principal.

```
┌─────────────────────────────────────────────────────────────┐
│         BGP Failover Monitoring Platform v2.0               │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              API REST com Autenticação JWT          │   │
│  │  (bgp_failover_api_v2.py)                          │   │
│  └─────────────────────────────────────────────────────┘   │
│                          ↓                                  │
│  ┌─────────────────────────────────────────────────────┐   │
│  │        Module Manager (Gerenciador de Módulos)      │   │
│  │  (bgp_failover_platform.py)                        │   │
│  └─────────────────────────────────────────────────────┘   │
│           ↓              ↓              ↓                   │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐        │
│  │   Latency    │ │   Traffic    │ │   Switches   │ ...   │
│  │   Module     │ │   Module     │ │   Module     │        │
│  └──────────────┘ └──────────────┘ └──────────────┘        │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │    Metrics Storage (SQLite)                         │   │
│  │    Auth Manager (JWT)                              │   │
│  │    Platform Config                                 │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 📦 Componentes Principais

### 1. **bgp_failover_platform.py** - Core da Plataforma

Define as classes base para toda a plataforma:

#### `MonitoringModule` (Classe Base)
```python
class MonitoringModule(ABC):
    MODULE_NAME = "base_module"
    MODULE_VERSION = "1.0.0"
    MODULE_DESCRIPTION = "..."
    MODULE_CAPABILITIES = []
    
    @abstractmethod
    def initialize(self) -> bool:
        """Inicializa o módulo"""
        pass
    
    @abstractmethod
    def execute(self) -> Dict[str, Any]:
        """Executa monitoramento"""
        pass
    
    @abstractmethod
    def cleanup(self):
        """Limpa recursos"""
        pass
```

#### `ModuleManager`
- Carrega módulos do diretório `/opt/bgp_failover/modules/`
- Executa módulos sob demanda
- Gerencia ciclo de vida dos módulos

#### `MetricsStorage`
- Armazena métricas em SQLite
- Interface comum para todos os módulos
- Queries para análise histórica

#### `PlatformConfig`
- Gerencia configuração centralizada
- Suporta configuração por ponto (ex: `api.port`)

### 2. **auth_manager.py** - Autenticação

- Gerenciamento de usuários locais
- Hashing de senhas com PBKDF2
- Geração e verificação de JWT tokens
- Auditoria de login
- Suporte a múltiplos roles (admin, user, viewer)

### 3. **bgp_failover_api_v2.py** - API REST

Endpoints principais:

```
POST   /api/v2/auth/login              - Login
POST   /api/v2/auth/verify             - Verificar token
POST   /api/v2/auth/change-password    - Alterar senha

GET    /api/v2/modules                 - Listar módulos
POST   /api/v2/modules/<name>/execute  - Executar módulo
POST   /api/v2/modules/execute-all     - Executar todos

GET    /api/v2/metrics/<module>        - Obter métricas

GET    /api/v2/admin/users             - Listar usuários
POST   /api/v2/admin/users             - Criar usuário
GET    /api/v2/admin/audit-logs        - Logs de auditoria
```

---

## 🔌 Como Criar um Novo Módulo

### Passo 1: Criar Diretório

```bash
mkdir -p /opt/bgp_failover/modules/seu_modulo
```

### Passo 2: Criar `module.py`

```python
from bgp_failover_platform import MonitoringModule
from typing import Dict, Any

class SeuModulo(MonitoringModule):
    MODULE_NAME = "seu_modulo"
    MODULE_VERSION = "1.0.0"
    MODULE_DESCRIPTION = "Descrição do seu módulo"
    MODULE_AUTHOR = "Seu Nome"
    MODULE_CAPABILITIES = ['sua_capacidade']
    
    def initialize(self) -> bool:
        """Inicializa o módulo"""
        try:
            # Seu código de inicialização
            self.logger.info("Módulo inicializado")
            return True
        except Exception as e:
            self.logger.error(f"Erro: {e}")
            return False
    
    def execute(self) -> Dict[str, Any]:
        """Executa monitoramento"""
        try:
            # Seu código de monitoramento
            return {
                'status': 'success',
                'data': {
                    'metrica1': 100,
                    'metrica2': 200
                }
            }
        except Exception as e:
            return {
                'status': 'error',
                'message': str(e)
            }
    
    def cleanup(self):
        """Limpa recursos"""
        # Seu código de limpeza
        self.logger.info("Módulo finalizado")
```

### Passo 3: Criar `config.json`

```json
{
  "enabled": true,
  "parametro1": "valor1",
  "parametro2": 123
}
```

### Passo 4: Registrar Módulo

O `ModuleManager` carregará automaticamente quando a plataforma iniciar.

---

## 📚 Exemplos de Módulos

### Módulo de Latência (Incluído)

```
/opt/bgp_failover/modules/latency/
├── module.py
└── config.json
```

Monitora latência de destinos por operadora usando NQA e Probes.

### Módulo de Tráfego (Exemplo)

```python
class TrafficModule(MonitoringModule):
    MODULE_NAME = "traffic"
    MODULE_CAPABILITIES = ['traffic', 'bandwidth']
    
    def execute(self) -> Dict[str, Any]:
        # Coletar tráfego via SNMP
        # Retornar métricas
        pass
```

### Módulo de Switches (Exemplo)

```python
class SwitchesModule(MonitoringModule):
    MODULE_NAME = "switches"
    MODULE_CAPABILITIES = ['cpu', 'memory', 'ports']
    
    def execute(self) -> Dict[str, Any]:
        # Monitorar switches via SNMP
        # Retornar status
        pass
```

---

## 🔐 Autenticação e Autorização

### Fluxo de Login

```
1. Cliente envia POST /api/v2/auth/login
   {
     "username": "operador1",
     "password": "senha123"
   }

2. AuthManager valida credenciais

3. Se válido, gera JWT token
   {
     "token": "eyJ0eXAiOiJKV1QiLCJhbGc...",
     "expires_in": 86400
   }

4. Cliente armazena token

5. Cliente envia token em Authorization header
   Authorization: Bearer eyJ0eXAiOiJKV1QiLCJhbGc...

6. API valida token antes de processar requisição
```

### Criar Usuário

```bash
# Via API
curl -X POST http://localhost:5000/api/v2/admin/users \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "novo_usuario",
    "password": "senha123",
    "email": "usuario@example.com",
    "full_name": "Nome do Usuário",
    "role": "user"
  }'
```

---

## 📊 Armazenamento de Métricas

Todos os módulos podem armazenar métricas via `MetricsStorage`:

```python
def execute(self) -> Dict[str, Any]:
    # ... seu código ...
    
    # Armazenar métrica
    metrics_storage.store_metric(
        module='seu_modulo',
        metric_name='latencia',
        metric_value=45.2,
        metric_label='AWS_SAO_PAULO',
        tags={'operadora': 'op1', 'cliente': 'cliente_a'}
    )
    
    return result
```

Consultar métricas:

```bash
curl -X GET "http://localhost:5000/api/v2/metrics/seu_modulo?metric_name=latencia&hours=24" \
  -H "Authorization: Bearer $TOKEN"
```

---

## 🚀 Instalação em Debian

### Instalação Automática

```bash
sudo bash install_debian.sh
```

### Instalação Manual

```bash
# 1. Instalar dependências
sudo apt-get update
sudo apt-get install -y python3 python3-pip git

# 2. Clonar repositório
git clone https://seu-repo.git /opt/bgp_failover
cd /opt/bgp_failover

# 3. Instalar dependências Python
pip3 install -r requirements.txt

# 4. Criar diretórios
sudo mkdir -p /etc/bgp_failover
sudo mkdir -p /var/lib/bgp_failover

# 5. Copiar configuração
sudo cp config.json /etc/bgp_failover/

# 6. Iniciar serviço
python3 bgp_failover_api_v2.py
```

---

## 🔄 Ciclo de Vida de um Módulo

```
1. LOAD (Carregamento)
   └─ ModuleManager descobre módulo em /opt/bgp_failover/modules/
   └─ Carrega arquivo module.py
   └─ Instancia classe que herda de MonitoringModule

2. INITIALIZE (Inicialização)
   └─ Módulo chama initialize()
   └─ Conecta a recursos (BD, APIs, etc)
   └─ Retorna True se sucesso

3. EXECUTE (Execução)
   └─ Módulo chama execute()
   └─ Coleta dados
   └─ Armazena métricas
   └─ Retorna resultados

4. CLEANUP (Limpeza)
   └─ Módulo chama cleanup()
   └─ Fecha conexões
   └─ Libera recursos
```

---

## 📈 Escalabilidade

### Adicionar Novo Tipo de Monitoramento

```
Novo Requisito: Monitorar CPU de servidores

1. Criar módulo
   /opt/bgp_failover/modules/servers/module.py

2. Implementar ServerMonitoringModule

3. Configurar
   /opt/bgp_failover/modules/servers/config.json

4. Reiniciar API
   systemctl restart bgp-failover-api.service

5. Usar via API
   POST /api/v2/modules/servers/execute
```

### Múltiplas Instâncias

Você pode rodar múltiplas instâncias da API em diferentes portas:

```bash
# Instância 1 (porta 5000)
python3 bgp_failover_api_v2.py

# Instância 2 (porta 5001)
export API_PORT=5001
python3 bgp_failover_api_v2.py
```

---

## 🔍 Monitoramento da Plataforma

### Health Check

```bash
curl http://localhost:5000/api/v2/health
```

### Logs

```bash
# Logs da API
tail -f /opt/bgp_failover/logs/bgp_failover.log

# Logs do systemd
journalctl -u bgp-failover-api.service -f
```

### Métricas

```bash
# Ver métricas armazenadas
sqlite3 /var/lib/bgp_failover/metrics.db \
  "SELECT * FROM metrics ORDER BY timestamp DESC LIMIT 10;"
```

---

## 🛠️ Troubleshooting

### Módulo não carrega

```bash
# Verificar permissões
ls -la /opt/bgp_failover/modules/seu_modulo/

# Verificar sintaxe Python
python3 -m py_compile /opt/bgp_failover/modules/seu_modulo/module.py

# Ver logs
journalctl -u bgp-failover-api.service -n 50
```

### Erro de autenticação

```bash
# Resetar senha do admin
sqlite3 /var/lib/bgp_failover/auth.db \
  "UPDATE users SET password_hash='...' WHERE username='admin';"
```

### Banco de dados corrompido

```bash
# Backup
cp /var/lib/bgp_failover/metrics.db /var/lib/bgp_failover/metrics.db.bak

# Recriar
rm /var/lib/bgp_failover/metrics.db
systemctl restart bgp-failover-api.service
```

---

## 📚 Referências

- [Documentação de Módulos](MODULO_DESENVOLVIMENTO.md)
- [API REST](API_DOCUMENTATION.md)
- [Autenticação](AUTENTICACAO.md)
