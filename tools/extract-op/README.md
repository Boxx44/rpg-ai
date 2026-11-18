# Extração de dados de Ordem Paranormal

Scripts usados uma única vez para tirar do PDF do livro (v1.3) **apenas dados mecânicos**: nomes, custos, alcances, dados de dano, PV, Defesa e a página. O resultado conferido fica em `packages/rules-engine/src/systems/ordem-paranormal-data.ts`.

- O texto do livro **não** é copiado para o código. A descrição completa é aberta no próprio PDF enviado pelo mestre (botão "p. X").
- Os scripts dependem do PDF local (`pdftotext -layout` e `pdfplumber`). Eles não fazem parte do build nem do site.
- Correções manuais feitas depois da extração (nomes partidos, trilhas do Ocultista, VD faltando) estão registradas em `docs/decisions.md` (ADR-031).
