import type {
  ValueToken,
  Token,
  UnsafeToken,
  PrimitiveType,
} from "../compiler/tokens";

type NumberTok = { kind: "number"; text: string };
type IdentTok = { kind: "ident"; text: string };
type SymbolTok = { kind: "symbol"; text: string };
type EofTok = { kind: "eof" };
type Tok = NumberTok | IdentTok | SymbolTok | EofTok;

function isAlpha(char: string) {
  return /[A-Za-z_]/.test(char);
}

function isAlphaNum(char: string) {
  return /[A-Za-z0-9_]/.test(char);
}

function isDigit(char: string) {
  return /[0-9]/.test(char);
}

function lexer(input: string): Tok[] {
  const tokens: Tok[] = [];
  let pos = 0;
  const length = input.length;

  while (pos < length) {
    const char = input[pos];
    if (char === undefined) throw new Error("Unexpected end of input");

    if (/\s/.test(char)) {
      pos++;
      continue;
    }

    // skip comment lines starting with //
    if (char === "/" && input[pos + 1] === "/") {
      pos += 2;
      while (pos < length && input[pos] !== "\n") pos++;
      continue;
    }

    if (isAlpha(char)) {
      let end = pos + 1;
      while (end < length && isAlphaNum(input[end] ?? "")) end++;
      tokens.push({ kind: "ident", text: input.slice(pos, end) });
      pos = end;
      continue;
    }

    if (isDigit(char) || (char === "-" && isDigit(input[pos + 1] ?? ""))) {
      let end = pos;
      if (input[end] === "-") end++;
      while (end < length && isDigit(input[end] ?? "")) end++;
      tokens.push({ kind: "number", text: input.slice(pos, end) });
      pos = end;
      continue;
    }

    // two-character symbols
    const twoCharSym = input.slice(pos, pos + 2);
    if (["==", "!=", "<=", ">="].includes(twoCharSym)) {
      tokens.push({ kind: "symbol", text: twoCharSym });
      pos += 2;
      continue;
    }

    // single-character symbols including $
    if ("(){}+-*/:,<>[]$".includes(char)) {
      tokens.push({ kind: "symbol", text: char });
      pos++;
      continue;
    }

    throw new Error(`Unexpected character '${char}' at ${pos}`);
  }

  tokens.push({ kind: "eof" });
  return tokens;
}

type ParserState = { tokens: Tok[]; position: number };

function peek(state: ParserState): Tok {
  return state.tokens[state.position] as Tok;
}

function advance(state: ParserState, step = 1): ParserState {
  return { tokens: state.tokens, position: state.position + step };
}

function expectSymbol(state: ParserState, symbol: string): ParserState {
  const current = peek(state);
  if (current.kind === "symbol" && current.text === symbol) {
    return advance(state);
  }
  throw new Error(`Expected symbol '${symbol}', found ${JSON.stringify(current)}`);
}

function expectIdentifier(state: ParserState): [string, ParserState] {
  const current = peek(state);
  if (current.kind === "ident") {
    return [current.text, advance(state)];
  }
  throw new Error(`Expected identifier, found ${JSON.stringify(current)}`);
}

function parseFactor(state: ParserState): [ValueToken, ParserState] {
  const current = peek(state);

  if (current.kind === "number") {
    const num = Number((current as NumberTok).text);
    return [{ tokenType: "Literal", value: num }, advance(state)];
  }

  if (current.kind === "ident") {
    const name = current.text;
    if (name === "max") return [{ tokenType: "Max" }, advance(state)];

    let nextState = advance(state);
    let index = 0;
    const nextToken = peek(nextState);
    if (nextToken.kind === "symbol" && nextToken.text === "[") {
      nextState = advance(nextState);
      const [indexExpr, afterIndex] = parseExpression(nextState);
      nextState = expectSymbol(afterIndex, "]");
      return [{ tokenType: "Variable", name: [name, indexExpr] }, nextState];
    }
    return [{ tokenType: "Variable", name: [name, 0] }, nextState];
  }

  if (current.kind === "symbol" && current.text === "(") {
    let nextState = advance(state);
    const maybeMath = peek(nextState);
    if (maybeMath.kind === "ident" && maybeMath.text === "math") {
      nextState = advance(nextState);
    }
    const [expression, afterExprState] = parseExpression(nextState);
    const closing = peek(afterExprState);
    if (!(closing.kind === "symbol" && closing.text === ")")) {
      throw new Error(`Expected ')' after expression, found ${JSON.stringify(closing)}`);
    }
    return [expression, advance(afterExprState)];
  }

  throw new Error(`Unexpected token in factor: ${JSON.stringify(current)}`);
}

