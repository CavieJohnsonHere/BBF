import type { PrimitiveType, ValueToken, UnsafeToken, Token } from "./tokens";

/*
  This compiler is a single-pass compiler that turns
  instructions from a low-level representation of
  basic functions in brainfuck to actual brainfuck
  code. Thus, it manages memory and functionality
  similar to an interpreter.
*/

let brainfuckCode = "";
// "null" is used for freed memory
// An object is used for cells storing a variable
// "undefined" is used for cells storing a temporary value.
let memoryUsage = new Map<
  number,
  { variable: [string, number]; type: PrimitiveType } | null | undefined
>();
let pointerLocation = 0;

// Functions, oh yes! Here's where we put the code that they run.
// The key is the function name.
// We wanna use the disallowed "&" character for our builtin function so typescript WILL scream and shout and try to kill you
//@ts-ignore
let functions = new Map<string, Token[]>([
  [
    "__dump",
    [{ tokenType: "Unsafe", safetySize: 1, body: [{ tokenType: "Abstract", bf: "&" }] }],
  ],
]);

// Since unsafe code blocks use their own custom memory block to provide safeguards against unwanted corruption
let unsafePointerLocation: number | null = null;

// Here are some helper functions
function movePointerRight() {
  pointerLocation += 1;
  brainfuckCode += ">";
}

function movePointerLeft() {
  pointerLocation -= 1;
  brainfuckCode += "<";
}

/**
 * Finds the first available empty memory cell.
 *
 * This function iterates through the `memoryUsage` map.
 * It looks for a cell marked as `null` (freed).
 * If no freed cells are found, it returns the index
 * immediately after the highest-occupied cell,
 * effectively allocating new memory at the end.
 *
 * @returns {number} The index of an available memory cell.
 */
function findEmptyLocation(): number {
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

function moveTo(locationIndex: number) {
  while (pointerLocation < locationIndex) movePointerRight();
  while (pointerLocation > locationIndex) movePointerLeft();
}

function clearCell() {
  brainfuckCode += "[-]";
}

function setValue(value: number | string | boolean) {
  clearCell();

  if (typeof value === "number") {
    if (value > 0) brainfuckCode += "+".repeat(value);
    else if (value < 0) brainfuckCode += "-".repeat(-value);
  } else if (typeof value === "boolean") {
    if (value) brainfuckCode += "+";
  } else if (typeof value === "string") {
    const code = value.charCodeAt(0);
    if (code > 0) brainfuckCode += "+".repeat(code);
  }
}

/**
  * @param {number} cell - The location for the
  cell to copy
  * @returns {number} The location for the copied
  cell
  
  * This function will copy the content of a cell to
  a new location. It will go through the first cell,
  put the content in two other cells, making itself
  zero because of the limitations in brainfuck, then
  it will use one of the new cells to restore the
  original cell's value. Here's a demonstration:

  * og    first second
  * 10    0     0
  * 0     10    10
  * 10    0     10 <- new cell, whose location is returned
  * original cell is unchanged
**/
function copy(cell: number): number {
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

  // Restore original cell from location1
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

/**
  * Don't use this function directly, evaluation will
  automatically use it correctly.
  * @param {number} a - The cell location of the first value
  * @param {number} b - The cell location of the first value
  * This function first gets a copy of the provided
  cells, then it will prepare a cell for it to be
  the location of the addition. It will then put the
  content of the first cell into the result cell,
  emptying itself in the process. It will then
  repeat the same thing for the other copied cell.
  Here is a representation:

  * a  b  t
  * 10 10 0
  * 0  10 10
  * 0  0  20 <- this is returned
**/
function add(a: number, b: number): number {
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

/**
 * Subtracts the value of cell `b` from cell `a`.
 *
 * This function first gets copies of the values from
 * cells `a` and `b`. It allocates a new target cell
 * for the result. It moves the value from `copiedA`
 * into the target cell, then subtracts the value
 * from `copiedB` from the target cell.
 * The original `a` and `b` cells are preserved.
 *
 * * a  b  t  (a=10, b=7)
 * * 10 7  0
 * * 0  7  10 (after moving a's copy)
 * * 0  0  3  (after subtracting b's copy) <- this is returned
 *
 * @param {number} a - The cell location of the minuend.
 * @param {number} b - The cell location of the subtrahend.
 * @returns {number} The cell location containing the result
 * of the subtraction (a - b).
 */
function subtract(a: number, b: number): number {
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

  moveTo(copiedA);
  clearCell();
  memoryUsage.set(copiedA, null);

  moveTo(copiedB);
  clearCell();
  memoryUsage.set(copiedB, null);

  return targetLocation;
}

function findVariableLocation(name: string, index = 0): number | undefined {
  return Array.from(memoryUsage.entries()).find(([loc, details]) => {
    if (!details) return false;
    const [n, i] = details.variable;
    return n === name && i === index;
  })?.[0];
}

/**
 * Evaluates a complex value token and returns the
 * memory location of the result.
 *
 * This function handles different types of values:
 * * Literal: Allocates a new temporary cell and sets
 *   its value.
 * * Variable: Finds the existing memory location of
 *   the variable.
 * * Math: Recursively evaluates the left and right
 *   sides, then performs the operation (e.g., `add`,
 *   `subtract`) on them, returning the location of
 *   the new temporary cell holding the result.
 *
 * @param {ValueToken} val - The value token (Literal,
 * Variable, or Math) to evaluate.
 * @returns {number} The memory cell location where the
 * final computed value is stored.
 */
function evalValue(val: ValueToken): number {
  if (val.tokenType === "Literal") {
    const loc = findEmptyLocation();
    memoryUsage.set(loc, undefined);
    moveTo(loc);
    setValue(val.value);
    return loc;
  } else if (val.tokenType === "Variable") {
    const src = findVariableLocation(val.name[0], val.name[1]);
    if (src == undefined) throw new Error(`Variable ${val.name} not declared`);
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
  } else if (val.tokenType == "Max") {
    const loc = findEmptyLocation();
    memoryUsage.set(loc, undefined);
    moveTo(loc);
    brainfuckCode += "[-]-";
    return loc;
  }
  throw new Error("Unknown value token");
}

/**
 * Compiles tokens within an "unsafe" block.
 */
function compileUnsafe(tokens: UnsafeToken[]) {
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
        throw new Error(`Unknown Unsafe token ${(token as any).tokenType}`);
    }
  });
}

