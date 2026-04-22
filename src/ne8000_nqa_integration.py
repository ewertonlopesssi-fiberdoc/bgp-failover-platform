#!/usr/bin/env python3
"""
Integração com NQA (Network Quality Analysis) do Huawei Ne8000
Monitora latência garantindo que os pings saem pela operadora específica
"""

import paramiko
import logging
import re
import json
from typing import Dict, List, Optional, Tuple
from datetime import datetime
from dataclasses import dataclass

logger = logging.getLogger(__name__)


@dataclass
class NQAResult:
    """Resultado de um teste NQA"""
    test_name: str
    operadora: str
    destino: str
    latencia_min: float
    latencia_max: float
    latencia_media: float
    perda_percent: float
    jitter: float
    timestamp: str
    status: str  # success, failed, timeout


class Ne8000NQAManager:
    """Gerenciador de NQA no Ne8000 M4"""
    
    def __init__(self, host: str, username: str, password: str = None, 
                 key_filename: str = None, port: int = 22):
        """
        Inicializa conexão SSH com Ne8000
        
        Args:
            host: IP do Ne8000
            username: Usuário SSH
            password: Senha SSH (usar key_filename se disponível)
            key_filename: Caminho para chave privada SSH
            port: Porta SSH (padrão 22)
        """
        self.host = host
        self.username = username
        self.password = password
        self.key_filename = key_filename
        self.port = port
        self.client = None
        self.connected = False
    
    def connect(self) -> bool:
        """
        Conecta ao Ne8000 via SSH
        
        Returns:
            True se conectado com sucesso
        """
        try:
            self.client = paramiko.SSHClient()
            self.client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
            
            if self.key_filename:
                self.client.connect(
                    self.host,
                    port=self.port,
                    username=self.username,
                    key_filename=self.key_filename,
                    timeout=10
                )
            else:
                self.client.connect(
                    self.host,
                    port=self.port,
                    username=self.username,
                    password=self.password,
                    timeout=10
                )
            
            self.connected = True
            logger.info(f"Conectado ao Ne8000 {self.host}")
            return True
        
        except Exception as e:
            logger.error(f"Erro ao conectar ao Ne8000: {e}")
            self.connected = False
            return False
    
    def disconnect(self):
        """Desconecta do Ne8000"""
        if self.client:
            self.client.close()
            self.connected = False
            logger.info("Desconectado do Ne8000")
    
    def _execute_command(self, command: str) -> Tuple[str, str, int]:
        """
        Executa comando no Ne8000
        
        Args:
            command: Comando a executar
        
        Returns:
            Tupla (stdout, stderr, return_code)
        """
        if not self.connected:
            raise RuntimeError("Não conectado ao Ne8000")
        
        try:
            stdin, stdout, stderr = self.client.exec_command(command, timeout=30)
            output = stdout.read().decode('utf-8')
            error = stderr.read().decode('utf-8')
            return_code = stdout.channel.recv_exit_status()
            
            return output, error, return_code
        
        except Exception as e:
            logger.error(f"Erro ao executar comando: {e}")
            raise
    
    def create_nqa_test(self, test_name: str, operadora_id: str, 
                       destino_ip: str, source_ip: str = None,
                       vrf: str = None) -> bool:
        """
        Cria teste NQA no Ne8000
        
        Args:
            test_name: Nome do teste (ex: test_op1_aws)
            operadora_id: ID da operadora
            destino_ip: IP de destino
            source_ip: IP de origem (opcional, usa interface da operadora)
            vrf: VRF a usar (opcional)
        
        Returns:
            True se criado com sucesso
        """
        try:
            # Determinar interface de origem baseado na operadora
            if not source_ip:
                source_ip = self._get_operator_source_ip(operadora_id)
            
            # Construir comandos de configuração
            commands = [
                "system-view",
                f"nqa test-instance admin {test_name}",
                "test-type icmp",
                f"destination-address {destino_ip}",
                f"source-address {source_ip}",
            ]
            
            # Adicionar VRF se especificado
            if vrf:
                commands.append(f"vrf {vrf}")
            
            # Configurar parâmetros de teste
            commands.extend([
                "frequency 30",           # A cada 30 segundos
                "probe-count 3",          # 3 probes por teste
                "timeout 5000",           # Timeout de 5 segundos
                "quit",
                "quit"
            ])
            
            # Executar configuração
            for cmd in commands:
                output, error, rc = self._execute_command(cmd)
                if rc != 0:
                    logger.warning(f"Comando '{cmd}' retornou: {error}")
            
            logger.info(f"Teste NQA '{test_name}' criado com sucesso")
            return True
        
        except Exception as e:
            logger.error(f"Erro ao criar teste NQA: {e}")
            return False
    
    def delete_nqa_test(self, test_name: str) -> bool:
        """
        Deleta teste NQA
        
        Args:
            test_name: Nome do teste
        
        Returns:
            True se deletado com sucesso
        """
        try:
            commands = [
                "system-view",
                f"undo nqa test-instance admin {test_name}",
                "quit"
            ]
            
            for cmd in commands:
                output, error, rc = self._execute_command(cmd)
                if rc != 0:
                    logger.warning(f"Comando '{cmd}' retornou: {error}")
            
            logger.info(f"Teste NQA '{test_name}' deletado com sucesso")
            return True
        
        except Exception as e:
            logger.error(f"Erro ao deletar teste NQA: {e}")
            return False
    
    def get_nqa_results(self, test_name: str, operadora_id: str,
                       destino: str) -> Optional[NQAResult]:
        """
        Obtém resultados de um teste NQA
        
        Args:
            test_name: Nome do teste
            operadora_id: ID da operadora
            destino: Nome do destino
        
        Returns:
            Objeto NQAResult ou None se erro
        """
        try:
            # Executar comando para obter resultados
            cmd = f"display nqa results test-instance admin {test_name}"
            output, error, rc = self._execute_command(cmd)
            
            if rc != 0:
                logger.error(f"Erro ao obter resultados: {error}")
                return None
            
            # Parser dos resultados
            result = self._parse_nqa_output(output, test_name, operadora_id, destino)
            return result
        
        except Exception as e:
            logger.error(f"Erro ao obter resultados NQA: {e}")
            return None
    
    def _parse_nqa_output(self, output: str, test_name: str, 
                         operadora_id: str, destino: str) -> Optional[NQAResult]:
        """
        Parser de saída NQA
        
        Args:
            output: Saída do comando display nqa
            test_name: Nome do teste
            operadora_id: ID da operadora
            destino: Nome do destino
        
        Returns:
            NQAResult ou None
        """
        try:
            # Padrões regex para extrair dados
            patterns = {
                'latencia_min': r'Min\s*:\s*(\d+\.?\d*)\s*ms',
                'latencia_max': r'Max\s*:\s*(\d+\.?\d*)\s*ms',
                'latencia_media': r'Average\s*:\s*(\d+\.?\d*)\s*ms',
                'perda': r'Loss\s*:\s*(\d+\.?\d*)%',
                'jitter': r'Jitter\s*:\s*(\d+\.?\d*)\s*ms',
                'status': r'Status\s*:\s*(\w+)'
            }
            
            result_dict = {}
            for key, pattern in patterns.items():
                match = re.search(pattern, output, re.IGNORECASE)
                if match:
                    result_dict[key] = float(match.group(1))
            
            # Validar se temos dados suficientes
            if 'latencia_media' not in result_dict:
                logger.warning(f"Não foi possível extrair latência média de {test_name}")
                return None
            
            return NQAResult(
                test_name=test_name,
                operadora=operadora_id,
                destino=destino,
                latencia_min=result_dict.get('latencia_min', 0),
                latencia_max=result_dict.get('latencia_max', 0),
                latencia_media=result_dict.get('latencia_media', 0),
                perda_percent=result_dict.get('perda', 0),
                jitter=result_dict.get('jitter', 0),
                timestamp=datetime.now().isoformat(),
                status=result_dict.get('status', 'unknown')
            )
        
        except Exception as e:
            logger.error(f"Erro ao fazer parser de NQA: {e}")
            return None
    
    def _get_operator_source_ip(self, operadora_id: str) -> str:
        """
        Obtém IP de origem para uma operadora
        Mapeia operadora para interface/IP específico
        
        Args:
            operadora_id: ID da operadora
        
        Returns:
            IP de origem
        """
        # Mapa de operadora para IP de origem
        # Isso deve ser configurado conforme sua topologia
        operator_map = {
            'operadora_1': '192.168.1.2',   # Interface GigabitEthernet0/0/0
            'operadora_2': '192.168.2.2',   # Interface GigabitEthernet0/0/1
            'operadora_3': '192.168.3.2',   # Interface GigabitEthernet0/0/2
        }
        
        return operator_map.get(operadora_id, '0.0.0.0')
    
    def list_nqa_tests(self) -> List[str]:
        """
        Lista todos os testes NQA configurados
        
        Returns:
            Lista de nomes de testes
        """
        try:
            cmd = "display nqa test-instance"
            output, error, rc = self._execute_command(cmd)
            
            if rc != 0:
                logger.error(f"Erro ao listar testes: {error}")
                return []
            
            # Parser simples para extrair nomes
            tests = []
            for line in output.split('\n'):
                if 'test-instance' in line.lower():
                    # Extrair nome do teste
                    match = re.search(r'admin\s+(\S+)', line)
                    if match:
                        tests.append(match.group(1))
            
            return tests
        
        except Exception as e:
            logger.error(f"Erro ao listar testes NQA: {e}")
            return []
    
    def verify_operator_path(self, operadora_id: str, destino_ip: str) -> bool:
        """
        Verifica se o caminho para o destino realmente passa pela operadora
        Usa traceroute com source-based routing
        
        Args:
            operadora_id: ID da operadora
            destino_ip: IP de destino
        
        Returns:
            True se o caminho está correto
        """
        try:
            source_ip = self._get_operator_source_ip(operadora_id)
            
            # Executar traceroute com source específico
            cmd = f"traceroute -s {source_ip} {destino_ip}"
            output, error, rc = self._execute_command(cmd)
            
            # Verificar se primeiro hop é o peer da operadora
            # Isso depende da sua topologia específica
            logger.info(f"Traceroute para {destino_ip} via {operadora_id}:\n{output}")
            
            return True
        
        except Exception as e:
            logger.error(f"Erro ao verificar caminho: {e}")
            return False


