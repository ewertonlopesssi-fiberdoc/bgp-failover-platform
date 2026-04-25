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

## Fase 19 — Visibilidade de interfaces
- [x] Adicionar coluna `visible` (boolean, default true) na tabela interface_configs em produção e dev
- [x] Atualizar schema Drizzle, helpers db.ts e endpoint upsertInterfaceConfig
- [x] Adicionar toggle "Visível" na página InterfaceConfig.tsx
- [x] Filtrar interfaces com visible=false na página TrafficAnalysis.tsx
- [x] Build e deploy em produção

## Fase 20 — Adicionar cliente Canhotinho (Vlanif999)
- [x] Descobrir portId da Vlanif999 no LibreNMS (portId=84)
- [x] Inserir registro na tabela interface_configs (produção e dev) com label=CANHOTINHO, city=Canhotinho, category=dedicated
- [x] Adicionar Vlanif999 ao DEDICATED_INTERFACES no TrafficAnalysis.tsx
- [x] Build e deploy em produção

## Fase 21 — Gráficos em Mbps/Gbps
- [x] Corrigir eixo Y do gráfico histórico para exibir em Mbps/Gbps (não bps brutos)
- [x] Corrigir tooltip do gráfico para exibir valores formatados em Mbps/Gbps
- [x] Corrigir legenda do gráfico (IN/OUT labels dinâmicos por unidade)
- [x] Build e deploy em produção

## Fase 22 — Melhorias no gráfico histórico
- [x] Adicionar linha de referência (ReferenceLine) com o plano contratado no gráfico
- [x] Adicionar botão de período 30d no seletor de período (já existia)
- [x] Calcular e exibir percentil 95 de IN e OUT no modal do gráfico
- [x] Build e deploy em produção

## Fase 23 — Latência dos clientes dedicados nos cards de tráfego
- [x] Adicionar coluna client_ip na tabela interface_configs (schema + migration)
- [x] Popular client_ip com IPs mapeados (portId→IP) em produção e dev
- [x] Criar endpoint tRPC traffic.pingClients que faz ping para todos os client_ips e salva latência
- [x] Criar endpoint tRPC traffic.getLatencies que retorna latência atual de cada portId
- [x] Exibir latência (ms) à esquerda do tráfego nos cards normal e compacto
- [x] Build e deploy em produção

## Fase 24 — Cron de ping, alerta Telegram por latência e histórico RTT
- [x] Criar tabela latency_history no banco (portId, latencyMs, status, timestamp)
- [x] Atualizar pingClients para persistir cada medição no banco
- [x] Criar endpoint traffic.getLatencyHistory para retornar histórico RTT por portId e período
- [x] Implementar alerta Telegram quando latência > threshold ou sem resposta por 3 ciclos
- [x] Adicionar modal de histórico RTT ao clicar no badge de latência nos cards
- [x] Instalar cron de ping automático no servidor (a cada 1 min)
- [x] Build e deploy em produção

## Fase 25 — Correção de IPs de ping
- [x] CONECTA-TELECOM (portId 104): client_ip → 131.196.240.1 (RTT ~1.27ms)
- [x] RB-NET (portId 103): client_ip → 45.233.25.1 (RTT ~1.63ms)
- [x] Remover client_ip de portId 102 (RB-NET antigo 10.22.67.2)
- [x] Limpar client_ip de HNET-META (portId 108) e HNET-META-BJ (portId 112)
- [x] Testar ping com novos IPs em produção (ambos respondendo 0% perda)

## Fase 26 — Mapa de Rede Geográfico
- [x] Criar tabelas network_nodes (id, deviceId, name, city, lat, lng, type, active) e network_links (id, fromNodeId, fromPortId, toNodeId, toPortId, linkType, active) no schema Drizzle
- [x] Gerar migration e aplicar em produção e dev
- [x] Helpers db.ts: listNetworkNodes, createNetworkNode, updateNetworkNode, deleteNetworkNode, listNetworkLinks, createNetworkLink, updateNetworkLink, deleteNetworkLink
- [x] Endpoints tRPC: network.nodes (list, create, update, delete) e network.links (list, create, update, delete)
- [x] Endpoint tRPC: network.getLibreNMSDevices (importar dispositivos do LibreNMS)
- [x] Endpoint tRPC: network.getLinkTraffic (tráfego em tempo real por portId de link)
- [x] Página NetworkMap.tsx com Google Maps, marcadores de switches e linhas de links com tráfego
- [x] Painel lateral de cadastro/edição de nós (nome, cidade, lat/lng, tipo, deviceId LibreNMS)
- [x] Painel lateral de cadastro/edição de links (fromNode+porta, toNode+porta, tipo de link)
- [x] Importação automática de dispositivos do LibreNMS com geocoding por cidade
- [x] Adicionar item "Mapa de Rede" no menu lateral (DashboardLayout.tsx)
- [x] Registrar rota /network-map no App.tsx
- [x] Build e deploy em produção

