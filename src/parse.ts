// parser.ts  (complete, updated)

import type {
  ValueToken,
  Token,
  UnsafeToken,
  PrimitiveType,
} from "./compiler/tokens";

/* ------------------------------------------------------------------ */
/*  Lexer                                                             */
/* ------------------------------------------------------------------ */

type TokNumber = { kind: "number"; text: string };
type TokIdent = { kind: "ident"; text: string };
type TokSymbol = { kind: "symbol"; text: string };
type TokEof = { kind: "eof" };
type Tok = TokNumber | TokIdent | TokSymbol | TokEof;

function isAlpha(ch: string) { return /[A-Za-z_]/.test(ch); }
function isAlphaNum(ch: string) { return /[A-Za-z0-9_]/.test(ch); }
function isDigit(ch: string) { return /[0-9]/.test(ch); }

function lex(input: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  const n = input.length;

  while (i < n) {
    const ch = input[i];
    if (ch == undefined) throw new Error("woops");

    if (/\s/.test(ch)) { i++; continue; }

    // comment //
    if (ch === "/" && input[i + 1] === "/") {
      i += 2;
      while (i < n && input[i] !== "\n") i++;
      continue;
    }

    if (isAlpha(ch)) {
      let j = i + 1;
      while (j < n && isAlphaNum(input[j])) j++;
      out.push({ kind: "ident", text: input.slice(i, j) });
      i = j;
      continue;
    }

    if (isDigit(ch) || (ch === "-" && isDigit(input[i + 1] ?? ""))) {
      let j = i;
      if (input[j] === "-") j++;
      while (j < n && isDigit(input[j])) j++;
      out.push({ kind: "number", text: input.slice(i, j) });
      i = j;
      continue;
    }

    const two = input.slice(i, i + 2);
    if (["==", "!=", "<=", ">="].includes(two)) {
      out.push({ kind: "symbol", text: two });
      i += 2;
      continue;
    }

    if ("(){}+-*/:,<>[]$".includes(ch)) { // $ added
      out.push({ kind: "symbol", text: ch });
      i++;
      continue;
    }

    throw new Error(`Unexpected char '${ch}' at ${i}`);
  }

  out.push({ kind: "eof" });
  return out;
}

/* ------------------------------------------------------------------ */
/*  Parser core                                                       */
/* ------------------------------------------------------------------ */

type State = { toks: Tok[]; idx: number };

function peek(state: State): Tok { return state.toks[state.idx]; }
function advance(state: State, by = 1): State { return { toks: state.toks, idx: state.idx + by }; }
function expectSymbol(state: State, sym: string): State {
  const t = peek(state);
  if (t.kind === "symbol" && t.text === sym) return advance(state, 1);
  throw new Error(`Expected '${sym}', got ${JSON.stringify(t)}`);
}
function expectIdentText(state: State): [string, State] {
  const t = peek(state);
  if (t.kind === "ident") return [t.text, advance(state, 1)];
  throw new Error(`Expected identifier, got ${JSON.stringify(t)}`);
}

/* ------------------------------------------------------------------ */
/*  Expressions                                                       */
/* ------------------------------------------------------------------ */

function parseFactor(state: State): [ValueToken, State] {
  const t = peek(state);

  if (t.kind === "number") {
    const num = Number((t as TokNumber).text);
    return [{ tokenType: "Literal", value: num }, advance(state, 1)];
  }

  if (t.kind === "ident") {
    const text = t.text;
    if (text === "max") return [{ tokenType: "Max" }, advance(state, 1)];

    let s2 = advance(state, 1);
    let index = 0;
    const next = peek(s2);
    if (next.kind === "symbol" && next.text === "[") {
      s2 = advance(s2, 1);
      const numTok = peek(s2);
      if (numTok.kind !== "number") throw new Error("Expected number literal inside array index");
      index = Number(numTok.text);
      s2 = advance(s2, 1);
      s2 = expectSymbol(s2, "]");
    }
    return [{ tokenType: "Variable", name: [text, index] }, s2];
  }

  if (t.kind === "symbol" && t.text === "(") {
    let s = advance(state, 1);
    const maybeMath = peek(s);
    if (maybeMath.kind === "ident" && maybeMath.text === "math") s = advance(s, 1);
    const [expr, s2] = parseExpression(s);
    const closing = peek(s2);
    if (!(closing.kind === "symbol" && closing.text === ")")) {
      throw new Error(`Expected ')' after expression, got ${JSON.stringify(closing)}`);
    }
    return [expr, advance(s2, 1)];
  }
  throw new Error(`Unexpected token in factor: ${JSON.stringify(t)}`);
}

