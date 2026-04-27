# Contribuindo para BGP Failover Platform

Obrigado por seu interesse em contribuir! Este documento fornece diretrizes para contribuir com o projeto.

## Como Contribuir

### 1. Reportar Bugs

Se você encontrou um bug, crie uma issue no GitHub com:
- Descrição clara do problema
- Passos para reproduzir
- Comportamento esperado vs. atual
- Seu ambiente (OS, Python, versão do projeto)

### 2. Sugerir Melhorias

Para sugerir uma melhoria:
- Abra uma issue com o título começando com `[FEATURE]`
- Descreva a melhoria proposta
- Explique por que seria útil
- Liste exemplos de como seria usado

### 3. Enviar Pull Requests

#### Preparação

```bash
# 1. Fork o repositório
# 2. Clone seu fork
git clone https://github.com/seu-usuario/bgp-failover-platform.git
cd bgp-failover-platform

# 3. Crie uma branch
git checkout -b feature/sua-feature

# 4. Instale dependências
pip3 install -r requirements.txt
```

#### Desenvolvimento

- Siga o estilo de código Python (PEP 8)
- Adicione testes para novas funcionalidades
- Atualize a documentação
- Mantenha commits atômicos e descritivos

#### Submissão

```bash
# 1. Commit suas mudanças
git commit -m "Add: descrição clara da mudança"

# 2. Push para sua branch
git push origin feature/sua-feature

# 3. Abra um Pull Request
```

## Padrões de Código

### Python

```python
# Use type hints
def minha_funcao(parametro: str) -> Dict[str, Any]:
    """Docstring descrevendo a função."""
    pass

# Use logging
import logging
logger = logging.getLogger(__name__)
logger.info("Mensagem informativa")

# Tratamento de exceções
try:
    # código
except SpecificException as e:
    logger.error(f"Erro específico: {e}")
    raise
```

### Commits

```
Format: <tipo>: <descrição curta>

Tipos:
- feat: Nova funcionalidade
- fix: Correção de bug
- docs: Mudanças na documentação
- style: Formatação, sem mudanças de lógica
- refactor: Refatoração de código
- test: Adição ou atualização de testes
- chore: Mudanças em build, deps, etc

Exemplo:
feat: adicionar módulo de tráfego
fix: corrigir erro de conexão SSH
docs: atualizar guia de instalação
```

## Desenvolvimento de Módulos

Para contribuir com um novo módulo:

1. Crie a estrutura em `modules/seu_modulo/`
2. Implemente a classe herdando de `MonitoringModule`
3. Crie `config.json` com configuração padrão
4. Adicione `README.md` com documentação
5. Adicione testes em `tests/`
6. Envie um Pull Request

Veja [MODULO_DESENVOLVIMENTO.md](docs/MODULO_DESENVOLVIMENTO.md) para detalhes.

## Processo de Review

1. Seu PR será revisado por um mantenedor
2. Feedback será fornecido se necessário
3. Após aprovação, será feito merge
4. Você será creditado como contribuidor

## Código de Conduta

- Seja respeitoso com outros contribuidores
- Não tolere discriminação de qualquer tipo
- Reporte comportamento inadequado aos mantenedores

## Dúvidas?

- Abra uma issue com tag `[QUESTION]`
- Participe das discussões
- Envie um email para os mantenedores

## Licença

Ao contribuir, você concorda que suas contribuições serão licenciadas sob a MIT License.

---

Obrigado por contribuir! 🙏
