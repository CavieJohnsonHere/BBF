// src/compiler/index.ts
var brainfuckCode = "";
var memoryUsage = new Map;
var pointerLocation = 0;
var unsafePointerLocation = null;
function movePointerRight() {
  pointerLocation += 1;
  brainfuckCode += ">";
}
function movePointerLeft() {
  pointerLocation -= 1;
  brainfuckCode += "<";
}
function findEmptyLocation() {
  let lastOccupiedIndex = -1;
  for (let [locationIndex, details] of memoryUsage.entries()) {
    if (details !== null) {
      lastOccupiedIndex = locationIndex;
    } else {
      return locationIndex;
    }
  }
  return lastOccupiedIndex + 1;
}
function moveTo(locationIndex) {
  while (pointerLocation < locationIndex)
    movePointerRight();
  while (pointerLocation > locationIndex)
    movePointerLeft();
}
function clearCell() {
  brainfuckCode += "[-]";
}
function setValue(value) {
  clearCell();
  if (typeof value === "number") {
    if (value > 0)
      brainfuckCode += "+".repeat(value);
    else if (value < 0)
      brainfuckCode += "-".repeat(-value);
  } else if (typeof value === "boolean") {
    if (value)
      brainfuckCode += "+";
  } else if (typeof value === "string") {
    const code = value.charCodeAt(0);
    if (code > 0)
      brainfuckCode += "+".repeat(code);
  }
}
function copy(cell) {
  moveTo(cell);
  const location1 = findEmptyLocation();
  memoryUsage.set(location1, undefined);
  const location2 = findEmptyLocation();
  memoryUsage.set(location2, undefined);
  brainfuckCode += "[";
  moveTo(location1);
  brainfuckCode += "+";
  moveTo(location2);
  brainfuckCode += "+";
  moveTo(cell);
  brainfuckCode += "-";
  brainfuckCode += "]";
  moveTo(location1);
  brainfuckCode += "[";
  moveTo(cell);
  brainfuckCode += "+";
  moveTo(location1);
  brainfuckCode += "-";
  brainfuckCode += "]";
  moveTo(location1);
  clearCell();
  memoryUsage.set(location1, null);
  return location2;
}
function add(a, b) {
  const copiedA = copy(a);
  const copiedB = copy(b);
  const targetLocation = findEmptyLocation();
  memoryUsage.set(targetLocation, undefined);
  moveTo(copiedA);
  brainfuckCode += "[";
  moveTo(targetLocation);
  brainfuckCode += "+";
  moveTo(copiedA);
  brainfuckCode += "-";
  brainfuckCode += "]";
  moveTo(copiedB);
  brainfuckCode += "[";
  moveTo(targetLocation);
  brainfuckCode += "+";
  moveTo(copiedB);
  brainfuckCode += "-";
  brainfuckCode += "]";
  moveTo(copiedA);
  clearCell();
  memoryUsage.set(copiedA, null);
  moveTo(copiedB);
  clearCell();
  memoryUsage.set(copiedB, null);
  return targetLocation;
}
function subtract(a, b) {
  const targetLocation = findEmptyLocation();
  memoryUsage.set(targetLocation, undefined);
  const copiedA = copy(a);
  const copiedB = copy(b);
  moveTo(copiedA);
  brainfuckCode += "[";
  moveTo(targetLocation);
  brainfuckCode += "+";
  moveTo(copiedA);
  brainfuckCode += "-";
  brainfuckCode += "]";
  moveTo(copiedB);
  brainfuckCode += "[";
  moveTo(targetLocation);
  brainfuckCode += "-";
  moveTo(copiedB);
  brainfuckCode += "-";
  brainfuckCode += "]";
  return targetLocation;
}
function evalValue(val) {
  if (val.tokenType === "Literal") {
    const loc = findEmptyLocation();
    memoryUsage.set(loc, undefined);
    moveTo(loc);
    setValue(val.value);
    return loc;
  } else if (val.tokenType === "Variable") {
    const src = Array.from(memoryUsage.entries()).find(([, d]) => d?.variable === val.name)?.[0];
    if (src == undefined)
      throw new Error(`Variable ${val.name} not declared`);
    return src;
  } else if (val.tokenType === "Math") {
    if (val.operator === "+") {
      const a = evalValue(val.left);
      const b = evalValue(val.right);
      return add(a, b);
    }
    if (val.operator === "-") {
      const a = evalValue(val.left);
      const b = evalValue(val.right);
      return subtract(a, b);
    }
    throw new Error(`Unsupported nested operator ${val.operator}`);
  }
  throw new Error("Unknown value token");
}
function compileUnsafe(tokens) {
  tokens.forEach((token) => {
    switch (token.tokenType) {
      case "UnsafeAdd": {
        const amountCell = evalValue(token.amount);
        const copyOfAmount = copy(amountCell);
        if (unsafePointerLocation == null)
          throw new Error("Unsafe pointer not initialized");
        moveTo(copyOfAmount);
        brainfuckCode += "[";
        moveTo(unsafePointerLocation);
        brainfuckCode += "+";
        moveTo(copyOfAmount);
        brainfuckCode += "-";
        brainfuckCode += "]";
        break;
      }
      case "UnsafeReduce": {
        const amountCell = evalValue(token.amount);
        const copyOfAmount = copy(amountCell);
        if (unsafePointerLocation == null)
          throw new Error("Unsafe pointer not initialized");
        moveTo(copyOfAmount);
        brainfuckCode += "[";
        moveTo(unsafePointerLocation);
        brainfuckCode += "-";
        moveTo(copyOfAmount);
        brainfuckCode += "-";
        brainfuckCode += "]";
        break;
      }
      case "UnsafeGoto": {
        if (unsafePointerLocation == null)
          throw new Error("Unsafe pointer not initialized");
        const target = unsafePointerLocation + token.loc;
        moveTo(target);
        unsafePointerLocation = target;
        break;
      }
      case "UnsafeShow": {
        if (unsafePointerLocation == null)
          throw new Error("Unsafe pointer not initialized");
        moveTo(unsafePointerLocation);
        brainfuckCode += ".";
        break;
      }
      case "UnsafeLoop": {
        if (unsafePointerLocation == null)
          throw new Error("Unsafe pointer not initialized");
        moveTo(unsafePointerLocation);
        brainfuckCode += "[";
        compileUnsafe(token.body);
        moveTo(unsafePointerLocation);
        brainfuckCode += "]";
        break;
      }
      case "Abstract": {
        brainfuckCode += token.bf;
        break;
      }
      default:
        throw new Error(`Unknown Unsafe token ${token.tokenType}`);
    }
  });
}
function findContiguousFreeRegion(size) {
  const used = new Set;
  for (const key of memoryUsage.keys())
    used.add(key);
  let start = 0;
  while (true) {
    let fits = true;
    for (let i = 0;i < size; i++) {
      if (used.has(start + i)) {
        fits = false;
        start = start + i + 1;
        break;
      }
    }
    if (fits)
      return start;
  }
}
function compile(code, reset = true) {
  if (reset) {
    brainfuckCode = "";
    memoryUsage = new Map;
    pointerLocation = 0;
    unsafePointerLocation = null;
  }
  code.forEach((token) => {
    if (token.tokenType === "Declaration") {
      const locationIndex = findEmptyLocation();
      memoryUsage.set(locationIndex, {
        variable: token.name,
        type: token.type
      });
    } else if (token.tokenType === "Assign") {
      const entry = Array.from(memoryUsage.entries()).find(([, details]) => details?.variable === token.variable);
      if (!entry)
        throw new Error(`Variable ${token.variable} not declared`);
      const targetLocation = entry[0];
      if (token.value.tokenType === "Literal") {
        moveTo(targetLocation);
        setValue(token.value.value);
      } else if (token.value.tokenType === "Variable") {
        moveTo(targetLocation);
        clearCell();
        const sourceName = token.value.name;
        const sourceLocation = Array.from(memoryUsage.entries()).find(([, details]) => details?.variable === sourceName)?.[0];
        if (sourceLocation == undefined)
          throw new Error(`Variable ${sourceName} not declared`);
        moveTo(sourceLocation);
        const copyLocation = copy(sourceLocation);
        moveTo(copyLocation);
        brainfuckCode += "[";
        moveTo(targetLocation);
        brainfuckCode += "+";
        moveTo(copyLocation);
        brainfuckCode += "-";
        brainfuckCode += "]";
      } else if (token.value.tokenType === "Math") {
        const resultCell = evalValue(token.value);
        moveTo(targetLocation);
        clearCell();
        moveTo(resultCell);
        brainfuckCode += "[";
        moveTo(targetLocation);
        brainfuckCode += "+";
        moveTo(resultCell);
        brainfuckCode += "-";
        brainfuckCode += "]";
      }
    } else if (token.tokenType === "Show") {
      const valueLocation = evalValue(token.value);
      moveTo(valueLocation);
      switch (true) {
        case (token.value.tokenType === "Variable" && memoryUsage.get(valueLocation)?.type === "char"):
        case (token.value.tokenType === "Literal" && typeof token.value.value === "string"):
          brainfuckCode += "~";
          break;
        default:
          brainfuckCode += ".";
          break;
      }
    } else if (token.tokenType === "Loop") {
      const condCell = token.condition.tokenType === "Variable" ? Array.from(memoryUsage.entries()).find(([, d]) => d?.variable === token.condition.name)?.[0] : evalValue(token.condition);
      if (condCell == undefined)
        throw new Error("woopsies");
      moveTo(condCell);
      brainfuckCode += "[";
      compile(token.body, false);
      moveTo(condCell);
      brainfuckCode += "]";
    } else if (token.tokenType == "Input") {
      const entry = Array.from(memoryUsage.entries()).find(([, details]) => details?.variable === token.variable);
      if (!entry)
        throw new Error(`Variable ${token.variable} not declared`);
      const targetLocation = entry[0];
      moveTo(targetLocation);
      brainfuckCode += ",";
    } else if (token.tokenType === "If") {
      const condCell = token.condition.tokenType === "Variable" ? Array.from(memoryUsage.entries()).find(([, d]) => d?.variable === token.condition.name)?.[0] : evalValue(token.condition);
      if (condCell == undefined)
        throw new Error("woopsies");
      moveTo(condCell);
      brainfuckCode += "[";
      compile(token.body, false);
      moveTo(condCell);
      clearCell();
      brainfuckCode += "]";
    } else if (token.tokenType === "Unsafe") {
      const start = findContiguousFreeRegion(token.safetySize);
      for (let i = 0;i < token.safetySize; i++) {
        memoryUsage.set(start + i, null);
      }
      unsafePointerLocation = start;
      moveTo(unsafePointerLocation);
      compileUnsafe(token.body);
      for (let i = 0;i < token.safetySize; i++) {
        memoryUsage.delete(start + i);
        moveTo(start + i);
        clearCell();
      }
      unsafePointerLocation = null;
    } else {
      throw new Error(`Unhandled token type ${token.tokenType}`);
    }
  });
  return brainfuckCode;
}

