import { compile } from "../src/compiler";
import { brainfuck } from "../src/brainfuck";
import { parseSourceToTokens } from "../src/parse";

// MOSTLY AI GENERATED SLOP DO NOT TOUCH

const $ = <T extends Element>(s: string): T | null => document.querySelector(s);
const $txt = (t: string): Text => document.createTextNode(t);
const $c = (
  tag: string,
  children: Node[],
  props: Record<string, string> = {}
): HTMLElement => {
  const el = document.createElement(tag);
  for (const ch of children) el.appendChild(ch);
  for (const [k, v] of Object.entries(props)) el.setAttribute(k, v);
  return el;
};

let code = "";
let lastGoodTokens: any[] = [];

function escapeHTML(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Syntax highlighting
const tokenRE =
  /\/\/.*$|"(?:\\.|[^"])*"|'(?:\\.|[^'])*'|\b-?\d+\b|\b[A-Za-z_][A-Za-z0-9_]*\b|[(){}\[\]:,.+\-*/<>=%;]|\s+/gm;
const keywords = new Set([
  "define",
  "input",
  "set",
  "show",
  "if",
  "loop",
  "unsafe",
  "math",
  "max",
]);
const types = new Set(["number", "char"]);
const vars = new Set<string>();

function highlightCode(src: string): string {
  let out = "";
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = tokenRE.exec(src)) !== null) {
    const idx = m.index;
    if (idx > lastIndex) out += escapeHTML(src.slice(lastIndex, idx));
    const tok = m[0];
    let wrapped = "";

    if (/^\s+$/.test(tok)) {
      wrapped = tok
        .split("")
        .map((ch) => {
          if (ch === " ")
            return `<span style="display:inline-block;width:9px;"></span>`;
          if (ch === "\t")
            return `<span style="display:inline-block;width:36px;"></span>`;
          if (ch === "\r") return "";
          if (ch === "\n") return "\n";
          return `<span style="display:inline-block;width:9px;">${escapeHTML(
            ch
          )}</span>`;
        })
        .join("");
    } else if (tok.startsWith("//")) {
      wrapped = `<span style="color:#6a9955">${escapeHTML(tok)}</span>`;
    } else if (/^-?\d+$/.test(tok)) {
      wrapped = `<span style="color:#b5cea8">${escapeHTML(tok)}</span>`;
    } else if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(tok)) {
      if (keywords.has(tok)) {
        if (tok === "define") {
          const idRE = /\b([A-Za-z_][A-Za-z0-9_]*)\b/g;
          idRE.lastIndex = tokenRE.lastIndex;
          let found: RegExpExecArray | null;
          while ((found = idRE.exec(src)) !== null) {
            const cand = found[1];
            if (cand && cand !== tok) {
              vars.add(cand);
              break;
            }
          }
        }
        wrapped = `<span style="color:#569cd6;font-weight:600">${escapeHTML(
          tok
        )}</span>`;
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

  if (lastIndex < src.length) out += escapeHTML(src.slice(lastIndex));
  return out.replace(/\n/g, "<br/>");
}

function updateLineNumbers(): void {
  const numbers = $("#numbers")!;
  numbers.innerHTML = "";
  code.split("\n").forEach((_, i) =>
    numbers.appendChild(
      $c("div", [$txt(`${i + 1}`)], {
        class: "size-8 flex justify-center items-center",
      })
    )
  );
}

function showDiagnostics(errors: string[], warnings: string[]): void {
  const diag = $("#diagnostics")!;
  diag.innerHTML = "";

  if (errors.length) {
    const header = $c("div", [$txt("Errors:")], {
      class: "text-red-500 font-bold mt-2",
    });
    diag.appendChild(header);
    for (const e of errors) {
      diag.appendChild(
        $c("div", [$txt("" + e)], { class: "text-red-300 text-sm" })
      );
    }
  }

  if (warnings.length) {
    const header = $c("div", [$txt("Warnings:")], {
      class: "text-yellow-500 font-bold mt-2",
    });
    diag.appendChild(header);
    for (const w of warnings) {
      diag.appendChild(
        $c("div", [$txt("• " + w)], { class: "text-yellow-400 text-sm" })
      );
    }
  }

  // disable run on fatal errors
  ($("#run") as HTMLButtonElement).disabled = errors.length > 0;
}

function validateSource(): void {
  const errors: string[] = [];
  const warnings: string[] = [];

  try {
    const toks = parseSourceToTokens(code);
    lastGoodTokens = toks;

    // warn if "abstract unsafe" appears (DOESN'T FUCKING WORK)
    if (/abstract\s+unsafe/.test(code)) {
      warnings.push(
        `⚠️ "abstract unsafe" usage is discouraged and may be unsafe.`
      );
    }

    // warn if unsafe block uses normal tokens (DOESN'T FUCKING WORK)
    const unsafeBlocks = code.matchAll(/unsafe\s*{([^}]*)}/gs);
    for (const block of unsafeBlocks) {
      const inner = block[1] ?? ""; // ✅ ensure string, never undefined
      if (inner.match(/\b(define|set|show|if|loop|input)\b/)) {
        warnings.push(
          `⚠️ Non-unsafe token used inside unsafe block. This is not allowed.`
        );
      }
    }
  } catch (err: any) {
    errors.push(err.message);
  }

  showDiagnostics(errors, warnings);
}

