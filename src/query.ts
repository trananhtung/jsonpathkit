import { JSONValue, Segment, Selector, FilterExpr, JSONPathError } from "./types.js";
import { parse } from "./parser.js";

// ── Built-in filter functions ────────────────────────────────────────────────

type FilterFn = (args: JSONValue[]) => JSONValue;

const FILTER_FUNCTIONS: Record<string, FilterFn> = {
  length: ([v]) => {
    if (typeof v === "string") return v.length;
    if (Array.isArray(v)) return v.length;
    if (v !== null && typeof v === "object") return Object.keys(v).length;
    return 0;
  },
  count: ([v]) => {
    if (Array.isArray(v)) return v.length;
    return 0;
  },
  match: ([v, pattern]) => {
    if (typeof v !== "string" || typeof pattern !== "string") return false;
    try { return new RegExp(`^${pattern}$`, "u").test(v); }
    catch { return false; }
  },
  search: ([v, pattern]) => {
    if (typeof v !== "string" || typeof pattern !== "string") return false;
    try { return new RegExp(pattern, "u").test(v); }
    catch { return false; }
  },
  value: ([v]) => {
    if (Array.isArray(v) && v.length === 1) return v[0];
    return v;
  },
  keys: ([v]) => {
    if (v !== null && typeof v === "object" && !Array.isArray(v)) return Object.keys(v);
    return [];
  },
  min: ([v]) => {
    if (Array.isArray(v) && v.every((x) => typeof x === "number")) return Math.min(...(v as number[]));
    return null;
  },
  max: ([v]) => {
    if (Array.isArray(v) && v.every((x) => typeof x === "number")) return Math.max(...(v as number[]));
    return null;
  },
  sum: ([v]) => {
    if (Array.isArray(v) && v.every((x) => typeof x === "number")) return (v as number[]).reduce((a, b) => a + b, 0);
    return null;
  },
  type: ([v]) => {
    if (v === null) return "null";
    if (Array.isArray(v)) return "array";
    return typeof v;
  },
};

// ── Slice normalization ───────────────────────────────────────────────────────

function normalizeSlice(start: number | undefined, end: number | undefined, step: number | undefined, len: number) {
  const s = step ?? 1;
  if (s === 0) throw new JSONPathError("Slice step cannot be zero");
  let lo: number, hi: number;
  if (s > 0) {
    lo = start === undefined ? 0 : start < 0 ? Math.max(len + start, 0) : Math.min(start, len);
    hi = end === undefined   ? len : end < 0 ? Math.max(len + end, 0) : Math.min(end, len);
  } else {
    lo = start === undefined ? len - 1 : start < 0 ? Math.max(len + start, -1) : Math.min(start, len - 1);
    hi = end === undefined   ? -(len + 1) : end < 0 ? Math.max(len + end, -1) : Math.min(end, len - 1);
  }
  return { lo, hi, s };
}

// ── Filter expression evaluator ──────────────────────────────────────────────

function evalFilter(expr: FilterExpr, current: JSONValue, root: JSONValue): JSONValue {
  switch (expr.kind) {
    case "literal": return expr.value;
    case "current": return current;
    case "root":    return root;

    case "member": {
      const base = evalFilter(expr.base, current, root);
      if (base !== null && typeof base === "object" && !Array.isArray(base)) {
        return (base as Record<string, JSONValue>)[expr.key] ?? null;
      }
      return null;
    }

    case "index": {
      const base = evalFilter(expr.base, current, root);
      if (Array.isArray(base)) {
        const i = expr.idx < 0 ? base.length + expr.idx : expr.idx;
        return base[i] ?? null;
      }
      return null;
    }

    case "wildcard": {
      const base = evalFilter(expr.base, current, root);
      if (Array.isArray(base)) return base;
      if (base !== null && typeof base === "object") return Object.values(base as Record<string, JSONValue>);
      return null;
    }

    case "compare": {
      const l = evalFilter(expr.left, current, root);
      const r = evalFilter(expr.right, current, root);
      switch (expr.op) {
        case "==":  return jsonEqual(l, r);
        case "!=":  return !jsonEqual(l, r);
        case "<":   return typeof l === "number" && typeof r === "number" ? l < r : (typeof l === "string" && typeof r === "string" ? l < r : false);
        case "<=":  return typeof l === "number" && typeof r === "number" ? l <= r : (typeof l === "string" && typeof r === "string" ? l <= r : false);
        case ">":   return typeof l === "number" && typeof r === "number" ? l > r : (typeof l === "string" && typeof r === "string" ? l > r : false);
        case ">=":  return typeof l === "number" && typeof r === "number" ? l >= r : (typeof l === "string" && typeof r === "string" ? l >= r : false);
        default: return false;
      }
    }

    case "logical": {
      const l = isTruthy(evalFilter(expr.left, current, root));
      if (expr.op === "&&") return l ? isTruthy(evalFilter(expr.right, current, root)) : false;
      return l ? true : isTruthy(evalFilter(expr.right, current, root));
    }

    case "not": return !isTruthy(evalFilter(expr.operand, current, root));

    case "exists": {
      // Try to eval — any non-null result means existence
      try {
        const v = evalFilter(expr.expr, current, root);
        return v !== null && v !== undefined;
      } catch { return false; }
    }

    case "call": {
      const fn = FILTER_FUNCTIONS[expr.name];
      if (!fn) throw new JSONPathError(`Unknown filter function '${expr.name}'`);
      const args = expr.args.map((a) => evalFilter(a, current, root));
      return fn(args);
    }

    case "recursive":
      return null; // Not used in top-level filters
  }
}