// src/brainfuck.ts
function brainfuck(code, {
  input = "",
  useNumberInputs = false
}) {
  const memorySize = 30000;
  let memory = new Array(memorySize).fill(0);
  let dataPointer = 0;
  let instructionPointer = 0;
  let output = "";
  let inputPointer = 0;
  const operations = {
    ">": (mem, dp, ip) => {
      dp = (dp + 1) % memorySize;
      return [dp, ip + 1];
    },
    "<": (mem, dp, ip) => {
      dp = (dp - 1 + memorySize) % memorySize;
      return [dp, ip + 1];
    },
    "+": (mem, dp, ip) => {
      mem[dp] = (mem[dp] + 1) % 256;
      return [dp, ip + 1];
    },
    "-": (mem, dp, ip) => {
      mem[dp] = (mem[dp] - 1 + 256) % 256;
      return [dp, ip + 1];
    },
    ".": (mem, dp, ip) => {
      output += `${mem[dp]}`;
      return [dp, ip + 1];
    },
    "~": (mem, dp, ip) => {
      output += String.fromCharCode(mem[dp]);
      return [dp, ip + 1];
    },
    ",": (mem, dp, ip) => {
      if (inputPointer < input.length) {
        mem[dp] = useNumberInputs ? parseInt(input[inputPointer]) : input.charCodeAt(inputPointer);
        inputPointer++;
      } else {
        mem[dp] = 0;
      }
      return [dp, ip + 1];
    },
    "[": (mem, dp, ip) => {
      if (mem[dp] === 0) {
        let loopCount = 1;
        while (loopCount > 0) {
          ip++;
          if (ip >= code.length) {
            throw new Error("Unmatched '[' bracket.");
          }
          const char = code[ip];
          if (char === "[")
            loopCount++;
          else if (char === "]")
            loopCount--;
        }
      }
      return [dp, ip + 1];
    },
    "]": (mem, dp, ip) => {
      if (mem[dp] !== 0) {
        let loopCount = 1;
        while (loopCount > 0) {
          ip--;
          if (ip < 0) {
            throw new Error("Unmatched ']' bracket.");
          }
          const char = code[ip];
          if (char === "]")
            loopCount++;
          else if (char === "[")
            loopCount--;
        }
      }
      return [dp, ip + 1];
    }
  };
  while (instructionPointer < code.length) {
    const instruction = code[instructionPointer];
    if (typeof instruction === "string") {
      const operation = operations[instruction];
      if (operation) {
        [dataPointer, instructionPointer] = operation(memory, dataPointer, instructionPointer);
      } else {
        instructionPointer++;
      }
    } else {
      instructionPointer++;
    }
  }
  return output;
}

