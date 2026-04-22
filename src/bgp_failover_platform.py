#!/usr/bin/env python3
"""
BGP Failover Monitoring Platform
Plataforma modular para monitoramento de redes com sistema de plugins
"""

import os
import sys
import json
import logging
import importlib.util
from abc import ABC, abstractmethod
from pathlib import Path
from typing import Dict, List, Optional, Any
from datetime import datetime
import sqlite3

logger = logging.getLogger(__name__)


class MonitoringModule(ABC):
    """
    Classe base para módulos de monitoramento
    Todos os módulos devem herdar desta classe
    """
    
    # Metadados do módulo (devem ser sobrescritos)
    MODULE_NAME = "base_module"
    MODULE_VERSION = "1.0.0"
    MODULE_DESCRIPTION = "Módulo base de monitoramento"
    MODULE_AUTHOR = "BGP Failover Team"
    MODULE_CAPABILITIES = []  # Ex: ['latency', 'traffic', 'bgp']
    
    def __init__(self, config: Dict[str, Any]):
        """
        Inicializa módulo
        
        Args:
            config: Dicionário de configuração do módulo
        """
        self.config = config
        self.enabled = config.get('enabled', True)
        self.logger = logging.getLogger(self.MODULE_NAME)
    
    @abstractmethod
    def initialize(self) -> bool:
        """
        Inicializa o módulo
        
        Returns:
            True se inicializado com sucesso
        """
        pass
    
    @abstractmethod
    def execute(self) -> Dict[str, Any]:
        """
        Executa monitoramento
        
        Returns:
            Dicionário com resultados
        """
        pass
    
    @abstractmethod
    def cleanup(self):
        """Limpa recursos do módulo"""
        pass
    
    def get_metadata(self) -> Dict[str, Any]:
        """Retorna metadados do módulo"""
        return {
            'name': self.MODULE_NAME,
            'version': self.MODULE_VERSION,
            'description': self.MODULE_DESCRIPTION,
            'author': self.MODULE_AUTHOR,
            'capabilities': self.MODULE_CAPABILITIES,
            'enabled': self.enabled
        }


class ModuleManager:
    """Gerenciador de módulos"""
    
    def __init__(self, modules_dir: str = '/opt/bgp_failover/modules'):
        """
        Inicializa gerenciador de módulos
        
        Args:
            modules_dir: Diretório onde os módulos estão localizados
        """
        self.modules_dir = Path(modules_dir)
        self.modules = {}
        self.load_modules()
    
    def load_modules(self):
        """Carrega todos os módulos disponíveis"""
        if not self.modules_dir.exists():
            logger.warning(f"Diretório de módulos não existe: {self.modules_dir}")
            return
        
        for module_path in self.modules_dir.glob('*/module.py'):
            try:
                self._load_module(module_path)
            except Exception as e:
                logger.error(f"Erro ao carregar módulo {module_path}: {e}")
    
    def _load_module(self, module_path: Path):
        """
        Carrega um módulo específico
        
        Args:
            module_path: Caminho para o arquivo module.py
        """
        module_name = module_path.parent.name
        
        # Carregar arquivo Python
        spec = importlib.util.spec_from_file_location(module_name, module_path)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        
        # Procurar classe que herda de MonitoringModule
        for attr_name in dir(module):
            attr = getattr(module, attr_name)
            if (isinstance(attr, type) and 
                issubclass(attr, MonitoringModule) and 
                attr is not MonitoringModule):
                
                # Carregar configuração do módulo
                config_file = module_path.parent / 'config.json'
                config = {}
                
                if config_file.exists():
                    with open(config_file, 'r') as f:
                        config = json.load(f)
                
                # Instanciar módulo
                module_instance = attr(config)
                self.modules[module_name] = module_instance
                
                logger.info(f"Módulo carregado: {module_name} v{attr.MODULE_VERSION}")
    
    def get_module(self, module_name: str) -> Optional[MonitoringModule]:
        """Obtém um módulo específico"""
        return self.modules.get(module_name)
    
    def list_modules(self) -> Dict[str, Dict[str, Any]]:
        """Lista todos os módulos carregados"""
        return {
            name: module.get_metadata()
            for name, module in self.modules.items()
        }
    
    def execute_module(self, module_name: str) -> Dict[str, Any]:
        """
        Executa um módulo específico
        
        Args:
            module_name: Nome do módulo
        
        Returns:
            Resultados da execução
        """
        module = self.get_module(module_name)
        
        if not module:
            return {
                'status': 'error',
                'message': f'Módulo não encontrado: {module_name}'
            }
        
        if not module.enabled:
            return {
                'status': 'disabled',
                'message': f'Módulo desabilitado: {module_name}'
            }
        
        try:
            result = module.execute()
            result['timestamp'] = datetime.now().isoformat()
            result['module'] = module_name
            return result
        except Exception as e:
            logger.error(f"Erro ao executar módulo {module_name}: {e}")
            return {
                'status': 'error',
                'message': str(e),
                'module': module_name
            }
    
    def execute_all_modules(self) -> Dict[str, Dict[str, Any]]:
        """Executa todos os módulos habilitados"""
        results = {}
        
        for module_name in self.modules:
            results[module_name] = self.execute_module(module_name)
        
        return results
    
    def cleanup_all(self):
        """Limpa recursos de todos os módulos"""
        for module in self.modules.values():
            try:
                module.cleanup()
            except Exception as e:
                logger.error(f"Erro ao limpar módulo: {e}")


