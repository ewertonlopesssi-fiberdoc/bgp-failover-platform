# Módulo de Latência

Monitora latência de destinos por operadora usando NQA nativo do Huawei Ne8000 e Probes distribuídas.

## Características

- ✅ Monitoramento nativo via NQA do Ne8000
- ✅ Validação com Probes locais
- ✅ Suporte a Probes remotos
- ✅ Traceroute para validar caminho
- ✅ Gráficos de latência
- ✅ Alertas automáticos

## Configuração

Editar `config.json`:

```json
{
  "enabled": true,
  "destinos": [
    {
      "nome": "AWS_SAO_PAULO",
      "ip": "52.67.0.1",
      "operadoras": ["operadora_1", "operadora_2", "operadora_3"],
      "latencia_limite_ms": 100,
      "perda_limite_percent": 1
    }
  ],
  "nqa": {
    "enabled": true,
    "frequency": 30
  },
  "probes": {
    "enabled": true,
    "timeout": 5
  }
}
```

## Uso

### Via API

```bash
# Executar módulo
curl -X POST http://localhost:5000/api/v2/modules/latency/execute \
  -H "Authorization: Bearer $TOKEN"

# Obter métricas
curl -X GET "http://localhost:5000/api/v2/metrics/latency?hours=24" \
  -H "Authorization: Bearer $TOKEN"
```

### Via CLI

```bash
bgp-failover manage-destinos --id cliente_a
```

## Métricas

- `latencia_media_ms` - Latência média em milissegundos
- `latencia_min_ms` - Latência mínima
- `latencia_max_ms` - Latência máxima
- `perda_percent` - Percentual de perda de pacotes
- `jitter_ms` - Variação de latência

## Troubleshooting

### NQA não conecta

```bash
# Testar SSH ao Ne8000
ssh -i /etc/bgp_failover/ne8000_key.pem admin@192.168.0.1

# Verificar configuração
cat /etc/bgp_failover/nqa_config.json
```

### Latência muito alta

```bash
# Verificar se operadora está congestionada
curl -X GET "http://localhost:5000/api/v2/metrics/latency?hours=1" \
  -H "Authorization: Bearer $TOKEN"
```

## Próximas Melhorias

- [ ] Suporte a múltiplos destinos por cliente
- [ ] Alertas customizáveis
- [ ] Integração com Prometheus
- [ ] Dashboard web
