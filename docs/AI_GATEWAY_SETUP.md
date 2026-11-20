<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:cc29116ac3b4a21056fca18d4cb5c4d295728482369b324a6478d115a1c7203c -->

# Configuração do AI Gateway

## Pré-requisitos

Node.js 24 ou superior e npm. Execute `npm ci --ignore-scripts` na raiz. As versões estão fixadas em package-lock.json. Não é necessário configurar Vercel, Docker ou credenciais para os testes com MockModel.

## Variáveis do servidor

| Variável | Uso |
| --- | --- |
| AI_GATEWAY_API_KEY | Chave do Vercel AI Gateway; obrigatória para execução real. |
| JARVIS_MODEL | ID `provedor/modelo` disponível no catálogo do Gateway; não há modelo padrão. |
| JARVIS_ADMIN_ID | Identidade administrativa estável provisionada no servidor. |
| JARVIS_ADMIN_TOKEN | Token aleatório secreto, com pelo menos 32 caracteres. |

Copie `.env.example` para `services/eve/.env.local`, preencha localmente e mantenha fora do Git. Não use prefixos NEXT_PUBLIC_. Não cole credenciais em conversas ou logs. A Eve carrega o ambiente de seu diretório de aplicação. Alternativamente, injete variáveis pelo ambiente do processo.

## Comandos

- `npm test`: testes locais com o mockModel oficial da Eve, incluindo servidor descartável.
- `npm run typecheck`: verificação TypeScript.
- `npm run build`: build Node da Eve.
- `npm run dev`: servidor local da Eve; use o cliente `JarvisSessions` no servidor com token administrativo. O terminal padrão da Eve não possui automaticamente esse token.

O módulo JarvisSessions permite `create()`, `attach(id)` e `execute(session, mensagem, true)` para solicitar o schema de plano. O handle oficial permite `snapshot()`, `cancel()` e `end()`; essas operações também passam pela verificação de proprietário no servidor. Não exponha o token diretamente ao navegador. O painel e uma API própria para seus usuários ainda não existem.

## Validação externa pendente

