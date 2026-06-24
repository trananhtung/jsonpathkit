import { tokenize, Token, TT } from "./lexer.js";
import {
  Segment, Selector, SimpleSelector, FilterExpr,
  NameSelector, WildcardSelector, IndexSelector, SliceSelector, FilterSelector,
  JSONPathError, JSONValue,
} from "./types.js";

class Parser {
  private tokens: Token[];
  private pos: number = 0;

  constructor(src: string) {
    this.tokens = tokenize(src);
  }

  private peek(offset = 0): Token { return this.tokens[this.pos + offset]; }
  private consume(): Token { return this.tokens[this.pos++]; }
  private expect(type: TT): Token {
    const t = this.consume();
    if (t.type !== type) throw new JSONPathError(`Expected '${type}' but got '${t.raw || "EOF"}'`, t.pos);
    return t;
  }
  private check(type: TT): boolean { return this.peek().type === type; }
  private match(...types: TT[]): boolean { return types.includes(this.peek().type); }

  parse(): Segment[] {
    this.expect(TT.Dollar);
    const segments: Segment[] = [];
    while (!this.check(TT.EOF)) {
      if (this.check(TT.DotDot)) {
        this.consume();
        segments.push({ kind: "descendant", selectors: this.parseSelectors() });
      } else if (this.check(TT.Dot)) {
        this.consume();
        segments.push({ kind: "child", selectors: this.parseSelectors() });
      } else if (this.check(TT.LBracket)) {
        segments.push({ kind: "child", selectors: this.parseBracketSelectors() });
      } else {
        const t = this.peek();
        throw new JSONPathError(`Unexpected token '${t.raw}'`, t.pos);
      }
    }
    return segments;
  }

  // Selectors after `.` — either `.name`, `.['name']`, `.*`, or `.[0]`
  private parseSelectors(): Selector[] {
    if (this.check(TT.Star)) {
      this.consume();
      return [{ kind: "wildcard" } as WildcardSelector];
    }
    if (this.check(TT.LBracket)) {
      return this.parseBracketSelectors();
    }
    if (this.check(TT.Ident) || this.check(TT.String)) {
      const t = this.consume();
      return [{ kind: "name", name: t.raw } as NameSelector];
    }
    // Handle keywords used as member names
    if (this.match(TT.True, TT.False, TT.Null)) {
      const t = this.consume();
      return [{ kind: "name", name: t.raw } as NameSelector];
    }
    const t = this.peek();
    throw new JSONPathError(`Expected member name after '.'`, t.pos);
  }

  // Parse `[...]` — may contain union of selectors
  private parseBracketSelectors(): Selector[] {
    this.expect(TT.LBracket);
    const selectors: SimpleSelector[] = [this.parseSingleSelector()];
    while (this.check(TT.Comma)) {
      this.consume();
      selectors.push(this.parseSingleSelector());
    }
    this.expect(TT.RBracket);
    if (selectors.length === 1) return selectors;
    return [{ kind: "union", selectors }];
  }

  private parseSingleSelector(): SimpleSelector {
    // Filter: ?( expr )
    if (this.check(TT.Question)) {
      this.consume();
      this.expect(TT.LParen);
      const expr = this.parseFilterExpr(0);
      this.expect(TT.RParen);
      return { kind: "filter", expr } as FilterSelector;
    }
    // Wildcard
    if (this.check(TT.Star)) {
      this.consume();
      return { kind: "wildcard" } as WildcardSelector;
    }
    // String name selector: ['name'] or ["name"]
    if (this.check(TT.String)) {
      const t = this.consume();
      return { kind: "name", name: t.raw } as NameSelector;
    }
    // Number → index or slice
    if (this.check(TT.Number)) {
      return this.parseIndexOrSlice();
    }
    // Negative → index or slice start
    if (this.check(TT.Colon)) {
      return this.parseSliceFrom(undefined);
    }
    // Identifier as name
    if (this.check(TT.Ident) || this.match(TT.True, TT.False, TT.Null)) {
      const t = this.consume();
      return { kind: "name", name: t.raw } as NameSelector;
    }
    const t = this.peek();
    throw new JSONPathError(`Unexpected selector token '${t.raw}'`, t.pos);
  }

  private parseIndexOrSlice(): SimpleSelector {
    const n = parseInt(this.consume().raw, 10);
    if (this.check(TT.Colon)) {
      return this.parseSliceFrom(n);
    }
    return { kind: "index", index: n } as IndexSelector;
  }

  private parseSliceFrom(start: number | undefined): SliceSelector {
    this.expect(TT.Colon);
    let end: number | undefined;
    let step: number | undefined;
    if (this.check(TT.Number)) end = parseInt(this.consume().raw, 10);
    if (this.check(TT.Colon)) {
      this.consume();
      if (this.check(TT.Number)) step = parseInt(this.consume().raw, 10);
    }
    return { kind: "slice", start, end, step } as SliceSelector;
  }

  // ── Filter expression parser (Pratt) ────────────────────────────────────────

