// website.ts  (replace the old file with this)
import { compile } from "../src/compiler";
import { brainfuck } from "../src/brainfuck";
import { parseSourceToTokens } from "../src/parse";

/* ----------  tiny helpers  ---------------------------------------- */
const $ = <T extends Element>(s: string): T | null => document.querySelector(s);
const $txt = (t: string): Text => document.createTextNode(t);
const $c = (
  tag: string,
  children: Node[],
  props: Record<string, string> = {}
): HTMLElement => {
  const el = document.createElement(tag);
  for (const ch of children) el.appendChild(ch);
  Object.entries(props).forEach(([k, v]) => el.setAttribute(k, v));
  return el;
};

/* ----------  state  ----------------------------------------------- */
let code = "";
let lastGoodTokens: any[] = [];

/* ----------  html escaper  ---------------------------------------- */
function escapeHTML(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/* ----------  syntax highlighting  --------------------------------- */
const tokenRE =
  /\/\/.*$|"(?:\\.|[^"])*"|'(?:\\.|[^'])*'|\b-?\d+\b|\b[A-Za-z_][A-Za-z0-9_]*\b|[(){}\[\]:,.+\-*/<>=%;\\$]|\s+/gm;

/* ----------  keyword / type / func sets  -------------------------- */
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
  "function", // NEW
]);
const types = new Set(["number", "char"]);
const vars = new Set<string>();
const funcs = new Set<string>(); // NEW

/* ----------  highlight + collect identifiers  --------------------- */
function highlightCode(src: string): string {
  let out = "";
  let lastIdx = 0;
  let m: RegExpExecArray | null;
  vars.clear();
  funcs.clear();

  while ((m = tokenRE.exec(src))) {
    const idx = m.index;
    if (idx > lastIdx) out += escapeHTML(src.slice(lastIdx, idx));
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
        wrapped = `<b style="color:#569cd6">${escapeHTML(tok)}</b>`;
      } else if (types.has(tok)) {
        wrapped = `<i style="color:#fe9c9cff">${escapeHTML(tok)}</i>`;
      } else if (vars.has(tok)) {
        wrapped = `<span style="color:#fe9cf9ff">${escapeHTML(tok)}</span>`;
      } else if (funcs.has(tok)) {
        wrapped = `<span style="color:#dcdcaa">${escapeHTML(tok)}</span>`; // NEW
      } else {
        wrapped = `<span style="color:#c7ecffff">${escapeHTML(tok)}</span>`;
      }
    } else if (tok === "$") {
      wrapped = `<span style="color:#ffd700;font-weight:bold">$</span>`; // NEW
    } else {
      wrapped = `<span style="color:#d4d4d4">${escapeHTML(tok)}</span>`;
    }

    out += wrapped;
    lastIdx = idx + tok.length;
  }
  if (lastIdx < src.length) out += escapeHTML(src.slice(lastIdx));
  return out.replace(/\n/g, "<br/>");
}

/* ----------  file download  --------------------------------------- */
function downloadFile(content: string, fileName: string, contentType: string) {
  const blob = new Blob([content], { type: contentType });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), {
    href: url,
    download: fileName,
  });
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/* ----------  line numbers  ---------------------------------------- */
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

/* ----------  diagnostics  ----------------------------------------- */
function showDiagnostics(errors: string[], warnings: string[]): void {
  const diag = $("#diagnostics")!;
  diag.innerHTML = "";
  if (errors.length) {
    diag.appendChild(
      $c("div", [$txt("Errors:")], { class: "text-red-500 font-bold mt-2" })
    );
    errors.forEach((e) =>
      diag.appendChild($c("div", [$txt(e)], { class: "text-red-300 text-sm" }))
    );
  }
  if (warnings.length) {
    diag.appendChild(
      $c("div", [$txt("Warnings:")], {
        class: "text-yellow-500 font-bold mt-2",
      })
    );
    warnings.forEach((w) =>
      diag.appendChild(
        $c("div", [$txt("• " + w)], { class: "text-yellow-400 text-sm" })
      )
    );
  }
  ($("#run") as HTMLButtonElement).disabled = errors.length > 0;
}

/* ----------  validator  ------------------------------------------- */
function validateSource(): void {
  const errors: string[] = [];
  const warnings: string[] = [];
  try {
    const toks = parseSourceToTokens(code);
    lastGoodTokens = toks;

    if (/abstract\s+unsafe/.test(code))
      warnings.push(
        `⚠️ "abstract unsafe" usage is discouraged and may be unsafe.`
      );

    for (const m of code.matchAll(/unsafe\s*{([^}]*)}/gs)) {
      const inner = m[1] ?? "";
      if (/\b(define|set|show|if|loop|input)\b/.test(inner))
        warnings.push(`⚠️ Non-unsafe token used inside unsafe block.`);
    }
  } catch (err: any) {
    errors.push(err.message);
  }
  showDiagnostics(errors, warnings);
}

/* ----------  sync highlight  -------------------------------------- */
function syncHighlight(checkToggle: boolean): void {
  const ta = $("textarea") as HTMLTextAreaElement;
  code = ta.value;
  ($("#code") as HTMLDivElement).innerHTML = highlightCode(code);
  updateLineNumbers();
  if (checkToggle) validateSource();
}

/* ----------  auto-format  ----------------------------------------- */
function indentLevel(line: string): number {
  let lvl = 0;
  for (const ch of line) {
    if (ch === "{") lvl++;
    if (ch === "}") lvl--;
  }
  return Math.max(0, lvl);
}

