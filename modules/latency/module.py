#!/usr/bin/env python3
"""
Exemplo de Módulo: Monitoramento de Latência
Este arquivo deve ser copiado para /opt/bgp_failover/modules/latency/module.py
"""

import json
from typing import Dict, Any
from bgp_failover_platform import MonitoringModule
from ne8000_nqa_integration import NQAMonitoringConfig, Ne8000NQAManager
from distributed_probes import ProbeManager


class LatencyModule(MonitoringModule):
    """Módulo de monitoramento de latência"""
    
    MODULE_NAME = "latency"
    MODULE_VERSION = "1.0.0"
    MODULE_DESCRIPTION = "Monitora latência de destinos por operadora"
    MODULE_AUTHOR = "BGP Failover Team"
    MODULE_CAPABILITIES = ['latency', 'jitter', 'packet_loss']
    
    def __init__(self, config: Dict[str, Any]):
        """Inicializa módulo de latência"""
        super().__init__(config)
        
        self.nqa_manager = None
        self.probe_manager = None
        self.results = {}
    
    def initialize(self) -> bool:
        """Inicializa o módulo"""
        try:
            # Inicializar NQA
            nqa_config = NQAMonitoringConfig()
            self.nqa_manager = nqa_config.get_ne8000_manager()
            
            if not self.nqa_manager.connect():
                self.logger.warning("Não foi possível conectar ao Ne8000 para NQA")
            
            # Inicializar Probes
            self.probe_manager = ProbeManager()
            
            self.logger.info("Módulo de latência inicializado")
            return True
        
        except Exception as e:
            self.logger.error(f"Erro ao inicializar módulo: {e}")
            return False
    
    def execute(self) -> Dict[str, Any]:
        """Executa monitoramento de latência"""
        try:
            results = {
                'status': 'success',
                'measurements': {}
            }
            
            # Obter configuração de destinos
            destinos = self.config.get('destinos', [])
            
            for destino in destinos:
                destino_name = destino.get('nome')
                destino_ip = destino.get('ip')
                operadoras = destino.get('operadoras', [])
                
                results['measurements'][destino_name] = {}
                
                # Medir latência por operadora
                for operadora in operadoras:
                    latencia = self._measure_latency(destino_name, destino_ip, operadora)
                    results['measurements'][destino_name][operadora] = latencia
            
            return results
        
        except Exception as e:
            self.logger.error(f"Erro ao executar módulo: {e}")
            return {
                'status': 'error',
                'message': str(e)
            }
    
    def _measure_latency(self, destino_name: str, destino_ip: str,
                        operadora: str) -> Dict[str, Any]:
        """
        Mede latência para um destino via operadora específica
        
        Args:
            destino_name: Nome do destino
            destino_ip: IP do destino
            operadora: ID da operadora
        
        Returns:
            Dicionário com métricas
        """
        result = {
            'operadora': operadora,
            'destino': destino_name,
            'status': 'unknown'
        }
        
        try:
            # Tentar NQA primeiro
            if self.nqa_manager and self.nqa_manager.connected:
                nqa_result = self._measure_nqa(destino_name, destino_ip, operadora)
                if nqa_result:
                    result.update(nqa_result)
                    return result
            
            # Fallback para probe local
            if self.probe_manager:
                probe_result = self._measure_probe(destino_name, destino_ip, operadora)
                if probe_result:
                    result.update(probe_result)
                    return result
            
            result['status'] = 'error'
            result['message'] = 'Nenhum método de medição disponível'
        
        except Exception as e:
            self.logger.error(f"Erro ao medir latência: {e}")
            result['status'] = 'error'
            result['message'] = str(e)
        
        return result
    
    def _measure_nqa(self, destino_name: str, destino_ip: str,
                    operadora: str) -> Dict[str, Any]:
        """Mede latência via NQA"""
        try:
            test_name = f"test_{operadora}_{destino_name.lower()}"
            
            # Criar teste se não existir
            self.nqa_manager.create_nqa_test(
                test_name=test_name,
                operadora_id=operadora,
                destino_ip=destino_ip
            )
            
            # Obter resultados
            nqa_result = self.nqa_manager.get_nqa_results(
                test_name=test_name,
                operadora_id=operadora,
                destino=destino_name
            )
            
            if nqa_result:
                return {
                    'status': nqa_result.status,
                    'latencia_media_ms': nqa_result.latencia_media,
                    'latencia_min_ms': nqa_result.latencia_min,
                    'latencia_max_ms': nqa_result.latencia_max,
                    'perda_percent': nqa_result.perda_percent,
                    'jitter_ms': nqa_result.jitter,
                    'method': 'nqa'
                }
        
        except Exception as e:
            self.logger.debug(f"Erro ao medir NQA: {e}")
        
        return None
    
    def _measure_probe(self, destino_name: str, destino_ip: str,
                      operadora: str) -> Dict[str, Any]:
        """Mede latência via probe local"""
        try:
            probe_name = f"local_{operadora}"
            
            result = self.probe_manager.execute_probe(
                probe_name,
                destino_ip,
                operadora
            )
            
            if result:
                return {
                    'status': result.status,
                    'latencia_media_ms': result.latencia_ms,
                    'perda_percent': result.perda_percent,
                    'jitter_ms': result.jitter_ms,
                    'source_ip': result.source_ip,
                    'method': 'probe'
                }
        
        except Exception as e:
            self.logger.debug(f"Erro ao medir probe: {e}")
        
        return None
    
    def cleanup(self):
        """Limpa recursos do módulo"""
        try:
            if self.nqa_manager and self.nqa_manager.connected:
                self.nqa_manager.disconnect()
            
            self.logger.info("Módulo de latência finalizado")
        
        except Exception as e:
            self.logger.error(f"Erro ao limpar módulo: {e}")


# Exemplo de configuração (config.json)
EXAMPLE_CONFIG = {
    "enabled": True,
    "destinos": [
        {
            "nome": "AWS_SAO_PAULO",
            "ip": "52.67.0.1",
            "operadoras": ["operadora_1", "operadora_2", "operadora_3"]
        },
        {
            "nome": "DNS_GOOGLE",
            "ip": "8.8.8.8",
            "operadoras": ["operadora_1", "operadora_2", "operadora_3"]
        }
    ],
    "nqa": {
        "enabled": True,
        "frequency": 30
    },
    "probes": {
        "enabled": True,
        "timeout": 5
    }
}


if __name__ == '__main__':
    import logging
    logging.basicConfig(level=logging.INFO)
    
    # Exemplo de uso
    config = EXAMPLE_CONFIG
    module = LatencyModule(config)
    
    if module.initialize():
        result = module.execute()
        print(json.dumps(result, indent=2))
        module.cleanup()
