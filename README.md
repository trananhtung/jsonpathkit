# jsonpathkit

> Zero-dependency TypeScript JSONPath implementation (RFC 9535). Query JSON with `$..author`, wildcards, slices, filter expressions, recursive descent. Drop-in replacement for the abandoned `jsonpath` package (4.3M downloads/week, last published 2021).

[![npm](https://img.shields.io/npm/v/jsonpathkit)](https://www.npmjs.com/package/jsonpathkit)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

## Install

```bash
npm install jsonpathkit
```

## Quick start

```typescript
import { query, queryFirst, queryExists, JSONPath } from "jsonpathkit";

const data = {
  store: {
    book: [
      { title: "Sayings of the Century",    author: "Nigel Rees",      price: 8.95  },
      { title: "Sword of Honour",           author: "Evelyn Waugh",    price: 12.99 },
      { title: "Moby Dick",                 author: "Herman Melville",  price: 8.99, isbn: "0-553-21311-3" },
      { title: "The Lord of the Rings",     author: "J. R. R. Tolkien", price: 22.99, isbn: "0-395-19395-8" },
    ],
    bicycle: { color: "red", price: 19.95 },
  },
};

// All authors
query("$..author", data);
// → ["Nigel Rees", "Evelyn Waugh", "Herman Melville", "J. R. R. Tolkien"]

// Books under $10
query("$.store.book[?(@.price < 10)]", data);
// → [{ title: "Sayings...", price: 8.95 }, { title: "Moby Dick", price: 8.99 }]

// First matching value
queryFirst("$.store.bicycle.color", data);  // "red"

// Does any value match?
queryExists("$.store.book[?(@.isbn)]", data);  // true

// Compile for reuse (faster for repeated queries)
const allPrices = new JSONPath("$..price");
allPrices.query(data);  // [8.95, 12.99, 8.99, 22.99, 19.95]
```

## Why jsonpathkit?

| Package | Downloads/week | Status | Deps | RFC 9535 |
|---|---|---|---|---|
| `jsonpath` | ~4.3M | **Abandoned 2021** | esprima | ❌ |
| `jsonpath-plus` | ~11.4M | Active | 3 deps | ❌ |
| `json-p3` | ~13/week | Active | 0 | ✅ |
| **`jsonpathkit`** | — | **Active** | **0** | ✅ |

The dominant packages (`jsonpath`, `jsonpath-plus`) either depend on a full JavaScript parser (`esprima`) or carry multiple runtime deps, and neither targets RFC 9535. `jsonpathkit` is zero-dependency, ESM+CJS, native TypeScript, and implements the 2024 IETF standard.

## Features

- **RFC 9535 compliant** — IETF Proposed Standard, February 2024
- **Name selectors** — `.key`, `['key']`, `["key"]`
- **Wildcard** — `.*`, `[*]`
- **Index selectors** — `[0]`, `[-1]` (negative from end)
- **Array slices** — `[start:end:step]` (like Python)
- **Recursive descent** — `..key`, `..[*]`
- **Filter expressions** — `[?(@.price < 10)]`
- **Comparison operators** — `==`, `!=`, `<`, `<=`, `>`, `>=`
- **Logical operators** — `&&`, `||`, `!`
- **Union selectors** — `[0,1]`, `['a','b']`
- **Built-in filter functions** — `length()`, `count()`, `match()`, `search()`, `value()`
- **`compile()` pattern** — `new JSONPath(expr)` for repeated queries

## API

### `query(path, data): JSONValue[]`

Returns all values matching the JSONPath expression.

```typescript
query("$.store.book[*].title", data)
// → ["Sayings of the Century", "Sword of Honour", ...]
```

### `queryFirst(path, data): JSONValue | undefined`

Returns the first matching value, or `undefined` if none.

```typescript
queryFirst("$.store.bicycle.color", data)  // "red"
queryFirst("$.nope", data)                  // undefined
```

### `queryExists(path, data): boolean`

Returns `true` if at least one match exists.

```typescript
queryExists("$.store.bicycle", data)  // true
queryExists("$.store.drone", data)    // false
```

### `new JSONPath(path)`

Compile a path once, query many times:

```typescript
const prices = new JSONPath("$..price");
prices.query(data1);  // [...]
prices.query(data2);  // [...]
prices.first(data);   // 8.95
prices.exists(data);  // true
prices.source;        // "$..price"
```

## JSONPath Syntax

| Expression | Description |
|---|---|
| `$` | Root node |
| `.name` | Child member |
| `['name']` | Child member (bracket form) |
| `[0]` | Array index (zero-based) |
| `[-1]` | Last element |
| `[*]` or `.*` | All children (wildcard) |
| `[start:end]` | Array slice |
| `[start:end:step]` | Array slice with step |
| `..name` | Recursive descent |
| `..[*]` | All descendants |
| `[?(@.key > 0)]` | Filter expression |
| `[0,1]` or `['a','b']` | Union (multiple selectors) |

## Filter expressions

Filter expressions use `@` for the current node and `$` for the root:

```typescript
// Books with an ISBN
query("$.store.book[?(@.isbn)]", data)

// Price range
query("$.store.book[?(@.price >= 8 && @.price <= 10)]", data)

// String match (regex)
query("$.store.book[?(match(@.isbn, '0-55.*'))]", data)

// Search anywhere in the string
query("$.store.book[?(search(@.author, 'Tolkien'))]", data)

// Length-based filter
query("$.store.book[?(length(@.title) > 15)]", data)

// Negate: books without isbn
query("$.store.book[?(!@.isbn)]", data)
```

### Built-in filter functions

| Function | Description |
|---|---|
| `length(node)` | String length, array/object size |
| `count(node)` | Array length (0 for non-arrays) |
| `match(str, regex)` | Anchored regex match (`^...$`) |
| `search(str, regex)` | Unanchored regex search |
| `value(node)` | Unwrap single-element array |
| `keys(obj)` | Array of object keys |
| `min(arr)` / `max(arr)` / `sum(arr)` | Array aggregates |
| `type(node)` | "null" \| "boolean" \| "number" \| "string" \| "array" \| "object" |

## Examples

### Pick specific fields from each item

```typescript
// Title and price of first 2 books
query("$.store.book[:2]['title','price']", data)
```

### Recursive search

```typescript
// Every price anywhere in the document
query("$..price", data)

// Every ISBN across the document
query("$..isbn", data)
```

### Conditional selection with root reference (`$`)

```typescript
const data = { threshold: 10, items: [{ name: "a", price: 8 }, { name: "b", price: 15 }] };
// Items cheaper than the threshold
query("$.items[?(@.price < $.threshold)]", data)
```

## License

MIT © [trananhtung](https://github.com/trananhtung)
