#!/usr/bin/env python3
"""
Sistema de Probes Distribuídas
Valida que os pings realmente saem pela operadora específica
usando múltiplos pontos de coleta
"""

import json
import logging
import subprocess
import socket
from typing import Dict, List, Optional, Tuple
from datetime import datetime
from dataclasses import dataclass
import requests

logger = logging.getLogger(__name__)


@dataclass
class ProbeResult:
    """Resultado de um probe"""
    probe_name: str
    operadora: str
    destino: str
    latencia_ms: float
    perda_percent: float
    jitter_ms: float
    timestamp: str
    status: str
    source_ip: str
    path_hops: List[str]


class LocalProbe:
    """Probe local executado no Ne8000 ou sistema local"""
    
    def __init__(self, probe_name: str, source_ip: str = None):
        """
        Inicializa probe local
        
        Args:
            probe_name: Nome do probe
            source_ip: IP de origem para ping
        """
        self.probe_name = probe_name
        self.source_ip = source_ip
    
    def ping(self, destino_ip: str, count: int = 3, timeout: int = 5) -> ProbeResult:
        """
        Executa ping para destino
        
        Args:
            destino_ip: IP de destino
            count: Número de pings
            timeout: Timeout em segundos
        
        Returns:
            ProbeResult com resultados
        """
        try:
            # Construir comando ping
            cmd = ['ping', '-c', str(count), '-W', str(timeout * 1000)]
            
            # Adicionar source IP se especificado
            if self.source_ip:
                cmd.extend(['-I', self.source_ip])
            
            cmd.append(destino_ip)
            
            # Executar ping
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=timeout * count + 5
            )
            
            # Parser de resultados
            return self._parse_ping_output(
                result.stdout,
                destino_ip
            )
        
        except subprocess.TimeoutExpired:
            logger.error(f"Timeout ao fazer ping para {destino_ip}")
            return ProbeResult(
                probe_name=self.probe_name,
                operadora='unknown',
                destino=destino_ip,
                latencia_ms=0,
                perda_percent=100,
                jitter_ms=0,
                timestamp=datetime.now().isoformat(),
                status='timeout',
                source_ip=self.source_ip or 'local',
                path_hops=[]
            )
        
        except Exception as e:
            logger.error(f"Erro ao fazer ping: {e}")
            return None
    
    def _parse_ping_output(self, output: str, destino_ip: str) -> ProbeResult:
        """
        Parser de saída do ping
        
        Args:
            output: Saída do comando ping
            destino_ip: IP de destino
        
        Returns:
            ProbeResult
        """
        try:
            import re
            
            # Extrair estatísticas
            stats_match = re.search(
                r'(\d+) packets transmitted.*?(\d+) received.*?(\d+\.?\d*)% packet loss',
                output
            )
            
            if not stats_match:
                return None
            
            transmitted = int(stats_match.group(1))
            received = int(stats_match.group(2))
            perda_percent = float(stats_match.group(3))
            
            # Extrair latência
            latencia_match = re.search(
                r'min/avg/max/stddev = ([\d.]+)/([\d.]+)/([\d.]+)/([\d.]+)',
                output
            )
            
            if latencia_match:
                latencia_min = float(latencia_match.group(1))
                latencia_media = float(latencia_match.group(2))
                latencia_max = float(latencia_match.group(3))
                jitter = float(latencia_match.group(4))
            else:
                latencia_media = 0
                jitter = 0
            
            status = 'success' if received > 0 else 'failed'
            
            return ProbeResult(
                probe_name=self.probe_name,
                operadora='local',
                destino=destino_ip,
                latencia_ms=latencia_media,
                perda_percent=perda_percent,
                jitter_ms=jitter,
                timestamp=datetime.now().isoformat(),
                status=status,
                source_ip=self.source_ip or 'local',
                path_hops=[]
            )
        
        except Exception as e:
            logger.error(f"Erro ao fazer parser de ping: {e}")
            return None
    
    def traceroute(self, destino_ip: str, max_hops: int = 15) -> List[str]:
        """
        Executa traceroute para destino
        
        Args:
            destino_ip: IP de destino
            max_hops: Número máximo de hops
        
        Returns:
            Lista de IPs no caminho
        """
        try:
            cmd = ['traceroute', '-m', str(max_hops)]
            
            if self.source_ip:
                cmd.extend(['-s', self.source_ip])
            
            cmd.append(destino_ip)
            
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=30
            )
            
            # Parser de traceroute
            hops = []
            import re
            
            for line in result.stdout.split('\n'):
                # Extrair IP do hop
                match = re.search(r'\(([\d.]+)\)', line)
                if match:
                    hops.append(match.group(1))
            
            return hops
        
        except Exception as e:
            logger.error(f"Erro ao fazer traceroute: {e}")
            return []


