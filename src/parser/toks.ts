export type TokNumber = { kind: "number"; text: string };
export type TokIdent = { kind: "ident"; text: string };
export type TokSymbol = { kind: "symbol"; text: string };
export type TokEof = { kind: "eof" };
export type Tok = TokNumber | TokIdent | TokSymbol | TokEof;
export type State = { toks: Tok[]; idx: number };