function parseTerm(state: ParserState): [ValueToken, ParserState] {
  let [leftNode, nextState] = parseFactor(state);
  while (true) {
    const current = peek(nextState);
    if (current.kind === "symbol" && (current.text === "*" || current.text === "/")) {
      nextState = advance(nextState);
      const [rightNode, afterRight] = parseFactor(nextState);
      leftNode = { tokenType: "Math", operator: current.text as "*" | "/", left: leftNode, right: rightNode };
      nextState = afterRight;
    } else {
      break;
    }
  }
  return [leftNode, nextState];
}

function parseExpression(state: ParserState): [ValueToken, ParserState] {
  let [leftNode, nextState] = parseTerm(state);
  while (true) {
    const current = peek(nextState);
    if (current.kind === "symbol" && (current.text === "+" || current.text === "-")) {
      nextState = advance(nextState);
      const [rightNode, afterRight] = parseTerm(nextState);
      leftNode = { tokenType: "Math", operator: current.text as "+" | "-", left: leftNode, right: rightNode };
      nextState = afterRight;
    } else {
      break;
    }
  }
  return [leftNode, nextState];
}

function parseBlock(state: ParserState, unsafe = false): [Token[] | UnsafeToken[], ParserState] {
  let nextState = expectSymbol(state, "{");
  const statements: (Token | UnsafeToken)[] = [];

  while (true) {
    const current = peek(nextState);
    if (current.kind === "symbol" && current.text === "}") {
      return [statements as any, advance(nextState)];
    }
    if (current.kind === "eof") throw new Error("Block not terminated with '}'");

    if (unsafe) {
      const [unsafeStmt, afterUnsafe] = parseUnsafeStatement(nextState);
      statements.push(unsafeStmt);
      nextState = afterUnsafe;
    } else {
      const [stmt, afterStmt] = parseStatement(nextState);
      statements.push(stmt);
      nextState = afterStmt;
    }
  }
}

