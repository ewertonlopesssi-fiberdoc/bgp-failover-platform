# Guia de Desenvolvimento de Módulos

## 📋 Índice

1. [Estrutura de um Módulo](#estrutura-de-um-módulo)
2. [Classe Base MonitoringModule](#classe-base-monitoringmodule)
3. [Exemplos Práticos](#exemplos-práticos)
4. [Integração com Métricas](#integração-com-métricas)
5. [Testes](#testes)
6. [Publicação](#publicação)

---

## 🏗️ Estrutura de um Módulo

Cada módulo deve ter a seguinte estrutura:

```
/opt/bgp_failover/modules/seu_modulo/
├── module.py                 # Implementação do módulo
├── config.json              # Configuração padrão
├── README.md                # Documentação
└── requirements.txt         # Dependências (opcional)
```

### Exemplo de Estrutura

```bash
mkdir -p /opt/bgp_failover/modules/meu_modulo
cd /opt/bgp_failover/modules/meu_modulo

# Criar arquivos
touch module.py config.json README.md
```

---

## 🔌 Classe Base MonitoringModule

### Atributos Obrigatórios

```python
class MeuModulo(MonitoringModule):
    # Metadados (OBRIGATÓRIO)
    MODULE_NAME = "meu_modulo"           # Identificador único
    MODULE_VERSION = "1.0.0"             # Versão semântica
    MODULE_DESCRIPTION = "..."           # Descrição curta
    MODULE_AUTHOR = "Seu Nome"           # Autor
    MODULE_CAPABILITIES = ['cap1', 'cap2']  # Capacidades
```

### Métodos Obrigatórios

#### `initialize(self) -> bool`

Chamado quando o módulo é carregado. Deve:
- Conectar a recursos externos
- Validar configuração
- Retornar `True` se sucesso, `False` caso contrário

```python
def initialize(self) -> bool:
    try:
        # Conectar ao Ne8000
        self.manager = Ne8000Manager(self.config)
        if not self.manager.connect():
            self.logger.error("Falha ao conectar")
            return False
        
        self.logger.info("Módulo inicializado")
        return True
    except Exception as e:
        self.logger.error(f"Erro: {e}")
        return False
```

#### `execute(self) -> Dict[str, Any]`

Chamado para executar o monitoramento. Deve:
- Coletar dados
- Processar informações
- Retornar dicionário com resultados

```python
def execute(self) -> Dict[str, Any]:
    try:
        # Coletar dados
        dados = self.manager.collect_data()
        
        # Processar
        resultado = self.processar(dados)
        
        # Retornar
        return {
            'status': 'success',
            'data': resultado,
            'timestamp': datetime.now().isoformat()
        }
    except Exception as e:
        self.logger.error(f"Erro: {e}")
        return {
            'status': 'error',
            'message': str(e)
        }
```

#### `cleanup(self)`

Chamado quando o módulo é descarregado. Deve:
- Fechar conexões
- Liberar recursos
- Limpar arquivos temporários

```python
def cleanup(self):
    try:
        if self.manager:
            self.manager.disconnect()
        self.logger.info("Módulo finalizado")
    except Exception as e:
        self.logger.error(f"Erro ao limpar: {e}")
```

---

## 💡 Exemplos Práticos

### Exemplo 1: Módulo Simples (Hello World)

```python
# /opt/bgp_failover/modules/hello/module.py

from bgp_failover_platform import MonitoringModule
from typing import Dict, Any

class HelloModule(MonitoringModule):
    MODULE_NAME = "hello"
    MODULE_VERSION = "1.0.0"
    MODULE_DESCRIPTION = "Módulo Hello World"
    MODULE_AUTHOR = "Seu Nome"
    MODULE_CAPABILITIES = ['hello']
    
    def initialize(self) -> bool:
        self.logger.info("Hello module initialized")
        return True
    
    def execute(self) -> Dict[str, Any]:
        return {
            'status': 'success',
            'message': 'Hello, World!',
            'count': 42
        }
    
    def cleanup(self):
        self.logger.info("Hello module cleaned up")
```

**config.json:**
```json
{
  "enabled": true
}
```

### Exemplo 2: Módulo com Configuração

```python
# /opt/bgp_failover/modules/contador/module.py

from bgp_failover_platform import MonitoringModule
from typing import Dict, Any

class ContadorModule(MonitoringModule):
    MODULE_NAME = "contador"
    MODULE_VERSION = "1.0.0"
    MODULE_DESCRIPTION = "Módulo que conta até N"
    MODULE_AUTHOR = "Seu Nome"
    MODULE_CAPABILITIES = ['counting']
    
    def initialize(self) -> bool:
        self.max_count = self.config.get('max_count', 10)
        self.logger.info(f"Contador inicializado até {self.max_count}")
        return True
    
    def execute(self) -> Dict[str, Any]:
        numeros = list(range(1, self.max_count + 1))
        
        return {
            'status': 'success',
            'numeros': numeros,
            'total': len(numeros)
        }
    
    def cleanup(self):
        self.logger.info("Contador finalizado")
```

**config.json:**
```json
{
  "enabled": true,
  "max_count": 100
}
```

### Exemplo 3: Módulo com Banco de Dados

```python
# /opt/bgp_failover/modules/temperatura/module.py

from bgp_failover_platform import MonitoringModule, MetricsStorage
from typing import Dict, Any
import random

class TemperaturaModule(MonitoringModule):
    MODULE_NAME = "temperatura"
    MODULE_VERSION = "1.0.0"
    MODULE_DESCRIPTION = "Monitora temperatura de sensores"
    MODULE_AUTHOR = "Seu Nome"
    MODULE_CAPABILITIES = ['temperature']
    
    def initialize(self) -> bool:
        self.metrics = MetricsStorage()
        self.sensores = self.config.get('sensores', [])
        return True
    
    def execute(self) -> Dict[str, Any]:
        resultado = {
            'status': 'success',
            'sensores': {}
        }
        
        for sensor in self.sensores:
            # Simular leitura
            temp = random.uniform(20, 40)
            
            # Armazenar métrica
            self.metrics.store_metric(
                module='temperatura',
                metric_name='temperatura',
                metric_value=temp,
                metric_label=sensor,
                tags={'sensor': sensor}
            )
            
            resultado['sensores'][sensor] = {
                'temperatura': temp,
                'status': 'ok' if temp < 35 else 'warning'
            }
        
        return resultado
    
    def cleanup(self):
        self.logger.info("Módulo de temperatura finalizado")
```

**config.json:**
```json
{
  "enabled": true,
  "sensores": ["sensor_1", "sensor_2", "sensor_3"]
}
```

### Exemplo 4: Módulo de Tráfego (SNMP)

```python
# /opt/bgp_failover/modules/traffic/module.py

from bgp_failover_platform import MonitoringModule, MetricsStorage
from typing import Dict, Any
from pysnmp.hlapi import *

class TrafficModule(MonitoringModule):
    MODULE_NAME = "traffic"
    MODULE_VERSION = "1.0.0"
    MODULE_DESCRIPTION = "Monitora tráfego via SNMP"
    MODULE_AUTHOR = "Seu Nome"
    MODULE_CAPABILITIES = ['traffic', 'bandwidth']
    
    def initialize(self) -> bool:
        self.metrics = MetricsStorage()
        self.devices = self.config.get('devices', [])
        self.community = self.config.get('snmp_community', 'public')
        return True
    
    def execute(self) -> Dict[str, Any]:
        resultado = {
            'status': 'success',
            'devices': {}
        }
        
        for device in self.devices:
            try:
                traffic = self._get_traffic(device['ip'])
                
                # Armazenar métricas
                for iface, data in traffic.items():
                    self.metrics.store_metric(
                        module='traffic',
                        metric_name='bytes_in',
                        metric_value=data['in'],
                        metric_label=f"{device['name']}:{iface}",
                        tags={'device': device['name'], 'interface': iface}
                    )
                    
                    self.metrics.store_metric(
                        module='traffic',
                        metric_name='bytes_out',
                        metric_value=data['out'],
                        metric_label=f"{device['name']}:{iface}",
                        tags={'device': device['name'], 'interface': iface}
                    )
                
                resultado['devices'][device['name']] = traffic
            
            except Exception as e:
                self.logger.error(f"Erro ao coletar tráfego de {device['name']}: {e}")
                resultado['devices'][device['name']] = {'status': 'error'}
        
        return resultado
    
    def _get_traffic(self, ip: str) -> Dict:
        # Implementar coleta SNMP
        pass
    
    def cleanup(self):
        self.logger.info("Módulo de tráfego finalizado")
```

---

## 📊 Integração com Métricas

### Armazenar Métrica

```python
from bgp_failover_platform import MetricsStorage

metrics = MetricsStorage()

metrics.store_metric(
    module='seu_modulo',
    metric_name='latencia',
    metric_value=45.2,
    metric_label='AWS_SAO_PAULO',
    tags={'operadora': 'op1', 'cliente': 'cliente_a'}
)
```

### Consultar Métricas

```python
# Via API
GET /api/v2/metrics/seu_modulo?metric_name=latencia&hours=24

# Via Python
metrics = MetricsStorage()
dados = metrics.get_metrics('seu_modulo', 'latencia', hours=24)
```

---

## ✅ Testes

### Teste Local

```python
# teste_modulo.py

import logging
from seu_modulo.module import SeuModulo

logging.basicConfig(level=logging.INFO)

# Carregar configuração
config = {
    'enabled': True,
    'parametro1': 'valor1'
}

# Criar instância
modulo = SeuModulo(config)

# Testar inicialização
if modulo.initialize():
    print("✅ Inicialização OK")
    
    # Testar execução
    resultado = modulo.execute()
    print(f"Resultado: {resultado}")
    
    # Testar limpeza
    modulo.cleanup()
    print("✅ Limpeza OK")
else:
    print("❌ Erro na inicialização")
```

Executar:
```bash
python3 teste_modulo.py
```

### Teste via API

```bash
# Login
TOKEN=$(curl -s -X POST http://localhost:5000/api/v2/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}' | jq -r '.token')

# Executar módulo
curl -X POST http://localhost:5000/api/v2/modules/seu_modulo/execute \
  -H "Authorization: Bearer $TOKEN"

# Obter métricas
curl -X GET "http://localhost:5000/api/v2/metrics/seu_modulo" \
  -H "Authorization: Bearer $TOKEN"
```

---

## 📦 Publicação

### Estrutura Final

```
seu_modulo/
├── module.py
├── config.json
├── README.md
├── requirements.txt (opcional)
└── LICENSE
```

### README.md

```markdown
# Seu Módulo

## Descrição
Descrição do que o módulo faz.

## Instalação
```bash
cp -r seu_modulo /opt/bgp_failover/modules/
```

## Configuração
Editar `config.json`:
```json
{
  "enabled": true,
  "parametro1": "valor1"
}
```

## Uso
```bash
curl -X POST http://localhost:5000/api/v2/modules/seu_modulo/execute \
  -H "Authorization: Bearer $TOKEN"
```

## Métricas
- `metrica1`: Descrição
- `metrica2`: Descrição

## Autor
Seu Nome

## Licença
MIT
```

### Compartilhar Módulo

1. Criar repositório GitHub
2. Adicionar estrutura do módulo
3. Documentar bem
4. Publicar

---

## 🔍 Checklist de Desenvolvimento

- [ ] Classe herda de `MonitoringModule`
- [ ] Todos os atributos obrigatórios definidos
- [ ] Método `initialize()` implementado
- [ ] Método `execute()` implementado
- [ ] Método `cleanup()` implementado
- [ ] Arquivo `config.json` criado
- [ ] Arquivo `README.md` criado
- [ ] Logging implementado
- [ ] Tratamento de exceções
- [ ] Testes locais executados
- [ ] Testes via API executados
- [ ] Documentação completa

---

## 📚 Referências

- [Arquitetura Modular](ARQUITETURA_MODULAR.md)
- [API REST](API_DOCUMENTATION.md)
- [Exemplos de Módulos](../modules/)
