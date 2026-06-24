import { JSONPathError } from "./types.js";

export const enum TT {
  Dollar    = "$",
  At        = "@",
  Dot       = ".",
  DotDot    = "..",
  LBracket  = "[",
  RBracket  = "]",
  LParen    = "(",
  RParen    = ")",
  Star      = "*",
  Comma     = ",",
  Colon     = ":",
  Question  = "?",
  Eq        = "==",
  NEq       = "!=",
  Lt        = "<",
  Lte       = "<=",
  Gt        = ">",
  Gte       = ">=",
  And       = "&&",
  Or        = "||",
  Bang      = "!",
  Number    = "Number",
  String    = "String",
  Ident     = "Ident",
  True      = "true",
  False     = "false",
  Null      = "null",
  EOF       = "EOF",
}

export interface Token {
  type: TT;
  raw: string;
  pos: number;
}

export function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < src.length) {
    const pos = i;
    const ch = src[i];

    if (/\s/.test(ch)) { i++; continue; }

    // two-char tokens
    const two = src.slice(i, i + 2);
    if (two === "..")  { tokens.push({ type: TT.DotDot, raw: "..", pos }); i += 2; continue; }
    if (two === "==")  { tokens.push({ type: TT.Eq,  raw: "==", pos }); i += 2; continue; }
    if (two === "!=")  { tokens.push({ type: TT.NEq, raw: "!=", pos }); i += 2; continue; }
    if (two === "<=")  { tokens.push({ type: TT.Lte, raw: "<=", pos }); i += 2; continue; }
    if (two === ">=")  { tokens.push({ type: TT.Gte, raw: ">=", pos }); i += 2; continue; }
    if (two === "&&")  { tokens.push({ type: TT.And, raw: "&&", pos }); i += 2; continue; }
    if (two === "||")  { tokens.push({ type: TT.Or,  raw: "||", pos }); i += 2; continue; }

    // one-char
    const oneMap: Record<string, TT> = {
      "$": TT.Dollar, "@": TT.At, ".": TT.Dot,
      "[": TT.LBracket, "]": TT.RBracket,
      "(": TT.LParen, ")": TT.RParen,
      "*": TT.Star, ",": TT.Comma, ":": TT.Colon, "?": TT.Question,
      "<": TT.Lt, ">": TT.Gt, "!": TT.Bang,
    };
    if (ch in oneMap) { tokens.push({ type: oneMap[ch], raw: ch, pos }); i++; continue; }

    // number (including negative)
    if (/[0-9]/.test(ch) || (ch === "-" && /[0-9]/.test(src[i + 1] ?? ""))) {
      let raw = ch; i++;
      while (i < src.length && /[0-9.]/.test(src[i])) raw += src[i++];
      if (src[i] === "e" || src[i] === "E") {
        raw += src[i++];
        if (src[i] === "+" || src[i] === "-") raw += src[i++];
        while (i < src.length && /[0-9]/.test(src[i])) raw += src[i++];
      }
      tokens.push({ type: TT.Number, raw, pos });
      continue;
    }

    // string (single or double quoted)
    if (ch === "'" || ch === '"') {
      const quote = ch;
      let raw = "";
      i++;
      while (i < src.length && src[i] !== quote) {
        if (src[i] === "\\") {
          i++;
          const esc: Record<string, string> = { n: "\n", r: "\r", t: "\t", "\\": "\\", "'": "'", '"': '"', "/": "/" };
          raw += esc[src[i]] ?? src[i];
        } else {
          raw += src[i];
        }
        i++;
      }
      if (i >= src.length) throw new JSONPathError("Unterminated string", pos);
      i++; // closing quote
      tokens.push({ type: TT.String, raw, pos });
      continue;
    }

    // identifier / keywords
    if (/[a-zA-Z_]/.test(ch)) {
      let raw = "";
      while (i < src.length && /[a-zA-Z0-9_]/.test(src[i])) raw += src[i++];
      const kw: Record<string, TT> = { true: TT.True, false: TT.False, null: TT.Null };
      tokens.push({ type: kw[raw] ?? TT.Ident, raw, pos });
      continue;
    }

    throw new JSONPathError(`Unexpected character '${ch}'`, pos);
  }

  tokens.push({ type: TT.EOF, raw: "", pos: i });
  return tokens;
}