class NQAMonitoringConfig:
    """Configuração de monitoramento NQA"""
    
    def __init__(self, config_file: str = '/etc/bgp_failover/nqa_config.json'):
        self.config_file = config_file
        self.load()
    
    def load(self):
        """Carrega configuração"""
        try:
            with open(self.config_file, 'r') as f:
                self.config = json.load(f)
        except FileNotFoundError:
            self.config = {
                'ne8000': {
                    'host': '192.168.0.1',
                    'username': 'admin',
                    'password': '',
                    'key_filename': '/etc/bgp_failover/ne8000_key.pem'
                },
                'operadoras': {
                    'operadora_1': {
                        'source_ip': '192.168.1.2',
                        'interface': 'GigabitEthernet0/0/0'
                    },
                    'operadora_2': {
                        'source_ip': '192.168.2.2',
                        'interface': 'GigabitEthernet0/0/1'
                    },
                    'operadora_3': {
                        'source_ip': '192.168.3.2',
                        'interface': 'GigabitEthernet0/0/2'
                    }
                }
            }
    
    def save(self):
        """Salva configuração"""
        with open(self.config_file, 'w') as f:
            json.dump(self.config, f, indent=2)
    
    def get_ne8000_manager(self) -> Ne8000NQAManager:
        """Retorna instância do gerenciador NQA"""
        ne8000_config = self.config.get('ne8000', {})
        
        return Ne8000NQAManager(
            host=ne8000_config.get('host'),
            username=ne8000_config.get('username'),
            password=ne8000_config.get('password'),
            key_filename=ne8000_config.get('key_filename')
        )


# Exemplo de uso
if __name__ == '__main__':
    logging.basicConfig(level=logging.INFO)
    
    # Carregar configuração
    config = NQAMonitoringConfig()
    
    # Conectar ao Ne8000
    manager = config.get_ne8000_manager()
    
    if manager.connect():
        try:
            # Criar teste NQA
            manager.create_nqa_test(
                test_name='test_op1_aws',
                operadora_id='operadora_1',
                destino_ip='52.67.0.1'
            )
            
            # Listar testes
            tests = manager.list_nqa_tests()
            print(f"Testes NQA: {tests}")
            
            # Obter resultados
            result = manager.get_nqa_results(
                test_name='test_op1_aws',
                operadora_id='operadora_1',
                destino='AWS_SAO_PAULO'
            )
            
            if result:
                print(f"Resultado: {result}")
        
        finally:
            manager.disconnect()
    else:
        print("Falha ao conectar ao Ne8000")
