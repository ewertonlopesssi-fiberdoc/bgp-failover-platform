#!/usr/bin/env python3
"""
BGP Failover CLI v2
Interface de linha de comando melhorada com gerenciamento interativo de destinos
"""

import json
import sys
import argparse
from pathlib import Path
from tabulate import tabulate
from datetime import datetime

CONFIG_FILE = '/etc/bgp_failover/config.json'


class BGPFailoverCLIv2:
    """CLI melhorada para gerenciamento de failover BGP"""
    
    def __init__(self):
        self.config_file = CONFIG_FILE
        self.load_config()
    
    def load_config(self):
        """Carrega configuração"""
        try:
            with open(self.config_file, 'r') as f:
                self.config = json.load(f)
        except FileNotFoundError:
            print(f"❌ Arquivo de configuração não encontrado: {self.config_file}")
            sys.exit(1)
    
    def save_config(self):
        """Salva configuração"""
        with open(self.config_file, 'w') as f:
            json.dump(self.config, f, indent=2)
        print("✅ Configuração salva com sucesso")
    
    # ========================================================================
    # GERENCIAMENTO DE DESTINOS (NOVO)
    # ========================================================================
    
    def cmd_manage_destinos(self, args):
        """Gerencia destinos críticos de um cliente"""
        cliente_id = args.id
        
        cliente = self._find_cliente(cliente_id)
        if not cliente:
            print(f"❌ Cliente não encontrado: {cliente_id}")
            return
        
        while True:
            self._print_destinos_menu(cliente)
            opcao = input("\nEscolha uma opção: ").strip()
            
            if opcao == '0':
                break
            elif opcao == '1':
                self._add_destino(cliente)
            elif opcao == '2':
                self._remove_destino(cliente)
            elif opcao == '3':
                self._edit_destino(cliente)
            elif opcao == '4':
                self._list_destinos(cliente)
            else:
                print("❌ Opção inválida")
            
            print()
        
        self.save_config()
        print(f"✅ Destinos de '{cliente['nome']}' atualizados!\n")
    
    def _print_destinos_menu(self, cliente):
        """Exibe menu de gerenciamento de destinos"""
        print(f"\n{'='*60}")
        print(f"GERENCIAR DESTINOS - {cliente['nome']}")
        print(f"{'='*60}\n")
        
        # Listar destinos atuais
        destinos = cliente.get('destinos_criticos', [])
        print(f"📍 Destinos Atuais ({len(destinos)}):\n")
        
        if destinos:
            for i, destino in enumerate(destinos, 1):
                print(f"{i}. {destino['nome']}")
                print(f"   IP: {destino['ip']}")
                print(f"   Latência máx: {destino.get('latencia_maxima_ms', 'N/A')}ms")
                print(f"   Perda máx: {destino.get('perda_maxima_percent', 'N/A')}%\n")
        else:
            print("   (Nenhum destino cadastrado)\n")
        
        print("Opções:")
        print("1. ➕ Adicionar destino")
        print("2. 🗑️  Remover destino")
        print("3. ✏️  Editar destino")
        print("4. 📋 Listar destinos")
        print("0. ⬅️  Voltar")
    
    def _add_destino(self, cliente):
        """Adiciona novo destino"""
        print("\n➕ ADICIONAR NOVO DESTINO\n")
        
        nome = input("Nome do destino (ex: AWS_SAO_PAULO): ").strip()
        if not nome:
            print("❌ Nome é obrigatório")
            return
        
        ip = input("IP do destino (ex: 52.67.0.1): ").strip()
        if not ip:
            print("❌ IP é obrigatório")
            return
        
        try:
            latencia = int(input("Latência máxima (ms, padrão 100): ").strip() or "100")
            perda = float(input("Perda máxima (%, padrão 1): ").strip() or "1")
        except ValueError:
            print("❌ Valores inválidos")
            return
        
        destino = {
            'nome': nome,
            'ip': ip,
            'latencia_maxima_ms': latencia,
            'perda_maxima_percent': perda
        }
        
        cliente['destinos_criticos'].append(destino)
        print(f"✅ Destino '{nome}' adicionado com sucesso!")
    
    def _remove_destino(self, cliente):
        """Remove destino"""
        destinos = cliente.get('destinos_criticos', [])
        
        if not destinos:
            print("❌ Nenhum destino para remover")
            return
        
        print("\n🗑️  REMOVER DESTINO\n")
        
        for i, destino in enumerate(destinos, 1):
            print(f"{i}. {destino['nome']} ({destino['ip']})")
        
        try:
            idx = int(input("\nNúmero do destino a remover (0 para cancelar): ")) - 1
            
            if idx == -1:
                print("❌ Operação cancelada")
                return
            
            if 0 <= idx < len(destinos):
                destino_removido = destinos.pop(idx)
                print(f"✅ Destino '{destino_removido['nome']}' removido!")
            else:
                print("❌ Índice inválido")
        except ValueError:
            print("❌ Entrada inválida")
    
    def _edit_destino(self, cliente):
        """Edita destino existente"""
        destinos = cliente.get('destinos_criticos', [])
        
        if not destinos:
            print("❌ Nenhum destino para editar")
            return
        
        print("\n✏️  EDITAR DESTINO\n")
        
        for i, destino in enumerate(destinos, 1):
            print(f"{i}. {destino['nome']} ({destino['ip']})")
        
        try:
            idx = int(input("\nNúmero do destino a editar (0 para cancelar): ")) - 1
            
            if idx == -1:
                print("❌ Operação cancelada")
                return
            
            if not (0 <= idx < len(destinos)):
                print("❌ Índice inválido")
                return
            
            destino = destinos[idx]
            
            print(f"\nEditando: {destino['nome']}\n")
            
            # Editar campos
            novo_nome = input(f"Nome [{destino['nome']}]: ").strip() or destino['nome']
            novo_ip = input(f"IP [{destino['ip']}]: ").strip() or destino['ip']
            
            try:
                nova_latencia = int(input(f"Latência máx (ms) [{destino.get('latencia_maxima_ms')}]: ").strip() or str(destino.get('latencia_maxima_ms')))
                nova_perda = float(input(f"Perda máx (%) [{destino.get('perda_maxima_percent')}]: ").strip() or str(destino.get('perda_maxima_percent')))
            except ValueError:
                print("❌ Valores inválidos")
                return
            
            # Atualizar
            destino['nome'] = novo_nome
            destino['ip'] = novo_ip
            destino['latencia_maxima_ms'] = nova_latencia
            destino['perda_maxima_percent'] = nova_perda
            
            print(f"✅ Destino atualizado!")
        
        except ValueError:
            print("❌ Entrada inválida")
    
    def _list_destinos(self, cliente):
        """Lista destinos em formato tabela"""
        destinos = cliente.get('destinos_criticos', [])
        
        if not destinos:
            print("❌ Nenhum destino cadastrado")
            return
        
        print("\n📋 DESTINOS CRÍTICOS\n")
        
        data = []
        for i, destino in enumerate(destinos, 1):
            data.append([
                i,
                destino['nome'],
                destino['ip'],
                f"{destino.get('latencia_maxima_ms', 'N/A')}ms",
                f"{destino.get('perda_maxima_percent', 'N/A')}%"
            ])
        
        headers = ['#', 'Nome', 'IP', 'Latência Máx', 'Perda Máx']
        print(tabulate(data, headers=headers, tablefmt='grid'))
        print()
    
    # ========================================================================
    # COMANDOS ORIGINAIS (MANTIDOS)
    # ========================================================================
    
    def cmd_list_clientes(self, args):
        """Lista todos os clientes"""
        clientes = self.config.get('clientes', [])
        
        if not clientes:
            print("❌ Nenhum cliente cadastrado")
            return
        
        data = []
        for cliente in clientes:
            data.append([
                cliente['id'],
                cliente['nome'],
                cliente['prefixo'],
                len(cliente.get('destinos_criticos', [])),
                ', '.join(cliente.get('operadoras_preferidas', []))
            ])
        
        headers = ['ID', 'Nome', 'Prefixo', 'Destinos', 'Operadoras Preferidas']
        print("\n📋 CLIENTES CADASTRADOS:\n")
        print(tabulate(data, headers=headers, tablefmt='grid'))
        print(f"\nTotal: {len(clientes)} cliente(s)\n")
    
    def cmd_show_cliente(self, args):
        """Mostra detalhes de um cliente"""
        cliente_id = args.id
        
        cliente = self._find_cliente(cliente_id)
        if not cliente:
            print(f"❌ Cliente não encontrado: {cliente_id}")
            return
        
        self._print_cliente_details(cliente)
    
    def cmd_validate_config(self, args):
        """Valida a configuração"""
        print("\n🔍 VALIDANDO CONFIGURAÇÃO...\n")
        
        erros = []
        avisos = []
        
        clientes = self.config.get('clientes', [])
        operadoras = self.config.get('operadoras', [])
        operadora_ids = [op['id'] for op in operadoras]
        
        for cliente in clientes:
            if not cliente.get('id'):
                erros.append(f"Cliente sem ID")
            if not cliente.get('nome'):
                erros.append(f"Cliente {cliente.get('id')} sem nome")
            if not cliente.get('prefixo'):
                erros.append(f"Cliente {cliente.get('id')} sem prefixo")
            
            if not cliente.get('destinos_criticos'):
                erros.append(f"Cliente {cliente.get('id')} sem destinos críticos")
            
            operadoras_pref = cliente.get('operadoras_preferidas', [])
            for op_id in operadoras_pref:
                if op_id not in operadora_ids:
                    erros.append(f"Cliente {cliente.get('id')} referencia operadora inexistente: {op_id}")
            
            if cliente.get('operadora_fallback') not in operadora_ids:
                avisos.append(f"Cliente {cliente.get('id')} com operadora de fallback inexistente")
        
        if not operadoras:
            erros.append("Nenhuma operadora cadastrada")
        
        if erros:
            print("❌ ERROS ENCONTRADOS:\n")
            for erro in erros:
                print(f"   • {erro}")
            print()
        
        if avisos:
            print("⚠️  AVISOS:\n")
            for aviso in avisos:
                print(f"   • {aviso}")
            print()
        
        if not erros and not avisos:
            print("✅ Configuração válida!\n")
        
        return len(erros) == 0
    
    # ========================================================================
    # MÉTODOS AUXILIARES
    # ========================================================================
    
    def _find_cliente(self, cliente_id):
        """Encontra um cliente pelo ID"""
        for cliente in self.config.get('clientes', []):
            if cliente['id'] == cliente_id:
                return cliente
        return None
    
    def _print_cliente_details(self, cliente):
        """Imprime detalhes de um cliente"""
        print(f"\n{'='*60}")
        print(f"CLIENTE: {cliente['nome']}")
        print(f"{'='*60}\n")
        
        print(f"ID:                    {cliente['id']}")
        print(f"Prefixo:               {cliente['prefixo']}")
        print(f"VRF:                   {cliente.get('vrf', 'N/A')}")
        print(f"Operadoras Preferidas: {', '.join(cliente.get('operadoras_preferidas', []))}")
        print(f"Operadora Fallback:    {cliente.get('operadora_fallback', 'N/A')}")
        
        print(f"\n📍 DESTINOS CRÍTICOS ({len(cliente.get('destinos_criticos', []))}):\n")
        
        for destino in cliente.get('destinos_criticos', []):
            print(f"   • {destino['nome']}")
            print(f"     IP: {destino['ip']}")
            print(f"     Latência máxima: {destino.get('latencia_maxima_ms', 'N/A')}ms")
            print(f"     Perda máxima: {destino.get('perda_maxima_percent', 'N/A')}%\n")
        
        print(f"{'='*60}\n")