function parseStatement(state: ParserState): [Token, ParserState] {
  const current = peek(state);

  if (current.kind === "symbol" && current.text === "$") {
    let nextState = advance(state);
    const [funcName, afterName] = expectIdentifier(nextState);
    return [{ tokenType: "Call", name: funcName }, afterName];
  }

  if (current.kind !== "ident") throw new Error(`Expected keyword or function call, found ${JSON.stringify(current)}`);
  const keyword = current.text;
  let nextState = advance(state);

  switch (keyword) {
    case "function": {
      const [funcName, afterName] = expectIdentifier(nextState);
      const [body, afterBody] = parseBlock(afterName);
      return [{ tokenType: "Function", name: funcName, body: body as Token[] }, afterBody];
    }
    case "define": {
      const [varName, afterName] = expectIdentifier(nextState);
      let cursor = afterName;
      let varType: PrimitiveType = "number";
      let arrayLength: number | undefined;
      const maybeArrayLen = peek(cursor);
      if (maybeArrayLen.kind === "number") {
        arrayLength = Number(maybeArrayLen.text);
        cursor = advance(cursor);
      }
      const maybeType = peek(cursor);
      if (maybeType.kind === "ident" && (maybeType.text === "char" || maybeType.text === "number")) {
        varType = maybeType.text as PrimitiveType;
        cursor = advance(cursor);
      }
      return [{ tokenType: "Declaration", name: varName, type: varType, array: arrayLength }, cursor];
    }
    case "set": {
      const [varName, afterName] = expectIdentifier(nextState);
      let cursor = afterName;
      let index: number | any = 0;
      const nextTok = peek(cursor);
      if (nextTok.kind === "symbol" && nextTok.text === "[") {
        cursor = advance(cursor);
        const [idxExpr, afterIdx] = parseExpression(cursor);
        cursor = expectSymbol(afterIdx, "]");
        index = idxExpr;
      }
      const [value, afterValue] = parseExpression(cursor);
      return [{ tokenType: "Assign", variable: [varName, index], value }, afterValue];
    }
    case "show": {
      const [expr, afterExpr] = parseExpression(nextState);
      return [{ tokenType: "Show", value: expr }, afterExpr];
    }
    case "input": {
      const [inputVar, afterVar] = expectIdentifier(nextState);
      return [{ tokenType: "Input", variable: inputVar }, afterVar];
    }
    case "remove": {
      const [removeVar, afterVar] = expectIdentifier(nextState);
      return [{ tokenType: "Remove", variable: removeVar }, afterVar];
    }
    case "if": {
      const [condExpr, afterCond] = parseExpression(nextState);
      const [bodyBlock, afterBody] = parseBlock(afterCond);
      return [{ tokenType: "If", condition: condExpr, body: bodyBlock as Token[] }, afterBody];
    }
    case "loop": {
      const [condExpr, afterCond] = parseExpression(nextState);
      const [bodyBlock, afterBody] = parseBlock(afterCond);
      return [{ tokenType: "Loop", condition: condExpr, body: bodyBlock as Token[] }, afterBody];
    }
    case "unsafe": {
      const sizeTok = peek(nextState);
      if (sizeTok.kind !== "number") throw new Error("Unsafe block must specify size");
      const size = Number(sizeTok.text);
      nextState = advance(nextState);
      const [unsafeBody, afterUnsafe] = parseBlock(nextState, true);
      return [{ tokenType: "Unsafe", safetySize: size, body: unsafeBody as UnsafeToken[] }, afterUnsafe];
    }
    default:
      throw new Error(`Unknown statement keyword '${keyword}'`);
  }
}

function parseUnsafeStatement(state: ParserState): [UnsafeToken, ParserState] {
  const current = peek(state);
  if (current.kind !== "ident") throw new Error(`Expected unsafe operation, found ${JSON.stringify(current)}`);
  const op = current.text;
  let nextState = advance(state);

  switch (op) {
    case "goto": {
      const locTok = peek(nextState);
      if (locTok.kind !== "number") throw new Error("Expected number after goto");
      const loc = Number(locTok.text);
      return [{ tokenType: "UnsafeGoto", loc }, advance(nextState)];
    }
    case "add": {
      const [amount, afterAmount] = parseExpression(nextState);
      return [{ tokenType: "UnsafeAdd", amount }, afterAmount];
    }
    case "reduce": {
      const [amount, afterAmount] = parseExpression(nextState);
      return [{ tokenType: "UnsafeReduce", amount }, afterAmount];
    }
    case "show": {
      return [{ tokenType: "UnsafeShow" }, nextState];
    }
    case "loop": {
      const [body, afterBody] = parseBlock(nextState, true);
      return [{ tokenType: "UnsafeLoop", body: body as UnsafeToken[] }, afterBody];
    }
    case "abstract": {
      const operations: (">" | "<" | "+" | "-" | "," | "." | "[" | "]")[] = [];
      while (true) {
        const nextTok = peek(nextState);
        if (nextTok.kind === "ident" && nextTok.text === "end") {
          nextState = advance(nextState);
          break;
        }
        if (nextTok.kind === "symbol" && "><+-.,[]".includes(nextTok.text)) {
          operations.push(nextTok.text as any);
          nextState = advance(nextState);
          continue;
        }
        throw new Error(`Invalid character inside abstract block: ${JSON.stringify(nextTok)}`);
      }
      return [{ tokenType: "Abstract", bf: operations }, nextState];
    }
    default:
      throw new Error(`Unknown unsafe command '${op}'`);
  }
}

export function parseSourceToTokens(source: string): Token[] {
  const tokens = lexer(source);
  let state: ParserState = { tokens, position: 0 };
  const allTokens: Token[] = [];

  while (peek(state).kind !== "eof") {
    const [stmt, nextState] = parseStatement(state);
    allTokens.push(stmt);
    state = nextState;
  }

  return allTokens;
}