function jsonEqual(a: JSONValue, b: JSONValue): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (typeof a !== typeof b) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((v, i) => jsonEqual(v, (b as JSONValue[])[i]));
  }
  if (typeof a === "object" && typeof b === "object" && !Array.isArray(a) && !Array.isArray(b)) {
    const ka = Object.keys(a as object).sort();
    const kb = Object.keys(b as object).sort();
    if (ka.join() !== kb.join()) return false;
    return ka.every((k) => jsonEqual((a as Record<string, JSONValue>)[k], (b as Record<string, JSONValue>)[k]));
  }
  return false;
}

function isTruthy(v: JSONValue): boolean {
  if (v === null || v === false || v === 0 || v === "") return false;
  if (Array.isArray(v) && v.length === 0) return false;
  return true;
}

// ── Apply a single selector against a node ───────────────────────────────────

function applySelector(sel: Selector, node: JSONValue, root: JSONValue): JSONValue[] {
  if (sel.kind === "union") {
    return sel.selectors.flatMap((s) => applySelector(s, node, root));
  }

  switch (sel.kind) {
    case "name": {
      if (node !== null && typeof node === "object" && !Array.isArray(node)) {
        const v = (node as Record<string, JSONValue>)[sel.name];
        return v !== undefined ? [v] : [];
      }
      return [];
    }

    case "wildcard": {
      if (Array.isArray(node)) return [...node];
      if (node !== null && typeof node === "object") return Object.values(node as Record<string, JSONValue>);
      return [];
    }

    case "index": {
      if (!Array.isArray(node)) return [];
      const i = sel.index < 0 ? node.length + sel.index : sel.index;
      return i >= 0 && i < node.length ? [node[i]] : [];
    }

    case "slice": {
      if (!Array.isArray(node)) return [];
      const { lo, hi, s } = normalizeSlice(sel.start, sel.end, sel.step, node.length);
      const results: JSONValue[] = [];
      if (s > 0) { for (let i = lo; i < hi; i += s) results.push(node[i]); }
      else        { for (let i = lo; i > hi; i += s) results.push(node[i]); }
      return results;
    }

    case "filter": {
      const items: [JSONValue, number | string][] = Array.isArray(node)
        ? node.map((v, i): [JSONValue, number] => [v, i])
        : node !== null && typeof node === "object"
          ? (Object.entries(node as Record<string, JSONValue>) as [string, JSONValue][]).map(([k, v]): [JSONValue, string] => [v, k])
          : [];
      const results: JSONValue[] = [];
      for (const [item] of items) {
        const r = evalFilter(sel.expr, item, root);
        if (isTruthy(r)) results.push(item);
      }
      return results;
    }
  }
}

// ── Recursive descent ─────────────────────────────────────────────────────────

function descendant(node: JSONValue, selectors: Selector[], root: JSONValue): JSONValue[] {
  const results: JSONValue[] = [];
  // Apply selectors at current level
  for (const sel of selectors) {
    results.push(...applySelector(sel, node, root));
  }
  // Recurse into all children
  if (Array.isArray(node)) {
    for (const child of node) results.push(...descendant(child, selectors, root));
  } else if (node !== null && typeof node === "object") {
    for (const child of Object.values(node as Record<string, JSONValue>)) {
      results.push(...descendant(child, selectors, root));
    }
  }
  return results;
}

// ── Main query engine ─────────────────────────────────────────────────────────

function applySegments(segments: Segment[], current: JSONValue[], root: JSONValue): JSONValue[] {
  let nodes = current;
  for (const seg of segments) {
    const next: JSONValue[] = [];
    for (const node of nodes) {
      if (seg.kind === "child") {
        for (const sel of seg.selectors) next.push(...applySelector(sel, node, root));
      } else {
        next.push(...descendant(node, seg.selectors, root));
      }
    }
    nodes = next;
  }
  return nodes;
}

// ── Public API ────────────────────────────────────────────────────────────────

const cache = new Map<string, Segment[]>();

function getSegments(path: string): Segment[] {
  let segs = cache.get(path);
  if (!segs) { segs = parse(path); cache.set(path, segs); }
  return segs;
}

/** Query a JSON value with a JSONPath expression. Returns all matching values. */
export function query(path: string, data: JSONValue): JSONValue[] {
  const segments = getSegments(path);
  return applySegments(segments, [data], data);
}

/** Query and return the first match, or undefined if none. */
export function queryFirst(path: string, data: JSONValue): JSONValue | undefined {
  return query(path, data)[0];
}

/** Query and return whether at least one match exists. */
export function queryExists(path: string, data: JSONValue): boolean {
  return query(path, data).length > 0;
}

/** Pre-compile a JSONPath expression for repeated use. */
export class JSONPath {
  private readonly _segments: Segment[];
  readonly source: string;

  constructor(path: string) {
    this.source = path;
    this._segments = parse(path);
  }

  query(data: JSONValue): JSONValue[] {
    return applySegments(this._segments, [data], data);
  }

  first(data: JSONValue): JSONValue | undefined {
    return this.query(data)[0];
  }

  exists(data: JSONValue): boolean {
    return this.query(data).length > 0;
  }
}