class RemoteProbe:
    """Probe remoto executado em servidor externo"""
    
    def __init__(self, probe_name: str, probe_url: str):
        """
        Inicializa probe remoto
        
        Args:
            probe_name: Nome do probe
            probe_url: URL do servidor de probe (ex: http://probe.example.com:5000)
        """
        self.probe_name = probe_name
        self.probe_url = probe_url
    
    def ping(self, destino_ip: str, operadora_id: str) -> Optional[ProbeResult]:
        """
        Executa ping remoto via API
        
        Args:
            destino_ip: IP de destino
            operadora_id: ID da operadora
        
        Returns:
            ProbeResult ou None
        """
        try:
            url = f"{self.probe_url}/api/v1/probe/ping"
            payload = {
                'destination': destino_ip,
                'operadora': operadora_id,
                'count': 3
            }
            
            response = requests.post(url, json=payload, timeout=30)
            
            if response.status_code == 200:
                data = response.json()
                return ProbeResult(
                    probe_name=self.probe_name,
                    operadora=operadora_id,
                    destino=destino_ip,
                    latencia_ms=data.get('latencia_ms', 0),
                    perda_percent=data.get('perda_percent', 0),
                    jitter_ms=data.get('jitter_ms', 0),
                    timestamp=data.get('timestamp', datetime.now().isoformat()),
                    status=data.get('status', 'unknown'),
                    source_ip=data.get('source_ip', 'remote'),
                    path_hops=data.get('path_hops', [])
                )
            else:
                logger.error(f"Erro ao chamar probe remoto: {response.text}")
                return None
        
        except Exception as e:
            logger.error(f"Erro ao executar probe remoto: {e}")
            return None
    
    def traceroute(self, destino_ip: str, operadora_id: str) -> Optional[List[str]]:
        """
        Executa traceroute remoto via API
        
        Args:
            destino_ip: IP de destino
            operadora_id: ID da operadora
        
        Returns:
            Lista de hops ou None
        """
        try:
            url = f"{self.probe_url}/api/v1/probe/traceroute"
            payload = {
                'destination': destino_ip,
                'operadora': operadora_id
            }
            
            response = requests.post(url, json=payload, timeout=60)
            
            if response.status_code == 200:
                data = response.json()
                return data.get('hops', [])
            else:
                logger.error(f"Erro ao chamar traceroute remoto: {response.text}")
                return None
        
        except Exception as e:
            logger.error(f"Erro ao executar traceroute remoto: {e}")
            return None


class ProbeManager:
    """Gerenciador de probes"""
    
    def __init__(self, config_file: str = '/etc/bgp_failover/probes_config.json'):
        self.config_file = config_file
        self.probes = {}
        self.load_config()
    
    def load_config(self):
        """Carrega configuração de probes"""
        try:
            with open(self.config_file, 'r') as f:
                config = json.load(f)
            
            # Criar probes locais
            for probe_config in config.get('local_probes', []):
                probe = LocalProbe(
                    probe_name=probe_config['name'],
                    source_ip=probe_config.get('source_ip')
                )
                self.probes[probe_config['name']] = probe
            
            # Criar probes remotos
            for probe_config in config.get('remote_probes', []):
                probe = RemoteProbe(
                    probe_name=probe_config['name'],
                    probe_url=probe_config['url']
                )
                self.probes[probe_config['name']] = probe
        
        except FileNotFoundError:
            logger.warning(f"Arquivo de configuração não encontrado: {self.config_file}")
    
    def execute_probe(self, probe_name: str, destino_ip: str,
                     operadora_id: str = None) -> Optional[ProbeResult]:
        """
        Executa um probe específico
        
        Args:
            probe_name: Nome do probe
            destino_ip: IP de destino
            operadora_id: ID da operadora (para probes remotos)
        
        Returns:
            ProbeResult ou None
        """
        if probe_name not in self.probes:
            logger.error(f"Probe não encontrado: {probe_name}")
            return None
        
        probe = self.probes[probe_name]
        
        if isinstance(probe, LocalProbe):
            return probe.ping(destino_ip)
        elif isinstance(probe, RemoteProbe):
            return probe.ping(destino_ip, operadora_id)
        else:
            logger.error(f"Tipo de probe desconhecido: {type(probe)}")
            return None
    
    def execute_all_probes(self, destino_ip: str,
                          operadora_id: str = None) -> Dict[str, ProbeResult]:
        """
        Executa todos os probes para um destino
        
        Args:
            destino_ip: IP de destino
            operadora_id: ID da operadora
        
        Returns:
            Dicionário com resultados de cada probe
        """
        results = {}
        
        for probe_name in self.probes:
            result = self.execute_probe(probe_name, destino_ip, operadora_id)
            if result:
                results[probe_name] = result
        
        return results
    
    def verify_operator_path(self, operadora_id: str, destino_ip: str,
                            expected_peer_ip: str = None) -> bool:
        """
        Verifica se o caminho realmente passa pela operadora
        
        Args:
            operadora_id: ID da operadora
            destino_ip: IP de destino
            expected_peer_ip: IP esperado do peer (primeiro hop)
        
        Returns:
            True se caminho está correto
        """
        try:
            # Executar traceroute para verificar caminho
            probe = self.probes.get(f'local_{operadora_id}')
            
            if not probe or not isinstance(probe, LocalProbe):
                logger.error(f"Probe local não encontrado para {operadora_id}")
                return False
            
            hops = probe.traceroute(destino_ip)
            
            if not hops:
                logger.error(f"Traceroute falhou para {destino_ip}")
                return False
            
            # Verificar primeiro hop
            first_hop = hops[0]
            
            if expected_peer_ip and first_hop != expected_peer_ip:
                logger.warning(
                    f"Primeiro hop {first_hop} não corresponde ao esperado {expected_peer_ip}"
                )
                return False
            
            logger.info(f"Caminho verificado para {operadora_id}: {' -> '.join(hops)}")
            return True
        
        except Exception as e:
            logger.error(f"Erro ao verificar caminho: {e}")
            return False


# Exemplo de uso
if __name__ == '__main__':
    logging.basicConfig(level=logging.INFO)
    
    # Criar probe local
    probe = LocalProbe(
        probe_name='local_operadora_1',
        source_ip='192.168.1.2'
    )
    
    # Executar ping
    result = probe.ping('8.8.8.8')
    if result:
        print(f"Resultado: {result}")
    
    # Executar traceroute
    hops = probe.traceroute('8.8.8.8')
    print(f"Hops: {hops}")