function parseTerm(state: State): [ValueToken, State] {
  let [node, s] = parseFactor(state);
  while (true) {
    const t = peek(s);
    if (t.kind === "symbol" && (t.text === "*" || t.text === "/")) {
      s = advance(s);
      const [rhs, s2] = parseFactor(s);
      node = { tokenType: "Math", operator: t.text as "*" | "/", left: node, right: rhs };
      s = s2;
      continue;
    }
    break;
  }
  return [node, s];
}

function parseExpression(state: State): [ValueToken, State] {
  let [node, s] = parseTerm(state);
  while (true) {
    const t = peek(s);
    if (t.kind === "symbol" && (t.text === "+" || t.text === "-")) {
      s = advance(s);
      const [rhs, s2] = parseTerm(s);
      node = { tokenType: "Math", operator: t.text as "+" | "-", left: node, right: rhs };
      s = s2;
      continue;
    }
    break;
  }
  return [node, s];
}

/* ------------------------------------------------------------------ */
/*  Statements                                                        */
/* ------------------------------------------------------------------ */

function parseBlock(state: State, unsafe = false): [Token[] | UnsafeToken[], State] {
  let s = expectSymbol(state, "{");
  const body: (Token | UnsafeToken)[] = [];
  while (true) {
    const t = peek(s);
    if (t.kind === "symbol" && t.text === "}") return [body as any, advance(s)];
    if (t.kind === "eof") throw new Error("Unterminated block");
    if (unsafe) {
      const [u, s2] = parseUnsafeStatement(s);
      body.push(u);
      s = s2;
    } else {
      const [stmt, s2] = parseStatement(s);
      body.push(stmt);
      s = s2;
    }
  }
}

