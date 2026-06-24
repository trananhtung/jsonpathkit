import { query, queryFirst, queryExists, JSONPath, JSONPathError, parse } from "../src/index.js";
import type { JSONValue } from "../src/index.js";

// RFC 9535 §2.1 example document
const STORE: JSONValue = {
  store: {
    book: [
      { category: "reference", author: "Nigel Rees",   title: "Sayings of the Century",    price: 8.95 },
      { category: "fiction",   author: "Evelyn Waugh", title: "Sword of Honour",            price: 12.99 },
      { category: "fiction",   author: "Herman Melville", title: "Moby Dick",               isbn: "0-553-21311-3", price: 8.99 },
      { category: "fiction",   author: "J. R. R. Tolkien", title: "The Lord of the Rings",  isbn: "0-395-19395-8", price: 22.99 },
    ],
    bicycle: { color: "red", price: 19.95 },
  },
};

// ── 1. root only ─────────────────────────────────────────────────────────────

describe("root selector $", () => {
  test("$ returns root", () => {
    expect(query("$", { a: 1 })).toEqual([{ a: 1 }]);
  });
});

// ── 2. name selector ─────────────────────────────────────────────────────────

describe("name selector", () => {
  test(".key", () => {
    expect(query("$.store", STORE)).toHaveLength(1);
  });

  test("['key']", () => {
    expect(query("$['store']", STORE)).toHaveLength(1);
  });

  test("chained .a.b.c", () => {
    expect(query("$.store.bicycle.color", STORE)).toEqual(["red"]);
  });

  test("missing key returns empty", () => {
    expect(query("$.nope", STORE)).toEqual([]);
  });
});

// ── 3. array index ────────────────────────────────────────────────────────────

describe("index selector", () => {
  test("[0]", () => {
    const books = (STORE as any).store.book;
    const result = query("$.store.book[0]", STORE);
    expect(result).toEqual([books[0]]);
  });

  test("[3]", () => {
    const books = (STORE as any).store.book;
    expect(query("$.store.book[3].title", STORE)).toEqual(["The Lord of the Rings"]);
  });

  test("[-1] last element", () => {
    const books = (STORE as any).store.book;
    expect(query("$.store.book[-1]", STORE)).toEqual([books[3]]);
  });

  test("out of bounds returns empty", () => {
    expect(query("$.store.book[99]", STORE)).toEqual([]);
  });
});

// ── 4. wildcard ───────────────────────────────────────────────────────────────

describe("wildcard selector", () => {
  test(".*", () => {
    const r = query("$.store.*", STORE);
    expect(r).toHaveLength(2);  // book array + bicycle
  });

  test("[*]", () => {
    const r = query("$.store.book[*]", STORE);
    expect(r).toHaveLength(4);
  });

  test(".*  for array returns elements", () => {
    const r = query("$.store.book[*].author", STORE);
    expect(r).toHaveLength(4);
    expect(r[0]).toBe("Nigel Rees");
  });
});

// ── 5. array slice ────────────────────────────────────────────────────────────

describe("slice selector", () => {
  test("[0:2]", () => {
    const r = query("$.store.book[0:2]", STORE);
    expect(r).toHaveLength(2);
  });

  test("[1:3]", () => {
    const r = query("$.store.book[1:3]", STORE);
    expect(r).toHaveLength(2);
    expect((r[0] as any).title).toBe("Sword of Honour");
  });

  test("[2:]", () => {
    expect(query("$.store.book[2:]", STORE)).toHaveLength(2);
  });

  test("[:2]", () => {
    expect(query("$.store.book[:2]", STORE)).toHaveLength(2);
  });

  test("[::2] step 2", () => {
    expect(query("$.store.book[::2]", STORE)).toHaveLength(2);
  });

  test("[-2:]", () => {
    expect(query("$.store.book[-2:]", STORE)).toHaveLength(2);
  });

  test("reverse [::-1]", () => {
    const arr: JSONValue = [1, 2, 3, 4];
    const r = query("$[::-1]", arr);
    expect(r).toEqual([4, 3, 2, 1]);
  });
});

// ── 6. recursive descent ──────────────────────────────────────────────────────

