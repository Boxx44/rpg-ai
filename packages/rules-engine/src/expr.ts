/**
 * Linguagem segura de fórmulas (início da DSL de regras).
 *
 * Permite: números, + - * /, parênteses, comparações (> < >= <= == !=), e as funções
 *   attr("VIG")             valor de um atributo
 *   field("nex")            valor numérico de um campo da ficha
 *   lookup("classe", "combatente", 20, "especialista", 16, ..., padrão?)
 *   min(a, b, ...)  max(a, b, ...)  floor(x)  ceil(x)  round(x)  if(cond, a, b)
 *
 * Não existe eval, acesso a variáveis globais, laços ou chamadas arbitrárias.
 * A fórmula é convertida em uma árvore (AST) validada antes de ser executada.
 */

export class FormulaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FormulaError';
  }
}

type Node =
  | { t: 'num'; v: number }
  | { t: 'str'; v: string }
  | { t: 'neg'; e: Node }
  | { t: 'bin'; op: string; a: Node; b: Node }
  | { t: 'call'; fn: string; args: Node[] };

export interface FormulaContext {
  attr(key: string): number;
  field(key: string): number | string | undefined;
}

const FUNCTIONS = new Set(['attr', 'field', 'lookup', 'min', 'max', 'floor', 'ceil', 'round', 'if']);
const MAX_LEN = 500;
const MAX_DEPTH = 40;

type Tok = { k: 'num' | 'str' | 'id' | 'op'; v: string };

function lex(src: string): Tok[] {
  if (src.length > MAX_LEN) throw new FormulaError('Fórmula longa demais');
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i]!;
    if (/\s/.test(c)) {
      i++;
    } else if (/[0-9.]/.test(c)) {
      const m = /^\d+(\.\d+)?/.exec(src.slice(i));
      if (!m) throw new FormulaError(`Número inválido na posição ${i}`);
      out.push({ k: 'num', v: m[0] });
      i += m[0].length;
    } else if (c === '"' || c === "'") {
      const end = src.indexOf(c, i + 1);
      if (end < 0) throw new FormulaError('Texto sem aspas de fechamento');
      const v = src.slice(i + 1, end);
      if (!/^[\p{L}\p{N} _.%-]*$/u.test(v)) throw new FormulaError('Texto com caracteres não permitidos');
      out.push({ k: 'str', v });
      i = end + 1;
    } else if (/[A-Za-z_]/.test(c)) {
      const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i))!;
      out.push({ k: 'id', v: m[0] });
      i += m[0].length;
    } else {
      const two = src.slice(i, i + 2);
      if (['>=', '<=', '==', '!='].includes(two)) {
        out.push({ k: 'op', v: two });
        i += 2;
      } else if ('+-*/(),<>'.includes(c)) {
        out.push({ k: 'op', v: c });
        i++;
      } else throw new FormulaError(`Caractere não permitido: "${c}"`);
    }
  }
  return out;
}

const PREC: Record<string, number> = {
  '==': 1,
  '!=': 1,
  '<': 2,
  '>': 2,
  '<=': 2,
  '>=': 2,
  '+': 3,
  '-': 3,
  '*': 4,
  '/': 4,
};

