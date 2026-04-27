#!/usr/bin/env python3
"""
Módulo de Gráficos de Latência
Gera gráficos de latência por destino e operadora
"""

import json
import sqlite3
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, List, Tuple
import matplotlib.pyplot as plt
import matplotlib.dates as mdates
from contextlib import contextmanager

# Configuração de estilo
plt.style.use('seaborn-v0_8-darkgrid')
COLORS = {
    'operadora_1': '#FF6B6B',
    'operadora_2': '#4ECDC4',
    'operadora_3': '#45B7D1',
    'operadora_4': '#FFA07A',
    'operadora_5': '#98D8C8'
}


class LatencyGraphGenerator:
    """Gerador de gráficos de latência"""
    
    def __init__(self, db_file: str = '/var/lib/bgp_failover/latency.db',
                 output_dir: str = '/var/lib/bgp_failover/graphs'):
        self.db_file = db_file
        self.output_dir = output_dir
        Path(self.output_dir).mkdir(parents=True, exist_ok=True)
        self._init_db()
    
    def _init_db(self):
        """Inicializa banco de dados de latência"""
        with self._get_connection() as conn:
            conn.execute('''
                CREATE TABLE IF NOT EXISTS latency_metrics (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                    destino TEXT NOT NULL,
                    operadora TEXT NOT NULL,
                    latencia_ms REAL NOT NULL,
                    perda_percent REAL DEFAULT 0,
                    jitter_ms REAL DEFAULT 0
                )
            ''')
            
            # Criar índices para performance
            conn.execute('CREATE INDEX IF NOT EXISTS idx_destino_operadora ON latency_metrics(destino, operadora)')
            conn.execute('CREATE INDEX IF NOT EXISTS idx_timestamp ON latency_metrics(timestamp)')
            
            conn.commit()
    
    @contextmanager
    def _get_connection(self):
        """Context manager para conexão com banco de dados"""
        conn = sqlite3.connect(self.db_file)
        try:
            yield conn
        finally:
            conn.close()
    
    def record_latency(self, destino: str, operadora: str, latencia_ms: float,
                      perda_percent: float = 0, jitter_ms: float = 0):
        """
        Registra métrica de latência
        
        Args:
            destino: Nome do destino
            operadora: ID da operadora
            latencia_ms: Latência em milissegundos
            perda_percent: Percentual de perda de pacotes
            jitter_ms: Jitter em milissegundos
        """
        with self._get_connection() as conn:
            conn.execute('''
                INSERT INTO latency_metrics (destino, operadora, latencia_ms, perda_percent, jitter_ms)
                VALUES (?, ?, ?, ?, ?)
            ''', (destino, operadora, latencia_ms, perda_percent, jitter_ms))
            conn.commit()
    
    def get_latency_data(self, destino: str, operadora: str = None,
                        hours: int = 24) -> List[Tuple]:
        """
        Obtém dados de latência
        
        Args:
            destino: Nome do destino
            operadora: ID da operadora (None para todas)
            hours: Número de horas para retroceder
        
        Returns:
            Lista de tuplas (timestamp, latencia_ms)
        """
        cutoff_time = datetime.now() - timedelta(hours=hours)
        
        with self._get_connection() as conn:
            if operadora:
                cursor = conn.execute('''
                    SELECT timestamp, latencia_ms FROM latency_metrics
                    WHERE destino = ? AND operadora = ? AND timestamp > ?
                    ORDER BY timestamp ASC
                ''', (destino, operadora, cutoff_time.isoformat()))
            else:
                cursor = conn.execute('''
                    SELECT timestamp, latencia_ms FROM latency_metrics
                    WHERE destino = ? AND timestamp > ?
                    ORDER BY timestamp ASC
                ''', (destino, cutoff_time.isoformat()))
            
            return cursor.fetchall()
    
    def get_operadoras_for_destino(self, destino: str) -> List[str]:
        """Obtém lista de operadoras para um destino"""
        with self._get_connection() as conn:
            cursor = conn.execute('''
                SELECT DISTINCT operadora FROM latency_metrics
                WHERE destino = ?
                ORDER BY operadora
            ''', (destino,))
            return [row[0] for row in cursor.fetchall()]
    
    def get_all_destinos(self) -> List[str]:
        """Obtém lista de todos os destinos monitorados"""
        with self._get_connection() as conn:
            cursor = conn.execute('''
                SELECT DISTINCT destino FROM latency_metrics
                ORDER BY destino
            ''')
            return [row[0] for row in cursor.fetchall()]
    
    def generate_destino_graph(self, destino: str, hours: int = 24,
                              filename: str = None) -> str:
        """
        Gera gráfico de latência por operadora para um destino
        
        Args:
            destino: Nome do destino
            hours: Número de horas para retroceder
            filename: Nome do arquivo (auto-gerado se None)
        
        Returns:
            Caminho do arquivo gerado
        """
        if filename is None:
            filename = f"{destino}_latency_{datetime.now().strftime('%Y%m%d_%H%M%S')}.png"
        
        filepath = Path(self.output_dir) / filename
        
        # Obter operadoras para este destino
        operadoras = self.get_operadoras_for_destino(destino)
        
        if not operadoras:
            raise ValueError(f"Nenhum dado disponível para destino: {destino}")
        
        # Criar figura
        fig, ax = plt.subplots(figsize=(14, 8))
        
        # Plotar dados para cada operadora
        for operadora in operadoras:
            data = self.get_latency_data(destino, operadora, hours)
            
            if not data:
                continue
            
            timestamps = [datetime.fromisoformat(row[0]) for row in data]
            latencias = [row[1] for row in data]
            
            color = COLORS.get(operadora, '#808080')
            ax.plot(timestamps, latencias, marker='o', label=operadora,
                   color=color, linewidth=2, markersize=4, alpha=0.7)
        
        # Configurar eixos
        ax.set_xlabel('Horário', fontsize=12, fontweight='bold')
        ax.set_ylabel('Latência (ms)', fontsize=12, fontweight='bold')
        ax.set_title(f'Latência - {destino} (últimas {hours}h)', 
                    fontsize=14, fontweight='bold')
        
        # Formatar eixo X
        ax.xaxis.set_major_formatter(mdates.DateFormatter('%H:%M'))
        ax.xaxis.set_major_locator(mdates.HourLocator(interval=max(1, hours//12)))
        plt.xticks(rotation=45, ha='right')
        
        # Grid e legenda
        ax.grid(True, alpha=0.3)
        ax.legend(loc='upper left', fontsize=10)
        
        # Ajustar layout
        plt.tight_layout()
        
        # Salvar
        plt.savefig(filepath, dpi=100, bbox_inches='tight')
        plt.close()
        
        return str(filepath)
    
    def generate_operadora_graph(self, operadora: str, hours: int = 24,
                                filename: str = None) -> str:
        """
        Gera gráfico de latência por destino para uma operadora
        
        Args:
            operadora: ID da operadora
            hours: Número de horas para retroceder
            filename: Nome do arquivo (auto-gerado se None)
        
        Returns:
            Caminho do arquivo gerado
        """
        if filename is None:
            filename = f"{operadora}_latency_{datetime.now().strftime('%Y%m%d_%H%M%S')}.png"
        
        filepath = Path(self.output_dir) / filename
        
        # Obter todos os destinos
        destinos = self.get_all_destinos()
        
        if not destinos:
            raise ValueError("Nenhum dado disponível")
        
        # Criar figura
        fig, ax = plt.subplots(figsize=(14, 8))
        
        # Plotar dados para cada destino
        for i, destino in enumerate(destinos):
            data = self.get_latency_data(destino, operadora, hours)
            
            if not data:
                continue
            
            timestamps = [datetime.fromisoformat(row[0]) for row in data]
            latencias = [row[1] for row in data]
            
            color = plt.cm.tab10(i % 10)
            ax.plot(timestamps, latencias, marker='s', label=destino,
                   color=color, linewidth=2, markersize=4, alpha=0.7)
        
        # Configurar eixos
        ax.set_xlabel('Horário', fontsize=12, fontweight='bold')
        ax.set_ylabel('Latência (ms)', fontsize=12, fontweight='bold')
        ax.set_title(f'Latência - {operadora} (últimas {hours}h)',
                    fontsize=14, fontweight='bold')
        
        # Formatar eixo X
        ax.xaxis.set_major_formatter(mdates.DateFormatter('%H:%M'))
        ax.xaxis.set_major_locator(mdates.HourLocator(interval=max(1, hours//12)))
        plt.xticks(rotation=45, ha='right')
        
        # Grid e legenda
        ax.grid(True, alpha=0.3)
        ax.legend(loc='upper left', fontsize=10, ncol=2)
        
        # Ajustar layout
        plt.tight_layout()
        
        # Salvar
        plt.savefig(filepath, dpi=100, bbox_inches='tight')
        plt.close()
        
        return str(filepath)
    
    def generate_comparison_graph(self, destino: str, operadoras: List[str],
                                 hours: int = 24, filename: str = None) -> str:
        """
        Gera gráfico comparativo de latência
        
        Args:
            destino: Nome do destino
            operadoras: Lista de IDs de operadoras
            hours: Número de horas para retroceder
            filename: Nome do arquivo (auto-gerado se None)
        
        Returns:
            Caminho do arquivo gerado
        """
        if filename is None:
            filename = f"comparison_{destino}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.png"
        
        filepath = Path(self.output_dir) / filename
        
        # Criar figura com subplots
        fig, axes = plt.subplots(len(operadoras), 1, figsize=(14, 4*len(operadoras)))
        
        if len(operadoras) == 1:
            axes = [axes]
        
        # Plotar para cada operadora
        for idx, operadora in enumerate(operadoras):
            ax = axes[idx]
            data = self.get_latency_data(destino, operadora, hours)
            
            if not data:
                ax.text(0.5, 0.5, f'Sem dados para {operadora}',
                       ha='center', va='center', transform=ax.transAxes)
                continue
            
            timestamps = [datetime.fromisoformat(row[0]) for row in data]
            latencias = [row[1] for row in data]
            
            color = COLORS.get(operadora, '#808080')
            ax.fill_between(timestamps, latencias, alpha=0.3, color=color)
            ax.plot(timestamps, latencias, marker='o', color=color,
                   linewidth=2, markersize=5)
            
            # Calcular estatísticas
            avg_latencia = sum(latencias) / len(latencias)
            max_latencia = max(latencias)
            min_latencia = min(latencias)
            
            ax.axhline(y=avg_latencia, color=color, linestyle='--', alpha=0.5, label=f'Média: {avg_latencia:.2f}ms')
            
            ax.set_ylabel('Latência (ms)', fontsize=10, fontweight='bold')
            ax.set_title(f'{operadora} - Min: {min_latencia:.2f}ms, Máx: {max_latencia:.2f}ms',
                        fontsize=11, fontweight='bold')
            ax.grid(True, alpha=0.3)
            ax.legend(loc='upper left', fontsize=9)
            
            # Formatar eixo X
            ax.xaxis.set_major_formatter(mdates.DateFormatter('%H:%M'))
            ax.xaxis.set_major_locator(mdates.HourLocator(interval=max(1, hours//12)))
            
            if idx == len(operadoras) - 1:
                plt.setp(ax.xaxis.get_majorticklabels(), rotation=45, ha='right')
            else:
                ax.set_xticklabels([])
        
        # Título geral
        fig.suptitle(f'Comparação de Latência - {destino} (últimas {hours}h)',
                    fontsize=14, fontweight='bold', y=0.995)
        
        # Ajustar layout
        plt.tight_layout()
        
        # Salvar
        plt.savefig(filepath, dpi=100, bbox_inches='tight')
        plt.close()
        
        return str(filepath)
    
    def generate_summary_report(self, hours: int = 24) -> Dict:
        """
        Gera relatório resumido de latência
        
        Args:
            hours: Número de horas para retroceder
        
        Returns:
            Dicionário com resumo
        """
        destinos = self.get_all_destinos()
        
        report = {
            'timestamp': datetime.now().isoformat(),
            'period_hours': hours,
            'destinos': {}
        }
        
        for destino in destinos:
            operadoras = self.get_operadoras_for_destino(destino)
            destino_data = {}
            
            for operadora in operadoras:
                data = self.get_latency_data(destino, operadora, hours)
                
                if not data:
                    continue
                
                latencias = [row[1] for row in data]
                
                destino_data[operadora] = {
                    'media': sum(latencias) / len(latencias),
                    'minima': min(latencias),
                    'maxima': max(latencias),
                    'amostras': len(latencias)
                }
            
            if destino_data:
                report['destinos'][destino] = destino_data
        
        return report


# Exemplo de uso
if __name__ == '__main__':
    generator = LatencyGraphGenerator()
    
    # Registrar algumas métricas de exemplo
    generator.record_latency('AWS_SAO_PAULO', 'operadora_1', 45.2, 0.1, 2.3)
    generator.record_latency('AWS_SAO_PAULO', 'operadora_2', 38.5, 0.05, 1.8)
    generator.record_latency('AWS_SAO_PAULO', 'operadora_3', 52.1, 0.2, 3.1)
    
    # Gerar gráfico
    try:
        filepath = generator.generate_destino_graph('AWS_SAO_PAULO')
        print(f"Gráfico gerado: {filepath}")
    except ValueError as e:
        print(f"Erro: {e}")
