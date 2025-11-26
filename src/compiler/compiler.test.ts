import { test, expect } from "bun:test";
import { parseSourceToTokens } from "../parser/parse";
import { compile } from "./index";
import { brainfuck } from "../brainfuck";

test("dynamic indexing assignment and show", () => {
	const source = `
define a 5 number
define i number
set a[0] 3
set a[1] 1
set a[2] 4
set a[3] 1
set a[4] 5

set i 3
set a[i] 7
show a[i]
`;
	const toks = parseSourceToTokens(source);
	const code = compile(toks);
	const out = brainfuck(code, { input: "", useNumberInputs: false, bits: 8 });
	expect(out).toBe("7");
});

test("dynamic indexing read only", () => {
	const source = `
define a 5 number
define i number
set a[3] 7
set i 3
show a[i]
`;
	const toks = parseSourceToTokens(source);
	const code = compile(toks);
	const out = brainfuck(code, { input: "", useNumberInputs: false, bits: 8 });
	expect(out).toBe("7");
});

test("expression-based index read and write", () => {
	const source = `
define a 3 number
define i number
set a[0] 11
set a[1] 22
set a[2] 33
set i 2
set a[(math i - 1)] 99
show a[(math i - 1)]
`;
	const toks = parseSourceToTokens(source);
	const code = compile(toks);
	const out = brainfuck(code, { input: "", useNumberInputs: false, bits: 8 });
	expect(out).toBe("99");
});

test("loop-based dynamic index write", () => {
	const source = `
define a 10 number
define counter number
set counter 10

loop counter {
	set counter (math counter - 1)
	set a[counter] counter
}

show a[5]
`;
	const toks = parseSourceToTokens(source);
	const code = compile(toks);
	const out = brainfuck(code, { input: "", useNumberInputs: false, bits: 8 });
	expect(out).toBe("5");
});