// src/parse.ts
function isAlpha(ch) {
  return /[A-Za-z_]/.test(ch);
}
function isAlphaNum(ch) {
  return /[A-Za-z0-9_]/.test(ch);
}
function isDigit(ch) {
  return /[0-9]/.test(ch);
}
function lex(input) {
  const out = [];
  let i = 0;
  const n = input.length;
  while (i < n) {
    const ch = input[i];
    if (ch == undefined)
      throw new Error("woops");
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (ch === "/" && input[i + 1] === "/") {
      i += 2;
      while (i < n && input[i] !== `
`)
        i++;
      continue;
    }
    if (isAlpha(ch)) {
      let j = i + 1;
      while (j < n && isAlphaNum(input[j]))
        j++;
      out.push({ kind: "ident", text: input.slice(i, j) });
      i = j;
      continue;
    }
    if (isDigit(ch) || ch === "-" && isDigit(input[i + 1] ?? "")) {
      let j = i;
      if (input[j] === "-")
        j++;
      while (j < n && isDigit(input[j]))
        j++;
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
    if ("(){}+-*/:,<>[]".includes(ch)) {
      out.push({ kind: "symbol", text: ch });
      i++;
      continue;
    }
    throw new Error(`Unexpected char '${ch}' at ${i}`);
  }
  out.push({ kind: "eof" });
  return out;
}
function peek(state) {
  return state.toks[state.idx];
}
function advance(state, by = 1) {
  return { toks: state.toks, idx: state.idx + by };
}
function expectSymbol(state, sym) {
  const t = peek(state);
  if (t.kind === "symbol" && t.text === sym)
    return advance(state, 1);
  throw new Error(`Expected '${sym}', got ${JSON.stringify(t)}`);
}
function expectIdentText(state) {
  const t = peek(state);
  if (t.kind === "ident")
    return [t.text, advance(state, 1)];
  throw new Error(`Expected identifier, got ${JSON.stringify(t)}`);
}
function parseFactor(state) {
  const t = peek(state);
  if (t.kind === "number") {
    const num = Number(t.text);
    return [{ tokenType: "Literal", value: num }, advance(state, 1)];
  }
  if (t.kind === "ident") {
    const text = t.text;
    return [{ tokenType: "Variable", name: text }, advance(state, 1)];
  }
  if (t.kind === "symbol" && t.text === "(") {
    let s = advance(state, 1);
    const maybeMath = peek(s);
    if (maybeMath.kind === "ident" && maybeMath.text === "math") {
      s = advance(s, 1);
    }
    const [expr, s2] = parseExpression(s);
    const closing = peek(s2);
    if (!(closing.kind === "symbol" && closing.text === ")")) {
      throw new Error(`Expected ')' after expression, got ${JSON.stringify(closing)}`);
    }
    return [expr, advance(s2, 1)];
  }
  throw new Error(`Unexpected token in factor: ${JSON.stringify(t)}`);
}
function parseTerm(state) {
  let [node, s] = parseFactor(state);
  while (true) {
    const t = peek(s);
    if (t.kind === "symbol" && (t.text === "*" || t.text === "/")) {
      s = advance(s);
      const [rhs, s2] = parseFactor(s);
      node = {
        tokenType: "Math",
        operator: t.text,
        left: node,
        right: rhs
      };
      s = s2;
      continue;
    }
    break;
  }
  return [node, s];
}
function parseExpression(state) {
  let [node, s] = parseTerm(state);
  while (true) {
    const t = peek(s);
    if (t.kind === "symbol" && (t.text === "+" || t.text === "-")) {
      s = advance(s);
      const [rhs, s2] = parseTerm(s);
      node = {
        tokenType: "Math",
        operator: t.text,
        left: node,
        right: rhs
      };
      s = s2;
      continue;
    }
    break;
  }
  return [node, s];
}
function parseBlock(state, unsafe = false) {
  let s = expectSymbol(state, "{");
  const body = [];
  while (true) {
    const t = peek(s);
    if (t.kind === "symbol" && t.text === "}")
      return [body, advance(s)];
    if (t.kind === "eof")
      throw new Error("Unterminated block");
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
function parseStatement(state) {
  const t = peek(state);
  if (t.kind !== "ident")
    throw new Error(`Expected keyword, got ${JSON.stringify(t)}`);
  const kw = t.text;
  let s = advance(state);
  if (kw === "define") {
    const [name, s1] = expectIdentText(s);
    s = s1;
    let type = "number";
    const nxt = peek(s);
    if (nxt.kind === "ident" && (nxt.text === "char" || nxt.text === "number")) {
      type = nxt.text;
      s = advance(s);
    }
    return [{ tokenType: "Declaration", name, type }, s];
  }
  if (kw === "set") {
    const [variable, s1] = expectIdentText(s);
    const [value, s2] = parseExpression(s1);
    return [{ tokenType: "Assign", variable, value }, s2];
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
    return [{ tokenType: "If", condition: cond, body }, s2];
  }
  if (kw === "loop") {
    const [cond, s1] = parseExpression(s);
    const [body, s2] = parseBlock(s1);
    return [{ tokenType: "Loop", condition: cond, body }, s2];
  }
  if (kw === "unsafe") {
    const sizeTok = peek(s);
    if (sizeTok.kind !== "number")
      throw new Error("Expected size after unsafe");
    const safteySize = Number(sizeTok.text);
    s = advance(s);
    const [body, s2] = parseBlock(s, true);
    return [
      { tokenType: "Unsafe", safteySize, body },
      s2
    ];
  }
  throw new Error(`Unknown statement '${kw}'`);
}
function parseUnsafeStatement(state) {
  const t = peek(state);
  if (t.kind !== "ident")
    throw new Error(`Expected unsafe op, got ${JSON.stringify(t)}`);
  const kw = t.text;
  let s = advance(state);
  switch (kw) {
    case "goto": {
      const numTok = peek(s);
      if (numTok.kind !== "number")
        throw new Error("Expected number after goto");
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
      return [{ tokenType: "UnsafeLoop", body }, s1];
    }
    case "abstract": {
      console.warn("[Warning] Using abstract unsafe code — this bypasses safety checks!");
      const bfOps = [];
      while (true) {
        const p = peek(s);
        if (p.kind === "ident" && p.text === "end") {
          s = advance(s);
          break;
        }
        if (p.kind === "symbol" && "><+-.,[]".includes(p.text)) {
          bfOps.push(p.text);
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
function parseSourceToTokens(source) {
  const toks = lex(source);
  let state = { toks, idx: 0 };
  const tokens = [];
  while (peek(state).kind !== "eof") {
    const [stmt, s2] = parseStatement(state);
    tokens.push(stmt);
    state = s2;
  }
  return tokens;
}

// website/index.ts
var $ = (s) => document.querySelector(s);
var $txt = (t) => document.createTextNode(t);
var $c = (tag, children, props = {}) => {
  const el = document.createElement(tag);
  for (const ch of children)
    el.appendChild(ch);
  for (const [k, v] of Object.entries(props))
    el.setAttribute(k, v);
  return el;
};
var code = "";
var lastGoodTokens = [];
function escapeHTML(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
var tokenRE = /\/\/.*$|"(?:\\.|[^"])*"|'(?:\\.|[^'])*'|\b-?\d+\b|\b[A-Za-z_][A-Za-z0-9_]*\b|[(){}\[\]:,.+\-*/<>=%;]|\s+/gm;
var keywords = new Set([
  "define",
  "input",
  "set",
  "show",
  "if",
  "loop",
  "unsafe",
  "math"
]);
var types = new Set(["number", "char"]);
var vars = new Set;
function highlightCode(src) {
  let out = "";
  let lastIndex = 0;
  let m;
  while ((m = tokenRE.exec(src)) !== null) {
    const idx = m.index;
    if (idx > lastIndex)
      out += escapeHTML(src.slice(lastIndex, idx));
    const tok = m[0];
    let wrapped = "";
    if (/^\s+$/.test(tok)) {
      wrapped = tok.split("").map((ch) => {
        if (ch === " ")
          return `<span style="display:inline-block;width:9px;"></span>`;
        if (ch === "\t")
          return `<span style="display:inline-block;width:36px;"></span>`;
        if (ch === "\r")
          return "";
        if (ch === `
`)
          return `
`;
        return `<span style="display:inline-block;width:9px;">${escapeHTML(ch)}</span>`;
      }).join("");
    } else if (tok.startsWith("//")) {
      wrapped = `<span style="color:#6a9955">${escapeHTML(tok)}</span>`;
    } else if (/^-?\d+$/.test(tok)) {
      wrapped = `<span style="color:#b5cea8">${escapeHTML(tok)}</span>`;
    } else if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(tok)) {
      if (keywords.has(tok)) {
        if (tok === "define") {
          const idRE = /\b([A-Za-z_][A-Za-z0-9_]*)\b/g;
          idRE.lastIndex = tokenRE.lastIndex;
          let found;
          while ((found = idRE.exec(src)) !== null) {
            const cand = found[1];
            if (cand && cand !== tok) {
              vars.add(cand);
              break;
            }
          }
        }
        wrapped = `<span style="color:#569cd6;font-weight:600">${escapeHTML(tok)}</span>`;
      } else if (types.has(tok)) {
        wrapped = `<i style="color:#fe9c9cff">${escapeHTML(tok)}</i>`;
      } else if (vars.has(tok)) {
        wrapped = `<span style="color:#fe9cf9ff">${escapeHTML(tok)}</span>`;
      } else {
        wrapped = `<span style="color:#c7ecffff">${escapeHTML(tok)}</span>`;
      }
    } else {
      wrapped = `<span style="color:#d4d4d4">${escapeHTML(tok)}</span>`;
    }
    out += wrapped;
    lastIndex = idx + tok.length;
  }
  if (lastIndex < src.length)
    out += escapeHTML(src.slice(lastIndex));
  return out.replace(/\n/g, "<br/>");
}
function updateLineNumbers() {
  const numbers = $("#numbers");
  numbers.innerHTML = "";
  code.split(`
`).forEach((_, i) => numbers.appendChild($c("div", [$txt(`${i + 1}`)], {
    class: "size-8 flex justify-center items-center"
  })));
}
function showDiagnostics(errors, warnings) {
  const diag = $("#diagnostics");
  diag.innerHTML = "";
  if (!errors.length && !warnings.length) {
    diag.appendChild($c("div", [$txt("✅ No issues detected.")], {
      class: "text-green-400"
    }));
    $("#run").disabled = false;
    return;
  }
  if (errors.length) {
    const header = $c("div", [$txt("Errors:")], {
      class: "text-red-500 font-bold mt-2"
    });
    diag.appendChild(header);
    for (const e of errors) {
      diag.appendChild($c("div", [$txt("• " + e)], { class: "text-red-400 text-sm" }));
    }
  }
  if (warnings.length) {
    const header = $c("div", [$txt("Warnings:")], {
      class: "text-yellow-500 font-bold mt-2"
    });
    diag.appendChild(header);
    for (const w of warnings) {
      diag.appendChild($c("div", [$txt("• " + w)], { class: "text-yellow-400 text-sm" }));
    }
  }
  $("#run").disabled = errors.length > 0;
}
function validateSource() {
  const errors = [];
  const warnings = [];
  try {
    const toks = parseSourceToTokens(code);
    lastGoodTokens = toks;
    if (/abstract\s+unsafe/.test(code)) {
      warnings.push(`⚠️ "abstract unsafe" usage is discouraged and may be unsafe.`);
    }
    const unsafeBlocks = code.matchAll(/unsafe\s*{([^}]*)}/gs);
    for (const block of unsafeBlocks) {
      const inner = block[1] ?? "";
      if (inner.match(/\b(define|set|show|if|loop|input)\b/)) {
        warnings.push(`⚠️ Non-unsafe token used inside unsafe block. This is not allowed.`);
      }
    }
  } catch (err) {
    errors.push(err.message);
  }
  showDiagnostics(errors, warnings);
}
function syncHighlight() {
  const ta = $("textarea");
  code = ta.value;
  $("#code").innerHTML = highlightCode(code);
  updateLineNumbers();
  validateSource();
}
function indentLevel(line) {
  let lvl = 0;
  for (const ch of line) {
    if (ch === "{")
      lvl++;
    if (ch === "}")
      lvl--;
  }
  return Math.max(0, lvl);
}
var varsForAC = new Set;
var kw = new Set([
  "define",
  "set",
  "show",
  "if",
  "loop",
  "math",
  "number",
  "char",
  "unsafe"
]);
function collectIdentifiers() {
  varsForAC.clear();
  for (const m of code.matchAll(/\b([A-Za-z_][A-Za-z0-9_]*)\b/g)) {
    const id = m[1];
    if (!kw.has(id))
      varsForAC.add(id);
  }
}
var acBox = $c("div", [], {
  id: "acBox",
  class: "hidden absolute bg-stone-700 text-stone-100 text-sm border border-stone-600 z-20 max-h-48 overflow-y-auto translate-y-2 translate-x-4"
});
document.body.appendChild(acBox);
function showAC() {
  collectIdentifiers();
  const ta = $("textarea");
  const pos = ta.selectionStart;
  const pre = ta.value.slice(0, pos);
  const m = pre.match(/([A-Za-z_][A-Za-z0-9_]*)$/);
  if (!m) {
    acBox.classList.add("hidden");
    return;
  }
  const prefix = m[1];
  const hits = [...varsForAC, ...keywords].filter((v) => v.startsWith(prefix) && v !== prefix).sort();
  if (!hits.length) {
    acBox.classList.add("hidden");
    return;
  }
  acBox.innerHTML = "";
  hits.forEach((v) => {
    const item = $c("div", [$txt(v)], {
      class: "px-3 py-1 hover:bg-stone-600 cursor-pointer"
    });
    item.onclick = () => {
      ta.setRangeText(v.slice((prefix ?? "").length), pos ?? 0, pos ?? 0, "end");
      ta.dispatchEvent(new Event("input"));
      acBox.classList.add("hidden");
    };
    acBox.appendChild(item);
  });
  const rect = ta.getBoundingClientRect();
  acBox.style.left = `${rect.left + 4}px`;
  acBox.style.top = `${rect.top + 20}px`;
  acBox.classList.remove("hidden");
}
function run() {
  try {
    const inputs = $("#input").value;
    const compiled = compile(lastGoodTokens);
    const numberBased = $("#number-based").checked;
    $("#output").innerText = brainfuck(compiled, inputs, numberBased);
    $("#brainfuck").innerText = compiled;
  } catch (err) {
    $("#output").innerText = `❌ Runtime error: ${err.message}`;
  }
}
function main() {
  const ta = $("textarea");
  ta.addEventListener("input", () => {
    syncHighlight();
    showAC();
  });
  ta.addEventListener("keydown", (e) => {
    if (e.key !== "Enter")
      return;
    e.preventDefault();
    const cur = ta.value.slice(0, ta.selectionStart).split(`
`).pop();
    const base = (cur.match(/^\s*/)?.[0] ?? "").length;
    const extra = indentLevel(cur) * 2;
    ta.setRangeText(`
` + " ".repeat(base + extra), ta.selectionStart, ta.selectionEnd, "end");
    ta.dispatchEvent(new Event("input"));
  });
  ta.addEventListener("keydown", (e) => {
    if (acBox.classList.contains("hidden"))
      return;
    if (e.key === "Tab" || e.key === "Enter") {
      e.preventDefault();
      acBox.querySelector("div")?.click();
    }
    if (e.key === "Escape")
      acBox.classList.add("hidden");
  });
  document.addEventListener("click", (e) => {
    if (!acBox.contains(e.target))
      acBox.classList.add("hidden");
  });
  $("#run").addEventListener("click", run);
  syncHighlight();
}
document.addEventListener("DOMContentLoaded", main);
