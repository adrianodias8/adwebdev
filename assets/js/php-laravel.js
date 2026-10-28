// Pretend Laravel for the Tinker window: collect(), Str, Arr, Carbon, Hash,
// Cache, fake() and Eloquent-ish models whose rows are this site's own posts
// and projects. Rows you create live in memory until the page reloads.
(() => {
  "use strict";
  const { PhpArray, PhpObject, Closure, fail, phpDate, humanDiff, randomInt, Raw, isNumericString } = MiniPhp;

  // ---- Helpers

  const dataGet = (php, target, key) => {
    if (key === null || key === undefined) return target;
    for (const part of php.str(key).split(".")) {
      if (target instanceof PhpArray) target = target.has(part) ? target.get(part) : null;
      else if (target instanceof PhpObject) target = target.props.has(part) ? target.props.get(part) : target.getProp ? target.getProp(part) ?? null : null;
      else return null;
    }
    return target ?? null;
  };
  const toList = (php, v) => (v instanceof PhpArray ? v : v instanceof PhpObject && v.items ? v.items : v === null || v === undefined ? new PhpArray() : PhpArray.of([v]));
  const words = (s) => s.replace(/([a-z\d])([A-Z])/g, "$1 $2").replace(/[-_\s]+/g, " ").trim().split(" ").filter(Boolean);
  const ascii = (s) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const randomString = (n, chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789") => Array.from({ length: n }, () => chars[randomInt(0, chars.length - 1)]).join("");
  const stamp = (ms = Date.now()) => phpDate("Y-m-d H:i:s", ms);

  // ---- Str

  const IRREGULAR = { person: "people", child: "children", man: "men", woman: "women", mouse: "mice", goose: "geese", ox: "oxen", tooth: "teeth", foot: "feet" };
  const plural = (s) => {
    const low = s.toLowerCase();
    if (IRREGULAR[low]) return IRREGULAR[low];
    if (/[^aeiou]y$/i.test(s)) return `${s.slice(0, -1)}ies`;
    if (/(s|x|z|ch|sh)$/i.test(s)) return `${s}es`;
    return `${s}s`;
  };
  const singular = (s) => {
    const back = Object.entries(IRREGULAR).find(([, p]) => p === s.toLowerCase());
    if (back) return back[0];
    if (/ies$/i.test(s)) return `${s.slice(0, -3)}y`;
    if (/(s|x|z|ch|sh)es$/i.test(s)) return s.slice(0, -2);
    if (/s$/i.test(s) && !/ss$/i.test(s)) return s.slice(0, -1);
    return s;
  };
  const ulid = () => {
    const alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
    let t = Date.now();
    let time = "";
    for (let i = 0; i < 10; i++) { time = alphabet[t % 32] + time; t = Math.floor(t / 32); }
    return time + randomString(16, alphabet);
  };
  const STR = (php) => {
    const s = (v) => php.str(v);
    const fns = {
      slug: ([v, sep = "-"]) => ascii(s(v)).toLowerCase().replace(/@/g, ` at `).replace(/[^a-z0-9]+/g, s(sep)).replace(new RegExp(`^\\${s(sep)}+|\\${s(sep)}+$`, "g"), ""),
      upper: ([v]) => s(v).toUpperCase(),
      lower: ([v]) => s(v).toLowerCase(),
      title: ([v]) => s(v).toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase()),
      headline: ([v]) => words(s(v)).map((w) => w[0].toUpperCase() + w.slice(1)).join(" "),
      camel: ([v]) => words(s(v)).map((w, i) => (i ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w.toLowerCase())).join(""),
      studly: ([v]) => words(s(v)).map((w) => w[0].toUpperCase() + w.slice(1)).join(""),
      pascal: ([v]) => fns.studly([v]),
      snake: ([v, sep = "_"]) => words(s(v)).map((w) => w.toLowerCase()).join(s(sep)),
      kebab: ([v]) => fns.snake([v, "-"]),
      ucfirst: ([v]) => s(v).charAt(0).toUpperCase() + s(v).slice(1),
      lcfirst: ([v]) => s(v).charAt(0).toLowerCase() + s(v).slice(1),
      length: ([v]) => [...s(v)].length,
      limit: ([v, n = 100, end = "..."]) => ([...s(v)].length <= php.num(n) ? s(v) : [...s(v)].slice(0, php.num(n)).join("").trimEnd() + s(end)),
      words: ([v, n = 100, end = "..."]) => { const w = s(v).split(/\s+/); return w.length <= php.num(n) ? s(v) : w.slice(0, php.num(n)).join(" ") + s(end); },
      wordcount: ([v]) => (s(v).match(/\S+/g) || []).length,
      random: ([n = 16]) => randomString(php.num(n)),
      password: ([n = 32]) => randomString(php.num(n), "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()-_=+[]{};:,.<>?"),
      uuid: () => crypto.randomUUID(),
      ordereduuid: () => crypto.randomUUID(),
      ulid: () => ulid(),
      plural: ([v, n = 2]) => (Math.abs(php.num(n)) === 1 ? s(v) : plural(s(v))),
      singular: ([v]) => singular(s(v)),
      reverse: ([v]) => [...s(v)].reverse().join(""),
      contains: ([h, n]) => (n instanceof PhpArray ? n.values() : [n]).some((x) => s(h).includes(s(x))),
      containsall: ([h, n]) => n.values().every((x) => s(h).includes(s(x))),
      startswith: ([h, n]) => (n instanceof PhpArray ? n.values() : [n]).some((x) => s(h).startsWith(s(x))),
      endswith: ([h, n]) => (n instanceof PhpArray ? n.values() : [n]).some((x) => s(h).endsWith(s(x))),
      before: ([v, x]) => { const i = s(v).indexOf(s(x)); return i < 0 ? s(v) : s(v).slice(0, i); },
      after: ([v, x]) => { const i = s(v).indexOf(s(x)); return i < 0 ? s(v) : s(v).slice(i + s(x).length); },
      between: ([v, a, b]) => fns.before([fns.after([v, a]), b]),
      replace: ([search, rep, subject]) => s(subject).split(s(search)).join(s(rep)),
      squish: ([v]) => s(v).trim().replace(/\s+/g, " "),
      mask: ([v, ch, index, len]) => { const c = [...s(v)]; let i = php.num(index); if (i < 0) i += c.length; const l = len === undefined ? c.length - i : php.num(len); for (let k = i; k < Math.min(c.length, i + l); k++) c[k] = s(ch); return c.join(""); },
      padleft: ([v, n, p = " "]) => s(v).padStart(php.num(n), s(p)),
      padright: ([v, n, p = " "]) => s(v).padEnd(php.num(n), s(p)),
      padboth: ([v, n, p = " "]) => { const left = Math.floor((php.num(n) - s(v).length) / 2); return s(v).padStart(s(v).length + Math.max(0, left), s(p)).padEnd(php.num(n), s(p)); },
      isuuid: ([v]) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s(v)),
      isjson: ([v]) => { try { JSON.parse(s(v)); return true; } catch { return false; } },
      isurl: ([v]) => /^https?:\/\/[^\s]+$/i.test(s(v)),
      isascii: ([v]) => /^[\x00-\x7f]*$/.test(s(v)),
      is: ([pattern, v]) => new RegExp(`^${s(pattern).replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}$`).test(s(v)),
      ascii: ([v]) => ascii(s(v)),
      excerpt: ([v, phrase, opts]) => { const i = s(v).toLowerCase().indexOf(s(phrase).toLowerCase()); if (i < 0) return null; const r = 100; return `${i > r ? "..." : ""}${s(v).slice(Math.max(0, i - r), i + s(phrase).length + r)}${i + s(phrase).length + r < s(v).length ? "..." : ""}`; },
      inlinemarkdown: ([v]) => s(v).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/\*(.+?)\*/g, "<em>$1</em>").replace(/`(.+?)`/g, "<code>$1</code>"),
      markdown: ([v]) => `<p>${fns.inlinemarkdown([v])}</p>\n`,
      of: ([v]) => stringable(php, s(v)),
    };
    return fns;
  };
  function stringable(php, value) {
    const o = new PhpObject("Illuminate\\Support\\Stringable");
    const str = STR(php);
    o.toStr = () => value;
    o.dumpEntries = () => [["value", value]];
    o.methods = {
      tostring: () => value,
      value: () => value,
      __tostring: () => value,
      append: (args) => stringable(php, value + args.map((a) => php.str(a)).join("")),
      prepend: (args) => stringable(php, args.map((a) => php.str(a)).join("") + value),
      trim: () => stringable(php, value.trim()),
      explode: ([sep]) => collection(php, PhpArray.of(value.split(php.str(sep)))),
      split: ([n]) => collection(php, PhpArray.of(value.match(new RegExp(`.{1,${php.num(n)}}`, "g")) || [])),
      exactly: ([x]) => value === php.str(x),
      isempty: () => value === "",
      isnotempty: () => value !== "",
      when: ([cond, cb]) => (php.truthy(cond) ? php.callValue(cb, [o, cond]) ?? o : o),
      pipe: ([cb]) => stringable(php, php.str(php.callValue(cb, [o]))),
      dump: () => { php.note(php.dump(o), "is-value"); return o; },
    };
    o.callMissing = (name, args) => {
      const fn = str[name.toLowerCase()];
      if (!fn) return undefined;
      const r = fn([value, ...args]);
      return typeof r === "string" ? stringable(php, r) : r;
    };
    return o;
  }

  // ---- Collections

  function collection(php, items) {
    const c = new PhpObject("Illuminate\\Support\\Collection");
    c.items = items instanceof PhpArray ? items : new PhpArray();
    const make = (entries, keep = true) => {
      const a = new PhpArray();
      for (const [k, v] of entries) keep ? a.set(k, v) : a.push(v);
      return collection(php, a);
    };
    const ent = () => c.items.entries();
    const vals = () => c.items.values();
    const call = (cb, v, k) => php.callValue(cb, [v, k]);
    const by = (key) => (v, k) => (key instanceof Closure || (typeof key === "string" && key.includes("::")) ? call(key, v, k) : dataGet(php, v, key));
    const truth = (cb) => (cb === undefined || cb === null ? ([, v]) => php.truthy(v) : ([k, v]) => php.truthy(call(cb, v, k)));
    const whereTest = (args) => {
      let [key, op, val] = args;
      if (args.length === 2) { val = op; op = "="; }
      op = php.str(op);
      return ([, v]) => {
        const x = dataGet(php, v, key);
        switch (op) {
          case "=": case "==": return php.looseEq(x, val);
          case "===": return php.strictEq(x, val);
          case "!=": case "<>": return !php.looseEq(x, val);
          case ">": return php.compare(x, val) > 0;
          case "<": return php.compare(x, val) < 0;
          case ">=": return php.compare(x, val) >= 0;
          case "<=": return php.compare(x, val) <= 0;
          default: return false;
        }
      };
    };
    const sortWith = (fn, desc) => make(ent().sort(([, a], [, b]) => (desc ? -1 : 1) * php.compare(fn(a), fn(b))));
    const nums = (key) => vals().map((v, i) => php.numLoose(key === undefined || key === null ? v : by(key)(v, i)));
    c.dumpEntries = () => [["all", c.items]];
    c.toJson = () => c.items;
    c.methods = {
      all: () => c.items,
      toarray: () => PhpArray.from(ent().map(([k, v]) => [k, v instanceof PhpObject && v.methods.toarray ? v.methods.toarray([], php, v) : v])),
      tojson: () => php.builtins.json_encode([c.items], php),
      count: () => c.items.size,
      sum: ([key]) => nums(key).reduce((a, b) => a + b, 0),
      avg: ([key]) => (c.items.size ? nums(key).reduce((a, b) => a + b, 0) / c.items.size : null),
      average: (args) => c.methods.avg(args),
      median: ([key]) => { const n = nums(key).sort((a, b) => a - b); if (!n.length) return null; const m = Math.floor(n.length / 2); return n.length % 2 ? n[m] : (n[m - 1] + n[m]) / 2; },
      max: ([key]) => (c.items.size ? vals().map((v, i) => (key === undefined ? v : by(key)(v, i))).reduce((a, b) => (php.compare(b, a) > 0 ? b : a)) : null),
      min: ([key]) => (c.items.size ? vals().map((v, i) => (key === undefined ? v : by(key)(v, i))).reduce((a, b) => (php.compare(b, a) < 0 ? b : a)) : null),
      first: ([cb, def = null]) => { for (const [k, v] of ent()) if (cb === undefined || cb === null || php.truthy(call(cb, v, k))) return v; return def; },
      last: ([cb, def = null]) => { for (const [k, v] of ent().reverse()) if (cb === undefined || cb === null || php.truthy(call(cb, v, k))) return v; return def; },
      firstwhere: (args) => { const t = whereTest(args.length === 1 ? [args[0], true] : args); return ent().find((e) => t(e))?.[1] ?? null; },
      get: ([k, def = null]) => (c.items.has(k) ? c.items.get(k) : def instanceof Closure ? php.callClosure(def, []) : def),
      has: ([k]) => c.items.has(k),
      put: ([k, v]) => { c.items.set(k, v); return c; },
      push: (args) => { for (const v of args) c.items.push(v); return c; },
      prepend: ([v]) => { const e = ent(); c.items = new PhpArray(); c.items.push(v); for (const [, x] of e) c.items.push(x); return c; },
      pop: () => { const k = c.items.keys().pop(); if (k === undefined) return null; const v = c.items.get(k); c.items.delete(k); return v; },
      shift: () => { const e = ent(); if (!e.length) return null; const [, v] = e.shift(); c.items = new PhpArray(); for (const [, x] of e) c.items.push(x); return v; },
      forget: ([k]) => { c.items.delete(k); return c; },
      map: ([cb]) => make(ent().map(([k, v]) => [k, call(cb, v, k)])),
      mapwithkeys: ([cb]) => { const out = new PhpArray(); for (const [k, v] of ent()) for (const [k2, v2] of php.callValue(cb, [v, k]).entries()) out.set(k2, v2); return collection(php, out); },
      flatmap: ([cb]) => { const out = new PhpArray(); for (const [k, v] of ent()) for (const x of toList(php, call(cb, v, k)).values()) out.push(x); return collection(php, out); },
      filter: ([cb]) => make(ent().filter(truth(cb))),
      reject: ([cb]) => make(ent().filter((e) => !truth(cb)(e))),
      where: (args) => make(ent().filter(whereTest(args))),
      wherein: ([key, list]) => make(ent().filter(([, v]) => toList(php, list).values().some((x) => php.looseEq(dataGet(php, v, key), x)))),
      wherenull: ([key]) => make(ent().filter(([, v]) => dataGet(php, v, key) === null)),
      wherenotnull: ([key]) => make(ent().filter(([, v]) => dataGet(php, v, key) !== null)),
      each: ([cb]) => { for (const [k, v] of ent()) if (call(cb, v, k) === false) break; return c; },
      pluck: ([key, keyBy]) => { const out = new PhpArray(); for (const v of vals()) keyBy === undefined ? out.push(dataGet(php, v, key)) : out.set(dataGet(php, v, keyBy), dataGet(php, v, key)); return collection(php, out); },
      keys: () => collection(php, PhpArray.of(c.items.keys())),
      values: () => collection(php, PhpArray.of(vals())),
      reverse: () => make(ent().reverse()),
      sort: ([cb]) => (cb ? make(ent().sort(([, a], [, b]) => php.num(php.callValue(cb, [a, b])))) : sortWith((v) => v)),
      sortdesc: () => sortWith((v) => v, true),
      sortby: ([key]) => sortWith((v) => by(key)(v)),
      sortbydesc: ([key]) => sortWith((v) => by(key)(v), true),
      sortkeys: () => make(ent().sort(([a], [b]) => php.compare(a, b))),
      take: ([n]) => make(php.num(n) >= 0 ? ent().slice(0, php.num(n)) : ent().slice(php.num(n))),
      skip: ([n]) => make(ent().slice(php.num(n))),
      slice: ([off, len]) => make(len === undefined ? ent().slice(php.num(off)) : ent().slice(php.num(off), php.num(off) + php.num(len))),
      chunk: ([n]) => { const e = ent(); const out = new PhpArray(); for (let i = 0; i < e.length; i += php.num(n)) out.push(make(e.slice(i, i + php.num(n)))); return collection(php, out); },
      split: ([n]) => { const e = ent(); const size = Math.ceil(e.length / php.num(n)); const out = new PhpArray(); for (let i = 0; i < e.length; i += size) out.push(make(e.slice(i, i + size), false)); return collection(php, out); },
      groupby: ([key]) => { const out = new PhpArray(); for (const [k, v] of ent()) { const g = by(key)(v, k); if (!out.has(g)) out.set(g, collection(php, new PhpArray())); out.get(g).items.push(v); } return collection(php, out); },
      keyby: ([key]) => { const out = new PhpArray(); for (const [k, v] of ent()) out.set(by(key)(v, k), v); return collection(php, out); },
      countby: ([key]) => { const out = new PhpArray(); for (const [k, v] of ent()) { const g = key === undefined ? v : by(key)(v, k); out.set(g, (out.get(g) || 0) + 1); } return collection(php, out); },
      unique: ([key]) => { const seen = []; return make(ent().filter(([k, v]) => { const s = php.dump(key === undefined ? v : by(key)(v, k)); if (seen.includes(s)) return false; seen.push(s); return true; })); },
      duplicates: () => { const seen = []; return make(ent().filter(([, v]) => { const s = php.dump(v); if (seen.includes(s)) return true; seen.push(s); return false; })); },
      contains: ([x, op, val]) => (op !== undefined ? ent().some(whereTest(val === undefined ? [x, op] : [x, op, val])) : x instanceof Closure ? ent().some(([k, v]) => php.truthy(call(x, v, k))) : vals().some((v) => php.looseEq(v, x))),
      doesntcontain: (args) => !c.methods.contains(args),
      search: ([x]) => { for (const [k, v] of ent()) if (x instanceof Closure ? php.truthy(call(x, v, k)) : php.looseEq(v, x)) return k; return false; },
      implode: ([a, b]) => (b === undefined ? vals().map((v) => php.str(v)).join(php.str(a ?? "")) : vals().map((v) => php.str(dataGet(php, v, a))).join(php.str(b))),
      join: ([glue, last]) => { const v = vals().map((x) => php.str(x)); if (last === undefined || v.length < 2) return v.join(php.str(glue)); return `${v.slice(0, -1).join(php.str(glue))}${php.str(last)}${v[v.length - 1]}`; },
      merge: ([other]) => { const out = c.items.copy(); for (const [k, v] of toList(php, other).entries()) typeof k === "number" ? out.push(v) : out.set(k, v); return collection(php, out); },
      combine: ([other]) => { const v = toList(php, other).values(); return make(vals().map((k, i) => [k, v[i] ?? null])); },
      flip: () => make(ent().map(([k, v]) => [v, k])),
      flatten: () => { const out = new PhpArray(); const walk = (v) => (v instanceof PhpArray || (v instanceof PhpObject && v.items) ? toList(php, v).values().forEach(walk) : out.push(v)); vals().forEach(walk); return collection(php, out); },
      collapse: () => { const out = new PhpArray(); for (const v of vals()) for (const x of toList(php, v).values()) out.push(x); return collection(php, out); },
      zip: ([other]) => { const o = toList(php, other).values(); return collection(php, PhpArray.of(vals().map((v, i) => collection(php, PhpArray.of([v, o[i] ?? null]))))); },
      pad: ([n, v]) => { const out = vals(); while (out.length < Math.abs(php.num(n))) php.num(n) > 0 ? out.push(v) : out.unshift(v); return collection(php, PhpArray.of(out)); },
      random: ([n]) => { const v = vals(); if (!v.length) fail("InvalidArgumentException", "You requested 1 items, but there are only 0 items available."); return n === undefined ? v[randomInt(0, v.length - 1)] : collection(php, PhpArray.of([...v].sort(() => Math.random() - 0.5).slice(0, php.num(n)))); },
      shuffle: () => collection(php, PhpArray.of([...vals()].sort(() => Math.random() - 0.5))),
      isempty: () => c.items.size === 0,
      isnotempty: () => c.items.size > 0,
      when: ([cond, cb, other]) => (php.truthy(cond) ? php.callValue(cb, [c, cond]) ?? c : other ? php.callValue(other, [c, cond]) ?? c : c),
      unless: ([cond, cb]) => (!php.truthy(cond) ? php.callValue(cb, [c, cond]) ?? c : c),
      pipe: ([cb]) => php.callValue(cb, [c]),
      tap: ([cb]) => { php.callValue(cb, [c]); return c; },
      reduce: ([cb, init = null]) => ent().reduce((acc, [k, v]) => php.callValue(cb, [acc, v, k]), init),
      every: ([cb]) => ent().every(([k, v]) => php.truthy(call(cb, v, k))),
      partition: ([cb]) => collection(php, PhpArray.of([make(ent().filter(truth(cb))), make(ent().filter((e) => !truth(cb)(e)))])),
      diff: ([other]) => make(ent().filter(([, v]) => !toList(php, other).values().some((x) => php.looseEq(x, v)))),
      intersect: ([other]) => make(ent().filter(([, v]) => toList(php, other).values().some((x) => php.looseEq(x, v)))),
      only: ([keys]) => make(ent().filter(([k]) => toList(php, keys).values().some((x) => php.looseEq(x, k)))),
      except: ([keys]) => make(ent().filter(([k]) => !toList(php, keys).values().some((x) => php.looseEq(x, k)))),
      times: ([n, cb]) => collection(php, PhpArray.of(Array.from({ length: php.num(n) }, (_, i) => php.callValue(cb, [i + 1])))),
      dump: () => { php.note(php.dump(c), "is-value"); return c; },
      dd: () => { php.note(php.dump(c), "is-value"); const h = new MiniPhp.Halt(); h.dumped = true; throw h; },
      collect: () => collection(php, c.items.copy()),
      lazy: () => c,
      getiterator: () => c,
    };
    return c;
  }

  // ---- Dates

  const UNITS = { second: 1000, minute: 60000, hour: 3600000, day: 86400000, week: 604800000 };
  function carbon(php, ms) {
    const c = new PhpObject("Illuminate\\Support\\Carbon");
    c.ms = ms;
    c.dumpHead = () => `@${Math.floor(c.ms / 1000)}`;
    c.dumpEntries = () => [["date", new Raw(phpDate("Y-m-d H:i:s.u e (P)", c.ms))]];
    c.toStr = () => phpDate("Y-m-d H:i:s", c.ms);
    c.toJson = () => phpDate("Y-m-d\\TH:i:s.v\\Z", c.ms);
    const other = (v) => (v instanceof PhpObject && v.ms !== undefined ? v.ms : v === undefined || v === null ? Date.now() : parseDate(php, v));
    const shift = (unit, n) => {
      const d = new Date(c.ms);
      if (unit === "month") d.setUTCMonth(d.getUTCMonth() + n);
      else if (unit === "year") d.setUTCFullYear(d.getUTCFullYear() + n);
      else d.setTime(d.getTime() + n * UNITS[unit]);
      c.ms = d.getTime();
      return c;
    };
    const z = () => MiniPhp.zoned(c.ms);
    c.methods = {
      format: ([f]) => phpDate(php.str(f), c.ms),
      todatestring: () => phpDate("Y-m-d", c.ms),
      todatetimestring: () => phpDate("Y-m-d H:i:s", c.ms),
      totimestring: () => phpDate("H:i:s", c.ms),
      toiso8601string: () => phpDate("c", c.ms),
      toformatteddatestring: () => phpDate("M j, Y", c.ms),
      todaydatetimestring: () => phpDate("D, M j, Y g:i A", c.ms),
      tostring: () => c.toStr(),
      diffforhumans: ([o]) => (o === undefined ? humanDiff(c.ms) : humanDiff(c.ms, other(o)).replace("ago", "before").replace("from now", "after")),
      isweekend: () => [0, 6].includes(z().wd),
      isweekday: () => ![0, 6].includes(z().wd),
      istoday: () => phpDate("Y-m-d", c.ms) === phpDate("Y-m-d", Date.now()),
      ispast: () => c.ms < Date.now(),
      isfuture: () => c.ms > Date.now(),
      isleapyear: () => phpDate("L", c.ms) === "1",
      startofday: () => { c.ms -= ((z().h * 60 + z().mi) * 60 + z().s) * 1000 + z().ms; return c; },
      endofday: () => { c.methods.startofday(); c.ms += 86399999; return c; },
      startofmonth: () => { c.methods.startofday(); c.ms -= (z().d - 1) * 86400000; return c; },
      startofyear: () => { c.ms = parseDate(php, `${z().y}-01-01 00:00:00`); return c; },
      copy: () => carbon(php, c.ms),
      clone: () => carbon(php, c.ms),
      settimezone: () => c,
      timezone: () => c,
      gettimestamp: () => Math.floor(c.ms / 1000),
      eq: ([o]) => c.ms === other(o),
      gt: ([o]) => c.ms > other(o),
      lt: ([o]) => c.ms < other(o),
    };
    c.callMissing = (name, args) => {
      const n = args.length ? php.num(args[0]) : 1;
      let m = /^(add|sub)(second|minute|hour|day|week|month|year)s?$/i.exec(name);
      if (m) return shift(m[2].toLowerCase(), m[1].toLowerCase() === "add" ? n : -n);
      m = /^diffin(second|minute|hour|day|week|month|year)s$/i.exec(name);
      if (m) {
        const unit = m[1].toLowerCase();
        const ms = Math.abs(other(args[0]) - c.ms);
        return Math.floor(ms / (unit === "month" ? 2629746000 : unit === "year" ? 31556952000 : UNITS[unit]));
      }
      m = /^is(monday|tuesday|wednesday|thursday|friday|saturday|sunday)$/i.exec(name);
      if (m) return MiniPhp.zoned(c.ms).wd === ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"].indexOf(m[1].toLowerCase());
      return undefined;
    };
    c.getProp = (name) => {
      const p = z();
      return {
        year: p.y, month: p.mo, day: p.d, hour: p.h, minute: p.mi, second: p.s, micro: p.ms * 1000,
        dayOfWeek: p.wd, dayOfWeekIso: p.wd || 7, dayOfYear: Number(phpDate("z", c.ms)) + 1, daysInMonth: Number(phpDate("t", c.ms)),
        dayName: phpDate("l", c.ms), shortDayName: phpDate("D", c.ms), monthName: phpDate("F", c.ms), englishDayOfWeek: phpDate("l", c.ms),
        timestamp: Math.floor(c.ms / 1000), timezoneName: MiniPhp.TZ, tzName: MiniPhp.TZ,
        age: Math.floor((Date.now() - c.ms) / 31556952000), quarter: Math.ceil(p.mo / 3), weekOfYear: Number(phpDate("W", c.ms)) || Math.ceil(Number(phpDate("z", c.ms)) / 7),
      }[name];
    };
    return c;
  }
  function parseDate(php, v) {
    if (typeof v === "number") return v * 1000;
    const s = php.str(v).trim();
    const rel = php.builtins.strtotime([s], php);
    if (rel !== false && !/^\d{4}-\d{2}-\d{2}/.test(s)) return rel * 1000;
    const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(s);
    if (m) {
      const guess = Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
      return guess - MiniPhp.zoned(guess).offset * 60000;
    }
    const t = Date.parse(s);
    if (Number.isNaN(t)) fail("Carbon\\Exceptions\\InvalidFormatException", `Could not parse '${s}': Failed to parse time string (${s}) at position 0 (${s[0] || ""}): The timezone could not be found in the database`);
    return t;
  }

  // ---- Fake data, a small Faker with a Brussels-and-Lisbon accent

  const FIRST = ["Ana", "João", "Inês", "Pedro", "Sofia", "Tiago", "Beatriz", "Emma", "Louis", "Noah", "Olivia", "Lars", "Maya", "Arthur", "Chloé", "Jules", "Mila", "Rui", "Lotte", "Wout"];
  const LAST = ["Silva", "Santos", "Ferreira", "Costa", "Martins", "Peeters", "Janssens", "Maes", "Dubois", "Lambert", "Willems", "Claes", "Pereira", "Mertens", "Rodrigues"];
  const CITIES = ["Brussels", "Lisbon", "Ghent", "Porto", "Antwerp", "Liège", "Coimbra", "Leuven", "Braga", "Bruges", "Namur", "Faro"];
  const COMPANIES = ["Peeters & Silva", "Waffle Works", "Atomium Digital", "Pastel Labs", "Manneken Media", "Tram 81", "Azulejo Studio", "Frites & Code"];
  const JOBS = ["Web Developer", "Drupal Developer", "Laravel Developer", "Site Builder", "DevOps Engineer", "Product Owner", "Designer", "Photographer"];
  const LOREM = "lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua ut enim ad minim veniam quis nostrud exercitation ullamco laboris nisi aliquip ex ea commodo consequat".split(" ");
  const COLOURS = ["Black", "White", "Orange", "Teal", "Navy", "Olive", "Maroon", "Silver", "Coral", "Indigo"];
  function faker(php) {
    const f = new PhpObject("Faker\\Generator");
    const one = (list) => list[randomInt(0, list.length - 1)];
    const sentence = (n = randomInt(4, 9)) => { const w = Array.from({ length: n }, () => one(LOREM)); w[0] = w[0][0].toUpperCase() + w[0].slice(1); return `${w.join(" ")}.`; };
    f.methods = {
      name: () => `${one(FIRST)} ${one(LAST)}`,
      firstname: () => one(FIRST),
      lastname: () => one(LAST),
      username: () => `${ascii(one(FIRST)).toLowerCase()}${randomInt(1, 99)}`,
      email: () => `${ascii(one(FIRST)).toLowerCase()}.${ascii(one(LAST)).toLowerCase()}@example.${one(["be", "pt", "com", "org"])}`,
      safeemail: () => `${ascii(one(FIRST)).toLowerCase()}@example.org`,
      unique: () => f,
      word: () => one(LOREM),
      words: ([n = 3, asText = false]) => { const w = Array.from({ length: php.num(n) }, () => one(LOREM)); return php.truthy(asText) ? w.join(" ") : PhpArray.of(w); },
      sentence: ([n]) => sentence(n === undefined ? undefined : php.num(n)),
      paragraph: () => Array.from({ length: 3 }, () => sentence()).join(" "),
      text: ([max = 200]) => { let t = ""; while (t.length < php.num(max) - 40) t += `${sentence()} `; return t.trim(); },
      city: () => one(CITIES),
      country: () => one(["Belgium", "Portugal", "the Netherlands", "France", "Spain"]),
      company: () => one(COMPANIES),
      jobtitle: () => one(JOBS),
      numberbetween: ([a = 0, b = 2147483647]) => randomInt(php.num(a), php.num(b)),
      randomdigit: () => randomInt(0, 9),
      randomnumber: ([n = 6]) => randomInt(0, 10 ** php.num(n) - 1),
      randomfloat: ([d = 2, a = 0, b = 100]) => Number((php.num(a) + Math.random() * (php.num(b) - php.num(a))).toFixed(php.num(d))),
      randomelement: ([list]) => one(toList(php, list).values()),
      boolean: ([chance = 50]) => randomInt(1, 100) <= php.num(chance),
      uuid: () => crypto.randomUUID(),
      date: ([fmt = "Y-m-d"]) => phpDate(php.str(fmt), Date.now() - randomInt(0, 3650) * 86400000),
      datetime: () => carbon(php, Date.now() - randomInt(0, 3650) * 86400000),
      colorname: () => one(COLOURS),
      hexcolor: () => `#${randomString(6, "0123456789abcdef")}`,
      url: () => `https://${ascii(one(COMPANIES)).toLowerCase().replace(/[^a-z]+/g, "-")}.example.com/`,
      ipv4: () => Array.from({ length: 4 }, () => randomInt(1, 254)).join("."),
      phonenumber: () => `+32 4${randomInt(70, 99)} ${randomInt(10, 99)} ${randomInt(10, 99)} ${randomInt(10, 99)}`,
      password: () => randomString(12, "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!#$%"),
      slug: () => Array.from({ length: 3 }, () => one(LOREM)).join("-"),
      emoji: () => one(["🙂", "🧇", "🍟", "📷", "🐘", "🦀", "☕", "🍺"]),
    };
    return f;
  }

  // ---- Models: Eloquent-ish, over rows that live in memory

  function modelDefs(data) {
    const users = [{
      id: 1, name: "Adriano Dias", email: data.email || "contact@adwebdev.xyz",
      email_verified_at: "2011-01-05 09:00:00",
      password: "$2y$12$Tn3pV1VzLq2T3cF5o0Fz0e1Jq6Yb3kz2m0yQwYH0rD6m3m3Kq0r2a",
      remember_token: null, created_at: "2011-01-05 09:00:00", updated_at: stamp(),
    }];
    const posts = [...(data.posts || [])].sort((a, b) => (a.date < b.date ? -1 : 1)).map((p, i) => ({
      id: i + 1, user_id: 1, title: p.title, slug: (p.url.match(/\/([^/]+)\/?$/) || [])[1] || "", url: p.url,
      published_at: `${p.date} 09:00:00`, created_at: `${p.date} 09:00:00`, updated_at: `${p.date} 09:00:00`,
    }));
    const projects = (data.projects || []).map((p, i) => ({
      id: i + 1, user_id: 1, name: p.name, slug: p.slug, kind: p.kind, status: p.status, about: p.about,
      created_at: stamp(), updated_at: stamp(),
    }));
    return {
      user: { short: "User", cls: "App\\Models\\User", table: "users", rows: users, hidden: ["password", "remember_token"], relations: { posts: "post", projects: "project" } },
      post: { short: "Post", cls: "App\\Models\\Post", table: "posts", rows: posts, belongsTo: { user: "user", author: "user" } },
      project: { short: "Project", cls: "App\\Models\\Project", table: "projects", rows: projects, belongsTo: { user: "user", owner: "user" } },
    };
  }

  function model(php, defs, def, row, exists = true) {
    const m = new PhpObject(def.cls);
    for (const [k, v] of Object.entries(row)) m.props.set(k, v);
    m.exists = exists;
    const visible = () => [...m.props.entries()].filter(([k]) => !(def.hidden || []).includes(k));
    m.toJson = () => PhpArray.from(visible());
    const persist = () => {
      const now = stamp();
      if (m.exists) {
        const r = def.rows.find((x) => x.id === m.props.get("id"));
        if (r) { m.props.set("updated_at", now); for (const [k, v] of m.props) r[k] = v; }
      } else {
        const id = def.rows.reduce((max, r) => Math.max(max, r.id), 0) + 1;
        const fresh = { id, ...Object.fromEntries(m.props), created_at: now, updated_at: now };
        m.props = new Map(Object.entries(fresh));
        def.rows.push(fresh);
        m.exists = true;
      }
      return true;
    };
    m.methods = {
      toarray: () => PhpArray.from(visible()),
      tojson: () => php.builtins.json_encode([m.toJson()], php),
      save: () => persist(),
      update: ([attrs]) => { for (const [k, v] of attrs.entries()) m.props.set(String(k), v); return persist(); },
      fill: ([attrs]) => { for (const [k, v] of attrs.entries()) m.props.set(String(k), v); return m; },
      delete: () => { const i = def.rows.findIndex((x) => x.id === m.props.get("id")); if (i >= 0) def.rows.splice(i, 1); m.exists = false; return true; },
      fresh: () => { const r = def.rows.find((x) => x.id === m.props.get("id")); return r ? model(php, defs, def, r) : null; },
      refresh: () => m,
      getkey: () => m.props.get("id") ?? null,
      getkeyname: () => "id",
      gettable: () => def.table,
      getattributes: () => PhpArray.from(m.props.entries()),
      getattribute: ([k]) => m.props.get(php.str(k)) ?? null,
      is: ([o]) => o instanceof PhpObject && o.cls === m.cls && o.props.get("id") === m.props.get("id"),
      isdirty: () => false,
      wasrecentlycreated: () => false,
      replicate: () => { const r = Object.fromEntries(m.props); delete r.id; return model(php, defs, def, r, false); },
      touch: () => persist(),
      only: ([keys]) => PhpArray.from(toList(php, keys).values().map((k) => [k, m.props.get(php.str(k)) ?? null])),
    };
    m.getProp = (name) => {
      if (def.relations?.[name]) {
        const target = defs[def.relations[name]];
        return collection(php, PhpArray.of(target.rows.filter((r) => r.user_id === m.props.get("id")).map((r) => model(php, defs, target, r))));
      }
      if (def.belongsTo?.[name]) {
        const target = defs[def.belongsTo[name]];
        const r = target.rows.find((x) => x.id === m.props.get("user_id"));
        return r ? model(php, defs, target, r) : null;
      }
      return undefined;
    };
    m.callMissing = (name) => {
      const rel = def.relations?.[name] ? def.relations[name] : null;
      if (rel) return builder(php, defs, defs[rel]).methods.where(["user_id", m.props.get("id")]);
      return undefined;
    };
    return m;
  }

  function builder(php, defs, def, std = false) {
    const b = new PhpObject(std ? "Illuminate\\Database\\Query\\Builder" : "Illuminate\\Database\\Eloquent\\Builder");
    const st = { wheres: [], orders: [], limit: null, offset: 0 };
    const like = (val, pattern) => new RegExp(`^${php.str(pattern).replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*").replace(/_/g, ".")}$`, "i").test(php.str(val));
    const test = (row) => st.wheres.every(([col, op, val]) => {
      const x = row[col] ?? null;
      switch (op) {
        case "=": case "==": return php.looseEq(x, val);
        case "!=": case "<>": return !php.looseEq(x, val);
        case ">": return php.compare(x, val) > 0;
        case "<": return php.compare(x, val) < 0;
        case ">=": return php.compare(x, val) >= 0;
        case "<=": return php.compare(x, val) <= 0;
        case "like": return like(x, val);
        case "not like": return !like(x, val);
        case "in": return toList(php, val).values().some((v) => php.looseEq(x, v));
        case "null": return x === null;
        case "not null": return x !== null;
        default: fail("InvalidArgumentException", `Illegal operator and value combination.`);
      }
    });
    const rows = () => {
      let r = def.rows.filter(test);
      if (st.orders.length) {
        r = [...r].sort((a, c) => {
          for (const [col, dir] of st.orders) {
            if (col === "__random") return Math.random() - 0.5;
            const d = php.compare(a[col] ?? null, c[col] ?? null);
            if (d) return dir === "desc" ? -d : d;
          }
          return 0;
        });
      }
      r = r.slice(st.offset);
      return st.limit === null ? r : r.slice(0, st.limit);
    };
    const hydrate = (row) => (std ? php.cast(PhpArray.from(Object.entries(row)), "object") : model(php, defs, def, row));
    const sql = () => {
      const where = st.wheres.map(([c, op, v]) => (op === "in" ? `\`${c}\` in (${toList(php, v).values().map(() => "?").join(", ")})` : op === "null" ? `\`${c}\` is null` : op === "not null" ? `\`${c}\` is not null` : `\`${c}\` ${op} ?`)).join(" and ");
      const order = st.orders.map(([c, d]) => (c === "__random" ? "RAND()" : `\`${c}\` ${d}`)).join(", ");
      return `select * from \`${def.table}\`${where ? ` where ${where}` : ""}${order ? ` order by ${order}` : ""}${st.limit !== null ? ` limit ${st.limit}` : ""}${st.offset ? ` offset ${st.offset}` : ""}`;
    };
    const notFound = (id) => fail("Illuminate\\Database\\Eloquent\\ModelNotFoundException", `No query results for model [${def.cls}] ${id ?? ""}`.trim());
    b.dumpEntries = () => [["sql", sql()]];
    b.methods = {
      where: (args) => {
        let [col, op, val] = args;
        if (col instanceof PhpArray) { for (const [k, v] of col.entries()) st.wheres.push([String(k), "=", v]); return b; }
        if (col instanceof Closure) fail("Error", "Nested where groups are beyond this pretend database");
        if (args.length === 2) { val = op; op = "="; }
        st.wheres.push([php.str(col), php.str(op).toLowerCase(), val]);
        return b;
      },
      wherein: ([col, vals]) => { st.wheres.push([php.str(col), "in", vals]); return b; },
      wherenull: ([col]) => { st.wheres.push([php.str(col), "null", null]); return b; },
      wherenotnull: ([col]) => { st.wheres.push([php.str(col), "not null", null]); return b; },
      wherelike: ([col, val]) => { st.wheres.push([php.str(col), "like", val]); return b; },
      orderby: ([col, dir = "asc"]) => { st.orders.push([php.str(col), php.str(dir).toLowerCase()]); return b; },
      orderbydesc: ([col]) => { st.orders.push([php.str(col), "desc"]); return b; },
      latest: ([col = "created_at"]) => { st.orders.push([php.str(col), "desc"]); return b; },
      oldest: ([col = "created_at"]) => { st.orders.push([php.str(col), "asc"]); return b; },
      inrandomorder: () => { st.orders.push(["__random", "asc"]); return b; },
      take: ([n]) => { st.limit = php.num(n); return b; },
      limit: ([n]) => { st.limit = php.num(n); return b; },
      skip: ([n]) => { st.offset = php.num(n); return b; },
      offset: ([n]) => { st.offset = php.num(n); return b; },
      select: () => b,
      with: () => b,
      get: () => collection(php, PhpArray.of(rows().map(hydrate))),
      all: () => collection(php, PhpArray.of(rows().map(hydrate))),
      first: () => { const r = rows()[0]; return r ? hydrate(r) : null; },
      firstorfail: () => { const r = rows()[0]; return r ? hydrate(r) : notFound(); },
      find: ([id]) => {
        if (id instanceof PhpArray) return collection(php, PhpArray.of(def.rows.filter((r) => id.values().some((x) => php.looseEq(r.id, x))).map(hydrate)));
        const r = def.rows.find((x) => php.looseEq(x.id, id));
        return r ? hydrate(r) : null;
      },
      findorfail: ([id]) => b.methods.find([id]) ?? notFound(php.str(id)),
      firstwhere: (args) => b.methods.where(args).methods.first([]),
      firstorcreate: ([attrs, extra]) => { b.methods.where([attrs]); const r = rows()[0]; if (r) return hydrate(r); const m = model(php, defs, def, Object.fromEntries([...attrs.entries(), ...(extra ? extra.entries() : [])]), false); m.methods.save([]); return m; },
      count: () => rows().length,
      exists: () => rows().length > 0,
      doesntexist: () => rows().length === 0,
      pluck: ([col, key]) => { const out = new PhpArray(); for (const r of rows()) key === undefined ? out.push(r[php.str(col)] ?? null) : out.set(r[php.str(key)], r[php.str(col)] ?? null); return collection(php, out); },
      value: ([col]) => rows()[0]?.[php.str(col)] ?? null,
      sum: ([col]) => rows().reduce((s, r) => s + php.numLoose(r[php.str(col)]), 0),
      avg: ([col]) => { const r = rows(); return r.length ? r.reduce((s, x) => s + php.numLoose(x[php.str(col)]), 0) / r.length : null; },
      max: ([col]) => rows().map((r) => r[php.str(col)]).reduce((a, c) => (a === null || php.compare(c, a) > 0 ? c : a), null),
      min: ([col]) => rows().map((r) => r[php.str(col)]).reduce((a, c) => (a === null || php.compare(c, a) < 0 ? c : a), null),
      tosql: () => sql(),
      torawsql: () => sql(),
      delete: () => { const gone = rows(); for (const r of gone) def.rows.splice(def.rows.indexOf(r), 1); return gone.length; },
      update: ([attrs]) => { const hit = rows(); for (const r of hit) for (const [k, v] of attrs.entries()) r[k] = v; return hit.length; },
      insert: ([attrs]) => { const id = def.rows.reduce((max, r) => Math.max(max, r.id), 0) + 1; def.rows.push({ id, ...Object.fromEntries(attrs.entries()) }); return true; },
      paginate: ([per = 15]) => b.methods.take([per]).methods.get([]),
      dump: () => { php.note(sql(), "is-value"); return b; },
    };
    return b;
  }

  function modelClass(php, defs, def) {
    const make = () => builder(php, defs, def);
    return {
      name: def.cls,
      statics: {
        query: () => make(),
        all: () => make().methods.get([]),
        create: ([attrs]) => { const m = model(php, defs, def, Object.fromEntries((attrs || new PhpArray()).entries()), false); m.methods.save([]); return m; },
        make: ([attrs]) => model(php, defs, def, Object.fromEntries((attrs || new PhpArray()).entries()), false),
        destroy: ([ids]) => { let n = 0; for (const id of toList(php, ids).values()) { const i = def.rows.findIndex((r) => php.looseEq(r.id, id)); if (i >= 0) { def.rows.splice(i, 1); n++; } } return n; },
        factory: ([n]) => factory(php, defs, def, n === undefined ? 1 : php.num(n)),
        truncate: () => { def.rows.splice(0); return null; },
      },
      callStatic: (name, args) => {
        const m = make().methods[name.toLowerCase()];
        return m ? m(args, php) : undefined;
      },
      construct: ([attrs]) => model(php, defs, def, Object.fromEntries((attrs || new PhpArray()).entries()), false),
    };
  }

  function factory(php, defs, def, count) {
    const f = new PhpObject(`Database\\Factories\\${def.short}Factory`);
    const fk = faker(php).methods;
    let n = count;
    const fresh = () => {
      if (def.short === "User") { const name = fk.name([]); return { name, email: `${ascii(name).toLowerCase().replace(/\s+/g, ".")}@example.org`, email_verified_at: stamp(), password: "$2y$12$" + randomString(53, "./ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"), remember_token: randomString(10) }; }
      if (def.short === "Post") { const title = fk.sentence([4]).replace(/\.$/, ""); return { user_id: 1, title, slug: title.toLowerCase().replace(/\s+/g, "-"), url: null, published_at: stamp() }; }
      return { user_id: 1, name: STR(php).headline([fk.words([2, true])]), slug: fk.slug([]), kind: "Side project", status: "Mostly unfinished", about: fk.sentence([]) };
    };
    const build = (attrs, save) => {
      const list = Array.from({ length: n }, () => {
        const m = model(php, defs, def, { ...fresh(), ...(attrs ? Object.fromEntries(attrs.entries()) : {}) }, false);
        if (save) m.methods.save([]);
        return m;
      });
      return n === 1 && count === 1 ? list[0] : collection(php, PhpArray.of(list));
    };
    f.methods = {
      count: ([c]) => { n = php.num(c); count = n; return f; },
      create: ([attrs]) => build(attrs, true),
      make: ([attrs]) => build(attrs, false),
      state: () => f,
      unverified: () => f,
    };
    return f;
  }

  // ---- Facades and helpers

  MiniPhp.flavors.laravel = (php, data) => {
    const defs = modelDefs(data);
    const str = STR(php);
    const cache = new Map();
    const siteUrl = data.siteUrl || "https://adrianodias8.github.io/adwebdev";
    const CONFIG = { "app.name": "adwebdev", "app.env": "production", "app.debug": false, "app.url": siteUrl, "app.timezone": MiniPhp.TZ, "app.locale": "en", "app.fallback_locale": "en", "database.default": "none", "cache.default": "array", "session.driver": "array", "mail.from.address": data.email, "mail.from.name": "Adriano Dias" };
    const ENV = { APP_NAME: "adwebdev", APP_ENV: "production", APP_DEBUG: false, APP_URL: siteUrl, APP_TIMEZONE: MiniPhp.TZ, DB_CONNECTION: "none", CACHE_STORE: "array" };
    const STATUS = { 400: "Bad Request", 401: "Unauthorized", 403: "Forbidden", 404: "Not Found", 405: "Method Not Allowed", 418: "I'm a teapot", 419: "Page Expired", 422: "Unprocessable Content", 429: "Too Many Requests", 500: "Internal Server Error", 503: "Service Unavailable" };
    const queryException = (sql) => fail("Illuminate\\Database\\QueryException", `SQLSTATE[HY000] [2002] Connection refused (Connection: mysql, SQL: ${sql})`, "There is no database: the site is static files. The models live in memory until you reload.");
    const app = new PhpObject("Illuminate\\Foundation\\Application");
    app.methods = {
      environment: (args) => (args.length ? args.some((a) => php.str(a) === "production") : "production"),
      version: () => "13.x",
      islocal: () => false,
      isproduction: () => true,
      getlocale: () => "en",
      basepath: ([p = ""]) => `/var/www/html${p ? `/${php.str(p)}` : ""}`,
      runninginconsole: () => true,
      make: ([name]) => fail("Illuminate\\Contracts\\Container\\BindingResolutionException", `Target class [${php.str(name)}] does not exist.`),
    };
    app.dumpEntries = () => [];
    const cacheApi = {
      get: ([k, def = null]) => (cache.has(php.str(k)) ? cache.get(php.str(k)) : def instanceof Closure ? php.callClosure(def, []) : def),
      put: ([k, v]) => { cache.set(php.str(k), v); return true; },
      set: ([k, v]) => { cache.set(php.str(k), v); return true; },
      add: ([k, v]) => { if (cache.has(php.str(k))) return false; cache.set(php.str(k), v); return true; },
      forever: ([k, v]) => { cache.set(php.str(k), v); return true; },
      has: ([k]) => cache.has(php.str(k)),
      missing: ([k]) => !cache.has(php.str(k)),
      forget: ([k]) => cache.delete(php.str(k)),
      pull: ([k, def = null]) => { const v = cache.has(php.str(k)) ? cache.get(php.str(k)) : def; cache.delete(php.str(k)); return v; },
      remember: ([k, , cb]) => { if (!cache.has(php.str(k))) cache.set(php.str(k), php.callValue(cb, [])); return cache.get(php.str(k)); },
      rememberforever: ([k, cb]) => { if (!cache.has(php.str(k))) cache.set(php.str(k), php.callValue(cb, [])); return cache.get(php.str(k)); },
      increment: ([k, by = 1]) => { const v = php.num(cache.get(php.str(k)) ?? 0) + php.num(by); cache.set(php.str(k), v); return v; },
      decrement: ([k, by = 1]) => { const v = php.num(cache.get(php.str(k)) ?? 0) - php.num(by); cache.set(php.str(k), v); return v; },
      flush: () => { cache.clear(); return true; },
    };
    const arrApi = {
      get: ([a, key, def = null]) => dataGet(php, a, key) ?? def,
      has: ([a, key]) => dataGet(php, a, key) !== null,
      exists: ([a, key]) => a.has(key),
      only: ([a, keys]) => PhpArray.from(a.entries().filter(([k]) => toList(php, keys).values().some((x) => php.looseEq(x, k)))),
      except: ([a, keys]) => PhpArray.from(a.entries().filter(([k]) => !toList(php, keys).values().some((x) => php.looseEq(x, k)))),
      first: ([a, cb, def = null]) => { for (const [k, v] of a.entries()) if (!cb || php.truthy(php.callValue(cb, [v, k]))) return v; return def; },
      last: ([a, cb, def = null]) => { for (const [k, v] of a.entries().reverse()) if (!cb || php.truthy(php.callValue(cb, [v, k]))) return v; return def; },
      wrap: ([v]) => (v === null ? new PhpArray() : v instanceof PhpArray ? v : PhpArray.of([v])),
      flatten: ([a]) => collection(php, a).methods.flatten([]).items,
      pluck: ([a, key]) => PhpArray.of(a.values().map((v) => dataGet(php, v, key))),
      random: ([a]) => a.values()[randomInt(0, a.size - 1)],
      shuffle: ([a]) => PhpArray.of([...a.values()].sort(() => Math.random() - 0.5)),
      islist: ([a]) => a.isList(),
      join: ([a, glue, last]) => collection(php, a).methods.join([glue, last]),
      dot: ([a]) => { const out = new PhpArray(); const walk = (v, prefix) => { for (const [k, x] of v.entries()) x instanceof PhpArray && x.size ? walk(x, `${prefix}${k}.`) : out.set(`${prefix}${k}`, x); }; walk(a, ""); return out; },
      sort: ([a]) => PhpArray.of([...a.values()].sort((x, y) => php.compare(x, y))),
      query: ([a]) => php.builtins.http_build_query([a], php),
    };
    const hashApi = {
      make: ([v]) => php.builtins.password_hash([v], php).replace("$2y$10$", "$2y$12$"),
      check: ([v, h]) => php.builtins.password_verify([v, php.str(h).replace("$2y$12$", "$2y$10$")], php) || php.hashes.get(php.str(h)) === php.str(v),
      needsrehash: () => false,
      info: () => PhpArray.from([["algo", "2y"], ["algoName", "bcrypt"], ["options", PhpArray.from([["cost", 12]])]]),
    };
    // Hashes made through Hash::make are remembered under the $2y$12$ form too.
    const makeHash = hashApi.make;
    hashApi.make = (args) => { const h = makeHash(args); php.hashes.set(h, php.str(args[0])); return h; };

    const facade = (name, api) => ({ name, statics: api });
    php.classes = {
      ...php.classes,
      str: facade("Illuminate\\Support\\Str", str),
      arr: facade("Illuminate\\Support\\Arr", arrApi),
      hash: facade("Illuminate\\Support\\Facades\\Hash", hashApi),
      cache: facade("Illuminate\\Support\\Facades\\Cache", cacheApi),
      config: facade("Illuminate\\Support\\Facades\\Config", { get: ([k, d = null]) => CONFIG[php.str(k)] ?? d, set: ([k, v]) => { CONFIG[php.str(k)] = v; return null; }, has: ([k]) => php.str(k) in CONFIG }),
      app: facade("Illuminate\\Support\\Facades\\App", { environment: (a) => app.methods.environment(a), version: () => "13.x", islocal: () => false, isproduction: () => true, getlocale: () => "en" }),
      log: facade("Illuminate\\Support\\Facades\\Log", Object.fromEntries(["info", "debug", "notice", "warning", "error", "critical", "alert", "emergency"].map((l) => [l, () => null]))),
      schema: facade("Illuminate\\Support\\Facades\\Schema", {
        hastable: ([t]) => Object.values(defs).some((d) => d.table === php.str(t)),
        getcolumnlisting: ([t]) => { const d = Object.values(defs).find((x) => x.table === php.str(t)); return PhpArray.of(d ? Object.keys(d.rows[0] || { id: 1 }) : []); },
        hascolumn: ([t, c]) => { const d = Object.values(defs).find((x) => x.table === php.str(t)); return !!d && php.str(c) in (d.rows[0] || {}); },
        create: () => queryException("create table ..."),
        drop: () => queryException("drop table ..."),
        dropifexists: () => queryException("drop table if exists ..."),
      }),
      db: facade("Illuminate\\Support\\Facades\\DB", {
        table: ([t]) => { const d = Object.values(defs).find((x) => x.table === php.str(t)); if (!d) queryException(`select * from \`${php.str(t)}\``); return builder(php, defs, d, true); },
        select: ([sql]) => queryException(php.str(sql)),
        statement: ([sql]) => queryException(php.str(sql)),
        insert: ([sql]) => queryException(php.str(sql)),
        update: ([sql]) => queryException(php.str(sql)),
        delete: ([sql]) => queryException(php.str(sql)),
        unprepared: ([sql]) => queryException(php.str(sql)),
        raw: ([sql]) => php.str(sql),
        connection: () => queryException("select 1"),
        getdrivername: () => "none",
        transaction: ([cb]) => php.callValue(cb, []),
      }),
      carbon: {
        name: "Illuminate\\Support\\Carbon",
        statics: {
          now: () => carbon(php, Date.now()),
          today: () => carbon(php, Date.now()).methods.startofday([]),
          tomorrow: () => carbon(php, Date.now() + 86400000).methods.startofday([]),
          yesterday: () => carbon(php, Date.now() - 86400000).methods.startofday([]),
          parse: ([v]) => carbon(php, v === undefined || v === null ? Date.now() : parseDate(php, v)),
          create: ([y = 1970, mo = 1, d = 1, h = 0, mi = 0, s = 0]) => carbon(php, parseDate(php, `${php.num(y)}-${String(php.num(mo)).padStart(2, "0")}-${String(php.num(d)).padStart(2, "0")} ${String(php.num(h)).padStart(2, "0")}:${String(php.num(mi)).padStart(2, "0")}:${String(php.num(s)).padStart(2, "0")}`)),
          createfromtimestamp: ([ts]) => carbon(php, php.num(ts) * 1000),
        },
        construct: ([v]) => carbon(php, v === undefined ? Date.now() : parseDate(php, v)),
      },
      collection: {
        name: "Illuminate\\Support\\Collection",
        statics: {
          make: ([v]) => collection(php, toList(php, v).copy()),
          wrap: ([v]) => collection(php, toList(php, v).copy()),
          times: ([n, cb]) => collection(php, new PhpArray()).methods.times([n, cb]),
          range: ([a, b]) => collection(php, php.builtins.range([a, b], php)),
          empty: () => collection(php, new PhpArray()),
        },
        construct: ([v]) => collection(php, toList(php, v).copy()),
      },
      factory: { name: "Faker\\Factory", statics: { create: () => faker(php) } },
      user: modelClass(php, defs, defs.user),
      post: modelClass(php, defs, defs.post),
      project: modelClass(php, defs, defs.project),
    };
    php.classes.datetime = php.classes.carbon;
    php.builtins.__carbon = ([v]) => carbon(php, v === undefined ? Date.now() : parseDate(php, v));

    Object.assign(php.builtins, {
      collect: ([v]) => collection(php, toList(php, v).copy()),
      now: () => carbon(php, Date.now()),
      today: () => carbon(php, Date.now()).methods.startofday([]),
      config: ([k, d = null]) => (k instanceof PhpArray ? (k.entries().forEach(([kk, v]) => (CONFIG[kk] = v)), null) : k === undefined ? PhpArray.from(Object.entries(CONFIG)) : CONFIG[php.str(k)] ?? d),
      env: ([k, d = null]) => ENV[php.str(k)] ?? d,
      app: ([name]) => (name === undefined ? app : app.methods.make([name])),
      str: ([v]) => (v === undefined ? fail("Error", "str() without arguments is beyond this pretend Laravel") : stringable(php, php.str(v))),
      fake: () => faker(php),
      bcrypt: ([v]) => hashApi.make([v]),
      cache: ([k, d]) => (k === undefined ? fail("Error", "cache() without arguments is beyond this pretend Laravel") : k instanceof PhpArray ? (k.entries().forEach(([kk, v]) => cache.set(String(kk), v)), true) : cacheApi.get([k, d])),
      info: () => null,
      logger: () => null,
      report: () => null,
      event: () => PhpArray.of([]),
      dispatch: () => null,
      url: ([p = ""]) => `${siteUrl}/${php.str(p).replace(/^\//, "")}`,
      asset: ([p = ""]) => `${siteUrl}/${php.str(p).replace(/^\//, "")}`,
      route: ([name]) => (php.str(name) === "home" ? `${siteUrl}/` : fail("Symfony\\Component\\Routing\\Exception\\RouteNotFoundException", `Route [${php.str(name)}] not defined.`)),
      abort: ([code, msg]) => fail(php.num(code) === 404 ? "Symfony\\Component\\HttpKernel\\Exception\\NotFoundHttpException" : "Symfony\\Component\\HttpKernel\\Exception\\HttpException", msg === undefined ? STATUS[php.num(code)] || "" : php.str(msg)),
      __: ([s]) => php.str(s),
      trans: ([s]) => php.str(s),
      optional: ([v]) => v,
      tap: ([v, cb]) => { if (cb) php.callValue(cb, [v]); return v; },
      value: ([v, ...args]) => (v instanceof Closure ? php.callClosure(v, args) : v),
      blank: ([v]) => v === null || (typeof v === "string" && v.trim() === "") || (v instanceof PhpArray && v.size === 0) || (v instanceof PhpObject && v.items && v.items.size === 0),
      filled: ([v]) => !php.builtins.blank([v], php),
      data_get: ([t, k, d = null]) => dataGet(php, t, k) ?? d,
      head: ([a]) => (a.values()[0] ?? false),
      last: ([a]) => (a.values().pop() ?? false),
      class_basename: ([c]) => php.str(c instanceof PhpObject ? c.cls : c).split("\\").pop(),
      e: ([s]) => php.builtins.htmlspecialchars([s], php),
      base_path: ([p = ""]) => `/var/www/html${p ? `/${php.str(p)}` : ""}`,
      app_path: ([p = ""]) => `/var/www/html/app${p ? `/${php.str(p)}` : ""}`,
      storage_path: ([p = ""]) => `/var/www/html/storage${p ? `/${php.str(p)}` : ""}`,
      public_path: ([p = ""]) => `/var/www/html/public${p ? `/${php.str(p)}` : ""}`,
      database_path: ([p = ""]) => `/var/www/html/database${p ? `/${php.str(p)}` : ""}`,
      throw_if: ([cond, ex]) => (php.truthy(cond) ? fail("RuntimeException", php.str(ex ?? "")) : cond),
      rescue: ([cb, def = null]) => { try { return php.callValue(cb, []); } catch (e) { if (e instanceof MiniPhp.PhpError) return def instanceof Closure ? php.callClosure(def, []) : def; throw e; } },
      retry: ([, cb]) => php.callValue(cb, [1]),
      inspire: () => fail("Error", "Call to undefined function inspire()", "That one is an Artisan command, not a helper: php artisan inspire."),
    });

    const removed = (fn, instead) => [fn, `Removed in Laravel 6. Use ${instead} instead.`];
    php.hints = Object.fromEntries([
      removed("str_slug", "Str::slug()"), removed("str_random", "Str::random()"), removed("str_plural", "Str::plural()"),
      removed("str_singular", "Str::singular()"), removed("camel_case", "Str::camel()"), removed("snake_case", "Str::snake()"),
      removed("kebab_case", "Str::kebab()"), removed("studly_case", "Str::studly()"), removed("title_case", "Str::title()"),
      removed("str_limit", "Str::limit()"), removed("starts_with", "Str::startsWith() or str_starts_with()"), removed("ends_with", "Str::endsWith() or str_ends_with()"),
      removed("array_get", "Arr::get()"), removed("array_has", "Arr::has()"), removed("array_first", "Arr::first()"),
      removed("array_last", "Arr::last()"), removed("array_pluck", "Arr::pluck()"), removed("array_only", "Arr::only()"), removed("array_except", "Arr::except()"),
      ["http", "No network from in here: this PHP runs inside your browser tab."],
      ["auth", "Nobody is logged in to a static site. Try User::first()."],
      ["request", "Tinker has no request. Neither does a static site."],
      ["session", "Tinker has no session to remember."],
    ]);
  };

  MiniPhp.laravel = { collection, carbon, faker, stringable };
})();
