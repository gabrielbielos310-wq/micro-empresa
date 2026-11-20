<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:2a9020abd44263c45660dd6debbe8d23926b4cfc71fa9eccacbd94254f9c9d07 -->

# Arquitetura oficial — Jarvis

Jarvis é o CEO, em português brasileiro. Eve interpreta objetivos, planeja etapas, coordena agentes e avalia evidências. Claude Agent SDK será executor técnico subordinado. Nenhuma ferramenta de execução está habilitada nesta fase.

```mermaid
flowchart LR
    A[Administrador autenticado] --> B[Node.js Bridge / JarvisSessions]
    B --> E[Vercel Eve / Jarvis]
    E --> G[AI Gateway / modelo configurável]
    E -. Planejamento futuro .-> C[Claude Agent SDK]
    B -. Futuro .-> P[PostgreSQL]
    UI[Painel Next.js / React / TypeScript / Three.js] -. Futuro .-> B
```

## Implementado

- `services/eve/agent`: configuração nativa Eve, instruções de identidade, canal HTTP protegido e hook de auditoria.
- `services/eve/src/config.ts`: seleção de modelo e verificação de credencial em tempo de execução.
- `auth.ts`: token administrativo comparado por hash em tempo constante; identidade provisionada no servidor; 60 requisições/minuto por administrador por processo.
- `channel.ts`: validação do proprietário em leitura e comandos, limite de corpo de 16 KiB e leitura de 5 segundos; anexos desabilitados. Somente health público. Metadados de proprietário em `.eve/jarvis-owners` com permissões locais restritas.
- `sessions.ts`: cliente para a Bridge, criação/recuperação de sessão, validação de mensagem, saída estruturada opcional, leitura com prazo e cancelamento cooperativo, mensagem de erro sanitizada.
- Histórico e execução de sessões são gerenciados pela Eve. O estado local é ignorado pelo Git. PostgreSQL ainda não foi integrado.

## Limites conhecidos

Um administrador por configuração; token compartilhado não é login de usuários nem SSO. Trocar o ID administrativo não transfere sessões antigas. Propriedade local deve migrar para banco transacional antes de múltiplas instâncias. O limitador reinicia com o processo. Encerrar uma sessão não apaga seu histórico. Backup, retenção e criptografia em repouso precisam de definição.

O cliente aplica 30 segundos e tenta cancelar; chamadas diretas ao canal não têm esse prazo de ponta a ponta. O limite de uso da Eve é verificado antes da próxima chamada e pode ultrapassar o teto em uma geração. Não constitui teto financeiro garantido. Traces da Eve podem conter conversas: manter diretório local privado e não usar dados sensíveis antes de definir retenção. Os logs escritos pelo projeto contêm apenas eventos e identificadores, nunca tokens ou conteúdo de erros do provedor.

## Fora desta missão

Executor Claude, ferramentas, departamentos reais, banco PostgreSQL e painel responsivo mobile-first. Os diretórios reservados existentes foram preservados. Nenhum deploy ou merge em main.

Fontes técnicas: [Eve](https://github.com/vercel/eve), documentação distribuída com `eve@1.0.0-rc.18` (`docs/agent-config.md`, `docs/channels/eve.mdx`, `docs/guides/auth-and-route-protection.md`).


## Evolução na Missão 02A

O núcleo e as proteções existentes foram preservados. `gateway.ts` fornece o modelo oficial do Gateway à configuração dinâmica da Eve. O Proxy preserva o contrato do provider e controla geração/streaming com teto de saída, prazo, cancelamento e auditoria segura. `GatewayFailure` separa códigos de falha do conteúdo sensível dos erros originais. `scripts/gateway-check.ts` reutiliza esse adapter para uma geração direta explícita, sem retries ou sessões.

A configuração antiga de string foi substituída por instância do provider para aplicar limites por chamada; seleção por JARVIS_MODEL permanece. A validação sintática não consulta o catálogo nem atesta credenciais. Testes substituem somente o modelo, sem habilitar fallback em execução real. A sessão Eve mantém contexto e controle de proprietário; diagnóstico direto não mede essa continuidade.


<!-- /coderabbit-ai-generated:v1 -->