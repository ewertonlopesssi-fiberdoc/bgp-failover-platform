#!/usr/bin/env python3
"""
Módulo de Notificações via Telegram
Integração com Telegram Bot API para alertas de failover BGP
"""

import requests
import json
import logging
from datetime import datetime
from typing import Optional, List, Dict
from enum import Enum

logger = logging.getLogger(__name__)


class AlertLevel(Enum):
    """Níveis de severidade de alertas"""
    INFO = "ℹ️"
    WARNING = "⚠️"
    CRITICAL = "🚨"
    SUCCESS = "✅"
    ERROR = "❌"


class TelegramNotifier:
    """Gerenciador de notificações via Telegram"""
    
    def __init__(self, bot_token: str, chat_id: str):
        """
        Inicializa o notificador Telegram
        
        Args:
            bot_token: Token do bot Telegram (obtido via @BotFather)
            chat_id: ID do chat ou grupo onde enviar mensagens
        """
        self.bot_token = bot_token
        self.chat_id = chat_id
        self.base_url = f"https://api.telegram.org/bot{bot_token}"
        self.enabled = bool(bot_token and chat_id)
    
    def _send_message(self, text: str, parse_mode: str = "HTML") -> bool:
        """
        Envia mensagem via Telegram
        
        Args:
            text: Texto da mensagem
            parse_mode: Formato de parsing (HTML ou Markdown)
        
        Returns:
            True se enviado com sucesso, False caso contrário
        """
        if not self.enabled:
            logger.warning("Telegram não configurado")
            return False
        
        try:
            url = f"{self.base_url}/sendMessage"
            payload = {
                'chat_id': self.chat_id,
                'text': text,
                'parse_mode': parse_mode,
                'disable_web_page_preview': True
            }
            
            response = requests.post(url, json=payload, timeout=10)
            
            if response.status_code == 200:
                logger.info("Mensagem Telegram enviada com sucesso")
                return True
            else:
                logger.error(f"Erro ao enviar mensagem Telegram: {response.text}")
                return False
        
        except requests.exceptions.RequestException as e:
            logger.error(f"Erro de conexão ao enviar mensagem Telegram: {e}")
            return False
        except Exception as e:
            logger.error(f"Erro inesperado ao enviar mensagem Telegram: {e}")
            return False
    
    def notify_failover_triggered(self, cliente_id: str, cliente_nome: str, 
                                  operadora_id: str, operadora_nome: str,
                                  destino: str, latencia_ms: float,
                                  limite_ms: float) -> bool:
        """
        Notifica quando um failover é acionado
        
        Args:
            cliente_id: ID do cliente
            cliente_nome: Nome do cliente
            operadora_id: ID da operadora
            operadora_nome: Nome da operadora
            destino: Destino monitorado
            latencia_ms: Latência detectada
            limite_ms: Limite de latência
        
        Returns:
            True se enviado com sucesso
        """
        timestamp = datetime.now().strftime("%H:%M:%S")
        
        mensagem = f"""
{AlertLevel.CRITICAL.value} <b>FAILOVER ACIONADO</b>

<b>Horário:</b> {timestamp}
<b>Cliente:</b> {cliente_nome} (<code>{cliente_id}</code>)
<b>Operadora:</b> {operadora_nome} (<code>{operadora_id}</code>)
<b>Destino:</b> {destino}

<b>Latência Detectada:</b> {latencia_ms:.2f}ms
<b>Limite Configurado:</b> {limite_ms:.2f}ms
<b>Excesso:</b> {latencia_ms - limite_ms:.2f}ms ({((latencia_ms/limite_ms - 1) * 100):.1f}%)

<i>O tráfego do cliente foi desviado para operadora alternativa.</i>
"""
        return self._send_message(mensagem)
    
    def notify_failover_recovered(self, cliente_id: str, cliente_nome: str,
                                  operadora_id: str, operadora_nome: str,
                                  destino: str, latencia_ms: float) -> bool:
        """
        Notifica quando um failover é revertido
        
        Args:
            cliente_id: ID do cliente
            cliente_nome: Nome do cliente
            operadora_id: ID da operadora
            operadora_nome: Nome da operadora
            destino: Destino monitorado
            latencia_ms: Latência atual
        
        Returns:
            True se enviado com sucesso
        """
        timestamp = datetime.now().strftime("%H:%M:%S")
        
        mensagem = f"""
{AlertLevel.SUCCESS.value} <b>FAILOVER REVERTIDO</b>

<b>Horário:</b> {timestamp}
<b>Cliente:</b> {cliente_nome} (<code>{cliente_id}</code>)
<b>Operadora:</b> {operadora_nome} (<code>{operadora_id}</code>)
<b>Destino:</b> {destino}

<b>Latência Atual:</b> {latencia_ms:.2f}ms

<i>A operadora se recuperou. Tráfego retornou à configuração normal.</i>
"""
        return self._send_message(mensagem)
    
    def notify_high_latency_warning(self, cliente_id: str, cliente_nome: str,
                                    operadora_id: str, operadora_nome: str,
                                    destino: str, latencia_ms: float,
                                    limite_ms: float) -> bool:
        """
        Notifica sobre latência alta (aviso)
        
        Args:
            cliente_id: ID do cliente
            cliente_nome: Nome do cliente
            operadora_id: ID da operadora
            operadora_nome: Nome da operadora
            destino: Destino monitorado
            latencia_ms: Latência detectada
            limite_ms: Limite de latência
        
        Returns:
            True se enviado com sucesso
        """
        timestamp = datetime.now().strftime("%H:%M:%S")
        
        mensagem = f"""
{AlertLevel.WARNING.value} <b>LATÊNCIA ALTA DETECTADA</b>

<b>Horário:</b> {timestamp}
<b>Cliente:</b> {cliente_nome} (<code>{cliente_id}</code>)
<b>Operadora:</b> {operadora_nome} (<code>{operadora_id}</code>)
<b>Destino:</b> {destino}

<b>Latência:</b> {latencia_ms:.2f}ms
<b>Limite:</b> {limite_ms:.2f}ms

<i>Monitorando situação. Failover será acionado se persistir.</i>
"""
        return self._send_message(mensagem)
    
    def notify_packet_loss(self, cliente_id: str, cliente_nome: str,
                          operadora_id: str, operadora_nome: str,
                          destino: str, perda_percent: float,
                          limite_percent: float) -> bool:
        """
        Notifica sobre perda de pacotes
        
        Args:
            cliente_id: ID do cliente
            cliente_nome: Nome do cliente
            operadora_id: ID da operadora
            operadora_nome: Nome da operadora
            destino: Destino monitorado
            perda_percent: Percentual de perda
            limite_percent: Limite de perda
        
        Returns:
            True se enviado com sucesso
        """
        timestamp = datetime.now().strftime("%H:%M:%S")
        
        mensagem = f"""
{AlertLevel.WARNING.value} <b>PERDA DE PACOTES DETECTADA</b>

<b>Horário:</b> {timestamp}
<b>Cliente:</b> {cliente_nome} (<code>{cliente_id}</code>)
<b>Operadora:</b> {operadora_nome} (<code>{operadora_id}</code>)
<b>Destino:</b> {destino}

<b>Perda:</b> {perda_percent:.2f}%
<b>Limite:</b> {limite_percent:.2f}%

<i>Investigar possível congestionamento ou problema na operadora.</i>
"""
        return self._send_message(mensagem)
    
    def notify_bgp_session_down(self, operadora_id: str, operadora_nome: str,
                               bgp_peer: str) -> bool:
        """
        Notifica quando sessão BGP cai
        
        Args:
            operadora_id: ID da operadora
            operadora_nome: Nome da operadora
            bgp_peer: IP do peer BGP
        
        Returns:
            True se enviado com sucesso
        """
        timestamp = datetime.now().strftime("%H:%M:%S")
        
        mensagem = f"""
{AlertLevel.CRITICAL.value} <b>SESSÃO BGP DOWN</b>

<b>Horário:</b> {timestamp}
<b>Operadora:</b> {operadora_nome} (<code>{operadora_id}</code>)
<b>BGP Peer:</b> <code>{bgp_peer}</code>

<i>Sessão BGP foi perdida. Ação manual pode ser necessária.</i>
"""
        return self._send_message(mensagem)
    
    def notify_bgp_session_up(self, operadora_id: str, operadora_nome: str,
                             bgp_peer: str) -> bool:
        """
        Notifica quando sessão BGP é restaurada
        
        Args:
            operadora_id: ID da operadora
            operadora_nome: Nome da operadora
            bgp_peer: IP do peer BGP
        
        Returns:
            True se enviado com sucesso
        """
        timestamp = datetime.now().strftime("%H:%M:%S")
        
        mensagem = f"""
{AlertLevel.SUCCESS.value} <b>SESSÃO BGP RESTAURADA</b>

<b>Horário:</b> {timestamp}
<b>Operadora:</b> {operadora_nome} (<code>{operadora_id}</code>)
<b>BGP Peer:</b> <code>{bgp_peer}</code>

<i>Sessão BGP foi restaurada com sucesso.</i>
"""
        return self._send_message(mensagem)
    
    def notify_cliente_added(self, cliente_id: str, cliente_nome: str,
                            prefixo: str, user: str = "sistema") -> bool:
        """
        Notifica quando novo cliente é adicionado
        
        Args:
            cliente_id: ID do cliente
            cliente_nome: Nome do cliente
            prefixo: Prefixo do cliente
            user: Usuário que adicionou
        
        Returns:
            True se enviado com sucesso
        """
        timestamp = datetime.now().strftime("%H:%M:%S")
        
        mensagem = f"""
{AlertLevel.INFO.value} <b>NOVO CLIENTE ADICIONADO</b>

<b>Horário:</b> {timestamp}
<b>Adicionado por:</b> {user}

<b>Cliente:</b> {cliente_nome}
<b>ID:</b> <code>{cliente_id}</code>
<b>Prefixo:</b> <code>{prefixo}</code>

<i>Cliente agora está sob monitoramento de failover.</i>
"""
        return self._send_message(mensagem)
    
    def notify_cliente_removed(self, cliente_id: str, cliente_nome: str,
                              user: str = "sistema") -> bool:
        """
        Notifica quando cliente é removido
        
        Args:
            cliente_id: ID do cliente
            cliente_nome: Nome do cliente
            user: Usuário que removeu
        
        Returns:
            True se enviado com sucesso
        """
        timestamp = datetime.now().strftime("%H:%M:%S")
        
        mensagem = f"""
{AlertLevel.INFO.value} <b>CLIENTE REMOVIDO</b>

<b>Horário:</b> {timestamp}
<b>Removido por:</b> {user}

<b>Cliente:</b> {cliente_nome}
<b>ID:</b> <code>{cliente_id}</code>

<i>Cliente não está mais sob monitoramento.</i>
"""
        return self._send_message(mensagem)
    
    def notify_system_status(self, status: str, clientes_ativos: int,
                            operadoras_ok: int, operadoras_total: int,
                            alertas_ativos: int) -> bool:
        """
        Envia relatório de status do sistema
        
        Args:
            status: Status geral (OK, WARNING, CRITICAL)
            clientes_ativos: Número de clientes monitorados
            operadoras_ok: Número de operadoras funcionando
            operadoras_total: Total de operadoras
            alertas_ativos: Número de alertas ativos
        
        Returns:
            True se enviado com sucesso
        """
        timestamp = datetime.now().strftime("%H:%M:%S")
        
        if status == "OK":
            emoji = AlertLevel.SUCCESS.value
        elif status == "WARNING":
            emoji = AlertLevel.WARNING.value
        else:
            emoji = AlertLevel.CRITICAL.value
        
        mensagem = f"""
{emoji} <b>RELATÓRIO DE STATUS - {status}</b>

<b>Horário:</b> {timestamp}

<b>Clientes Monitorados:</b> {clientes_ativos}
<b>Operadoras OK:</b> {operadoras_ok}/{operadoras_total}
<b>Alertas Ativos:</b> {alertas_ativos}

<i>Sistema de failover BGP operacional.</i>
"""
        return self._send_message(mensagem)
    
    def send_custom_message(self, titulo: str, mensagem: str,
                           level: AlertLevel = AlertLevel.INFO) -> bool:
        """
        Envia mensagem customizada
        
        Args:
            titulo: Título da mensagem
            mensagem: Corpo da mensagem
            level: Nível de severidade
        
        Returns:
            True se enviado com sucesso
        """
        timestamp = datetime.now().strftime("%H:%M:%S")
        
        texto = f"""
{level.value} <b>{titulo}</b>

<b>Horário:</b> {timestamp}

{mensagem}
"""
        return self._send_message(texto)