class MetricsStorage:
    """Armazena métricas de todos os módulos"""
    
    def __init__(self, db_file: str = '/var/lib/bgp_failover/metrics.db'):
        self.db_file = db_file
        self._init_db()
    
    def _init_db(self):
        """Inicializa banco de dados"""
        Path(self.db_file).parent.mkdir(parents=True, exist_ok=True)
        
        with sqlite3.connect(self.db_file) as conn:
            conn.execute('''
                CREATE TABLE IF NOT EXISTS metrics (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                    module TEXT NOT NULL,
                    metric_name TEXT NOT NULL,
                    metric_value REAL,
                    metric_label TEXT,
                    tags TEXT
                )
            ''')
            
            conn.execute('CREATE INDEX IF NOT EXISTS idx_module_timestamp ON metrics(module, timestamp)')
            conn.commit()
    
    def store_metric(self, module: str, metric_name: str, metric_value: float,
                    metric_label: str = None, tags: Dict = None):
        """
        Armazena métrica
        
        Args:
            module: Nome do módulo
            metric_name: Nome da métrica
            metric_value: Valor da métrica
            metric_label: Rótulo da métrica
            tags: Dicionário de tags
        """
        tags_json = json.dumps(tags) if tags else None
        
        with sqlite3.connect(self.db_file) as conn:
            conn.execute('''
                INSERT INTO metrics (module, metric_name, metric_value, metric_label, tags)
                VALUES (?, ?, ?, ?, ?)
            ''', (module, metric_name, metric_value, metric_label, tags_json))
            conn.commit()
    
    def get_metrics(self, module: str, metric_name: str = None,
                   hours: int = 24) -> List[Dict]:
        """Obtém métricas armazenadas"""
        from datetime import timedelta
        
        cutoff_time = datetime.now() - timedelta(hours=hours)
        
        with sqlite3.connect(self.db_file) as conn:
            if metric_name:
                cursor = conn.execute('''
                    SELECT timestamp, metric_value, metric_label, tags
                    FROM metrics
                    WHERE module = ? AND metric_name = ? AND timestamp > ?
                    ORDER BY timestamp DESC
                ''', (module, metric_name, cutoff_time.isoformat()))
            else:
                cursor = conn.execute('''
                    SELECT timestamp, metric_name, metric_value, metric_label, tags
                    FROM metrics
                    WHERE module = ? AND timestamp > ?
                    ORDER BY timestamp DESC
                ''', (module, cutoff_time.isoformat()))
            
            columns = [description[0] for description in cursor.description]
            return [dict(zip(columns, row)) for row in cursor.fetchall()]


class PlatformConfig:
    """Gerencia configuração da plataforma"""
    
    def __init__(self, config_file: str = '/etc/bgp_failover/platform_config.json'):
        self.config_file = config_file
        self.load()
    
    def load(self):
        """Carrega configuração"""
        try:
            with open(self.config_file, 'r') as f:
                self.config = json.load(f)
        except FileNotFoundError:
            self.config = self._default_config()
    
    def save(self):
        """Salva configuração"""
        Path(self.config_file).parent.mkdir(parents=True, exist_ok=True)
        
        with open(self.config_file, 'w') as f:
            json.dump(self.config, f, indent=2)
    
    def _default_config(self) -> Dict:
        """Retorna configuração padrão"""
        return {
            'platform': {
                'name': 'BGP Failover Monitoring Platform',
                'version': '2.0.0',
                'debug': False
            },
            'database': {
                'metrics_db': '/var/lib/bgp_failover/metrics.db',
                'auth_db': '/var/lib/bgp_failover/auth.db'
            },
            'modules': {
                'enabled': ['latency', 'traffic', 'bgp'],
                'disabled': []
            },
            'api': {
                'host': '0.0.0.0',
                'port': 5000,
                'debug': False
            }
        }
    
    def get(self, key: str, default=None):
        """Obtém valor de configuração"""
        keys = key.split('.')
        value = self.config
        
        for k in keys:
            if isinstance(value, dict):
                value = value.get(k)
            else:
                return default
        
        return value if value is not None else default
    
    def set(self, key: str, value: Any):
        """Define valor de configuração"""
        keys = key.split('.')
        config = self.config
        
        for k in keys[:-1]:
            if k not in config:
                config[k] = {}
            config = config[k]
        
        config[keys[-1]] = value


# Exemplo de uso
if __name__ == '__main__':
    logging.basicConfig(level=logging.INFO)
    
    # Carregar configuração
    platform_config = PlatformConfig()
    
    # Carregar módulos
    module_manager = ModuleManager()
    
    # Listar módulos
    print("Módulos carregados:")
    for name, metadata in module_manager.list_modules().items():
        print(f"  - {name}: {metadata['description']}")
    
    # Executar todos os módulos
    print("\nExecutando módulos...")
    results = module_manager.execute_all_modules()
    
    for module_name, result in results.items():
        print(f"\n{module_name}:")
        print(json.dumps(result, indent=2))
