# BGP Failover Web - TODO

## Backend / Schema
- [x] Schema: tabelas de configuração Ne8000, Telegram, operadoras, destinos, clientes, failover, eventos, métricas de latência
- [x] tRPC: auth local com JWT (login, logout, me)
- [x] tRPC: configuração Ne8000 (get, save)
- [x] tRPC: configuração Telegram (get, save, test)
- [x] tRPC: gerenciamento de usuários (list, create, update, delete)
- [x] tRPC: gerenciamento de operadoras e destinos (list, add, remove)
- [x] tRPC: gerenciamento de clientes dedicados (list, add, update, delete)
- [x] tRPC: métricas de latência (list, add simulado)
- [x] tRPC: log de eventos/auditoria (list, add)
- [x] tRPC: controle do serviço (status, start, stop, restart)

## Frontend
- [x] Design system: cores, tipografia, tokens (dark theme elegante)
- [x] Tela de login com JWT local
- [x] DashboardLayout com sidebar elegante
- [x] Dashboard principal com cards de status
- [x] Formulário de configuração Ne8000
- [x] Formulário de configuração Telegram
- [x] Gerenciamento de usuários (CRUD)
- [x] Gerenciamento de clientes dedicados (CRUD + destinos)
- [x] Gráficos de latência por destino e por operadora
- [x] Painel de controle do serviço (start/stop/restart/status)
- [x] Log de eventos e auditoria
- [x] Gerenciamento de destinos monitorados por operadora

## Fase 2 - NQA Automático (Correções)
- [x] Monitor SSH: usa shell interativo (conn.shell) para compatibilidade com Ne8000
- [x] NQA: criação/remoção automática de testes por destino monitorado
- [x] NQA: tipo de teste alterado de icmpjitter para icmp (compatível com peer BGP)
- [x] NQA: limpeza automática de testes legados (v1/v2) na inicialização
- [x] NQA: parser atualizado para suportar formato icmp (Min/Max/Average Completion Time + Lost packet ratio)
- [x] Status: ALOO mostra Online (BGP Established + NQA icmp funcionando, RTT=3ms)
- [x] Status: lógica de fallback corrigida (sem destinos reais = BGP determina status, não NQA)
- [x] BR Digital: destino alterado para 201.16.68.108 (peer BGP), NQA funcionando RTT=6ms, perda=0%

## Fase 3 - UX / Dashboard
- [x] Adicionar botão "Zerar métricas" no dashboard para resetar histórico de latency_metrics
- [x] Endpoint tRPC: latency.reset implementado (DELETE em latency_metrics)
- [x] Remover gráfico de Jitter da página de métricas
- [x] Diferenciar cores das operadoras nos gráficos (ALOO azul, BR Digital verde)

## Fase 4 - Monitor Linux (Ping Direto no Debian)
- [x] Schema: tabela `linux_probes` (id, operatorId, name, sourceIp, active, createdAt)
- [x] Schema: tabela `linux_metrics` (id, probeId, operatorId, destinationId, latencyMs, packetLoss, measuredAt)
- [x] Backend: módulo `linuxMonitor.ts` — executa `ping -I <sourceIp> -c 5 <destino>` e salva métricas
- [x] Backend: tRPC `linuxProbes.list`, `linuxProbes.add`, `linuxProbes.remove`, `linuxProbes.toggle`
- [x] Backend: tRPC `linuxProbes.applyLoopback` — executa `ip addr add/del <ip>/32 dev lo` no Debian
- [x] Backend: tRPC `linuxMetrics.list` — retorna métricas do monitor Linux por período
- [x] Backend: tRPC `linuxMetrics.reset` — limpa histórico de linux_metrics
- [x] Frontend: página `/linux-monitor` com CRUD de loopbacks e gráficos de latência/perda
- [x] Frontend: adicionar item "Monitor Linux" no menu lateral
- [x] Deploy: migração SQL das novas tabelas em produção

## Fase 4 - Monitor Linux (Ping Direto Debian)
- [x] Criar tabelas linux_probes e linux_metrics no banco de dados
- [x] Implementar módulo linuxMonitor.ts com ping -I source_ip
- [x] Gerenciamento automático de loopbacks (ip addr add/del)
- [x] Endpoints tRPC: linuxProbes.list/add/remove/toggle e linuxMetrics.list/reset
- [x] Página LinuxMonitor.tsx com CRUD de probes e gráficos
- [x] Item "Monitor Linux" no menu lateral
- [x] Deploy em produção