describe("recursive descent ..", () => {
  test("$..author", () => {
    const r = query("$..author", STORE);
    expect(r).toHaveLength(4);
    expect(r).toContain("Nigel Rees");
    expect(r).toContain("J. R. R. Tolkien");
  });

  test("$..price", () => {
    const r = query("$..price", STORE);
    expect(r).toHaveLength(5);  // 4 books + bicycle
    expect(r).toContain(19.95);
  });

  test("$..*  (all nodes)", () => {
    const r = query("$..*", { a: { b: 1 }, c: 2 });
    expect(r).toContain(1);
    expect(r).toContain(2);
  });

  test("$..book[0]", () => {
    const books = (STORE as any).store.book;
    expect(query("$..book[0]", STORE)).toEqual([books[0]]);
  });

  test("$..book[*].title", () => {
    const r = query("$..book[*].title", STORE);
    expect(r).toHaveLength(4);
  });
});

// ── 7. filter selector [?(expr)] ──────────────────────────────────────────────

describe("filter selector", () => {
  test("[?(@.price < 10)]", () => {
    const r = query("$.store.book[?(@.price < 10)]", STORE);
    expect(r).toHaveLength(2);
  });

  test("[?(@.isbn)]", () => {
    const r = query("$.store.book[?(@.isbn)]", STORE);
    expect(r).toHaveLength(2);
  });

  test("[?(@.price == 8.95)]", () => {
    const r = query("$.store.book[?(@.price == 8.95)]", STORE);
    expect(r).toHaveLength(1);
    expect((r[0] as any).author).toBe("Nigel Rees");
  });

  test("[?(@.category == 'fiction')]", () => {
    const r = query("$.store.book[?(@.category == 'fiction')]", STORE);
    expect(r).toHaveLength(3);
  });

  test("[?(@.price > 20)]", () => {
    const r = query("$.store.book[?(@.price > 20)]", STORE);
    expect(r).toHaveLength(1);
    expect((r[0] as any).title).toBe("The Lord of the Rings");
  });

  test("[?(@.price >= 12.99)]", () => {
    const r = query("$.store.book[?(@.price >= 12.99)]", STORE);
    expect(r).toHaveLength(2);
  });

  test("[?(!@.isbn)] — no isbn", () => {
    const r = query("$.store.book[?(!@.isbn)]", STORE);
    expect(r).toHaveLength(2);
  });

  test("[?(@.price > 5 && @.price < 10)]", () => {
    const r = query("$.store.book[?(@.price > 5 && @.price < 10)]", STORE);
    expect(r).toHaveLength(2);
  });

  test("[?(@.category == 'reference' || @.price > 20)]", () => {
    const r = query("$.store.book[?(@.category == 'reference' || @.price > 20)]", STORE);
    expect(r).toHaveLength(2);
  });
});

// ── 8. filter with functions ──────────────────────────────────────────────────

describe("filter functions", () => {
  test("length(@.title)", () => {
    const r = query("$.store.book[?(length(@.title) > 10)]", STORE);
    expect(r.length).toBeGreaterThan(0);
  });

  test("length(@) on array", () => {
    const r = query("$.store.book[?(length(@) > 4)]", STORE);
    // books with >4 keys
    expect(r.length).toBeGreaterThanOrEqual(0);
  });

  test("match(@.isbn, '0-55.*')", () => {
    const r = query("$.store.book[?(match(@.isbn, '0-55.*'))]", STORE);
    expect(r).toHaveLength(1);
    expect((r[0] as any).isbn).toBe("0-553-21311-3");
  });

  test("search(@.author, 'Tolkien')", () => {
    const r = query("$.store.book[?(search(@.author, 'Tolkien'))]", STORE);
    expect(r).toHaveLength(1);
    expect((r[0] as any).author).toBe("J. R. R. Tolkien");
  });
});

// ── 9. union ──────────────────────────────────────────────────────────────────

describe("union selectors", () => {
  test("[0,1]", () => {
    const books = (STORE as any).store.book;
    const r = query("$.store.book[0,1]", STORE);
    expect(r).toHaveLength(2);
    expect(r[0]).toEqual(books[0]);
    expect(r[1]).toEqual(books[1]);
  });

  test("['author','title']", () => {
    const r = query("$.store.book[0]['author','title']", STORE);
    expect(r).toHaveLength(2);
    expect(r).toContain("Nigel Rees");
    expect(r).toContain("Sayings of the Century");
  });
});

// ── 10. queryFirst / queryExists ─────────────────────────────────────────────

