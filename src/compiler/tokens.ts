export type PrimitiveType = "char" | "number";

// Value Tokens
export type LiteralToken = {
  tokenType: "Literal";
  value: number;
};
export type VariableToken = { tokenType: "Variable"; name: string };
export type MathToken = {
  tokenType: "Math";
  operator: "+" | "-" | "*" | "/";
  left: ValueToken;
  right: ValueToken;
};
export type ValueToken = LiteralToken | VariableToken | MathToken | MaxToken;

// Statement Tokens
export type DeclarationToken = {
  tokenType: "Declaration";
  name: string;
  type: PrimitiveType;
};
export type IfToken = {
  tokenType: "If";
  condition: ValueToken;
  body: Token[];
};
export type AssignToken = {
  tokenType: "Assign";
  variable: string;
  value: ValueToken;
};
export type ShowToken = { tokenType: "Show"; value: ValueToken };
export type LoopToken = {
  tokenType: "Loop";
  condition: ValueToken;
  body: Token[];
};
export type InputToken = {
  tokenType: "Input";
  variable: string;
};
export type MaxToken = {
  tokenType: "Max";
}
export type Unsafe = {
  tokenType: "Unsafe";
  safetySize: number;
  body: UnsafeToken[];
};

export type Token =
  | DeclarationToken
  | AssignToken
  | ShowToken
  | LoopToken
  | IfToken
  | InputToken
  | Unsafe;

// Unsafe Tokens
export type GotoToken = {
  tokenType: "UnsafeGoto";
  loc: number;
};

export type AddToken = {
  tokenType: "UnsafeAdd";
  amount: ValueToken;
};

export type ReduceToken = {
  tokenType: "UnsafeReduce";
  amount: ValueToken;
};

export type UnsafeLoopToken = {
  tokenType: "UnsafeLoop";
  body: UnsafeToken[];
};

export type UnsafeShowToken = {
  tokenType: "UnsafeShow";
};

export type UnsafeAbstractToken = {
  tokenType: "Abstract";
  bf: (">" | "<" | "+" | "-" | "," | "." | "[" | "]")[];
};

export type UnsafeToken =
  | GotoToken
  | AddToken
  | ReduceToken
  | UnsafeShowToken
  | UnsafeLoopToken
  | UnsafeAbstractToken;