def main():
    """Função principal"""
    parser = argparse.ArgumentParser(
        description='BGP Failover CLI v2 - Gerenciador de clientes e destinos',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog='''
Exemplos de uso:
  %(prog)s list-clientes
  %(prog)s show-cliente --id cliente_a
  %(prog)s manage-destinos --id cliente_a
  %(prog)s validate-config
        '''
    )
    
    subparsers = parser.add_subparsers(dest='comando', help='Comando a executar')
    
    # Comando: list-clientes
    subparsers.add_parser('list-clientes', help='Lista todos os clientes')
    
    # Comando: show-cliente
    show_parser = subparsers.add_parser('show-cliente', help='Mostra detalhes de um cliente')
    show_parser.add_argument('--id', required=True, help='ID do cliente')
    
    # Comando: manage-destinos (NOVO)
    manage_parser = subparsers.add_parser('manage-destinos', 
                                         help='Gerencia destinos críticos de um cliente (interativo)')
    manage_parser.add_argument('--id', required=True, help='ID do cliente')
    
    # Comando: validate-config
    subparsers.add_parser('validate-config', help='Valida a configuração')
    
    args = parser.parse_args()
    
    if not args.comando:
        parser.print_help()
        return
    
    # Executar comando
    cli = BGPFailoverCLIv2()
    
    comando_map = {
        'list-clientes': cli.cmd_list_clientes,
        'show-cliente': cli.cmd_show_cliente,
        'manage-destinos': cli.cmd_manage_destinos,
        'validate-config': cli.cmd_validate_config,
    }
    
    if args.comando in comando_map:
        comando_map[args.comando](args)
    else:
        print(f"❌ Comando desconhecido: {args.comando}")


if __name__ == '__main__':
    main()