## Fase 5 - Alertas Telegram por Limiar
- [x] Criar função sendTelegramMessage reutilizável no servidor
- [x] Adicionar campos latencyThreshold e packetLossThreshold na tabela telegram_config
- [x] Integrar envio de alerta no monitor quando latência/perda excede limiar
- [x] Integrar envio de alerta quando operadora muda de status (down/degraded/recovery)
- [x] Adicionar campos de limiar na página TelegramConfig
- [x] Deploy em produção

## Fase 6 - Monitor Linux: Destinos Independentes
- [x] Criar tabela linux_destinations com campos: name, host, packetSize, packetCount, frequency, offlineAlert, probeId, active
- [x] Migrar banco de dados em produção
- [x] Funções DB: listLinuxDestinations, createLinuxDestination, updateLinuxDestination, deleteLinuxDestination
- [x] Router tRPC: linuxDestinations (list, create, update, delete, metrics, clearMetrics)
- [x] Atualizar linuxMonitor para usar linux_destinations em vez de destinations (frequência individual por destino)
- [x] Frontend: modal de criação/edição com todos os campos
- [x] Frontend: listagem de destinos por probe com gráficos de latência/perda por destino
- [x] Deploy em produção

## Fase 7 - Monitor Linux: Alertas Telegram + Status em Tempo Real

- [x] Schema: adicionar campos offlineAlert (enum 1/2/3/5/never), latencyThreshold, lossThreshold na tabela linux_destinations
- [x] Migração SQL em produção para novos campos
- [x] linuxMonitor.ts: lógica de contagem consecutiva de falhas e disparo de alerta Telegram
- [x] linuxMonitor.ts: alerta por limiar de latência e perda por destino
- [x] linuxMonitor.ts: alerta de recuperação quando destino volta ao normal
- [x] Router tRPC: expor novos campos de alerta no linuxDestinations (create/update)
- [x] LinuxMonitor.tsx: indicador de status em tempo real (badge latência/perda por destino)
- [x] LinuxMonitor.tsx: formulário de edição com campos de alerta Telegram expandidos
- [x] Deploy em produção

## Fase 8 - Monitor Linux: Menu de Contexto no Badge + Histórico

- [x] Badge de status com menu de contexto (clique direito ou duplo clique): opções "Editar destino" e "Ver histórico"
- [x] Drawer/painel de histórico com gráfico de latência e perda ao longo do tempo (identificar início das perdas)
- [x] Anotações de eventos no gráfico (ex: marcador quando perda > 0 começa)
- [x] Botão de fechar o histórico retornando à tela geral sem perder estado
- [x] Deploy em produção

## Fase 9 - Monitor Linux: Notificações Telegram Enriquecidas

- [x] linuxMonitor.ts: rastrear início do incidente (timestamp da primeira falha)
- [x] linuxMonitor.ts: acumular amostras de perda durante o incidente para calcular média
- [x] linuxMonitor.ts: alerta de "perda estável" — notificar a cada 5 minutos com duração e média de perda/latência
- [x] linuxMonitor.ts: alerta de recuperação com duração total do incidente e média de perda durante o período
- [x] linuxMonitor.ts: alerta de limiar de latência com duração e média de latência durante o período
- [x] Deploy em produção

## Fase 10 - Monitor Linux: Alertas Telegram Diferenciados por Cenário

- [x] linuxMonitor.ts: mensagem específica para "só latência alta" (sem perda) — indica congestionamento
- [x] linuxMonitor.ts: mensagem específica para "só perda alta" (latência normal) — indica falha parcial
- [x] linuxMonitor.ts: mensagem específica para "ambos excedidos" — indica degradação severa
- [x] linuxMonitor.ts: notificação periódica e de normalização também diferenciadas por cenário
- [x] Deploy em produção

## Fase 11 - Monitor Linux: Grade Compacta de Destinos
- [x] LinuxMonitor.tsx: modo grade compacta de cards coloridos por status (verde/amarelo/vermelho)
- [x] Cards exibem latência/perda em destaque e nome do destino abaixo
- [x] Clique direito no card abre menu de contexto (Editar, Histórico)
- [x] Duplo clique abre histórico diretamente
- [x] Toggle entre modo grade e modo tabela
- [x] Deploy em produção

## Fase 11 - Correções Pendentes
- [x] Adicionar ação 'Remover' no menu de contexto dos cards da grade compacta (com confirmação)
- [x] Corrigir erro de runtime do LinuxMonitor em produção (query linux_probes — era apenas no dev server local, produção OK)