function syncHighlight(checkToggle: boolean): void {
  const ta = $("textarea") as HTMLTextAreaElement;
  code = ta.value;
  ($("#code") as HTMLDivElement).innerHTML = highlightCode(code);
  updateLineNumbers();
  if (checkToggle) validateSource();
}

function indentLevel(line: string): number {
  let lvl = 0;
  for (const ch of line) {
    if (ch === "{") lvl++;
    if (ch === "}") lvl--;
  }
  return Math.max(0, lvl);
}

function format(ta: HTMLTextAreaElement, checkToggle: boolean) {
  const chars = code.split("\n").map((line) => Array.from(line));

  // remove leading spaces
  for (const [lineIndex, line] of chars.entries()) {
    for (const [index, char] of line.entries()) {
      if (char === " " && chars[lineIndex]) {
        chars[lineIndex][index] = "";
      }
      if (char !== " ") break;
    }
  }

  let level = 0; // indentation depth

  for (const [lineIndex, line] of chars.entries()) {
    const joined = line.join("").trim();

    // decrease level if line starts with a closing brace
    if (
      joined.startsWith("}") ||
      joined.startsWith("]") ||
      joined.startsWith(")")
    ) {
      level = Math.max(level - 1, 0);
    }

    // rebuild line with indentation
    const indent = "  ".repeat(level); // use 2 spaces per level
    chars[lineIndex] = Array.from(indent + joined);

    // increase level if line ends with an opening brace
    if (joined.endsWith("{") || joined.endsWith("[") || joined.endsWith("(")) {
      level++;
    }
  }

  code = chars.map((line) => line.join("")).join("\n");
  ta.value = code;
  syncHighlight(checkToggle);
  showAC();
}

const varsForAC = new Set<string>();
const kw = new Set([
  "define",
  "set",
  "show",
  "if",
  "loop",
  "math",
  "number",
  "char",
  "unsafe",
]);

function collectIdentifiers(): void {
  varsForAC.clear();
  for (const m of code.matchAll(/\b([A-Za-z_][A-Za-z0-9_]*)\b/g)) {
    const id = m[1];
    if (!kw.has(id)) varsForAC.add(id);
  }
}

const acBox = $c("div", [], {
  id: "acBox",
  class:
    "hidden absolute bg-stone-700 text-stone-100 text-sm border border-stone-600 z-20 max-h-48 overflow-y-auto translate-y-2 translate-x-4",
});
document.body.appendChild(acBox);

