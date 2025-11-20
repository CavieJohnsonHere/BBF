import { brainfuck } from "../src/brainfuck";
import { compile } from "../src/compiler";
import { parseSourceToTokens } from "../src/parser/parse";

function printUsage() {
  console.log(`Usage:
  bbf compile <input.bbf> <output.bf>
  bbf execute <input.bf> <input-string> [--bits=8] [--input-number=false]
  bbf run <input.bbf> <input-string> [--bits=8] [--input-number=false]
`);
}

function parseFlags(args: string[]) {
  const flags: Record<string, string | boolean | number> = {
    bits: 8,
    "input-number": false,
  };

  for (const arg of args) {
    if (arg.startsWith("--")) {
      const [key, val] = arg.slice(2).split("=");
      if (val === undefined) flags[key] = true;
      else if (val === "true" || val === "false") flags[key] = val === "true";
      else if (!isNaN(Number(val))) flags[key] = Number(val);
      else flags[key] = val;
    }
  }
  return flags;
}

async function main() {
  const args = Bun.argv.slice(2);

  if (args.length < 1) {
    printUsage();
    process.exit(1);
  }

  const command = args[0];
  const flags = parseFlags(args);

  try {
    switch (command) {
      case "compile": {
        const [_, inputFile, outputFile] = args;
        if (!inputFile || !outputFile) {
          console.error("Error: Missing input or output file for compile.");
          printUsage();
          process.exit(1);
        }

        const source = await Bun.file(inputFile).text();
        const tokens = parseSourceToTokens(source);
        const bfCode = compile(tokens);
        await Bun.write(outputFile, bfCode);
        console.log(`✅ Compiled ${inputFile} → ${outputFile}`);
        break;
      }

      case "execute": {
        const [_, bfFile, inputString] = args;
        if (!bfFile) {
          console.error("Error: Missing brainfuck file to execute.");
          printUsage();
          process.exit(1);
        }

        const bfCode = await Bun.file(bfFile).text();
        const bits = Number(flags.bits) || 8;
        const useNumberInputs = Boolean(flags["input-number"]);

        const output = brainfuck(bfCode, {
          input: inputString ?? "",
          bits,
          useNumberInputs,
        });

        console.log(output);
        break;
      }

      case "run": {
        const [_, bbfFile, inputString] = args;
        if (!bbfFile) {
          console.error("Error: Missing BBF file to run.");
          printUsage();
          process.exit(1);
        }

        const source = await Bun.file(bbfFile).text();
        const bfCode = compile(parseSourceToTokens(source));
        const bits = Number(flags.bits) || 8;
        const useNumberInputs = Boolean(flags["input-number"]);

        const output = brainfuck(bfCode, {
          input: inputString ?? "",
          bits,
          useNumberInputs,
        });

        console.log(output);
        break;
      }

      default:
        console.error(`Unknown command: ${command}`);
        printUsage();
        process.exit(1);
    }
  } catch (err) {
    console.error("❌ Error:", err);
    process.exit(1);
  }
}

main();