/** Converte e valida a fórmula. Lança FormulaError em qualquer problema. */
export function parseFormula(src: string): Node {
  const toks = lex(src);
  let p = 0;
  const peek = () => toks[p];
  const expect = (v: string) => {
    if (peek()?.v !== v) throw new FormulaError(`Esperado "${v}"`);
    p++;
  };
  function primary(depth: number): Node {
    if (depth > MAX_DEPTH) throw new FormulaError('Fórmula aninhada demais');
    const t = toks[p++];
    if (!t) throw new FormulaError('Fórmula incompleta');
    if (t.k === 'num') return { t: 'num', v: Number(t.v) };
    if (t.k === 'str') return { t: 'str', v: t.v };
    if (t.v === '-') return { t: 'neg', e: primary(depth + 1) };
    if (t.v === '(') {
      const e = expr(0, depth + 1);
      expect(')');
      return e;
    }
    if (t.k === 'id') {
      if (!FUNCTIONS.has(t.v)) throw new FormulaError(`Função desconhecida: ${t.v}`);
      expect('(');
      const args: Node[] = [];
      if (peek()?.v !== ')') {
        do {
          if (peek()?.v === ',') p++;
          args.push(expr(0, depth + 1));
        } while (peek()?.v === ',');
      }
      expect(')');
      return { t: 'call', fn: t.v, args };
    }
    throw new FormulaError(`Símbolo inesperado: "${t.v}"`);
  }
  function expr(minPrec: number, depth: number): Node {
    let left = primary(depth);
    for (;;) {
      const t = peek();
      const prec = t && t.k === 'op' ? PREC[t.v] : undefined;
      if (prec === undefined || prec < minPrec) break;
      p++;
      const right = expr(prec + 1, depth + 1);
      left = { t: 'bin', op: t!.v, a: left, b: right };
    }
    return left;
  }
  const ast = expr(0, 0);
  if (p !== toks.length) throw new FormulaError(`Símbolo inesperado: "${toks[p]!.v}"`);
  return ast;
}

function evalNode(n: Node, ctx: FormulaContext): number | string {
  const num = (x: number | string) => {
    const v = typeof x === 'number' ? x : Number(x);
    if (!Number.isFinite(v)) throw new FormulaError(`Valor não numérico: "${x}"`);
    return v;
  };
  switch (n.t) {
    case 'num':
    case 'str':
      return n.v;
    case 'neg':
      return -num(evalNode(n.e, ctx));
    case 'bin': {
      const a = num(evalNode(n.a, ctx));
      const b = num(evalNode(n.b, ctx));
      switch (n.op) {
        case '+':
          return a + b;
        case '-':
          return a - b;
        case '*':
          return a * b;
        case '/':
          if (b === 0) throw new FormulaError('Divisão por zero');
          return a / b;
        case '<':
          return a < b ? 1 : 0;
        case '>':
          return a > b ? 1 : 0;
        case '<=':
          return a <= b ? 1 : 0;
        case '>=':
          return a >= b ? 1 : 0;
        case '==':
          return a === b ? 1 : 0;
        case '!=':
          return a !== b ? 1 : 0;
      }
      throw new FormulaError(`Operador inválido ${n.op}`);
    }
    case 'call': {
      const args = n.args;
      const str = (i: number) => {
        const v = args[i] ? evalNode(args[i]!, ctx) : undefined;
        if (typeof v !== 'string') throw new FormulaError(`${n.fn}: argumento ${i + 1} precisa ser texto`);
        return v;
      };
      switch (n.fn) {
        case 'attr':
          return ctx.attr(str(0));
        case 'field': {
          const v = ctx.field(str(0));
          return v === undefined || v === '' ? 0 : v;
        }
        case 'lookup': {
          const key = ctx.field(str(0));
          for (let i = 1; i + 1 < args.length; i += 2)
            if (evalNode(args[i]!, ctx) === key) return evalNode(args[i + 1]!, ctx);
          if (args.length % 2 === 0) return evalNode(args[args.length - 1]!, ctx); // valor padrão
          return 0;
        }
        case 'min':
        case 'max': {
          if (!args.length) throw new FormulaError(`${n.fn} precisa de argumentos`);
          const vs = args.map((a) => num(evalNode(a, ctx)));
          return n.fn === 'min' ? Math.min(...vs) : Math.max(...vs);
        }
        case 'floor':
        case 'ceil':
        case 'round':
          if (args.length !== 1) throw new FormulaError(`${n.fn} precisa de 1 argumento`);
          return Math[n.fn](num(evalNode(args[0]!, ctx)));
        case 'if':
          if (args.length !== 3) throw new FormulaError('if precisa de 3 argumentos');
          return num(evalNode(args[0]!, ctx)) ? evalNode(args[1]!, ctx) : evalNode(args[2]!, ctx);
      }
      throw new FormulaError(`Função desconhecida: ${n.fn}`);
    }
  }
}

/** Avalia uma fórmula e devolve um número. */
export function evalFormula(src: string, ctx: FormulaContext): number {
  const v = evalNode(parseFormula(src), ctx);
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) throw new FormulaError('A fórmula não resultou em número');
  return n;
}
