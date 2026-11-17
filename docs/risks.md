# Riscos técnicos e financeiros — RPG AI

Escala: Impacto e Probabilidade (Alto / Médio / Baixo).

## Riscos técnicos

| #   | Risco                                                                                                                                                  | Imp.  | Prob. | Mitigação                                                                                                                                                                                                 |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ----- | ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T1  | **Extração imperfeita de regras.** Livros de RPG têm colunas, tabelas, boxes laterais e regras espalhadas em vários capítulos. Nenhuma IA acerta 100%. | Alto  | Alto  | Revisão humana obrigatória; citação verificada; confiança visível; regras "textuais" quando não automatizáveis. Expectativa realista: a importação _acelera_ a configuração de um sistema, não a elimina. |
| T2  | **Sistemas muito diferentes** (sem dados, narrativos, com cartas) não caberem no modelo.                                                               | Alto  | Médio | Modelo extensível + regras textuais; validar cedo com 3 sistemas de estilos diferentes na Fase 3.                                                                                                         |
| T3  | **IA inventando regras ou fatos** ("alucinação").                                                                                                      | Alto  | Alto  | RAG só em regras aprovadas; resposta `not_found` obrigatória; motor determinístico faz os cálculos.                                                                                                       |
| T4  | **Prompt injection via PDF ou chat** (texto malicioso tentando comandar a IA).                                                                         | Alto  | Médio | Conteúdo externo marcado como dado; ferramentas com permissão mínima; validação de toda chamada; IA sem acesso a dados de outras campanhas.                                                               |
| T5  | **Vazamento de segredos** do mestre para jogadores via IA.                                                                                             | Alto  | Médio | Filtro de visibilidade na consulta; verificador de saída; testes de vazamento automatizados.                                                                                                              |
| T6  | **Escopo muito grande.** Esse produto equivale a vários produtos (VTT, IA narradora, processador de documentos).                                       | Alto  | Alto  | Fases com entregas utilizáveis; não iniciar fase sem a anterior estável; cortar extras sem dó.                                                                                                            |
| T7  | **Sincronização em tempo real** (conflitos, reconexão).                                                                                                | Médio | Médio | Servidor autoritativo, eventos numerados, controle de versão nas fichas.                                                                                                                                  |
| T8  | **Latência da IA** (respostas de 5–20 s quebram o ritmo do jogo).                                                                                      | Médio | Alto  | Respostas em streaming; modelos menores onde possível; ações mecânicas não dependem da IA.                                                                                                                |
| T9  | **Dependência de fornecedores** (mudança de preço/modelo).                                                                                             | Médio | Médio | Interface interna de provedor; prompts versionados; testes de regressão das respostas.                                                                                                                    |

## Riscos financeiros

> Valores aproximados para planejamento, em dólar, sujeitos a confirmação nos sites dos fornecedores antes de contratar. Preços de IA mudam com frequência.

### Infraestrutura fixa (mensal)

| Item                    | Desenvolvimento | Produção inicial (poucas centenas de usuários) |
| ----------------------- | --------------- | ---------------------------------------------- |
| Supabase                | Gratuito        | ~US$ 25+ (plano Pro)                           |
| Hospedagem API + worker | US$ 0–5         | ~US$ 20–80                                     |
| Hospedagem web (Vercel) | Gratuito        | ~US$ 0–20                                      |
| Redis gerenciado        | Gratuito/local  | ~US$ 0–15                                      |
| Monitoramento de erros  | Gratuito        | ~US$ 0–30                                      |
| **Total aproximado**    | **~US$ 0–10**   | **~US$ 50–170**                                |

### Custos variáveis de IA (o principal risco)

- **Importar um livro de ~300 páginas:** classificação + estruturação + embeddings ≈ **US$ 2 a 20 por livro**, dependendo do modelo e de quanto OCR for necessário. Ocorre uma vez por livro.
- **Sessão de 3 h com Mestre de IA** (~150–250 interações): ≈ **US$ 1 a 15 por sessão**, dependendo do modelo, tamanho do contexto e uso de cache.
- **Risco:** um grupo muito ativo pode custar mais do que paga. Mitigações: limites por campanha, painel de consumo, cache de prompt, resumos de memória (não enviar histórico inteiro), modelo menor para tarefas simples.

### Outros riscos

| Risco                                                  | Mitigação                                                                                             |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| **Direitos autorais** de livros enviados por usuários. | Material privado por usuário; termos de uso; canal de remoção; consulta jurídica antes do lançamento. |
| **LGPD** (dados pessoais de usuários brasileiros).     | Coleta mínima; exclusão de conta; registro de consentimento; política de privacidade.                 |
| **Uso de marcas** (ex.: "D&D") na divulgação.          | Não usar marcas de terceiros como se fossem parceiras.                                                |
