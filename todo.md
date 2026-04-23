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

- [ ] Schema: adicionar campos offlineConsecutive, latencyThreshold, lossThreshold na tabela linux_destinations
- [ ] Migração SQL em produção para novos campos
- [ ] linuxMonitor.ts: lógica de contagem consecutiva de falhas e disparo de alerta Telegram
- [ ] linuxMonitor.ts: alerta por limiar de latência e perda por destino
- [ ] linuxMonitor.ts: alerta de recuperação quando destino volta ao normal
- [ ] Router tRPC: expor novos campos de alerta no linuxDestinations (create/update)
- [ ] LinuxMonitor.tsx: indicador de status em tempo real (badge latência/perda por destino)
- [ ] LinuxMonitor.tsx: formulário de edição com campos de alerta Telegram expandidos
- [ ] Deploy em produção
