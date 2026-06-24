export type JSONValue =
  | null
  | boolean
  | number
  | string
  | JSONValue[]
  | { [key: string]: JSONValue };

export class JSONPathError extends Error {
  constructor(message: string, public readonly position?: number) {
    super(message);
    this.name = "JSONPathError";
  }
}

// ── Selector AST ─────────────────────────────────────────────────────────────

export interface NameSelector    { kind: "name";     name: string }
export interface WildcardSelector { kind: "wildcard" }
export interface IndexSelector   { kind: "index";    index: number }
export interface SliceSelector   { kind: "slice";    start?: number; end?: number; step?: number }
export interface FilterSelector  { kind: "filter";   expr: FilterExpr }
export interface UnionSelector   { kind: "union";    selectors: SimpleSelector[] }

export type SimpleSelector =
  | NameSelector
  | WildcardSelector
  | IndexSelector
  | SliceSelector
  | FilterSelector;

export type Selector = SimpleSelector | UnionSelector;

// ── Segment AST ───────────────────────────────────────────────────────────────

export interface ChildSegment      { kind: "child";      selectors: Selector[] }
export interface DescendantSegment { kind: "descendant"; selectors: Selector[] }

export type Segment = ChildSegment | DescendantSegment;

// ── Filter expression AST ────────────────────────────────────────────────────

export type FilterExpr =
  | { kind: "literal";      value: JSONValue }
  | { kind: "current" }                        // @
  | { kind: "root" }                           // $
  | { kind: "member";       base: FilterExpr; key: string }
  | { kind: "index";        base: FilterExpr; idx: number }
  | { kind: "wildcard";     base: FilterExpr }
  | { kind: "recursive";    base: FilterExpr; selector: FilterExpr }
  | { kind: "compare";      op: string; left: FilterExpr; right: FilterExpr }
  | { kind: "logical";      op: "&&" | "||"; left: FilterExpr; right: FilterExpr }
  | { kind: "not";          operand: FilterExpr }
  | { kind: "call";         name: string; args: FilterExpr[] }
  | { kind: "exists";       expr: FilterExpr }  // tests if expression yields any value