function parseStatement(state: State): [Token, State] {
  const t = peek(state);

  // ---- function call: $name ----------------------------------------
  if (t.kind === "symbol" && t.text === "$") {
    let s = advance(state, 1);
    const [name, s2] = expectIdentText(s);
    return [{ tokenType: "Call", name }, s2];
  }

  // ---- everything else must start with an identifier ---------------
  if (t.kind !== "ident") throw new Error(`Expected keyword or function call, got ${JSON.stringify(t)}`);
  const kw = t.text;
  let s = advance(state);

  if (kw === "function") {
    const [name, s1] = expectIdentText(s);
    const [body, s2] = parseBlock(s1);
    return [{ tokenType: "Function", name, body: body as Token[] }, s2];
  }

  if (kw === "define") {
    const [name, s1] = expectIdentText(s);
    s = s1;
    let type: PrimitiveType = "number";
    let array: number | undefined;
    const maybeArray = peek(s);
    if (maybeArray.kind === "number") {
      array = Number(maybeArray.text);
      s = advance(s);
    }
    const nxt = peek(s);
    if (nxt.kind === "ident" && (nxt.text === "char" || nxt.text === "number")) {
      type = nxt.text as PrimitiveType;
      s = advance(s);
    }
    return [{ tokenType: "Declaration", name, type, array }, s];
  }

  if (kw === "set") {
    const [name, s1] = expectIdentText(s);
    let s2 = s1;
    let arrayIndex = 0;
    const next = peek(s2);
    if (next.kind === "symbol" && next.text === "[") {
      s2 = advance(s2, 1);
      const idxTok = peek(s2);
      if (idxTok.kind !== "number") throw new Error("Expected array index number");
      arrayIndex = Number(idxTok.text);
      s2 = advance(s2, 1);
      s2 = expectSymbol(s2, "]");
    }
    const [value, s3] = parseExpression(s2);
    return [{ tokenType: "Assign", variable: [name, arrayIndex], value }, s3];
  }

  if (kw === "show") {
    const [value, s1] = parseExpression(s);
    return [{ tokenType: "Show", value }, s1];
  }

  if (kw === "input") {
    const [variable, s1] = expectIdentText(s);
    return [{ tokenType: "Input", variable }, s1];
  }

  if (kw === "if") {
    const [cond, s1] = parseExpression(s);
    const [body, s2] = parseBlock(s1);
    return [{ tokenType: "If", condition: cond, body: body as Token[] }, s2];
  }

  if (kw === "loop") {
    const [cond, s1] = parseExpression(s);
    const [body, s2] = parseBlock(s1);
    return [{ tokenType: "Loop", condition: cond, body: body as Token[] }, s2];
  }

  if (kw === "unsafe") {
    const sizeTok = peek(s);
    if (sizeTok.kind !== "number") throw new Error("Expected size after unsafe");
    const safetySize = Number(sizeTok.text);
    s = advance(s);
    const [body, s2] = parseBlock(s, true);
    return [{ tokenType: "Unsafe", safetySize, body: body as UnsafeToken[] }, s2];
  }

  throw new Error(`Unknown statement '${kw}'`);
}

/* ------------------------------------------------------------------ */
/*  Unsafe statements                                                 */
/* ------------------------------------------------------------------ */

function parseUnsafeStatement(state: State): [UnsafeToken, State] {
  const t = peek(state);
  if (t.kind !== "ident") throw new Error(`Expected unsafe op, got ${JSON.stringify(t)}`);
  const kw = t.text;
  let s = advance(state);

  switch (kw) {
    case "goto": {
      const numTok = peek(s);
      if (numTok.kind !== "number") throw new Error("Expected number after goto");
      const loc = Number(numTok.text);
      return [{ tokenType: "UnsafeGoto", loc }, advance(s)];
    }
    case "add": {
      const [amt, s1] = parseExpression(s);
      return [{ tokenType: "UnsafeAdd", amount: amt }, s1];
    }
    case "reduce": {
      const [amt, s1] = parseExpression(s);
      return [{ tokenType: "UnsafeReduce", amount: amt }, s1];
    }
    case "show": {
      return [{ tokenType: "UnsafeShow" }, s];
    }
    case "loop": {
      const [body, s1] = parseBlock(s, true);
      return [{ tokenType: "UnsafeLoop", body: body as UnsafeToken[] }, s1];
    }
    case "abstract": {
      const bfOps: (">" | "<" | "+" | "-" | "," | "." | "[" | "]")[] = [];
      while (true) {
        const p = peek(s);
        if (p.kind === "ident" && p.text === "end") { s = advance(s); break; }
        if (p.kind === "symbol" && "><+-.,[]".includes(p.text)) {
          bfOps.push(p.text as any);
          s = advance(s);
          continue;
        }
        throw new Error(`Invalid character inside abstract block: ${JSON.stringify(p)}`);
      }
      return [{ tokenType: "Abstract", bf: bfOps }, s];
    }
    default:
      throw new Error(`Unknown unsafe command '${kw}'`);
  }
}

/* ------------------------------------------------------------------ */
/*  Public API                                                        */
/* ------------------------------------------------------------------ */

export function parseSourceToTokens(source: string): Token[] {
  const toks = lex(source);
  let state: State = { toks, idx: 0 };
  const tokens: Token[] = [];
  while (peek(state).kind !== "eof") {
    const [stmt, s2] = parseStatement(state);
    tokens.push(stmt);
    state = s2;
  }
  return tokens;
}