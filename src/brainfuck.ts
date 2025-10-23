export function brainfuck(
  code: string,
  {
    input = "",
    useNumberInputs = false,
    bits = 16,
  }: {
    input: string;
    useNumberInputs: boolean;
    bits: number;
  }
): string {
  const memorySize = 30000;
  const cellSize = 2 ** bits;
  let memory: number[] = new Array(memorySize).fill(0);
  let dataPointer = 0;
  let instructionPointer = 0;
  let output = "";
  let inputPointer = 0;

  // You can adjust this to change how certain operations behave
  const operations: {
    [key: string]: (
      memory: number[],
      dataPointer: number,
      instructionPointer: number
    ) => [number, number];
  } = {
    ">": (mem, dp, ip) => {
      dp = (dp + 1) % memorySize;
      return [dp, ip + 1];
    },
    "<": (mem, dp, ip) => {
      dp = (dp - 1 + memorySize) % memorySize;
      return [dp, ip + 1];
    },
    "+": (mem, dp, ip) => {
      // Assert mem[dp] is a number. It always will be, but TS needs to be told.
      mem[dp] = ((mem[dp] as number) + 1) % bits;
      return [dp, ip + 1];
    },
    "-": (mem, dp, ip) => {
      // Assert mem[dp] is a number.
      mem[dp] = ((mem[dp] as number) - 1 + bits) % bits;
      return [dp, ip + 1];
    },
    ".": (mem, dp, ip) => {
      // Assert mem[dp] is a number.
      output += `${mem[dp]}`;
      return [dp, ip + 1];
    },
    "~": (mem, dp, ip) => {
      // Assert mem[dp] is a number.
      output += String.fromCharCode(mem[dp] as number);
      return [dp, ip + 1];
    },
    ",": (mem, dp, ip) => {
      if (inputPointer < input.length) {
        mem[dp] = useNumberInputs
          ? parseInt(input[inputPointer] as string)
          : input.charCodeAt(inputPointer);
        inputPointer++;
      } else {
        mem[dp] = 0;
      }
      return [dp, ip + 1];
    },
    "[": (mem, dp, ip) => {
      // Assert mem[dp] is a number.
      if ((mem[dp] as number) === 0) {
        let loopCount = 1;
        while (loopCount > 0) {
          ip++;
          if (ip >= code.length) {
            throw new Error("Unmatched '[' bracket.");
          }
          const char = code[ip];
          if (char === "[") loopCount++;
          else if (char === "]") loopCount--;
        }
      }
      return [dp, ip + 1];
    },
    "]": (mem, dp, ip) => {
      // Assert mem[dp] is a number.
      if ((mem[dp] as number) !== 0) {
        let loopCount = 1;
        while (loopCount > 0) {
          ip--;
          if (ip < 0) {
            throw new Error("Unmatched ']' bracket.");
          }
          const char = code[ip];
          if (char === "]") loopCount++;
          else if (char === "[") loopCount--;
        }
      }
      return [dp, ip + 1];
    },
  };

  while (instructionPointer < code.length) {
    const instruction = code[instructionPointer];
    if (typeof instruction === "string") {
      const operation = operations[instruction];

      if (operation) {
        [dataPointer, instructionPointer] = operation(
          memory,
          dataPointer,
          instructionPointer
        );
      } else {
        instructionPointer++;
      }
    } else {
      instructionPointer++;
    }
  }

  return output;
}
