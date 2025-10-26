# BetterBrainfuck

A compiler that compiles to Brainfuck.

## Language

This language has 7 keywords:

|  keyword | Usage                                                         | Explanation                                                                                                          |
| -------: | ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `define` | `define [variable] [optional: array length] <char \| number>` | Reserves space for a variable and points it to that location                                                         |
|    `set` | `set [variable] [value]`                                      | Set's the value of a variable                                                                                        |
|   `show` | `show [value]`                                                | Shows a value. number by default, but may print characters if the variable is set to that                            |
|  `input` | `input [variable]`                                            | Puts the content of the input into a variable                                                                        |
|   `loop` | `loop [value] {[code]}`                                       | Repeatedly runs code until the provided value is 0                                                                   |
|     `if` | `if [value] {[code]}`                                         | Runs code once if the provided value is not 0                                                                        |
| `unsafe` | `unsafe [safety size] {[unsafe code]}`                        | EXPERIMENTAL: Reserves a safety block in memory for unsafe low-level operations, similar to the "asm" keyword in GCC |

"Value" can be a variable or a number or "max" (the maximum value of a cell).

You can visit [the website](https://caviejohnsonhere.github.io/BBF/) for a playground (it also has auto complete!).

## CLI

The cli has three commands:

- bbf compile <input.bbf> <output.bf>
- bbf execute <input.bf> <input-string> [--bits=8] [--input-number=false]
- bbf run <input.bbf> <input-string> [--bits=8] [--input-number=false]

## Example code

### General

```bbf
define a number
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
}
```

### Arrays

```bbf
define a 5 number
define SPACE char

set a[0] 3
set a[1] 1
set a[2] 4
set a[3] 1
set a[4] 5

set SPACE 32

show a[0]
show SPACE
show a[4]

```

## Development

To install dependencies:

```bash
bun install
```

To run:

```bash
bun ./website/index.html
```

This project was created using `bun init` in bun v1.2.19. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.