  private filterBP: Partial<Record<TT, number>> = {
    [TT.Or]:  10,
    [TT.And]: 20,
    [TT.Eq]: 30, [TT.NEq]: 30,
    [TT.Lt]: 40, [TT.Lte]: 40, [TT.Gt]: 40, [TT.Gte]: 40,
  };

  private parseFilterExpr(minBP: number): FilterExpr {
    let left = this.parseFilterPrefix();

    while (true) {
      const t = this.peek();
      const bp = this.filterBP[t.type as TT];
      if (bp === undefined || bp <= minBP) break;
      this.consume();
      const right = this.parseFilterExpr(bp);
      if (t.type === TT.And || t.type === TT.Or) {
        left = { kind: "logical", op: t.type, left, right };
      } else {
        left = { kind: "compare", op: t.raw, left, right };
      }
    }

    return left;
  }

  private parseFilterPrefix(): FilterExpr {
    const t = this.peek();

    // Not
    if (t.type === TT.Bang) {
      this.consume();
      return { kind: "not", operand: this.parseFilterPrefix() };
    }

    // Parens
    if (t.type === TT.LParen) {
      this.consume();
      const inner = this.parseFilterExpr(0);
      this.expect(TT.RParen);
      return inner;
    }

    // Literals
    if (t.type === TT.Number) { this.consume(); return { kind: "literal", value: parseFloat(t.raw) }; }
    if (t.type === TT.String) { this.consume(); return { kind: "literal", value: t.raw }; }
    if (t.type === TT.True)   { this.consume(); return { kind: "literal", value: true }; }
    if (t.type === TT.False)  { this.consume(); return { kind: "literal", value: false }; }
    if (t.type === TT.Null)   { this.consume(); return { kind: "literal", value: null }; }

    // @ or $ — node references
    if (t.type === TT.At || t.type === TT.Dollar) {
      this.consume();
      let expr: FilterExpr = t.type === TT.At
        ? { kind: "current" }
        : { kind: "root" };
      return this.parseFilterSuffix(expr);
    }

    // Function calls (built-in functions without @ prefix)
    if (t.type === TT.Ident) {
      this.consume();
      if (this.check(TT.LParen)) {
        this.consume();
        const args: FilterExpr[] = [];
        if (!this.check(TT.RParen)) {
          args.push(this.parseFilterExpr(0));
          while (this.check(TT.Comma)) {
            this.consume();
            args.push(this.parseFilterExpr(0));
          }
        }
        this.expect(TT.RParen);
        return { kind: "call", name: t.raw, args };
      }
      return { kind: "literal", value: t.raw };
    }

    throw new JSONPathError(`Unexpected filter token '${t.raw}'`, t.pos);
  }

  private parseFilterSuffix(base: FilterExpr): FilterExpr {
    while (true) {
      if (this.check(TT.Dot)) {
        this.consume();
        if (this.check(TT.Star)) {
          this.consume();
          base = { kind: "wildcard", base };
          continue;
        }
        if (this.check(TT.Ident) || this.match(TT.True, TT.False, TT.Null)) {
          const name = this.consume().raw;
          // Check for function call
          if (this.check(TT.LParen)) {
            this.consume();
            const args: FilterExpr[] = [base];
            if (!this.check(TT.RParen)) {
              args.push(this.parseFilterExpr(0));
              while (this.check(TT.Comma)) {
                this.consume();
                args.push(this.parseFilterExpr(0));
              }
            }
            this.expect(TT.RParen);
            base = { kind: "call", name, args };
            continue;
          }
          base = { kind: "member", base, key: name };
          continue;
        }
        const t = this.peek();
        throw new JSONPathError(`Expected member name after '.'`, t.pos);
      }
      if (this.check(TT.DotDot)) {
        this.consume();
        if (this.check(TT.LBracket)) {
          this.consume();
          const sel = this.parseFilterExpr(0);
          this.expect(TT.RBracket);
          base = { kind: "recursive", base, selector: sel };
          continue;
        }
        if (this.check(TT.Ident)) {
          const name = this.consume().raw;
          base = { kind: "member", base, key: name }; // simplified
          continue;
        }
      }
      if (this.check(TT.LBracket)) {
        this.consume();
        // number index in filter
        if (this.check(TT.Number)) {
          const idx = parseInt(this.consume().raw, 10);
          this.expect(TT.RBracket);
          base = { kind: "index", base, idx };
          continue;
        }
        // string member
        if (this.check(TT.String)) {
          const key = this.consume().raw;
          this.expect(TT.RBracket);
          base = { kind: "member", base, key };
          continue;
        }
        // wildcard
        if (this.check(TT.Star)) {
          this.consume();
          this.expect(TT.RBracket);
          base = { kind: "wildcard", base };
          continue;
        }
        const t = this.peek();
        throw new JSONPathError(`Expected index or key in filter`, t.pos);
      }
      break;
    }
    return base;
  }
}

export function parse(src: string): Segment[] {
  return new Parser(src).parse();
}