## Fase 12 - Renotificação Configurável + Histórico de Incidentes
- [x] Schema: adicionar alertRepeatMinutes (int, default 5) em linux_destinations
- [x] Schema: criar tabela linux_incidents (id, destinationId, probeId, type, startedAt, endedAt, avgLatency, avgLoss, maxLatency, maxLoss, resolved)
- [x] Migração SQL em produção para novos campos/tabelas
- [x] linuxMonitor.ts: usar alertRepeatMinutes por destino em vez do fixo 5min
- [x] linuxMonitor.ts: persistir incidente no banco ao iniciar e ao resolver
- [x] db.ts: funções listLinuxIncidents, createLinuxIncident, resolveLinuxIncident com JOIN (destinationName, probeName)
- [x] routers.ts: endpoint linuxIncidents.list (por probe ou destino, paginado)
- [x] LinuxMonitor.tsx: campo alertRepeatMinutes no formulário de edição (select: 2, 5, 10, 15, 30 min)
- [x] LinuxMonitor.tsx: aba "Incidentes" por probe com tabela histórica (tipo, destino+host, probe, início, fim, duração, médias)
- [x] Deploy em produção

## Fase 13 — LibreNMS Nível 1 (iframe no menu)

- [x] Instalar dependências PHP 8.1, nginx, rrdtool, composer no servidor Debian
- [x] Clonar LibreNMS em /opt/librenms e configurar permissões
- [x] Criar banco de dados librenms no MySQL de produção
- [x] Configurar virtual host nginx para LibreNMS na porta 8080
- [x] Executar instalação e validação do LibreNMS (validate.php)
- [x] Configurar cron do poller do LibreNMS
- [x] Criar página TrafficAnalysis.tsx com iframe apontando para LibreNMS
- [x] Adicionar item "Análise de Tráfego" no menu lateral (DashboardLayout.tsx)
- [x] Registrar rota /traffic no App.tsx
- [x] Build e deploy em produção

## Fase 14 — Análise de Tráfego Nativa (Nível 2)

- [x] Gerar token API do LibreNMS e salvar como secret
- [x] Criar endpoint tRPC proxy para API do LibreNMS (port data + graph data)
- [x] Implementar página TrafficAnalysis com layout dual-coluna (Upstream / Clientes Dedicados)
- [x] Cards de interface com sparkline, valores IN/OUT em tempo real e barra de utilização
- [x] Seletor de período (1h / 6h / 24h / 7d)
- [x] Auto-refresh a cada 1 minuto
- [x] Modal/expansão de gráfico completo ao clicar no card
- [x] Build e deploy em produção

## Fase 15 — Modo Compacto na Análise de Tráfego

- [x] Adicionar toggle de visualização (Normal / Compacto) na página TrafficAnalysis
- [x] Implementar card compacto estilo badge com nome, IN/OUT e status em linha
- [x] Persistir preferência de visualização no localStorage
- [x] Build e deploy em produção

## Fase 16 — Configuração de Interfaces e Alertas de Saturação

- [x] Criar tabela interface_configs no schema Drizzle (portId, ifName, label, contractedBps, alertThreshold, alertEnabled, category)
- [x] Gerar e aplicar migração SQL
- [x] Criar helpers de banco em server/db.ts para interface_configs
- [x] Criar endpoints tRPC: getInterfaceConfigs, upsertInterfaceConfig, deleteInterfaceConfig
- [x] Implementar lógica de alerta: verificar utilização vs plano contratado e disparar Telegram
- [x] Pré-popular tabela com aliases do Ne8000
- [x] Criar página InterfaceConfig.tsx com tabela editável (nome, plano, threshold, ativo)
- [x] Atualizar TrafficAnalysis para usar nomes da tabela em vez de hardcoded
- [x] Adicionar item "Config. Interfaces" no menu lateral
- [x] Build e deploy em produção

## Fase 17 — Config. Interfaces: Campo Cidade e Agrupamento

- [x] Adicionar coluna `city` (VARCHAR 100, nullable) na tabela interface_configs
- [x] Remover interfaces: PTP-TOPNET, PPPOE-CAETES, ONLINE-NET, Vlanif911
- [x] Popular campo city com as cidades corretas para cada cliente
- [x] Atualizar schema Drizzle com campo city
- [x] Atualizar endpoints tRPC (upsertInterfaceConfig) para incluir city
- [x] Atualizar InterfaceConfig.tsx com campo cidade no formulário de edição
- [x] Atualizar InterfaceConfig.tsx para agrupar clientes dedicados por cidade
- [x] Atualizar TrafficAnalysis.tsx para agrupar por cidade no modo normal e compacto
- [x] Build e deploy em produção

- [x] Atualizar TrafficAnalysis.tsx para agrupar interfaces dedicadas por cidade nos modos normal e compacto

## Fase 18 — Limpeza de interfaces
- [x] Remover UPLINK-SW-6730 (portId 4), PTP-SW2 (portId 5), UPLINK-CRS317 (portId 39) e ONLINE-NET (portId 117) do TrafficAnalysis.tsx
- [x] Build e deploy em produção