/**
 * Finds a contiguous block of free memory.
 */
function findContiguousFreeRegion(size: number): number {
  const used = new Set<number>();
  for (const key of memoryUsage.keys()) used.add(key);

  let start = 0;
  while (true) {
    let fits = true;
    for (let i = 0; i < size; i++) {
      if (used.has(start + i)) {
        fits = false;
        start = start + i + 1;
        break;
      }
    }
    if (fits) return start;
  }
}

/**
 * The main compilation function.
 */
export function compile(code: Token[], reset: boolean = true) {
  if (reset) {
    brainfuckCode = "";
    memoryUsage = new Map();
    pointerLocation = 0;
    unsafePointerLocation = null;
  }

  code.forEach((token) => {
    if (token.tokenType === "Declaration") {
      if (typeof token.array === "number") {
        // MODIFICATION: Use findContiguousFreeRegion
        const baseAddress = findContiguousFreeRegion(token.array);
        for (let i = 0; i < token.array; i++) {
          const loc = baseAddress + i; // <-- Elements are now contiguous
          memoryUsage.set(loc, {
            variable: [token.name, i],
            type: token.type,
          });
          // Optional but good: initialize the cell to 0
          moveTo(loc);
          clearCell();
        }
      } else {
        // This part for single variables is fine
        const locationIndex = findEmptyLocation();
        memoryUsage.set(locationIndex, {
          variable: [token.name, 0],
          type: token.type,
        });
      }
    } else if (token.tokenType === "Assign") {
      const entryLoc = findVariableLocation(
        token.variable[0],
        token.variable[1]
      );
      if (entryLoc === undefined)
        throw new Error(`Variable ${token.variable} not declared`);
      const targetLocation = entryLoc;

      if (token.value.tokenType === "Literal") {
        moveTo(targetLocation);
        setValue(token.value.value);
      } else if (token.value.tokenType === "Variable") {
        moveTo(targetLocation);
        clearCell();

        const sourceLocation = findVariableLocation(
          token.value.name[0],
          token.value.name[1]
        );
        if (sourceLocation == undefined)
          throw new Error(`Variable ${token.value.name} not declared`);

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
      } else if (token.value.tokenType === "Max") {
        moveTo(targetLocation);
        clearCell();
        brainfuckCode += "-";
      }
    } else if (token.tokenType === "Show") {
      const valueLocation = evalValue(token.value);
      moveTo(valueLocation);
      switch (true) {
        case token.value.tokenType === "Variable" &&
          memoryUsage.get(valueLocation)?.type === "char":
        case token.value.tokenType === "Literal" &&
          typeof token.value.value === "string":
          brainfuckCode += "~";
          break;
        default:
          brainfuckCode += ".";
          break;
      }
    } else if (token.tokenType === "Loop") {
      const condCell =
        token.condition.tokenType === "Variable"
          ? findVariableLocation(
              token.condition.name[0],
              token.condition.name[1]
            )
          : evalValue(token.condition);

      if (condCell == undefined) throw new Error("woopsies");

      moveTo(condCell);
      brainfuckCode += "[";
      compile(token.body, false);
      moveTo(condCell);
      brainfuckCode += "]";
    } else if (token.tokenType === "Input") {
      const entryLoc = findVariableLocation(
        token.variable[0],
        token.variable[1]
      );
      if (!entryLoc) throw new Error(`Variable ${token.variable} not declared`);
      moveTo(entryLoc);
      brainfuckCode += ",";
    } else if (token.tokenType === "If") {
      const condCell =
        token.condition.tokenType === "Variable"
          ? findVariableLocation(
              token.condition.name[0],
              token.condition.name[1]
            )
          : evalValue(token.condition);
      if (condCell == undefined) throw new Error("woopsies");

      moveTo(condCell);
      brainfuckCode += "[";
      compile(token.body, false);
      moveTo(condCell);
      clearCell();
      brainfuckCode += "]";
    } else if (token.tokenType === "Unsafe") {
      const start = findContiguousFreeRegion(token.safetySize);
      for (let i = 0; i < token.safetySize; i++) {
        memoryUsage.set(start + i, null);
      }

      unsafePointerLocation = start;
      moveTo(unsafePointerLocation);
      compileUnsafe(token.body);

      for (let i = 0; i < token.safetySize; i++) {
        memoryUsage.delete(start + i);
        moveTo(start + i);
        clearCell();
      }

      unsafePointerLocation = null;
    } else if (token.tokenType === "Function") {
      functions.set(token.name, token.body);
    } else if (token.tokenType === "Call") {
      const funcCode = functions.get(token.name);
      if (!funcCode) throw new Error(`Function ${token.name} not defined`);
      brainfuckCode += compile(funcCode);
    } else {
      throw new Error(`Unhandled token type ${(token as any).tokenType}`);
    }
  });

  return brainfuckCode;
}
