<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:99b9e599b2823a6f17daf2f47c05cf51d4a358ab88c9450d68e9db9beb8ae9f4 -->

<!-- coderabbit-ai-generated-section:v1:99803fc568f90fdb7823e4340d43d3a8d2a0d1c491c309bcf76ccfd0319f9192 -->

# Micro Empresa

Empresa digital em desenvolvimento coordenada por Jarvis, CEO implementado sobre Vercel Eve. O Claude Agent SDK será seu executor especializado. Esta fase entrega a base local do agente; painel, departamentos e memória empresarial PostgreSQL permanecem futuros.

## Organização

- `services/eve/agent/`: agente Jarvis, canal protegido e auditoria.
- `services/eve/src/`: configuração, autenticação, controle HTTP e cliente de sessões.
- `services/claude-agent-sdk/`: executor futuro.
- `apps/jarvis-admin/`: painel futuro.
- `tests/`: testes automatizados com MockModel e servidor Eve local.

## Documentação

- [Auditoria inicial](docs/AUDIT_REPORT.md)
- [Arquitetura](docs/ARCHITECTURE.md)
- [Estado e validações](docs/PROJECT_STATUS.md)
- [Configuração e comandos](docs/AI_GATEWAY_SETUP.md)

Requer Node.js >=24. Instale com `npm ci --ignore-scripts`; valide com `npm test`, `npm run typecheck` e `npm run build`. Leia as limitações no estado do projeto antes de usar dados reais. Nenhum deploy foi realizado.


<!-- /coderabbit-ai-generated:v1 -->

## Gateway — Missão 02A

Integração real preparada com adapter oficial e limites por chamada; nenhuma inferência externa foi executada. O modo padrão exige configuração real; MockModel fica restrito aos testes. Consulte [configuração, custos e diagnóstico manual](docs/AI_GATEWAY_SETUP.md#missão-02a--execução-explícita) antes de usar `gateway:check`. Esse comando exige autorização explícita e pode consumir créditos.


<!-- /coderabbit-ai-generated:v1 -->