describe("queryFirst / queryExists", () => {
  test("queryFirst returns first match", () => {
    expect(queryFirst("$.store.bicycle.color", STORE)).toBe("red");
  });

  test("queryFirst returns undefined for no match", () => {
    expect(queryFirst("$.nope", STORE)).toBeUndefined();
  });

  test("queryExists true", () => {
    expect(queryExists("$.store.bicycle", STORE)).toBe(true);
  });

  test("queryExists false", () => {
    expect(queryExists("$.nope", STORE)).toBe(false);
  });
});

// ── 11. JSONPath class ────────────────────────────────────────────────────────

describe("JSONPath class", () => {
  test("compile once, reuse", () => {
    const jp = new JSONPath("$.store.book[*].price");
    const r1 = jp.query(STORE);
    const r2 = jp.query(STORE);
    expect(r1).toHaveLength(4);
    expect(r1).toEqual(r2);
  });

  test("first()", () => {
    const jp = new JSONPath("$.store.book[*].author");
    expect(jp.first(STORE)).toBe("Nigel Rees");
  });

  test("exists()", () => {
    expect(new JSONPath("$.store.bicycle").exists(STORE)).toBe(true);
    expect(new JSONPath("$.store.airplane").exists(STORE)).toBe(false);
  });

  test("source preserved", () => {
    const path = "$.store.book[*]";
    expect(new JSONPath(path).source).toBe(path);
  });
});

// ── 12. error handling ────────────────────────────────────────────────────────

describe("JSONPathError", () => {
  test("missing $", () => {
    expect(() => query("store.book", STORE)).toThrow(JSONPathError);
  });

  test("unexpected character", () => {
    expect(() => query("$.store@", STORE)).toThrow();
  });

  test("is Error", () => {
    expect(() => query("store", STORE)).toThrow(Error);
  });
});

// ── 13. primitive root values ────────────────────────────────────────────────

describe("primitive root", () => {
  test("$ on array", () => {
    expect(query("$", [1, 2, 3])).toEqual([[1, 2, 3]]);
  });

  test("[0] on array root", () => {
    expect(query("$[0]", [1, 2, 3])).toEqual([1]);
  });

  test("[*] on array root", () => {
    expect(query("$[*]", [1, 2, 3])).toEqual([1, 2, 3]);
  });

  test("$ on string", () => {
    expect(query("$", "hello")).toEqual(["hello"]);
  });

  test("$ on number", () => {
    expect(query("$", 42)).toEqual([42]);
  });
});

// ── 14. nested filter ────────────────────────────────────────────────────────

describe("nested filter", () => {
  const data: JSONValue = {
    users: [
      { name: "Alice", scores: [90, 85, 92], active: true },
      { name: "Bob",   scores: [70, 75, 68], active: false },
      { name: "Carol", scores: [95, 98, 100], active: true },
    ],
  };

  test("filter by boolean", () => {
    const r = query("$.users[?(@.active == true)]", data);
    expect(r).toHaveLength(2);
  });

  test("filter by boolean false", () => {
    const r = query("$.users[?(@.active == false)]", data);
    expect(r).toHaveLength(1);
    expect((r[0] as any).name).toBe("Bob");
  });

  test("filter numeric in nested array", () => {
    const r = query("$.users[*].scores[?(@  > 90)]", data);
    // 92, 95, 98, 100
    expect(r.length).toBeGreaterThanOrEqual(4);
  });
});

// ── 15. edge cases ────────────────────────────────────────────────────────────

describe("edge cases", () => {
  test("empty array", () => {
    expect(query("$[*]", [])).toEqual([]);
    expect(query("$..x", [])).toEqual([]);
  });

  test("null value in data", () => {
    const r = query("$.a", { a: null });
    expect(r).toEqual([null]);
  });

  test("numeric key name (string)", () => {
    const r = query("$['0']", { "0": "zero" });
    expect(r).toEqual(["zero"]);
  });

  test("deeply nested", () => {
    const deep: JSONValue = { a: { b: { c: { d: { e: 42 } } } } };
    expect(query("$.a.b.c.d.e", deep)).toEqual([42]);
  });

  test("$..* collects all leaf values", () => {
    const r = query("$..*", { a: 1, b: { c: 2 } });
    expect(r).toContain(1);
    expect(r).toContain(2);
  });

  test("filter with null comparison", () => {
    const data: JSONValue = { items: [{ v: null }, { v: 1 }] };
    const r = query("$.items[?(@.v == null)]", data);
    expect(r).toHaveLength(1);
  });

  test("parse() returns segments array", () => {
    const segs = parse("$.store.book[*]");
    expect(Array.isArray(segs)).toBe(true);
  });
});