## Fase 26b — Migração Google Maps → Leaflet/OpenStreetMap
- [x] Substituir Google Maps (MapView) pelo Leaflet.js + react-leaflet no NetworkMap.tsx
- [x] Usar tiles do OpenStreetMap (sem necessidade de API key ou proxy)
- [x] Corrigir ícones do Leaflet (bug de URL com Vite) via L.Icon.Default.mergeOptions
- [x] Substituir geocoding do Google Maps pelo Nominatim (OpenStreetMap) na importação LibreNMS
- [x] Substituir geocoding do Google Maps pelo Nominatim no botão de busca de coordenadas por cidade
- [x] Build e deploy em produção (45.237.165.251) com Leaflet funcionando

## Fase 26c — Correção do mapa Leaflet (container sem altura)
- [x] Corrigir MapContainer para ter altura explícita (não depender de flex-1 do pai)
- [x] Build e deploy em produção

## Fase 26d — Correções do painel Gerenciar e fluxo de links
- [x] Corrigir z-index do painel lateral (fica atrás do mapa Leaflet)
- [x] Melhorar fluxo de criação de links: selecionar nó de origem e destino visualmente
- [x] Build e deploy em produção

## Fase 26e — Bug: edição de nó não salva coordenadas
- [x] Investigar updateNode no routers.ts — backend funciona (confirmado via API direta)
- [x] Corrigir o formulário de edição no NetworkMap.tsx — adicionado onError visível + tratamento FORBIDDEN
- [x] Build e deploy em produção

## Fase 27 — Marcadores arrastáveis no mapa
- [x] Adicionar draggable nos Markers do Leaflet com atualização automática de lat/lng ao soltar
- [x] Toast de confirmação ao soltar o marcador
- [x] Build e deploy em produção

## Fase 28 — Melhorias no Mapa de Rede
- [x] Corrigir bug: traçado de link não aparece (era FORBIDDEN silencioso, mudado para localAuthProcedure)
- [x] Dropdown de portas do LibreNMS no formulário de link (origem e destino)
- [x] Campo de capacidade em MB/Gbps (amigável, sem digitar bps)
- [x] Renomear nós com nomes corretos (SW-ALAGOINHA, SW-ARCOVERDE, etc.)
- [x] Build e deploy em produção

## Fase 28b — Correção dropdown portas destino
- [x] Porta Destino mostrava portas do nó de origem — corrigido com key único por nodeId nos Select
- [x] Build e deploy em produção

## Fase 28c — Correção endpoint portas LibreNMS
- [x] Endpoint /ports?device_id=X ignorava o filtro — corrigido para /devices/{id}/ports
- [x] Build e deploy em produção

## Fase 29 — Roteamento por ruas e caixa de tráfego
- [x] Roteamento de links por ruas reais via OSRM (router.project-osrm.org)
- [x] Opção "Rota por ruas" ao criar/editar link (toggle: linha reta vs rota real)
- [x] Caixa flutuante ao hover na linha: tráfego IN/OUT, status da porta, velocidade, % utilização
- [x] Buscar dados de tráfego do LibreNMS em tempo real (endpoint /ports/{id})
- [x] Colorir linha por utilização: verde <50%, amarelo 50-80%, vermelho >80%
- [x] Build e deploy em produção

## Fase 30 — Modernização visual do Mapa de Rede

- [x] Redesenhar marcadores: ícone circular com halo colorido por status (vermelho=alto uso, laranja=médio, verde=baixo), estilo LibreNMS
- [x] Botão "Ocultar nomes" no header do mapa para alternar visibilidade dos labels dos switches
- [x] Rota por estradas calculada automaticamente ao criar/editar link (sem precisar ativar toggle manualmente)
- [x] Caixa de tráfego: usar apenas fromPortId (porta de saída do nó de origem) para evitar conflitos
- [x] Caixa de tráfego: exibir TX/RX com nome da porta, estilo popup simples como nas imagens de referência
- [x] Build e deploy em produção
