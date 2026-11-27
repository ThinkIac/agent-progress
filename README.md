# Agent Progress

Pacote Lógos para o ThinkIac que envia resumos periódicos do progresso do agente durante um turno. O repositório e o pacote no Runtime se chamam `agent-progress`.

## Requisitos e instalação

Instale o diretório do pacote como `packages/agent-progress` em um workspace ThinkIac compatível e carregue-o pelo Runtime Lógos. O pacote depende de `agent` e `ui-schema`, declarados em `logosDependencies`. Ele também requer uma versão do host que ofereça a seção extensível de configurações de Sessions, o hook `agent:progress`, o evento `agent:session-model-pools` e a entrega de mensagens de progresso no chat. Essas integrações pertencem ao host e não estão incluídas neste repositório; instalar o pacote sozinho em uma versão sem elas não habilita a funcionalidade.

## Configuração

Em **Configurações → Sessões → Resumos de progresso**, ative os resumos, escolha um intervalo inteiro positivo em iterações e selecione um modelo de uma pool ativa, agrupado por provider. Escolha as instruções:

- **Default**: pede um resumo breve do que foi feito, do trabalho em andamento e da expectativa para os próximos passos, no idioma do pedido.
- **Custom**: usa o texto informado como prompt de sistema, com até 4.000 caracteres.

A função começa desativada. As preferências são carregadas no início de cada turno, portanto mudanças salvas se aplicam aos próximos turnos. A seleção exige uma pool ativa e um modelo válido quando a função está ativada.

## Como funciona

O Agent chama o hook `agent:progress` nas fases de início, iteração e fim. No início, o pacote lê as preferências, verifica o modelo disponível e registra o objetivo do turno. Durante o loop, acumula as etapas fornecidas pelo host; no início de cada iteração múltipla do intervalo, envia essas informações como dados ao modelo selecionado pelo evento interno `llm:call`. O host entrega o texto retornado como mensagem do agente no fluxo normal do chat e no histórico.

A geração ocorre em paralelo e não bloqueia a próxima iteração do agente. Além do intervalo configurado em iterações, um relógio solicita uma atualização após 30 segundos sem geração em andamento, inclusive quando a iteração atual demora. Cada sessão mantém no máximo uma chamada de resumo em andamento, sem fila de textos antigos. O relógio é reiniciado após cada tentativa. A cadência de entrega depende da latência e da disponibilidade do modelo; falhas não geram mensagens artificiais.

As chamadas têm limite de 12 segundos e são canceladas quando o turno é cancelado. Se a geração falhar, não retornar texto ou for cancelada, nenhum resumo é publicado e o loop continua. O objetivo e as 199 etapas mais recentes são mantidos em memória durante o turno. Encerrar, cancelar ou reiniciar o turno cancela a geração anterior, remove o relógio e impede publicações tardias. A configuração local é salva em `data/preferences.json` e não acompanha a distribuição.

## Integração com Lógos e ThinkIac

| Recurso | Papel |
| --- | --- |
| Manifesto `settingsSection` | Registra a seção em Sessions, renderizada como formulário pelo `ui-schema`. |
| Rotas `system/view` e `system/action` | Fornecem o formulário e validam e salvam as preferências. |
| `agent:session-model-pools` | Fornece as pools para a seleção de modelos ativos. |
| Hook `agent:progress` | Recebe objetivo, iterações, etapas, cancelamento e função de entrega do host. |
| `llm:call` | Solicita a geração ao modelo e à pool escolhidos, sem ferramentas. |

## Desenvolvimento

```bash
npm test
```

Os testes do pacote exercitam o mecanismo de resumos e o hook com chamadas de modelo simuladas. Um teste com provedor real no aplicativo depende de uma instalação compatível e de um modelo ativo configurado.
