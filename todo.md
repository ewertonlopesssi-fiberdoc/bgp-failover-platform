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