function format(ta: HTMLTextAreaElement, checkToggle: boolean) {
  const lines = code.split("\n").map((l) => l.trimStart());
  let level = 0;
  const formatted = lines.map((l) => {
    if (l.startsWith("}") || l.startsWith("]") || l.startsWith(")"))
      level = Math.max(level - 1, 0);
    const out = "  ".repeat(level) + l;
    if (l.endsWith("{") || l.endsWith("[") || l.endsWith("(")) level++;
    return out;
  });
  code = formatted.join("\n");
  ta.value = code;
  syncHighlight(checkToggle);
  showAC();
}

/* ----------  autocomplete  ---------------------------------------- */
const varsForAC = new Set<string>();
const kwForAC = new Set([...keywords, ...types, "function"]); // NEW
const acBox = $c("div", [], {
  id: "acBox",
  class:
    "hidden absolute bg-stone-700 text-stone-100 text-sm border border-stone-600 z-20 max-h-48 overflow-y-auto translate-y-2 translate-x-4",
});
document.body.appendChild(acBox);

function collectIdentifiers(): void {
  varsForAC.clear();
  funcs.clear();
  for (const m of code.matchAll(/\b([A-Za-z_][A-Za-z0-9_]*)\b/g)) {
    const id = m[1]!;
    if (!kwForAC.has(id)) varsForAC.add(id);
  }
  for (const m of code.matchAll(/\bfunction\s+([A-Za-z_][A-Za-z0-9_]*)/g)) {
    const fn = m[1]!;
    funcs.add(fn);
  }
}

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
  const prefix = m[1]!;
  const hits = [
    ...Array.from(funcs).map((v) => ({ v, type: "func" as const })),
    ...Array.from(varsForAC).map((v) => ({ v, type: "var" as const })),
    ...Array.from(kwForAC).map((v) => ({ v, type: "kw" as const })),
  ].filter((x) => x.v.startsWith(prefix) && x.v !== prefix);
  if (!hits.length) {
    acBox.classList.add("hidden");
    return;
  }
  acBox.innerHTML = "";
  hits.forEach(({ v, type }) => {
    const item = $c(
      "div",
      [
        $txt(v),
        $c("div", [$txt(type)], {
          class: `ml-auto opacity-30 ${
            {
              func: "text-yellow-300",
              var: "text-purple-300",
              kw: "text-green-300",
            }[type]
          }`,
        }),
      ],
      {
        class:
          "px-3 py-1 hover:bg-stone-600 cursor-pointer flex gap-10 shadow-lg",
      }
    );
    item.onclick = () => {
      ta.setRangeText(v.slice(prefix.length), pos, pos, "end");
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

/* ----------  run  ------------------------------------------------- */
function run(checkToggle: boolean): void {
  try {
    const input = ($("#input") as HTMLInputElement).value;
    const tokensToCompile = checkToggle
      ? lastGoodTokens
      : parseSourceToTokens(code);
    const compiled = compile(tokensToCompile);
    const bits = ($("#bits") as HTMLInputElement).value;
    const dumpCore = ($("#dump-core") as HTMLInputElement).checked;
    const useNumberInputs = ($("#number-based") as HTMLInputElement).checked;
    ($("#output") as HTMLDivElement).innerText = brainfuck(compiled, {
      input,
      useNumberInputs,
      bits: parseInt(bits),
      dumpCore: dumpCore ? "&" : undefined,
    });
    ($("#brainfuck") as HTMLDivElement).innerHTML = Array.from(compiled)
      .map((c) => `<span>${escapeHTML(c)}</span> `)
      .join("");
  } catch (err: any) {
    (
      $("#output") as HTMLDivElement
    ).innerText = `❌ Runtime error: ${err.message}`;
  }
}

/* ----------  main  ------------------------------------------------ */
function main(): void {
  const checkToggle = ($("#check-toggle") as HTMLInputElement).checked;
  const ta = $("textarea") as HTMLTextAreaElement;

  ta.addEventListener("input", (e) => {
    if (ta.value === code) return;
    syncHighlight(checkToggle);
    showAC();
  });

  ta.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const cur = ta.value.slice(0, ta.selectionStart).split("\n").pop()!;
      const base = cur.match(/^\s*/)?.[0]?.length ?? 0;
      const extra = indentLevel(cur) * 2;
      ta.setRangeText(
        "\n" + " ".repeat(base + extra),
        ta.selectionStart,
        ta.selectionEnd,
        "end"
      );
      ta.dispatchEvent(new Event("input"));
    }
    if (
      !acBox.classList.contains("hidden") &&
      (e.key === "Tab" || e.key === "Enter")
    ) {
      e.preventDefault();
      (acBox.querySelector("div") as HTMLElement)?.click();
    }
    if (e.key === "Escape") acBox.classList.add("hidden");
  });

  document.addEventListener("click", (e) => {
    if (!acBox.contains(e.target as Node)) acBox.classList.add("hidden");
  });

  ($("#run") as HTMLButtonElement).addEventListener("click", () =>
    run(checkToggle)
  );
  ($("#example") as HTMLButtonElement).addEventListener("click", () => {
    const ex = `define a number
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
    code = ex;
    ta.value = ex;
    syncHighlight(checkToggle);
    showAC();
  });
  ($("#format") as HTMLButtonElement).addEventListener("click", () =>
    format(ta, checkToggle)
  );
  ($("#compile") as HTMLButtonElement).addEventListener(
    "click",
    () =>
      (($("#brainfuck") as HTMLDivElement).innerHTML = Array.from(
        compile(checkToggle ? lastGoodTokens : parseSourceToTokens(code))
      )
        .map((c) => `<span>${escapeHTML(c)}</span> `)
        .join(""))
  );
  ($("#save") as HTMLButtonElement).addEventListener("click", () =>
    downloadFile(code, "source.bbf", "text/plain")
  );

  syncHighlight(checkToggle);
}

document.addEventListener("DOMContentLoaded", main);