class TelegramNotifierConfig:
    """Gerencia configuração de Telegram"""
    
    def __init__(self, config_file: str = '/etc/bgp_failover/telegram.json'):
        self.config_file = config_file
        self.load()
    
    def load(self):
        """Carrega configuração"""
        try:
            with open(self.config_file, 'r') as f:
                self.config = json.load(f)
        except FileNotFoundError:
            self.config = {
                'bot_token': '',
                'chat_id': '',
                'enabled': False
            }
    
    def save(self):
        """Salva configuração"""
        with open(self.config_file, 'w') as f:
            json.dump(self.config, f, indent=2)
    
    def set_credentials(self, bot_token: str, chat_id: str):
        """Define credenciais do Telegram"""
        self.config['bot_token'] = bot_token
        self.config['chat_id'] = chat_id
        self.config['enabled'] = bool(bot_token and chat_id)
        self.save()
    
    def get_notifier(self) -> TelegramNotifier:
        """Retorna instância do notificador"""
        return TelegramNotifier(
            self.config.get('bot_token', ''),
            self.config.get('chat_id', '')
        )
    
    def is_enabled(self) -> bool:
        """Verifica se Telegram está habilitado"""
        return self.config.get('enabled', False)


# Exemplo de uso
if __name__ == '__main__':
    # Configurar logging
    logging.basicConfig(level=logging.INFO)
    
    # Exemplo de uso
    config = TelegramNotifierConfig()
    
    # Se quiser configurar manualmente:
    # config.set_credentials('SEU_BOT_TOKEN', 'SEU_CHAT_ID')
    
    notifier = config.get_notifier()
    
    if notifier.enabled:
        # Testar notificações
        notifier.notify_failover_triggered(
            cliente_id='cliente_a',
            cliente_nome='Cliente A - Empresa XYZ',
            operadora_id='operadora_1',
            operadora_nome='Operadora 1 - Vivo',
            destino='AWS_SAO_PAULO',
            latencia_ms=150.5,
            limite_ms=100.0
        )
    else:
        print("Telegram não configurado. Configure as credenciais.")
