# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.0] - 2025-11-12

### Added

- Functions.

```bbf
function foo {
  show 56
}

$foo
```

- The `$__dump` function, which will dump memory (will not do anything on a regular interpreter).

> Note:
> The brainfuck interpreter will be deprecated in the next update, instead replaced by the official brainfuck compiler. Only use it if you want to dump memory.

## [0.2.0] - 2025-10-29

### Added

- Arrays.

## [0.1.0] - 2025-10-24

This is the initial release of this project.