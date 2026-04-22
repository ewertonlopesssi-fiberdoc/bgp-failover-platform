# Guia de Instalação - BGP Failover Platform

## 🚀 Instalação Rápida (Recomendado)

### Opção 1: Copiar e Colar (Mais Fácil)

Se você está em um servidor Debian/Ubuntu com acesso SSH, copie e cole este comando:

```bash
sudo bash <(wget -qO - https://raw.githubusercontent.com/ewertonlopesssi-fiberdoc/bgp-failover-platform/main/scripts/quick_install.sh)
```

Ou com curl:

```bash
sudo bash <(curl -fsSL https://raw.githubusercontent.com/ewertonlopesssi-fiberdoc/bgp-failover-platform/main/scripts/quick_install.sh)
```

**Isso vai:**
- ✅ Instalar Git, wget, curl
- ✅ Clonar o repositório
- ✅ Instalar todas as dependências
- ✅ Configurar o serviço systemd
- ✅ Oferecer menu interativo

---

## 📥 Instalação Manual

Se o comando acima não funcionar, siga estes passos:

### Passo 1: Instalar Ferramentas Básicas

```bash
sudo apt-get update
sudo apt-get install -y wget curl git
```

### Passo 2: Clonar Repositório

```bash
git clone https://github.com/ewertonlopesssi-fiberdoc/bgp-failover-platform.git
cd bgp-failover-platform
```

### Passo 3: Executar Instalador

```bash
sudo bash scripts/install_debian.sh
```

### Passo 4: Configurar (Interativo)

```bash
sudo bash scripts/post_install.sh
```

---

## 🔧 Configuração Pós-Instalação

Após a instalação, você verá um menu interativo com as seguintes opções:

```
1) 🔧 Configurar Ne8000 (NQA)
2) 💬 Configurar Telegram (Notificações)
3) ▶️  Iniciar Serviço
4) 📊 Verificar Status
5) 🧪 Testar Conexão API
6) 👤 Gerenciar Usuários
7) 📖 Ver Documentação
8) 🚀 Executar Tudo (Recomendado)
9) ❌ Sair
```

**Recomendação:** Escolha a opção **8** para executar tudo automaticamente.

---

## 📋 Requisitos Mínimos

- **Sistema:** Debian 10+ ou Ubuntu 18.04+
- **Acesso:** Root ou sudo
- **Rede:** Conexão com internet para clonar repositório
- **Espaço:** ~500MB livres

---

## ✅ Verificação Pós-Instalação

### 1. Verificar Serviço

```bash
sudo systemctl status bgp-failover-api.service
```

Deve mostrar: `active (running)`

### 2. Testar API

```bash
curl http://localhost:5000/api/v2/health
```

Deve retornar: `{"status":"ok"}`

### 3. Login Padrão

```bash
curl -X POST http://localhost:5000/api/v2/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'
```

Deve retornar um token JWT.

---

## 🔐 Configuração do Ne8000

### Arquivo de Configuração

```bash
sudo nano /etc/bgp_failover/nqa_config.json
```

### Exemplo de Configuração

```json
{
  "ne8000": {
    "host": "192.168.0.1",
    "username": "admin",
    "key_filename": "/etc/bgp_failover/ne8000_key.pem",
    "port": 22
  },
  "operadoras": {
    "operadora_1": {
      "source_ip": "192.168.1.2",
      "interface": "GigabitEthernet0/0/0",
      "bgp_peer": "192.168.1.1"
    },
    "operadora_2": {
      "source_ip": "192.168.2.2",
      "interface": "GigabitEthernet0/0/1",
      "bgp_peer": "192.168.2.1"
    },
    "operadora_3": {
      "source_ip": "192.168.3.2",
      "interface": "GigabitEthernet0/0/2",
      "bgp_peer": "192.168.3.1"
    }
  }
}
```

### Gerar Chave SSH

Se ainda não tiver chave SSH:

```bash
ssh-keygen -t ed25519 -f /etc/bgp_failover/ne8000_key.pem -N ""
```

Copie a chave pública para o Ne8000:

```bash
cat /etc/bgp_failover/ne8000_key.pem.pub
```

---

## 💬 Configuração do Telegram (Opcional)

### Arquivo de Configuração

```bash
sudo nano /etc/bgp_failover/telegram.json
```

### Como Obter Token e Chat ID

1. Abra o Telegram e procure por **@BotFather**
2. Envie `/newbot` e siga as instruções
3. Copie o **TOKEN** fornecido
4. Abra um chat com seu bot
5. Envie uma mensagem
6. Acesse: `https://api.telegram.org/bot<TOKEN>/getUpdates`
7. Copie o **chat_id** da resposta

### Exemplo de Configuração

```json
{
  "bot_token": "123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11",
  "chat_id": "987654321",
  "enabled": true
}
```

---

## 🛠️ Gerenciamento do Serviço

### Iniciar

```bash
sudo systemctl start bgp-failover-api.service
```

### Parar

```bash
sudo systemctl stop bgp-failover-api.service
```

### Reiniciar

```bash
sudo systemctl restart bgp-failover-api.service
```

### Status

```bash
sudo systemctl status bgp-failover-api.service
```

### Logs

```bash
sudo journalctl -u bgp-failover-api.service -f
```

### Ativar no Boot

```bash
sudo systemctl enable bgp-failover-api.service
```

---

## 📊 Diretórios Importantes

| Diretório | Descrição |
|-----------|-----------|
| `/opt/bgp_failover` | Código-fonte e módulos |
| `/etc/bgp_failover` | Configurações |
| `/var/lib/bgp_failover` | Banco de dados e dados |
| `/var/log/bgp_failover` | Logs (via journalctl) |

---

## 🐛 Troubleshooting

### Erro: "git: comando não encontrado"

```bash
sudo apt-get install -y git
```

### Erro: "curl: comando não encontrado"

```bash
sudo apt-get install -y curl wget
```

### Erro: "Python 3 não encontrado"

```bash
sudo apt-get install -y python3 python3-pip
```

### Serviço não inicia

```bash
# Ver erro
sudo journalctl -u bgp-failover-api.service -n 50

# Verificar permissões
ls -la /opt/bgp_failover/
ls -la /etc/bgp_failover/
```

### Erro de conexão ao Ne8000

```bash
# Testar SSH
ssh -i /etc/bgp_failover/ne8000_key.pem admin@192.168.0.1

# Verificar chave
ls -la /etc/bgp_failover/ne8000_key.pem
```

### Porta 5000 já em uso

```bash
# Ver o que está usando a porta
sudo lsof -i :5000

# Mudar porta (editar arquivo de serviço)
sudo nano /etc/systemd/system/bgp-failover-api.service
```

---

## 📞 Suporte

- 📖 [Documentação Completa](README.md)
- 🏗️ [Arquitetura](docs/ARQUITETURA_MODULAR.md)
- 🔌 [Desenvolvimento de Módulos](docs/MODULO_DESENVOLVIMENTO.md)
- 🐛 [Issues](https://github.com/ewertonlopesssi-fiberdoc/bgp-failover-platform/issues)

---

## 🎉 Próximos Passos

Após a instalação:

1. **Configurar Ne8000** - Editar `/etc/bgp_failover/nqa_config.json`
2. **Configurar Telegram** (opcional) - Editar `/etc/bgp_failover/telegram.json`
3. **Adicionar Clientes** - Via CLI ou API
4. **Adicionar Destinos** - Para monitoramento
5. **Criar Usuários** - Para acesso à API

---

**Tudo pronto! Sua plataforma de monitoramento está instalada! 🚀**