function showAC(): void {
  collectIdentifiers();
  const ta = $("textarea") as HTMLTextAreaElement;
  const pos = ta.selectionStart;
  const pre = ta.value.slice(0, pos);
  const m = pre.match(/([A-Za-z_][A-Za-z0-9_]*)$/);
  if (!m) {
    acBox.classList.add("hidden");
    return;
  }
  const prefix = m[1];
  const hits = [...varsForAC, ...keywords]
    .filter((v) => v.startsWith(prefix) && v !== prefix)
    .sort();
  if (!hits.length) {
    acBox.classList.add("hidden");
    return;
  }
  acBox.innerHTML = "";
  hits.forEach((v) => {
    const item = $c("div", [$txt(v)], {
      class: "px-3 py-1 hover:bg-stone-600 cursor-pointer",
    });
    item.onclick = () => {
      ta.setRangeText(
        v.slice((prefix ?? "").length),
        pos ?? 0,
        pos ?? 0,
        "end"
      );
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

/* ---------- run ---------- */
function run(checkToggle: boolean): void {
  try {
    const input = ($("#input") as HTMLInputElement).value;
    const tokensToCompile = checkToggle
      ? lastGoodTokens
      : parseSourceToTokens(code);
    const compiled = compile(tokensToCompile);
    const bits = ($("#bits") as HTMLInputElement).value;
    const useNumberInputs = ($("#number-based") as HTMLInputElement).checked;
    ($("#output") as HTMLDivElement).innerText = brainfuck(compiled, {
      input,
      useNumberInputs,
      bits: parseInt(bits),
    });
    ($("#brainfuck") as HTMLDivElement).innerText = compiled;
  } catch (err: any) {
    (
      $("#output") as HTMLDivElement
    ).innerText = `❌ Runtime error: ${err.message}`;
  }
}

/* ---------- main ---------- */
function main(): void {
  const checkToggle = ($("#check-toggle") as HTMLInputElement).checked;
  const ta = $("textarea") as HTMLTextAreaElement;

  /* highlight on input */
  ta.addEventListener("input", () => {
    syncHighlight(checkToggle);
    showAC();
  });

  /* auto-indent */
  ta.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const cur = ta.value.slice(0, ta.selectionStart).split("\n").pop()!;
    const base = (cur.match(/^\s*/)?.[0] ?? "").length;
    const extra = indentLevel(cur) * 2; // 2 spaces per open brace
    ta.setRangeText(
      "\n" + " ".repeat(base + extra),
      ta.selectionStart,
      ta.selectionEnd,
      "end"
    );
    ta.dispatchEvent(new Event("input"));
  });

  /* completion accept / cancel */
  ta.addEventListener("keydown", (e) => {
    if (acBox.classList.contains("hidden")) return;
    if (e.key === "Tab" || e.key === "Enter") {
      e.preventDefault();
      (acBox.querySelector("div") as HTMLElement)?.click();
    }
    if (e.key === "Escape") acBox.classList.add("hidden");
  });

  document.addEventListener("click", (e) => {
    if (!acBox.contains(e.target as Node)) acBox.classList.add("hidden");
  });

  /* run button */
  ($("#run") as HTMLButtonElement).addEventListener("click", () =>
    run(checkToggle)
  );
  ($("#example") as HTMLButtonElement).addEventListener("click", () => {
    const exampleCode = `define a number
  define b number
  define temp number
  define counter number
  define SPACE char

  set a 1
  set b 1
  set counter max
  set SPACE 32

  show a

  loop counter {
    show SPACE
    show a
    set temp a
    set b temp
    set a (math a + b)
    set counter (math counter - 1)
  }`;
    code = exampleCode;
    ta.value = exampleCode;
    syncHighlight(checkToggle);
    showAC();
  });
  ($("#format") as HTMLButtonElement).addEventListener("click", () =>
    format(ta, checkToggle)
  );

  /* initial draw */
  syncHighlight(checkToggle);
}

document.addEventListener("DOMContentLoaded", main);