Nenhuma geração real pelo Gateway foi realizada. É necessário configurar uma chave válida, escolher modelo disponível e autorizar consumo. Preços variam por modelo e uso; não foi contratada capacidade nem efetuado pagamento. Consultar o [catálogo oficial](https://vercel.com/ai-gateway/models) e [documentação do Gateway](https://vercel.com/docs/ai-gateway) antes do teste. MockModel não comprova conectividade nem faturamento.


## Missão 02A — execução explícita

A versão Eve 1.0.0-rc.18 foi preservada. O adapter oficial @ai-sdk/gateway 4.0.146 foi fixado diretamente no projeto. Eve aceita interfaces de modelo v2/v3/v4 e recebe uma instância v4 do Gateway. A compatibilidade de tipos/build foi verificada; conectividade real ainda não foi validada.

### Modos

O agente em `services/eve/agent/agent.ts` usa exclusivamente `realModel()`. Sem configuração, falha; nunca troca silenciosamente para MockModel. Os testes criam uma cópia descartável com o `mockModel` oficial da Eve, sem credenciais. Não existe flag para ligar mock em produção.

### Configuração segura

1. Escolha um ID existente no [catálogo oficial](https://vercel.com/ai-gateway/models), verificando disponibilidade e preço; não há modelo padrão.
2. Configure `AI_GATEWAY_API_KEY` e `JARVIS_MODEL` em `services/eve/.env.local` para a Eve ou injete-os no processo.
3. Para o canal administrativo, configure também `JARVIS_ADMIN_ID` e `JARVIS_ADMIN_TOKEN` conforme a tabela acima.
4. Não use NEXT_PUBLIC_, não envie a chave ao navegador e não registre o ambiente. O arquivo local está ignorado pelo Git.

Não adicionamos AI_GATEWAY_BASE_URL: o provider oficial seleciona seu endpoint padrão. Não é necessário copiá-lo ou alterá-lo. Configuração válida sintaticamente não comprova que a chave ou o modelo são aceitos pelo serviço.

### Diagnóstico manual, não executado nesta missão

Somente após autorizar o consumo, o administrador executa na raiz, com as variáveis já injetadas:

```sh
npm run gateway:check -- --authorize-one-real-call
```

Para carregar o arquivo local no Node 24, sem imprimir valores:

```sh
node --env-file=services/eve/.env.local --import tsx scripts/gateway-check.ts --authorize-one-real-call
```

O diagnóstico exige a flag exata, valida a configuração antes da chamada e faz uma única solicitação: “Responda apenas: Jarvis operacional.” Limita a saída a 32 tokens e a duração a 15 segundos. Não usa sessão Eve nem testa continuidade: verifica diretamente o mesmo adapter compartilhado com o agente. A continuidade e a autenticação do canal são testadas localmente com MockModel.

Não há retry no diagnóstico, loop, lote ou agendamento. Uma resposta diferente da esperada resulta em invalid_response. O resultado imprime apenas status, confirmação da resposta esperada e metadados. Retorno completed após a chamada indica inferência externa; a simples inicialização não indica conexão. A chamada pode ser cobrada mesmo quando há timeout ou resposta inválida.

### Limites e observabilidade

O adapter compartilhado limita cada chamada a 256 tokens de saída (ou menos se solicitado), aplica 15 segundos inclusive ao streaming e combina cancelamento com o sinal do chamador. O teto é enviado ao provedor; tokens efetivamente cobrados dependem das regras do modelo. Não há ferramentas habilitadas. Permanecem os limites de sessão da Eve e 60 requisições/minuto por administrador/processo.

Mensagens ficam limitadas a 8000 caracteres na Bridge e no canal. O canal mantém o teto de corpo de 16 KiB. O adapter emite `gateway_call`, modo real, modelo, duração, status e totais de tokens quando fornecidos. Não registra texto, headers, resposta bruta, metadados arbitrários ou erro original. A Eve mantém seu histórico/traces próprios; esta mudança não garante que os logs internos de dependências omitam conversas. Mantenha o estado local privado.

### Diagnóstico de erros

- configuration_missing: preencher chave e modelo.
- invalid_model: corrigir a sintaxe provedor/modelo.
- authentication: conferir chave e permissões no painel.
- model_unavailable: conferir catálogo/acesso; inclui rejeições HTTP 400/404, que também podem indicar parâmetros incompatíveis.
- rate_limit: aguardar e verificar quota; nenhuma repetição automática pelo adapter.
- timeout: prazo esgotado; cancelamento não garante ausência de cobrança.
- cancelled: sinal de cancelamento recebido.
- network: falha de transporte.
- internal: erro não classificado ou HTTP 5xx.
- invalid_response: resposta vazia, stream sem término ou diagnóstico com texto inesperado.

O adapter lança GatewayFailure com código seguro e isRetryable=false. Não acrescenta tentativas. Os limites/cancelamento da sessão continuam sob controle da Eve; o diagnóstico direto é o caminho previsto para garantir uma única solicitação de inferência. Não realizar testes reais por `eve dev` sem autorização.

### Custos e escopo

Consulte preços no catálogo e uso no painel do Gateway antes/depois do diagnóstico. Configure manualmente os controles de gasto/quota disponíveis para sua conta/chave; nenhum limite financeiro foi criado por código. O teto de tokens não é teto monetário garantido. Não foram comprados créditos nem contratado serviço. PostgreSQL, executor Claude e painel continuam fora desta missão.

Fontes oficiais consultadas: [Eve agent-config](https://github.com/vercel/eve/blob/main/docs/agent-config.md), [Gateway getting started](https://vercel.com/docs/ai-gateway/getting-started), [provider oficial](https://ai-sdk.dev/providers/ai-sdk-providers/ai-gateway). Também foram inspecionadas as interfaces efetivamente instaladas das versões fixadas.


<!-- /coderabbit-ai-generated:v1 -->