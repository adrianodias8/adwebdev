// A small PHP for the Tinker and Drush windows. It is an interpreter written
// in JavaScript, so it runs in the visitor's browser: no server, nothing
// sent anywhere, and everything resets on reload. It knows enough of the
// language to play with (variables, strings, arrays, closures, loops and a
// good set of built-in functions); php-laravel.js and php-drupal.js add
// pretend corners of each framework, built on this site's own content.
(() => {
  "use strict";

  // ---- Errors and control flow

  class PhpError extends Error {
    constructor(type, message, hint) {
      super(message);
      this.type = type;
      this.hint = hint || "";
    }
  }
  const fail = (type, message, hint) => {
    throw new PhpError(type, message, hint);
  };
  const incomplete = (message) => {
    const e = new PhpError("ParseError", message);
    e.incomplete = true;
    throw e;
  };
  class ReturnSignal { constructor(value) { this.value = value; } }
  class BreakSignal {}
  class ContinueSignal {}
  class Halt {}

  // ---- Values: PHP arrays are ordered maps; objects carry their methods.

  class PhpArray {
    constructor() {
      this.m = new Map();
      this.next = 0;
    }
    static of(values) {
      const a = new PhpArray();
      for (const v of values) a.push(v);
      return a;
    }
    static from(entries) {
      const a = new PhpArray();
      for (const [k, v] of entries) a.set(k, v);
      return a;
    }
    static key(k) {
      if (typeof k === "boolean") return k ? 1 : 0;
      if (k === null || k === undefined) return "";
      if (typeof k === "number") return Math.trunc(k);
      if (typeof k === "string" && /^(0|-?[1-9]\d*)$/.test(k) && Math.abs(Number(k)) <= Number.MAX_SAFE_INTEGER) return Number(k);
      return String(k);
    }
    set(k, v) {
      k = PhpArray.key(k);
      this.m.set(k, v);
      if (typeof k === "number" && k >= this.next) this.next = k + 1;
    }
    push(v) {
      this.m.set(this.next, v);
      this.next += 1;
    }
    get(k) { return this.m.get(PhpArray.key(k)); }
    has(k) { return this.m.has(PhpArray.key(k)); }
    delete(k) { this.m.delete(PhpArray.key(k)); }
    get size() { return this.m.size; }
    values() { return [...this.m.values()]; }
    keys() { return [...this.m.keys()]; }
    entries() { return [...this.m.entries()]; }
    isList() {
      let i = 0;
      for (const k of this.m.keys()) if (k !== i++) return false;
      return true;
    }
    copy() {
      const a = new PhpArray();
      for (const [k, v] of this.m) a.m.set(k, v instanceof PhpArray ? v.copy() : v);
      a.next = this.next;
      return a;
    }
  }

  let objectIds = 5000 + Math.floor(Math.random() * 3000);
  class PhpObject {
    constructor(cls, props = {}, methods = {}) {
      this.cls = cls;
      this.props = new Map(Object.entries(props));
      this.methods = methods;
      this.oid = objectIds++;
    }
  }

  class Closure {
    constructor(params, body, scope, opts = {}) {
      this.params = params;
      this.body = body;
      this.scope = scope;
      this.arrow = !!opts.arrow;
      this.uses = opts.uses || new Map();
      this.name = opts.name || "{closure}";
      this.native = opts.native || null;
      this.oid = objectIds++;
    }
  }

  // Text a dump shows as it is, without quotes, like a Carbon's date.
  class Raw { constructor(text) { this.text = text; } }

  const isNumericString = (s) => typeof s === "string" && /^\s*[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?\s*$/.test(s);

  // ---- Lexer

  const OPS = ["===", "!==", "<=>", "**=", "??=", "...", "?->", "==", "!=", "<>", "<=", ">=", "&&", "||", "++", "--", "+=", "-=", "*=", "/=", ".=", "%=", "->", "=>", "::", "??", "**",
    "+", "-", "*", "/", "%", ".", "=", "<", ">", "!", "?", ":", ";", ",", "(", ")", "[", "]", "{", "}", "&", "|", "@"];

  function lex(input) {
    const src = input.replace(/^\s*<\?php\b/, "");
    const toks = [];
    let i = 0;
    while (i < src.length) {
      const c = src[i];
      if (/\s/.test(c)) { i++; continue; }
      if (c === "#" || (c === "/" && src[i + 1] === "/")) {
        while (i < src.length && src[i] !== "\n") i++;
        continue;
      }
      if (c === "/" && src[i + 1] === "*") {
        const end = src.indexOf("*/", i + 2);
        if (end < 0) incomplete("Unterminated comment starting line 1");
        i = end + 2;
        continue;
      }
      const rest = src.slice(i);
      const num = /^(0x[0-9a-f]+|0b[01]+|\d[\d_]*(?:\.\d+)?(?:e[+-]?\d+)?)/i.exec(rest);
      if (num) {
        const text = num[1].replace(/_/g, "");
        toks.push({ t: "num", v: /^0b/i.test(text) ? parseInt(text.slice(2), 2) : Number(text) });
        i += num[1].length;
        continue;
      }
      if (c === "'") {
        let s = "";
        i++;
        for (;;) {
          if (i >= src.length) incomplete("Syntax error, unexpected end of file");
          const ch = src[i];
          if (ch === "\\" && (src[i + 1] === "'" || src[i + 1] === "\\")) { s += src[i + 1]; i += 2; continue; }
          if (ch === "'") { i++; break; }
          s += ch;
          i++;
        }
        toks.push({ t: "str", v: s });
        continue;
      }
      if (c === '"') {
        i++;
        const parts = [];
        let lit = "";
        const flush = () => { if (lit) parts.push(lit); lit = ""; };
        for (;;) {
          if (i >= src.length) incomplete("Syntax error, unexpected end of file");
          const ch = src[i];
          if (ch === "\\") {
            const e = src[i + 1];
            const map = { n: "\n", t: "\t", r: "\r", v: "\v", e: "\x1b", f: "\f", 0: "\0", "\\": "\\", $: "$", '"': '"' };
            if (e === "u" && src[i + 2] === "{") {
              const end = src.indexOf("}", i);
              lit += String.fromCodePoint(parseInt(src.slice(i + 3, end), 16));
              i = end + 1;
            } else if (e in map) { lit += map[e]; i += 2; }
            else { lit += ch; i++; }
            continue;
          }
          if (ch === '"') { i++; break; }
          if (ch === "{" && src[i + 1] === "$") {
            let depth = 0;
            let j = i;
            for (; j < src.length; j++) {
              if (src[j] === "{") depth++;
              else if (src[j] === "}" && --depth === 0) break;
            }
            if (j >= src.length) incomplete("Syntax error, unexpected end of file");
            flush();
            parts.push({ src: src.slice(i + 1, j) });
            i = j + 1;
            continue;
          }
          if (ch === "$" && /[A-Za-z_]/.test(src[i + 1] || "")) {
            const m = /^\$[A-Za-z_]\w*(?:->[A-Za-z_]\w*|\[(?:-?\d+|[A-Za-z_]\w*|\$[A-Za-z_]\w*)\])?/.exec(src.slice(i));
            let expr = m[0];
            expr = expr.replace(/\[([A-Za-z_]\w*)\]$/, "['$1']");
            flush();
            parts.push({ src: expr });
            i += m[0].length;
            continue;
          }
          lit += ch;
          i++;
        }
        flush();
        if (parts.every((p) => typeof p === "string")) toks.push({ t: "str", v: parts.join("") });
        else toks.push({ t: "str", parts });
        continue;
      }
      if (c === "$" && /[A-Za-z_]/.test(src[i + 1] || "")) {
        const m = /^\$([A-Za-z_]\w*)/.exec(rest);
        toks.push({ t: "var", v: m[1] });
        i += m[0].length;
        continue;
      }
      const id = /^\\?[A-Za-z_]\w*(?:\\[A-Za-z_]\w*)*/.exec(rest);
      if (id) {
        toks.push({ t: "id", v: id[0] });
        i += id[0].length;
        continue;
      }
      const op = OPS.find((o) => rest.startsWith(o));
      if (op) {
        toks.push({ t: "op", v: op });
        i += op.length;
        continue;
      }
      fail("ParseError", `Syntax error, unexpected character "${c}"`);
    }
    toks.push({ t: "eof" });
    return toks;
  }

  // ---- Parser

  const CASTS = { int: "int", integer: "int", float: "float", double: "float", string: "string", bool: "bool", boolean: "bool", array: "array", object: "object" };
  const BIN = {
    or: [5], xor: [6], and: [7],
    "??": [30, "R"], "||": [40], "&&": [50],
    "==": [60], "!=": [60], "<>": [60], "===": [60], "!==": [60], "<=>": [60],
    "<": [70], ">": [70], "<=": [70], ">=": [70],
    ".": [80], "+": [90], "-": [90], "*": [100], "/": [100], "%": [100], "**": [130, "R"],
  };
  const ASSIGN = new Set(["=", "+=", "-=", "*=", "/=", ".=", "%=", "**=", "??="]);

  function parse(src) {
    const toks = lex(src);
    let p = 0;
    const peek = (o = 0) => toks[Math.min(p + o, toks.length - 1)];
    const next = () => toks[p++];
    const isOp = (v, o = 0) => peek(o).t === "op" && peek(o).v === v;
    const isKw = (v, o = 0) => peek(o).t === "id" && peek(o).v.toLowerCase() === v;
    const describe = (t) => ({ op: `token "${t.v}"`, id: `identifier "${t.v}"`, var: `variable "$${t.v}"`, num: `${Number.isInteger(t.v) ? "integer" : "floating-point number"} "${t.v}"`, str: "double-quoted string" })[t.t];
    const unexpected = () => {
      const t = peek();
      if (t.t === "eof") incomplete("Syntax error, unexpected end of file");
      fail("ParseError", `Syntax error, unexpected ${describe(t)}`);
    };
    const expectOp = (v) => {
      if (!isOp(v)) unexpected();
      return next();
    };
    const end = () => {
      if (isOp(";")) next();
      else if (peek().t !== "eof" && !isOp("}")) unexpected();
    };

    function program() {
      const body = [];
      while (peek().t !== "eof") body.push(statement());
      return body;
    }
    function block() {
      expectOp("{");
      const body = [];
      while (!isOp("}")) {
        if (peek().t === "eof") unexpected();
        body.push(statement());
      }
      next();
      return { k: "block", body };
    }
    function varName() {
      if (isOp("&")) next();
      const t = next();
      if (t.t !== "var") { p--; unexpected(); }
      return t.v;
    }
    function typeHint() {
      while (peek().t === "id" || isOp("?") || isOp("|")) next();
    }
    function params() {
      expectOp("(");
      const list = [];
      while (!isOp(")")) {
        if (peek().t === "id" || isOp("?")) typeHint();
        if (isOp("&")) next();
        let variadic = false;
        if (isOp("...")) { next(); variadic = true; }
        const name = varName();
        let def = null;
        if (isOp("=")) { next(); def = expr(); }
        list.push({ name, def, variadic });
        if (!isOp(")")) expectOp(",");
      }
      next();
      if (isOp(":")) { next(); typeHint(); }
      return list;
    }
    function args() {
      expectOp("(");
      const list = [];
      while (!isOp(")")) {
        if (isOp("...")) { next(); list.push({ k: "spread", e: expr() }); }
        else if (peek().t === "id" && isOp(":", 1)) { const name = next().v; next(); list.push({ k: "named", name, value: expr() }); }
        else list.push(expr());
        if (!isOp(")")) expectOp(",");
      }
      next();
      return list;
    }
    function arrayLit(close) {
      const items = [];
      while (!isOp(close)) {
        if (isOp("...")) { next(); items.push({ spread: expr() }); }
        else {
          const a = expr();
          if (isOp("=>")) { next(); items.push({ key: a, value: expr() }); }
          else items.push({ value: a });
        }
        if (!isOp(close)) expectOp(",");
      }
      next();
      return { k: "array", items };
    }
    function ifStatement() {
      next();
      expectOp("(");
      const test = expr();
      expectOp(")");
      const then = statement();
      let otherwise = null;
      if (isKw("elseif")) otherwise = ifStatement();
      else if (isKw("else")) {
        next();
        otherwise = isKw("if") ? ifStatement() : statement();
      }
      return { k: "if", test, then, otherwise };
    }
    function exprList(close) {
      const list = [];
      while (!isOp(close)) {
        list.push(expr());
        if (isOp(",")) next();
        else break;
      }
      return list;
    }
    function statement() {
      if (isOp("{")) return block();
      if (isOp(";")) { next(); return { k: "noop" }; }
      if (peek().t === "id") {
        const kw = peek().v.toLowerCase();
        if (kw === "echo" || kw === "print") {
          next();
          const list = [expr()];
          while (isOp(",")) { next(); list.push(expr()); }
          end();
          return { k: "echo", args: list };
        }
        if (kw === "return") {
          next();
          const value = isOp(";") || isOp("}") || peek().t === "eof" ? null : expr();
          end();
          return { k: "return", value };
        }
        if (kw === "break" || kw === "continue") { next(); if (peek().t === "num") next(); end(); return { k: kw }; }
        if (kw === "if") return ifStatement();
        if (kw === "foreach") {
          next();
          expectOp("(");
          const subject = expr();
          if (!isKw("as")) unexpected();
          next();
          let keyVar = null;
          let valVar = varName();
          if (isOp("=>")) { next(); keyVar = valVar; valVar = varName(); }
          expectOp(")");
          return { k: "foreach", subject, keyVar, valVar, body: statement() };
        }
        if (kw === "for") {
          next();
          expectOp("(");
          const init = exprList(";");
          expectOp(";");
          const test = exprList(";");
          expectOp(";");
          const step = exprList(")");
          expectOp(")");
          return { k: "for", init, test, step, body: statement() };
        }
        if (kw === "while") {
          next();
          expectOp("(");
          const test = expr();
          expectOp(")");
          return { k: "while", test, body: statement() };
        }
        if (kw === "do") {
          next();
          const body = statement();
          if (!isKw("while")) unexpected();
          next();
          expectOp("(");
          const test = expr();
          expectOp(")");
          end();
          return { k: "dowhile", test, body };
        }
        if (kw === "function" && peek(1).t === "id") {
          next();
          const name = next().v;
          const ps = params();
          return { k: "fndecl", name, params: ps, body: block() };
        }
        if (kw === "use" || kw === "namespace" || kw === "declare") {
          while (!isOp(";") && peek().t !== "eof") next();
          end();
          return { k: "noop" };
        }
        if (kw === "class" || kw === "interface" || kw === "trait" || kw === "enum") fail("ParseError", "Classes are beyond this little PHP. Closures and functions work, though.");
      }
      const e = expr();
      end();
      return { k: "expr", e };
    }

    function expr(min = 0) {
      let left = unary();
      for (;;) {
        const t = peek();
        let op = null;
        if (t.t === "op") op = t.v;
        else if (t.t === "id" && ["and", "or", "xor"].includes(t.v.toLowerCase())) op = t.v.toLowerCase();
        if (op === null) break;
        if (ASSIGN.has(op)) {
          if (min > 10) break;
          if (!["var", "idx", "prop"].includes(left.k)) fail("ParseError", `Syntax error, unexpected token "${op}"`);
          next();
          left = { k: "assign", op, target: left, value: expr(10) };
          continue;
        }
        if (op === "?") {
          if (min > 20) break;
          next();
          let then = null;
          if (!isOp(":")) then = expr();
          expectOp(":");
          left = { k: "ternary", test: left, then, otherwise: expr(21) };
          continue;
        }
        const info = BIN[op];
        if (!info || info[0] < min) break;
        next();
        left = { k: "bin", op, left, right: expr(info[1] === "R" ? info[0] : info[0] + 1) };
      }
      return left;
    }
    function unary() {
      const t = peek();
      if (t.t === "op") {
        if (t.v === "!") { next(); return { k: "not", e: expr(110) }; }
        if (t.v === "-" || t.v === "+") { next(); return { k: "neg", op: t.v, e: expr(120) }; }
        if (t.v === "++" || t.v === "--") { next(); return { k: "incdec", op: t.v, prefix: true, target: postfix(primary()) }; }
        if (t.v === "@") { next(); return unary(); }
        if (t.v === "&") { next(); return unary(); }
        if (t.v === "(" && peek(1).t === "id" && CASTS[peek(1).v.toLowerCase()] && isOp(")", 2)) {
          next();
          const to = CASTS[next().v.toLowerCase()];
          next();
          return { k: "cast", to, e: expr(120) };
        }
      }
      return postfix(primary());
    }
    function postfix(e) {
      for (;;) {
        if (isOp("[")) {
          next();
          if (isOp("]")) { next(); e = { k: "idx", obj: e, key: null }; continue; }
          const key = expr();
          expectOp("]");
          e = { k: "idx", obj: e, key };
          continue;
        }
        if (isOp("->") || isOp("?->")) {
          const nullsafe = next().v === "?->";
          const nt = next();
          if (nt.t !== "id") { p--; unexpected(); }
          e = isOp("(") ? { k: "mcall", obj: e, name: nt.v, args: args(), nullsafe } : { k: "prop", obj: e, name: nt.v, nullsafe };
          continue;
        }
        if (isOp("::") && e.k === "var") {
          fail("ParseError", "Static calls on variables are beyond this little PHP.");
        }
        if (isOp("(") && ["var", "idx", "prop", "closure", "call", "mcall", "fcall"].includes(e.k)) {
          e = { k: "call", fn: e, args: args() };
          continue;
        }
        if ((isOp("++") || isOp("--")) && ["var", "idx", "prop"].includes(e.k)) {
          e = { k: "incdec", op: next().v, prefix: false, target: e };
          continue;
        }
        return e;
      }
    }
    function primary() {
      const t = next();
      if (t.t === "num") return { k: "lit", v: t.v };
      if (t.t === "str") return t.parts ? { k: "interp", parts: t.parts.map((pt) => (typeof pt === "string" ? pt : parseExpression(pt.src))) } : { k: "lit", v: t.v };
      if (t.t === "var") return { k: "var", name: t.v };
      if (t.t === "op") {
        if (t.v === "(") {
          const e = expr();
          expectOp(")");
          return e.k === "closure" ? e : { k: "paren", e };
        }
        if (t.v === "[") return arrayLit("]");
        p--;
        unexpected();
      }
      if (t.t === "id") {
        const low = t.v.toLowerCase();
        if (low === "true") return { k: "lit", v: true };
        if (low === "false") return { k: "lit", v: false };
        if (low === "null") return { k: "lit", v: null };
        if (low === "array" && isOp("(")) { next(); return arrayLit(")"); }
        if (low === "list" && isOp("(")) fail("ParseError", "list() destructuring is beyond this little PHP.");
        if (low === "fn" || (low === "static" && isKw("fn"))) {
          if (low === "static") next();
          const ps = params();
          expectOp("=>");
          return { k: "closure", params: ps, arrow: true, body: expr() };
        }
        if (low === "function" || (low === "static" && isKw("function"))) {
          if (low === "static") next();
          const ps = params();
          const uses = [];
          if (isKw("use")) {
            next();
            expectOp("(");
            while (!isOp(")")) {
              uses.push(varName());
              if (!isOp(")")) expectOp(",");
            }
            next();
          }
          if (isOp(":")) { next(); typeHint(); }
          return { k: "closure", params: ps, uses, body: block() };
        }
        if (low === "new") {
          const cls = next();
          if (cls.t !== "id") { p--; unexpected(); }
          return { k: "new", cls: cls.v, args: isOp("(") ? args() : [] };
        }
        if (low === "isset") return { k: "isset", args: args() };
        if (low === "empty") return { k: "empty", e: args()[0] };
        if (low === "print") return { k: "print", e: expr(10) };
        if (low === "match") {
          expectOp("(");
          const subject = expr();
          expectOp(")");
          expectOp("{");
          const arms = [];
          while (!isOp("}")) {
            let conds = null;
            if (isKw("default")) next();
            else conds = exprList("=>");
            expectOp("=>");
            arms.push({ conds, value: expr() });
            if (!isOp("}")) expectOp(",");
          }
          next();
          return { k: "match", subject, arms };
        }
        if (isOp("::")) {
          next();
          const m = next();
          if (m.t === "id" && isOp("(")) return { k: "scall", cls: t.v, name: m.v, args: args() };
          if (m.t === "id") return { k: "sconst", cls: t.v, name: m.v };
          p--;
          unexpected();
        }
        if (isOp("(")) return { k: "fcall", name: t.v, args: args() };
        return { k: "const", name: t.v };
      }
      p--;
      unexpected();
    }

    return { program, expr, peek };
  }

  function parseProgram(src) { return parse(src).program(); }
  function parseExpression(src) {
    const parser = parse(src);
    const e = parser.expr();
    if (parser.peek().t !== "eof") fail("ParseError", "Syntax error in string interpolation");
    return e;
  }

  // ---- Dates, in Brussels time, formatted the way date() does it.

  const TZ = "Europe/Brussels";
  const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const partsFormat = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
  function zoned(ms) {
    const p = {};
    for (const { type, value } of partsFormat.formatToParts(new Date(ms))) p[type] = value;
    const y = +p.year, mo = +p.month, d = +p.day, h = +p.hour, mi = +p.minute, s = +p.second;
    const offset = Math.round((Date.UTC(y, mo - 1, d, h, mi, s) - Math.floor(ms / 1000) * 1000) / 60000);
    return { y, mo, d, h, mi, s, ms: ((ms % 1000) + 1000) % 1000, wd: new Date(Date.UTC(y, mo - 1, d)).getUTCDay(), offset };
  }
  function phpDate(fmt, ms) {
    const z = zoned(ms);
    const pad = (n, l = 2) => String(n).padStart(l, "0");
    const off = (sep) => `${z.offset < 0 ? "-" : "+"}${pad(Math.floor(Math.abs(z.offset) / 60))}${sep}${pad(Math.abs(z.offset) % 60)}`;
    let out = "";
    for (let i = 0; i < fmt.length; i++) {
      const c = fmt[i];
      switch (c) {
        case "\\": out += fmt[++i] ?? ""; break;
        case "d": out += pad(z.d); break;
        case "D": out += DAYS[z.wd].slice(0, 3); break;
        case "j": out += z.d; break;
        case "l": out += DAYS[z.wd]; break;
        case "N": out += z.wd || 7; break;
        case "w": out += z.wd; break;
        case "S": out += [11, 12, 13].includes(z.d) ? "th" : ["th", "st", "nd", "rd"][z.d % 10] || "th"; break;
        case "z": out += Math.round((Date.UTC(z.y, z.mo - 1, z.d) - Date.UTC(z.y, 0, 1)) / 864e5); break;
        case "F": out += MONTHS[z.mo - 1]; break;
        case "M": out += MONTHS[z.mo - 1].slice(0, 3); break;
        case "m": out += pad(z.mo); break;
        case "n": out += z.mo; break;
        case "t": out += new Date(Date.UTC(z.y, z.mo, 0)).getUTCDate(); break;
        case "L": out += (z.y % 4 === 0 && z.y % 100 !== 0) || z.y % 400 === 0 ? 1 : 0; break;
        case "Y": out += z.y; break;
        case "y": out += pad(z.y % 100); break;
        case "a": out += z.h < 12 ? "am" : "pm"; break;
        case "A": out += z.h < 12 ? "AM" : "PM"; break;
        case "g": out += z.h % 12 || 12; break;
        case "G": out += z.h; break;
        case "h": out += pad(z.h % 12 || 12); break;
        case "H": out += pad(z.h); break;
        case "i": out += pad(z.mi); break;
        case "s": out += pad(z.s); break;
        case "u": out += `${pad(z.ms, 3)}000`; break;
        case "v": out += pad(z.ms, 3); break;
        case "e": out += TZ; break;
        case "T": out += z.offset === 120 ? "CEST" : z.offset === 60 ? "CET" : "GMT"; break;
        case "P": out += off(":"); break;
        case "O": out += off(""); break;
        case "Z": out += z.offset * 60; break;
        case "U": out += Math.floor(ms / 1000); break;
        case "c": out += phpDate("Y-m-d\\TH:i:sP", ms); break;
        case "r": out += phpDate("D, d M Y H:i:s O", ms); break;
        default: out += c;
      }
    }
    return out;
  }
  function humanDiff(ms, now = Date.now()) {
    const diff = Math.round((ms - now) / 1000);
    const abs = Math.abs(diff);
    const steps = [["year", 31536000], ["month", 2592000], ["week", 604800], ["day", 86400], ["hour", 3600], ["minute", 60], ["second", 1]];
    if (abs < 1) return "0 seconds ago";
    for (const [name, size] of steps) {
      if (abs >= size) {
        const n = Math.floor(abs / size);
        return `${n} ${name}${n === 1 ? "" : "s"} ${diff < 0 ? "ago" : "from now"}`;
      }
    }
  }

  // ---- md5, so the classic still works.

  function md5(str) {
    const bytes = new TextEncoder().encode(str);
    const K = new Uint32Array(64).map((_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32));
    const S = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21];
    const len = bytes.length;
    const words = new Uint32Array((((len + 8) >> 6) + 1) * 16);
    for (let i = 0; i < len; i++) words[i >> 2] |= bytes[i] << ((i % 4) * 8);
    words[len >> 2] |= 0x80 << ((len % 4) * 8);
    words[words.length - 2] = (len * 8) >>> 0;
    words[words.length - 1] = Math.floor(len / 0x20000000);
    let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;
    for (let o = 0; o < words.length; o += 16) {
      let a = a0, b = b0, c = c0, d = d0;
      for (let i = 0; i < 64; i++) {
        const r = i >> 4;
        let f;
        let g;
        if (r === 0) { f = (b & c) | (~b & d); g = i; }
        else if (r === 1) { f = (d & b) | (~d & c); g = (5 * i + 1) % 16; }
        else if (r === 2) { f = b ^ c ^ d; g = (3 * i + 5) % 16; }
        else { f = c ^ (b | ~d); g = (7 * i) % 16; }
        const tmp = d;
        d = c;
        c = b;
        const sum = (a + f + K[i] + words[o + g]) >>> 0;
        const sh = S[r * 4 + (i % 4)];
        b = (b + ((sum << sh) | (sum >>> (32 - sh)))) >>> 0;
        a = tmp;
      }
      a0 = (a0 + a) >>> 0; b0 = (b0 + b) >>> 0; c0 = (c0 + c) >>> 0; d0 = (d0 + d) >>> 0;
    }
    return [a0, b0, c0, d0].map((x) => [0, 8, 16, 24].map((s) => ((x >>> s) & 255).toString(16).padStart(2, "0")).join("")).join("");
  }

  const randomInt = (min, max) => {
    const span = max - min + 1;
    if (span <= 0) fail("ValueError", "random_int(): Argument #1 ($min) must be less than or equal to argument #2 ($max)");
    const buf = new Uint32Array(1);
    const limit = Math.floor(0x100000000 / span) * span;
    do crypto.getRandomValues(buf); while (span <= 0x100000000 && buf[0] >= limit);
    return min + (buf[0] % span);
  };

  // ---- Scopes

  class Scope {
    constructor(parent = null) {
      this.vars = new Map();
      this.parent = parent;
    }
    has(name) { return this.vars.has(name) || (!!this.parent && this.parent.has(name)); }
    get(name) {
      if (this.vars.has(name)) return this.vars.get(name);
      return this.parent ? this.parent.get(name) : undefined;
    }
    set(name, v) { this.vars.set(name, v); }
  }

  // ---- The interpreter

  class Php {
    constructor(data = {}) {
      this.data = data;
      this.global = new Scope();
      this.functions = new Map();
      this.builtins = { ...BUILTINS };
      this.classes = {};
      this.constants = { ...CONSTANTS };
      this.hints = {};
      this.chunks = [];
      this.steps = 0;
      this.depth = 0;
      this.quiet = 0;
      this.hashes = new Map();
    }

    // Output, warnings and notes, in the order they happen.
    write(text) { this.chunks.push({ kind: "out", text: String(text) }); }
    warn(text) { if (!this.quiet) this.chunks.push({ kind: "warn", text }); }
    note(text, cls = "is-dim") { this.chunks.push({ kind: "note", text, cls }); }

    tick() {
      if (++this.steps > 200000) fail("FatalError", "Maximum execution time of 30 seconds exceeded");
    }

    // -- Type juggling

    typeName(v) {
      if (v === null || v === undefined) return "null";
      if (typeof v === "boolean") return "bool";
      if (typeof v === "number") return Number.isInteger(v) ? "int" : "float";
      if (typeof v === "string") return "string";
      if (v instanceof PhpArray) return "array";
      if (v instanceof Closure) return "Closure";
      if (v instanceof PhpObject) return v.cls;
      return "mixed";
    }
    truthy(v) {
      if (v === null || v === undefined || v === false || v === 0 || v === "" || v === "0") return false;
      if (Number.isNaN(v)) return true;
      if (v instanceof PhpArray) return v.size > 0;
      return true;
    }
    num(v, op = "+", other) {
      if (typeof v === "number") return v;
      if (typeof v === "boolean") return v ? 1 : 0;
      if (v === null || v === undefined) return 0;
      if (typeof v === "string") {
        if (isNumericString(v)) return Number(v);
        const lead = /^\s*[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?/.exec(v);
        if (lead) {
          this.warn("A non-numeric value encountered");
          return Number(lead[0]);
        }
        fail("TypeError", `Unsupported operand types: string ${op} ${this.typeName(other)}`);
      }
      fail("TypeError", `Unsupported operand types: ${this.typeName(v)} ${op} ${this.typeName(other)}`);
    }
    numLoose(v) {
      if (typeof v === "string") {
        const lead = /^\s*[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?/.exec(v);
        return lead ? Number(lead[0]) : 0;
      }
      if (v instanceof PhpArray) return v.size ? 1 : 0;
      if (v instanceof PhpObject || v instanceof Closure) return 1;
      return this.num(v);
    }
    fmtNum(n) {
      if (Number.isNaN(n)) return "NAN";
      if (n === Infinity) return "INF";
      if (n === -Infinity) return "-INF";
      if (Number.isInteger(n) && Math.abs(n) < 1e15) return String(n);
      const s = String(parseFloat(n.toPrecision(14)));
      return s.replace(/e\+?(-?\d+)$/, (_, e) => `.0E${e > 0 ? "+" : ""}${e}`).replace(/\.(\d+)\.0E/, ".$1E");
    }
    str(v) {
      if (v === null || v === undefined || v === false) return "";
      if (v === true) return "1";
      if (typeof v === "number") return this.fmtNum(v);
      if (typeof v === "string") return v;
      if (v instanceof PhpArray) {
        this.warn("Array to string conversion");
        return "Array";
      }
      if (v instanceof PhpObject && v.toStr) return v.toStr();
      fail("Error", `Object of class ${this.typeName(v)} could not be converted to string`);
    }
    looseEq(a, b) {
      a = a ?? null;
      b = b ?? null;
      if (a === null || b === null) {
        const o = a === null ? b : a;
        if (o === null) return true;
        if (typeof o === "string") return o === "";
        if (typeof o === "boolean") return o === false;
        if (typeof o === "number") return o === 0;
        if (o instanceof PhpArray) return o.size === 0;
        return false;
      }
      if (typeof a === "boolean" || typeof b === "boolean") return this.truthy(a) === this.truthy(b);
      if (typeof a === "number" && typeof b === "number") return a === b;
      if (typeof a === "number" && typeof b === "string") return isNumericString(b) ? a === Number(b) : this.fmtNum(a) === b;
      if (typeof a === "string" && typeof b === "number") return this.looseEq(b, a);
      if (typeof a === "string" && typeof b === "string") return isNumericString(a) && isNumericString(b) ? Number(a) === Number(b) : a === b;
      if (a instanceof PhpArray && b instanceof PhpArray) {
        if (a.size !== b.size) return false;
        for (const [k, v] of a.entries()) if (!b.has(k) || !this.looseEq(v, b.get(k))) return false;
        return true;
      }
      return a === b;
    }
    strictEq(a, b) {
      a = a ?? null;
      b = b ?? null;
      if (a instanceof PhpArray && b instanceof PhpArray) {
        if (a.size !== b.size) return false;
        const ka = a.keys();
        const kb = b.keys();
        return ka.every((k, i) => k === kb[i] && this.strictEq(a.get(k), b.get(k)));
      }
      if (typeof a === "number" && typeof b === "number") return a === b && Number.isInteger(a) === Number.isInteger(b);
      return a === b;
    }
    compare(a, b) {
      a = a ?? null;
      b = b ?? null;
      if (typeof a === "string" && typeof b === "string" && !(isNumericString(a) && isNumericString(b))) return a < b ? -1 : a > b ? 1 : 0;
      if (a instanceof PhpArray && b instanceof PhpArray) return Math.sign(a.size - b.size);
      if (typeof a === "boolean" || typeof b === "boolean" || a === null || b === null) {
        if (typeof a === "string" || typeof b === "string") {
          const sa = this.str(a);
          const sb = this.str(b);
          return sa < sb ? -1 : sa > sb ? 1 : 0;
        }
        return Math.sign(Number(this.truthy(a)) - Number(this.truthy(b)));
      }
      if ((typeof a === "number" && typeof b === "string" && !isNumericString(b)) || (typeof b === "number" && typeof a === "string" && !isNumericString(a))) {
        const sa = this.str(a);
        const sb = this.str(b);
        return sa < sb ? -1 : sa > sb ? 1 : 0;
      }
      return Math.sign(this.numLoose(a) - this.numLoose(b));
    }

    // -- Running statements

    exec(s, scope) {
      this.tick();
      switch (s.k) {
        case "noop": return;
        case "block": for (const st of s.body) this.exec(st, scope); return;
        case "expr": this.eval(s.e, scope); return;
        case "echo": for (const a of s.args) this.write(this.str(this.eval(a, scope))); return;
        case "return": throw new ReturnSignal(s.value ? this.eval(s.value, scope) : null);
        case "break": throw new BreakSignal();
        case "continue": throw new ContinueSignal();
        case "if":
          if (this.truthy(this.eval(s.test, scope))) this.exec(s.then, scope);
          else if (s.otherwise) this.exec(s.otherwise, scope);
          return;
        case "foreach": {
          const subject = this.eval(s.subject, scope);
          for (const [k, v] of this.iterate(subject)) {
            if (s.keyVar) scope.set(s.keyVar, k);
            scope.set(s.valVar, v instanceof PhpArray ? v.copy() : v);
            if (this.loopBody(s.body, scope)) break;
          }
          return;
        }
        case "for":
          for (s.init.forEach((e) => this.eval(e, scope)); s.test.length === 0 || s.test.map((e) => this.eval(e, scope)).map((v) => this.truthy(v)).pop(); s.step.forEach((e) => this.eval(e, scope))) {
            if (this.loopBody(s.body, scope)) break;
          }
          return;
        case "while":
          while (this.truthy(this.eval(s.test, scope))) if (this.loopBody(s.body, scope)) break;
          return;
        case "dowhile":
          do { if (this.loopBody(s.body, scope)) break; } while (this.truthy(this.eval(s.test, scope)));
          return;
        case "fndecl": {
          const key = s.name.toLowerCase();
          if (this.functions.has(key) || this.builtins[key]) fail("FatalError", `Cannot redeclare function ${s.name}()`);
          this.functions.set(key, new Closure(s.params, s.body, null, { name: s.name }));
          return;
        }
        default: fail("Error", `Cannot run ${s.k}`);
      }
    }
    // Runs one pass of a loop body; true means break.
    loopBody(body, scope) {
      this.tick();
      try {
        this.exec(body, scope);
      } catch (e) {
        if (e instanceof BreakSignal) return true;
        if (e instanceof ContinueSignal) return false;
        throw e;
      }
      return false;
    }
    iterate(v) {
      if (v instanceof PhpArray) return v.entries();
      if (v instanceof PhpObject) {
        if (v.items instanceof PhpArray) return v.items.entries();
        if (v.iterate) return v.iterate();
        return [...v.props.entries()];
      }
      this.warn(`foreach() argument must be of type array|object, ${this.typeName(v)} given`);
      return [];
    }

    // -- Evaluating expressions

    eval(e, scope) {
      switch (e.k) {
        case "lit": return e.v;
        case "paren": return this.eval(e.e, scope);
        case "interp": return e.parts.map((pt) => (typeof pt === "string" ? pt : this.str(this.eval(pt, scope)))).join("");
        case "var": {
          if (scope.has(e.name)) return scope.get(e.name);
          if (e.name === "this") fail("Error", "Using $this when not in object context");
          this.warn(`Undefined variable $${e.name}`);
          return null;
        }
        case "array": {
          const a = new PhpArray();
          for (const item of e.items) {
            if (item.spread) {
              const src = this.eval(item.spread, scope);
              for (const [k, v] of this.iterate(src)) typeof k === "number" ? a.push(v) : a.set(k, v);
              continue;
            }
            let v = this.eval(item.value, scope);
            if (v instanceof PhpArray) v = v.copy();
            if (item.key) a.set(this.eval(item.key, scope), v);
            else a.push(v);
          }
          return a;
        }
        case "assign": return this.assign(e, scope);
        case "bin": return this.binary(e, scope);
        case "ternary": {
          const t = this.eval(e.test, scope);
          if (this.truthy(t)) return e.then ? this.eval(e.then, scope) : t;
          return this.eval(e.otherwise, scope);
        }
        case "not": return !this.truthy(this.eval(e.e, scope));
        case "neg": {
          const v = this.eval(e.e, scope);
          return e.op === "-" ? -this.num(v, "*", -1) || 0 : this.num(v, "*", 1);
        }
        case "incdec": {
          const before = this.quietly(() => this.eval(e.target, scope));
          let after;
          if (before === null && e.op === "--") after = null;
          else if (typeof before === "string" && !isNumericString(before) && e.op === "++") after = this.strIncrement(before);
          else after = this.num(before ?? 0) + (e.op === "++" ? 1 : -1);
          this.store(e.target, after, scope);
          return e.prefix ? after : before;
        }
        case "cast": return this.cast(this.eval(e.e, scope), e.to);
        case "idx": return this.index(this.eval(e.obj, scope), e.key === null ? fail("Error", "Cannot use [] for reading") : this.eval(e.key, scope));
        case "prop": {
          const obj = this.eval(e.obj, scope);
          if ((obj === null || obj === undefined) && e.nullsafe) return null;
          return this.getProp(obj, e.name);
        }
        case "mcall": {
          const obj = this.eval(e.obj, scope);
          if ((obj === null || obj === undefined) && e.nullsafe) return null;
          return this.callMethod(obj, e.name, this.evalArgs(e.args, scope));
        }
        case "call": {
          const fn = this.eval(e.fn, scope);
          return this.callValue(fn, this.evalArgs(e.args, scope));
        }
        case "fcall": return this.callFunction(e.name, e.args, scope);
        case "scall": return this.callStatic(e.cls, e.name, this.evalArgs(e.args, scope));
        case "sconst": return this.classConstant(e.cls, e.name);
        case "const": {
          const name = e.name.replace(/^\\/, "");
          if (name in this.constants) return this.constants[name];
          if (name.toUpperCase() in this.constants && ["TRUE", "FALSE", "NULL"].includes(name.toUpperCase())) return this.constants[name.toUpperCase()];
          fail("Error", `Undefined constant "${name}"`);
          break;
        }
        case "closure": {
          if (e.arrow) return new Closure(e.params, e.body, scope, { arrow: true });
          const uses = new Map();
          for (const name of e.uses || []) {
            if (!scope.has(name)) this.warn(`Undefined variable $${name}`);
            const v = scope.get(name) ?? null;
            uses.set(name, v instanceof PhpArray ? v.copy() : v);
          }
          return new Closure(e.params, e.body, null, { uses });
        }
        case "new": return this.instantiate(e.cls, this.evalArgs(e.args, scope));
        case "isset": return e.args.every((a) => this.quietly(() => this.eval(a, scope)) !== null);
        case "empty": return !this.truthy(this.quietly(() => this.eval(e.e, scope)));
        case "print": this.write(this.str(this.eval(e.e, scope))); return 1;
        case "match": {
          const v = this.eval(e.subject, scope);
          for (const arm of e.arms) {
            if (!arm.conds || arm.conds.some((c) => this.strictEq(v, this.eval(c, scope)))) return this.eval(arm.value, scope);
          }
          fail("UnhandledMatchError", `Unhandled match case ${this.export(v)}`);
          break;
        }
        default: fail("Error", `Cannot evaluate ${e.k}`);
      }
    }
    quietly(fn) {
      this.quiet++;
      try {
        return fn() ?? null;
      } catch (err) {
        if (err instanceof PhpError && err.type === "Error" && /Undefined|offset|property/.test(err.message)) return null;
        throw err;
      } finally {
        this.quiet--;
      }
    }
    strIncrement(s) {
      if (!s) return "1";
      const chars = [...s];
      for (let i = chars.length - 1; i >= 0; i--) {
        const c = chars[i];
        if (c === "z") chars[i] = "a";
        else if (c === "Z") chars[i] = "A";
        else if (c === "9") chars[i] = "0";
        else if (/[a-yA-Y0-8]/.test(c)) { chars[i] = String.fromCharCode(c.charCodeAt(0) + 1); return chars.join(""); }
        else return chars.join("");
        if (i === 0) return (c === "z" ? "a" : c === "Z" ? "A" : "1") + chars.join("");
      }
      return chars.join("");
    }
    evalArgs(list, scope) {
      const out = [];
      for (const a of list) {
        if (a.k === "spread") out.push(...this.iterate(this.eval(a.e, scope)).map(([, v]) => v));
        else if (a.k === "named") out.push(this.eval(a.value, scope));
        else out.push(this.eval(a, scope));
      }
      return out;
    }
    cast(v, to) {
      switch (to) {
        case "int": return Math.trunc(this.numLoose(v)) || 0;
        case "float": return this.numLoose(v);
        case "string": return this.str(v);
        case "bool": return this.truthy(v);
        case "array":
          if (v instanceof PhpArray) return v;
          if (v === null) return new PhpArray();
          if (v instanceof PhpObject) return PhpArray.from(v.props.entries());
          return PhpArray.of([v]);
        case "object": {
          const o = new PhpObject("stdClass");
          if (v instanceof PhpArray) for (const [k, val] of v.entries()) o.props.set(String(k), val);
          else if (v !== null) o.props.set("scalar", v);
          return o;
        }
        default: return v;
      }
    }
    binary(e, scope) {
      const op = e.op;
      if (op === "&&" || op === "and") return this.truthy(this.eval(e.left, scope)) && this.truthy(this.eval(e.right, scope));
      if (op === "||" || op === "or") return this.truthy(this.eval(e.left, scope)) || this.truthy(this.eval(e.right, scope));
      if (op === "xor") return this.truthy(this.eval(e.left, scope)) !== this.truthy(this.eval(e.right, scope));
      if (op === "??") {
        const l = this.quietly(() => this.eval(e.left, scope));
        return l !== null ? l : this.eval(e.right, scope);
      }
      return this.operate(op, this.eval(e.left, scope), this.eval(e.right, scope));
    }
    operate(op, a, b) {
      switch (op) {
        case ".": return this.str(a) + this.str(b);
        case "==": return this.looseEq(a, b);
        case "!=": case "<>": return !this.looseEq(a, b);
        case "===": return this.strictEq(a, b);
        case "!==": return !this.strictEq(a, b);
        case "<": return this.compare(a, b) < 0;
        case ">": return this.compare(a, b) > 0;
        case "<=": return this.compare(a, b) <= 0;
        case ">=": return this.compare(a, b) >= 0;
        case "<=>": return this.compare(a, b);
        case "+":
          if (a instanceof PhpArray && b instanceof PhpArray) {
            const out = a.copy();
            for (const [k, v] of b.entries()) if (!out.has(k)) out.set(k, v);
            return out;
          }
          return this.num(a, op, b) + this.num(b, op, a);
        case "-": return this.num(a, op, b) - this.num(b, op, a);
        case "*": return this.num(a, op, b) * this.num(b, op, a);
        case "/": {
          const d = this.num(b, op, a);
          if (d === 0) fail("DivisionByZeroError", "Division by zero");
          return this.num(a, op, b) / d;
        }
        case "%": {
          const d = Math.trunc(this.num(b, op, a));
          if (d === 0) fail("DivisionByZeroError", "Modulo by zero");
          return Math.trunc(this.num(a, op, b)) % d;
        }
        case "**": return this.num(a, op, b) ** this.num(b, op, a);
        default: fail("Error", `Unknown operator ${op}`);
      }
    }
    assign(e, scope) {
      let value;
      if (e.op === "=") value = this.eval(e.value, scope);
      else if (e.op === "??=") {
        const current = this.quietly(() => this.eval(e.target, scope));
        if (current !== null) return current;
        value = this.eval(e.value, scope);
      } else {
        const current = this.eval(e.target, scope);
        value = this.operate(e.op.slice(0, -1), current, this.eval(e.value, scope));
      }
      if (value instanceof PhpArray) value = value.copy();
      this.store(e.target, value, scope);
      return value;
    }
    store(target, value, scope) {
      if (target.k === "var") {
        if (target.name === "this") fail("Error", "Cannot re-assign $this");
        scope.set(target.name, value);
        return;
      }
      if (target.k === "idx") {
        const container = this.containerFor(target.obj, scope);
        const key = target.key === null ? null : this.eval(target.key, scope);
        if (container instanceof PhpArray) {
          if (key === null) container.push(value);
          else container.set(key, value);
          return;
        }
        if (container instanceof PhpObject && container.items) {
          if (key === null) container.items.push(value);
          else container.items.set(key, value);
          return;
        }
        if (container instanceof PhpObject && container.offsetSet) { container.offsetSet(key, value); return; }
        fail("Error", "Cannot use a scalar value as an array");
      }
      if (target.k === "prop") {
        const obj = this.eval(target.obj, scope);
        this.setProp(obj, target.name, value);
        return;
      }
      fail("Error", "Cannot assign to this");
    }
    // The array an assignment like $a['x'][] = 1 writes into, made on the way.
    containerFor(node, scope) {
      if (node.k === "var") {
        let v = scope.has(node.name) ? scope.get(node.name) : null;
        if (v === null || v === undefined) {
          v = new PhpArray();
          scope.set(node.name, v);
        }
        if (typeof v === "string") fail("Error", "Cannot write to a string offset in this little PHP");
        return v;
      }
      if (node.k === "idx") {
        const parent = this.containerFor(node.obj, scope);
        const key = node.key === null ? null : this.eval(node.key, scope);
        const arr = parent instanceof PhpArray ? parent : parent.items;
        if (!(arr instanceof PhpArray)) fail("Error", "Cannot use a scalar value as an array");
        let v = key === null ? undefined : arr.get(key);
        if (v === null || v === undefined) {
          v = new PhpArray();
          if (key === null) arr.push(v);
          else arr.set(key, v);
        }
        return v;
      }
      if (node.k === "prop") {
        const obj = this.eval(node.obj, scope);
        let v = this.quietly(() => this.getProp(obj, node.name));
        if (v === null) {
          v = new PhpArray();
          this.setProp(obj, node.name, v);
        }
        return v;
      }
      return this.eval(node, scope);
    }
    index(base, key) {
      if (base instanceof PhpArray) {
        if (base.has(key)) return base.get(key);
        this.warn(`Undefined array key ${typeof PhpArray.key(key) === "number" ? PhpArray.key(key) : `"${key}"`}`);
        return null;
      }
      if (typeof base === "string") {
        let i = Math.trunc(this.numLoose(key));
        if (i < 0) i += base.length;
        if (i >= 0 && i < base.length) return base[i];
        this.warn(`Uninitialized string offset ${key}`);
        return "";
      }
      if (base instanceof PhpObject) {
        if (base.items instanceof PhpArray) return base.items.has(key) ? base.items.get(key) : null;
        if (base.offsetGet) return base.offsetGet(key);
        fail("Error", `Cannot use object of type ${base.cls} as array`);
      }
      this.warn(`Trying to access array offset on value of type ${this.typeName(base)}`);
      return null;
    }
    getProp(obj, name) {
      if (obj instanceof PhpObject) {
        if (obj.props.has(name)) return obj.props.get(name);
        if (obj.getProp) {
          const v = obj.getProp(name);
          if (v !== undefined) return v;
        }
        this.warn(`Undefined property: ${obj.cls}::$${name}`);
        return null;
      }
      this.warn(`Attempt to read property "${name}" on ${this.typeName(obj)}`);
      return null;
    }
    setProp(obj, name, value) {
      if (!(obj instanceof PhpObject)) fail("Error", `Attempt to assign property "${name}" on ${this.typeName(obj)}`);
      if (obj.setProp) obj.setProp(name, value);
      else obj.props.set(name, value);
    }

    // -- Calling things

    callValue(fn, args) {
      if (fn instanceof Closure) return this.callClosure(fn, args);
      if (typeof fn === "string") {
        if (fn.includes("::")) {
          const [cls, m] = fn.split("::");
          return this.callStatic(cls, m, args);
        }
        return this.callNamed(fn, args);
      }
      if (fn instanceof PhpArray && fn.size === 2) {
        const [target, method] = fn.values();
        return typeof target === "string" ? this.callStatic(target, method, args) : this.callMethod(target, method, args);
      }
      if (fn instanceof PhpObject && fn.methods.__invoke) return fn.methods.__invoke(args, this, fn);
      fail("Error", "Value not callable");
    }
    callClosure(c, args) {
      if (c.native) return c.native(args, this);
      if (++this.depth > 256) {
        this.depth = 0;
        fail("Error", "Maximum function nesting level of '256' reached, aborting!");
      }
      try {
        const scope = new Scope(c.arrow ? c.scope : null);
        for (const [k, v] of c.uses) scope.set(k, v);
        const required = c.params.filter((p) => !p.def && !p.variadic).length;
        c.params.forEach((p, i) => {
          if (p.variadic) { scope.set(p.name, PhpArray.of(args.slice(i))); return; }
          if (i < args.length) scope.set(p.name, args[i] instanceof PhpArray ? args[i].copy() : args[i]);
          else if (p.def) scope.set(p.name, this.eval(p.def, scope));
          else fail("ArgumentCountError", `Too few arguments to function ${c.name}(), ${args.length} passed and ${c.params.some((q) => q.def) ? "at least" : "exactly"} ${required} expected`);
        });
        if (c.arrow) return this.eval(c.body, scope);
        try {
          this.exec(c.body, scope);
        } catch (e) {
          if (e instanceof ReturnSignal) return e.value;
          throw e;
        }
        return null;
      } finally {
        this.depth--;
      }
    }
    callNamed(name, args) {
      const key = name.replace(/^\\/, "").toLowerCase();
      if (this.functions.has(key)) return this.callClosure(this.functions.get(key), args);
      const fn = this.builtins[key];
      if (fn) return fn(args, this);
      fail("Error", `Call to undefined function ${name.replace(/^\\/, "")}()`, this.hints[key]);
    }
    callFunction(name, argNodes, scope) {
      const key = name.replace(/^\\/, "").toLowerCase();
      if (BYREF[key] && !this.functions.has(key)) {
        if (!argNodes.length) fail("ArgumentCountError", `${key}() expects at least 1 argument, 0 given`);
        const target = this.containerFor(argNodes[0], scope);
        const arr = target instanceof PhpArray ? target : fail("TypeError", `${key}(): Argument #1 ($array) must be of type array, ${this.typeName(target)} given`);
        return BYREF[key](arr, this.evalArgs(argNodes.slice(1), scope), this);
      }
      if (key === "compact") {
        const out = new PhpArray();
        for (const n of this.evalArgs(argNodes, scope)) if (scope.has(n)) out.set(n, scope.get(n));
        return out;
      }
      if (key === "get_defined_vars") return PhpArray.from(scope.vars.entries());
      return this.callNamed(name, this.evalArgs(argNodes, scope));
    }
    callMethod(obj, name, args) {
      if (obj instanceof Closure) {
        const key = name.toLowerCase();
        if (key === "call" || key === "__invoke") return this.callClosure(obj, args);
        if (key === "bindto" || key === "bind") return obj;
      }
      if (!(obj instanceof PhpObject)) fail("Error", `Call to a member function ${name}() on ${this.typeName(obj)}`);
      const m = obj.methods[name.toLowerCase()];
      if (m) return m(args, this, obj);
      if (obj.props.has(name) && obj.props.get(name) instanceof Closure) return this.callClosure(obj.props.get(name), args);
      if (obj.callMissing) {
        const v = obj.callMissing(name, args);
        if (v !== undefined) return v;
      }
      fail("Error", `Call to undefined method ${obj.cls}::${name}()`);
    }
    resolveClass(name) {
      const clean = name.replace(/^\\/, "");
      const key = clean.toLowerCase();
      if (this.classes[key]) return this.classes[key];
      const short = key.split("\\").pop();
      if (this.classes[short]) return this.classes[short];
      fail("Error", `Class "${clean}" not found`, this.hints[short]);
    }
    callStatic(cls, name, args) {
      const def = this.resolveClass(cls);
      const m = def.statics?.[name.toLowerCase()];
      if (m) return m(args, this);
      if (def.callStatic) {
        const v = def.callStatic(name, args, this);
        if (v !== undefined) return v;
      }
      fail("Error", `Call to undefined method ${def.name}::${name}()`);
    }
    classConstant(cls, name) {
      if (name === "class") return this.resolveClass(cls).name;
      const def = this.resolveClass(cls);
      if (def.constants && name in def.constants) return def.constants[name];
      fail("Error", `Undefined constant ${def.name}::${name}`);
    }
    instantiate(cls, args) {
      const key = cls.replace(/^\\/, "").toLowerCase();
      if (key === "stdclass") return new PhpObject("stdClass");
      if (key === "datetime" || key === "datetimeimmutable") return this.builtins.__carbon ? this.builtins.__carbon(args, this) : fail("Error", `Class "${cls}" not found`);
      const def = this.resolveClass(cls);
      if (def.construct) return def.construct(args, this);
      fail("Error", `Cannot instantiate ${def.name}`);
    }

    // -- Showing values the way PsySH does

    dump(v, ind = 2) {
      const pad = " ".repeat(ind);
      if (v instanceof Raw) return v.text;
      if (v === null || v === undefined) return "null";
      if (typeof v === "boolean") return v ? "true" : "false";
      if (typeof v === "number") return Number.isInteger(v) ? this.fmtNum(v) : this.fmtNum(v).includes(".") || /[EN]/.test(this.fmtNum(v)) ? this.fmtNum(v) : `${this.fmtNum(v)}.0`;
      if (typeof v === "string") return JSON.stringify(v);
      if (v instanceof PhpArray) {
        if (!v.size) return "[]";
        const list = v.isList();
        const rows = v.entries().map(([k, x]) => `${pad}  ${list ? "" : `${typeof k === "number" ? k : JSON.stringify(k)} => `}${this.dump(x, ind + 2)},`);
        return `[\n${rows.join("\n")}\n${pad}]`;
      }
      if (v instanceof Closure) return `Closure(${v.params.map((p) => `$${p.name}`).join(", ")}) {#${v.oid} …}`;
      if (v instanceof PhpObject) {
        const head = `${v.cls}${v.dumpHead ? ` ${v.dumpHead()}` : ""} {#${v.oid}`;
        const entries = v.dumpEntries ? v.dumpEntries() : [...v.props.entries()];
        if (!entries.length) return `${head}}`;
        const rows = entries.map(([k, x]) => `${pad}  ${k}: ${this.dump(x, ind + 2)},`);
        return `${head}\n${rows.join("\n")}\n${pad}}`;
      }
      return String(v);
    }
    export(v, ind = "") {
      if (v === null || v === undefined) return "NULL";
      if (typeof v === "boolean") return v ? "true" : "false";
      if (typeof v === "number") return Number.isInteger(v) ? String(v) : this.fmtNum(v).includes(".") ? this.fmtNum(v) : `${this.fmtNum(v)}.0`;
      if (typeof v === "string") return `'${v.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
      if (v instanceof PhpArray) {
        const rows = v.entries().map(([k, x]) => `${ind}  ${typeof k === "number" ? k : this.export(k)} => ${x instanceof PhpArray ? `\n${ind}  ` : ""}${this.export(x, `${ind}  `)},`);
        return `array (\n${rows.join("\n")}${rows.length ? "\n" : ""}${ind})`;
      }
      if (v instanceof PhpObject) return `\\${v.cls}::__set_state(array(\n${[...v.props.entries()].map(([k, x]) => `${ind}   '${k}' => ${this.export(x, `${ind}  `)},`).join("\n")}\n${ind}))`;
      return "NULL";
    }
    printR(v, ind = 0) {
      if (v instanceof PhpArray || (v instanceof PhpObject && !v.toStr)) {
        const pad = " ".repeat(ind);
        const entries = v instanceof PhpArray ? v.entries() : v.items ? v.items.entries() : v.dumpEntries ? v.dumpEntries() : [...v.props.entries()];
        const head = v instanceof PhpArray ? "Array" : `${v.cls} Object`;
        const rows = entries.map(([k, x]) => `${pad}    [${k}] => ${this.printR(x, ind + 8).replace(/\n$/, "")}\n`);
        return `${head}\n${pad}(\n${rows.join("")}${pad})\n${ind ? "\n" : ""}`;
      }
      return this.str(v);
    }
    varDump(v, ind = "") {
      if (v === null || v === undefined) return `${ind}NULL\n`;
      if (typeof v === "boolean") return `${ind}bool(${v})\n`;
      if (typeof v === "number") return Number.isInteger(v) ? `${ind}int(${v})\n` : `${ind}float(${this.fmtNum(v)})\n`;
      if (typeof v === "string") return `${ind}string(${new TextEncoder().encode(v).length}) "${v}"\n`;
      if (v instanceof PhpArray) {
        const rows = v.entries().map(([k, x]) => `${ind}  [${typeof k === "number" ? k : `"${k}"`}]=>\n${this.varDump(x, `${ind}  `)}`);
        return `${ind}array(${v.size}) {\n${rows.join("")}${ind}}\n`;
      }
      if (v instanceof PhpObject) {
        const entries = v.dumpEntries ? v.dumpEntries() : [...v.props.entries()];
        return `${ind}object(${v.cls})#${v.oid} (${entries.length}) {\n${entries.map(([k, x]) => `${ind}  ["${k}"]=>\n${this.varDump(x, `${ind}  `)}`).join("")}${ind}}\n`;
      }
      return `${ind}object(Closure)#${v.oid} (0) {\n${ind}}\n`;
    }
    toJs(v) {
      if (v instanceof PhpArray) return v.isList() ? v.values().map((x) => this.toJs(x)) : Object.fromEntries(v.entries().map(([k, x]) => [k, this.toJs(x)]));
      if (v instanceof PhpObject) {
        if (v.toJson) return this.toJs(v.toJson());
        return Object.fromEntries((v.dumpEntries ? v.dumpEntries() : [...v.props.entries()]).map(([k, x]) => [k, this.toJs(x)]));
      }
      if (v instanceof Closure) return {};
      return v ?? null;
    }
    fromJs(v, assoc) {
      if (Array.isArray(v)) return PhpArray.of(v.map((x) => this.fromJs(x, assoc)));
      if (v && typeof v === "object") {
        if (assoc) return PhpArray.from(Object.entries(v).map(([k, x]) => [k, this.fromJs(x, assoc)]));
        const o = new PhpObject("stdClass");
        for (const [k, x] of Object.entries(v)) o.props.set(k, this.fromJs(x, assoc));
        return o;
      }
      return v;
    }

    // -- One line of input from the console

    run(src) {
      this.chunks = [];
      this.steps = 0;
      this.depth = 0;
      let body;
      try {
        body = parseProgram(src);
      } catch (e) {
        if (e.incomplete) return { incomplete: true, lines: [] };
        return { lines: this.finish([{ kind: "error", type: e.type || "ParseError", text: e.message, hint: e.hint }]) };
      }
      let value;
      let hasValue = false;
      let error = null;
      try {
        body.forEach((s, i) => {
          if (s.k === "expr") {
            value = this.eval(s.e, this.global);
            hasValue = i === body.length - 1;
          } else if (s.k === "return") {
            value = s.value ? this.eval(s.value, this.global) : null;
            hasValue = true;
            throw new Halt();
          } else {
            this.exec(s, this.global);
            hasValue = false;
          }
        });
      } catch (e) {
        if (e instanceof Halt) {
          if (e.dumped) hasValue = false;
        } else if (e instanceof PhpError) {
          error = { kind: "error", type: e.type, text: e.message, hint: e.hint };
          hasValue = false;
        } else if (e instanceof BreakSignal || e instanceof ContinueSignal) {
          error = { kind: "error", type: "FatalError", text: "'break' not in the 'loop' or 'switch' context" };
        } else if (e instanceof ReturnSignal) {
          value = e.value;
          hasValue = true;
        } else {
          error = { kind: "error", type: "Error", text: e.message || String(e) };
        }
      }
      const extra = [];
      if (error) extra.push(error);
      this.lastError = error;
      return { lines: this.finish(extra, hasValue ? value : undefined), value, hasValue };
    }
    // Turns what happened into console lines, PsySH style.
    finish(extra, value) {
      const lines = [];
      let out = "";
      const flushOut = () => {
        if (!out) return;
        lines.push({ text: out.endsWith("\n") ? out.slice(0, -1) : `${out}⏎`, cls: "is-out" });
        out = "";
      };
      for (const c of this.chunks) {
        if (c.kind === "out") { out += c.text; continue; }
        flushOut();
        if (c.kind === "warn") lines.push({ text: `   WARNING  ${c.text}.`, cls: "is-warn" });
        else lines.push({ text: c.text, cls: c.cls });
      }
      flushOut();
      for (const e of extra) {
        lines.push({ text: `   ${e.type}  ${e.text.replace(/\.?$/, ".")}`, cls: "is-error" });
        if (e.hint) lines.push({ text: `   ${e.hint}`, cls: "is-dim" });
      }
      if (value !== undefined) lines.push({ text: `= ${this.dump(value)}`, cls: "is-value" });
      this.chunks = [];
      return lines;
    }
    variables() { return [...this.global.vars.keys()]; }
  }

  // ---- Constants and built-in functions

  const CONSTANTS = {
    TRUE: true, FALSE: false, NULL: null,
    PHP_VERSION: "8.4.0", PHP_MAJOR_VERSION: 8, PHP_MINOR_VERSION: 4, PHP_OS: "Linux", PHP_OS_FAMILY: "Linux", PHP_EOL: "\n",
    PHP_INT_MAX: Number.MAX_SAFE_INTEGER, PHP_INT_MIN: Number.MIN_SAFE_INTEGER, PHP_INT_SIZE: 8, PHP_FLOAT_EPSILON: Number.EPSILON,
    M_PI: Math.PI, M_E: Math.E, M_SQRT2: Math.SQRT2, NAN: NaN, INF: Infinity,
    JSON_PRETTY_PRINT: 128, JSON_UNESCAPED_SLASHES: 64, JSON_UNESCAPED_UNICODE: 256, JSON_THROW_ON_ERROR: 4194304,
    STR_PAD_RIGHT: 1, STR_PAD_LEFT: 0, STR_PAD_BOTH: 2, SORT_REGULAR: 0, SORT_NUMERIC: 1, SORT_STRING: 2,
    ARRAY_FILTER_USE_KEY: 2, ARRAY_FILTER_USE_BOTH: 1, PASSWORD_DEFAULT: "2y", PASSWORD_BCRYPT: "2y",
    E_ALL: 32767, E_ERROR: 1, E_WARNING: 2, E_NOTICE: 8,
  };

  const arr = (php, v, fn, n = 1) => (v instanceof PhpArray ? v : fail("TypeError", `${fn}(): Argument #${n} ($array) must be of type array, ${php.typeName(v)} given`));
  const strArg = (php, v) => php.str(v);
  const cap = (s) => (s.length > 200000 ? fail("Error", "Allowed memory size of 134217728 bytes exhausted") : s);
  const pick = (php, values) => values[randomInt(0, values.length - 1)];
  const sorter = (php, flags) => (a, b) => (flags === 2 ? (php.str(a) < php.str(b) ? -1 : php.str(a) > php.str(b) ? 1 : 0) : php.compare(a, b));
  const rebuild = (target, entries, keepKeys) => {
    target.m = new Map();
    target.next = 0;
    for (const [k, v] of entries) keepKeys ? target.set(k, v) : target.push(v);
  };

  function sprintf(php, fmt, args) {
    let i = 0;
    return fmt.replace(/%(?:(\d+)\$)?((?:[-+ 0]|'.)*)(\d+)?(?:\.(\d+))?([bcdeEfFgGosuxX%])/g, (m, pos, flags, width, prec, type) => {
      if (type === "%") return "%";
      const v = args[pos ? Number(pos) - 1 : i++];
      if (v === undefined) fail("ArgumentCountError", `${args.length + 1} arguments are required, ${args.length + 1 - 1} given`);
      let s;
      switch (type) {
        case "d": case "u": s = String(Math.trunc(php.numLoose(v))); if (flags.includes("+") && !s.startsWith("-")) s = `+${s}`; break;
        case "f": case "F": s = php.numLoose(v).toFixed(prec === undefined ? 6 : Number(prec)); break;
        case "e": case "E": s = php.numLoose(v).toExponential(prec === undefined ? 6 : Number(prec)).replace("e", type === "E" ? "E" : "e"); break;
        case "g": case "G": s = String(php.numLoose(v)); break;
        case "s": s = php.str(v); if (prec !== undefined) s = s.slice(0, Number(prec)); break;
        case "x": s = Math.trunc(php.numLoose(v)).toString(16); break;
        case "X": s = Math.trunc(php.numLoose(v)).toString(16).toUpperCase(); break;
        case "o": s = Math.trunc(php.numLoose(v)).toString(8); break;
        case "b": s = Math.trunc(php.numLoose(v)).toString(2); break;
        case "c": s = String.fromCharCode(php.numLoose(v)); break;
        default: s = php.str(v);
      }
      if (width) {
        const padChar = /'(.)/.exec(flags)?.[1] ?? (flags.includes("0") && type !== "s" ? "0" : " ");
        s = flags.includes("-") ? s.padEnd(Number(width), padChar === "0" ? " " : padChar) : s.padStart(Number(width), padChar);
      }
      return s;
    });
  }

  const BUILTINS = {
    // Strings
    strlen: ([s], php) => new TextEncoder().encode(php.str(s)).length,
    mb_strlen: ([s], php) => [...php.str(s)].length,
    strtoupper: ([s], php) => php.str(s).toUpperCase(),
    strtolower: ([s], php) => php.str(s).toLowerCase(),
    mb_strtoupper: ([s], php) => php.str(s).toUpperCase(),
    mb_strtolower: ([s], php) => php.str(s).toLowerCase(),
    ucfirst: ([s], php) => { s = php.str(s); return s.charAt(0).toUpperCase() + s.slice(1); },
    lcfirst: ([s], php) => { s = php.str(s); return s.charAt(0).toLowerCase() + s.slice(1); },
    ucwords: ([s], php) => php.str(s).replace(/(^|[\s\t\r\n\f\v])(\S)/g, (m, a, b) => a + b.toUpperCase()),
    trim: ([s, chars], php) => { s = php.str(s); if (chars === undefined) return s.replace(/^[ \t\n\r\0\x0B]+|[ \t\n\r\0\x0B]+$/g, ""); const set = php.str(chars); let a = 0, b = s.length; while (a < b && set.includes(s[a])) a++; while (b > a && set.includes(s[b - 1])) b--; return s.slice(a, b); },
    ltrim: ([s], php) => php.str(s).replace(/^[ \t\n\r\0\x0B]+/, ""),
    rtrim: ([s], php) => php.str(s).replace(/[ \t\n\r\0\x0B]+$/, ""),
    chop: ([s], php) => php.str(s).replace(/[ \t\n\r\0\x0B]+$/, ""),
    str_repeat: ([s, n], php) => cap(php.str(s).repeat(Math.max(0, php.num(n)) | 0)),
    strrev: ([s], php) => [...php.str(s)].reverse().join(""),
    str_pad: ([s, len, padStr = " ", type = 1], php) => {
      s = php.str(s);
      const total = php.num(len);
      const p = php.str(padStr);
      if (total <= s.length || !p) return s;
      if (type === 0) return s.padStart(total, p);
      if (type === 2) { const left = Math.floor((total - s.length) / 2); return s.padStart(s.length + left, p).padEnd(total, p); }
      return s.padEnd(total, p);
    },
    str_replace: ([search, replace, subject], php) => {
      const one = (str) => {
        let out = php.str(str);
        const ss = search instanceof PhpArray ? search.values() : [search];
        const rs = replace instanceof PhpArray ? replace.values() : null;
        ss.forEach((s, i) => { const needle = php.str(s); if (needle) out = out.split(needle).join(rs ? php.str(rs[i] ?? "") : php.str(replace)); });
        return out;
      };
      return subject instanceof PhpArray ? PhpArray.from(subject.entries().map(([k, v]) => [k, one(v)])) : one(subject);
    },
    str_ireplace: ([search, replace, subject], php) => php.str(subject).replace(new RegExp(php.str(search).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), php.str(replace)),
    str_contains: ([h, n], php) => php.str(h).includes(php.str(n)),
    str_starts_with: ([h, n], php) => php.str(h).startsWith(php.str(n)),
    str_ends_with: ([h, n], php) => php.str(h).endsWith(php.str(n)),
    strpos: ([h, n, o = 0], php) => { const i = php.str(h).indexOf(php.str(n), php.num(o)); return i < 0 ? false : i; },
    stripos: ([h, n], php) => { const i = php.str(h).toLowerCase().indexOf(php.str(n).toLowerCase()); return i < 0 ? false : i; },
    strrpos: ([h, n], php) => { const i = php.str(h).lastIndexOf(php.str(n)); return i < 0 ? false : i; },
    strstr: ([h, n], php) => { h = php.str(h); const i = h.indexOf(php.str(n)); return i < 0 ? false : h.slice(i); },
    substr: ([s, start, len], php) => {
      s = php.str(s);
      let a = php.num(start);
      if (a < 0) a = Math.max(0, s.length + a);
      if (len === undefined || len === null) return s.slice(a);
      const l = php.num(len);
      return l < 0 ? s.slice(a, s.length + l) : s.substr(a, l);
    },
    mb_substr: (args, php) => BUILTINS.substr(args, php),
    substr_count: ([h, n], php) => php.str(h).split(php.str(n)).length - 1,
    str_word_count: ([s], php) => (php.str(s).match(/[A-Za-z'-]+/g) || []).length,
    wordwrap: ([s, width = 75, brk = "\n", cut = false], php) => {
      const words = php.str(s).split(" ");
      const lines = [];
      let line = "";
      for (const w of words) {
        if (line && (line + " " + w).length > php.num(width)) { lines.push(line); line = w; }
        else line = line ? `${line} ${w}` : w;
      }
      lines.push(line);
      return lines.join(php.str(brk));
    },
    nl2br: ([s], php) => php.str(s).replace(/(\r\n|\n)/g, "<br />$1"),
    htmlspecialchars: ([s], php) => php.str(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;"),
    html_entity_decode: ([s], php) => php.str(s).replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&amp;/g, "&"),
    strip_tags: ([s], php) => php.str(s).replace(/<[^>]*>/g, ""),
    addslashes: ([s], php) => php.str(s).replace(/([\\'"])/g, "\\$1"),
    sprintf: ([fmt, ...args], php) => sprintf(php, php.str(fmt), args),
    vsprintf: ([fmt, args], php) => sprintf(php, php.str(fmt), args.values()),
    printf: ([fmt, ...args], php) => { const s = sprintf(php, php.str(fmt), args); php.write(s); return s.length; },
    number_format: ([n, dec = 0, dp = ".", ts = ","], php) => {
      const fixed = Math.abs(php.numLoose(n)).toFixed(php.num(dec));
      const [int, frac] = fixed.split(".");
      const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, php.str(ts));
      return (php.numLoose(n) < 0 && Number(fixed) !== 0 ? "-" : "") + grouped + (frac ? php.str(dp) + frac : "");
    },
    explode: ([sep, s, limit], php) => {
      sep = php.str(sep);
      if (!sep) fail("ValueError", "explode(): Argument #1 ($separator) cannot be empty");
      let parts = php.str(s).split(sep);
      if (limit !== undefined && php.num(limit) > 0 && parts.length > php.num(limit)) parts = [...parts.slice(0, php.num(limit) - 1), parts.slice(php.num(limit) - 1).join(sep)];
      return PhpArray.of(parts);
    },
    implode: ([a, b], php) => {
      const [glue, list] = a instanceof PhpArray ? [b === undefined ? "" : b, a] : [a, b];
      return arr(php, list, "implode", 2).values().map((v) => php.str(v)).join(php.str(glue));
    },
    str_split: ([s, n = 1], php) => { s = php.str(s); const out = []; for (let i = 0; i < s.length; i += php.num(n)) out.push(s.slice(i, i + php.num(n))); return PhpArray.of(out.length ? out : [""]); },
    str_shuffle: ([s], php) => { const c = [...php.str(s)]; for (let i = c.length - 1; i > 0; i--) { const j = randomInt(0, i); [c[i], c[j]] = [c[j], c[i]]; } return c.join(""); },
    chr: ([n], php) => String.fromCharCode(((php.num(n) % 256) + 256) % 256),
    ord: ([s], php) => (php.str(s).length ? new TextEncoder().encode(php.str(s))[0] : 0),
    lcg_value: () => Math.random(),
    md5: ([s], php) => md5(php.str(s)),
    crc32: ([s], php) => { let c, crc = 0xffffffff; for (const b of new TextEncoder().encode(php.str(s))) { c = (crc ^ b) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1; crc = (crc >>> 8) ^ c; } return (crc ^ 0xffffffff) >>> 0; },
    base64_encode: ([s], php) => btoa(String.fromCharCode(...new TextEncoder().encode(php.str(s)))),
    base64_decode: ([s], php) => { try { return new TextDecoder().decode(Uint8Array.from(atob(php.str(s)), (c) => c.charCodeAt(0))); } catch { return false; } },
    bin2hex: ([s], php) => [...new TextEncoder().encode(php.str(s))].map((b) => b.toString(16).padStart(2, "0")).join(""),
    urlencode: ([s], php) => encodeURIComponent(php.str(s)).replace(/%20/g, "+").replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`),
    rawurlencode: ([s], php) => encodeURIComponent(php.str(s)),
    urldecode: ([s], php) => decodeURIComponent(php.str(s).replace(/\+/g, " ")),
    http_build_query: ([a], php) => arr(php, a, "http_build_query").entries().map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(php.str(v))}`).join("&"),
    uniqid: ([prefix = ""], php) => php.str(prefix) + Math.floor(Date.now() / 1000).toString(16) + Math.floor(Math.random() * 0xfffff).toString(16).padStart(5, "0"),
    levenshtein: ([a, b], php) => {
      a = php.str(a); b = php.str(b);
      const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
      for (let j = 1; j <= b.length; j++) d[0][j] = j;
      for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      return d[a.length][b.length];
    },
    similar_text: ([a, b], php) => { a = php.str(a); b = php.str(b); const sim = (x, y) => { let max = 0, px = 0, py = 0; for (let i = 0; i < x.length; i++) for (let j = 0; j < y.length; j++) { let k = 0; while (i + k < x.length && j + k < y.length && x[i + k] === y[j + k]) k++; if (k > max) { max = k; px = i; py = j; } } return max ? max + sim(x.slice(0, px), y.slice(0, py)) + sim(x.slice(px + max), y.slice(py + max)) : 0; }; return sim(a, b); },
    soundex: ([s], php) => { s = php.str(s).toUpperCase().replace(/[^A-Z]/g, ""); if (!s) return ""; const codes = { B: 1, F: 1, P: 1, V: 1, C: 2, G: 2, J: 2, K: 2, Q: 2, S: 2, X: 2, Z: 2, D: 3, T: 3, L: 4, M: 5, N: 5, R: 6 }; let out = s[0]; let last = codes[s[0]] || 0; for (const ch of s.slice(1)) { const c = codes[ch] || 0; if (c && c !== last) out += c; if (ch !== "H" && ch !== "W") last = c; } return (out + "000").slice(0, 4); },

    // Numbers
    abs: ([n], php) => Math.abs(php.num(n)),
    round: ([n, p = 0], php) => { const f = 10 ** php.num(p); const v = php.num(n) * f; return (Math.sign(v) * Math.round(Math.abs(v) + 1e-9)) / f; },
    floor: ([n], php) => Math.floor(php.num(n)),
    ceil: ([n], php) => Math.ceil(php.num(n)),
    sqrt: ([n], php) => Math.sqrt(php.num(n)),
    pow: ([a, b], php) => php.num(a) ** php.num(b),
    intdiv: ([a, b], php) => { if (php.num(b) === 0) fail("DivisionByZeroError", "Division by zero"); return Math.trunc(php.num(a) / php.num(b)); },
    fmod: ([a, b], php) => php.num(a) % php.num(b),
    pi: () => Math.PI,
    exp: ([n], php) => Math.exp(php.num(n)),
    log: ([n, base], php) => (base === undefined ? Math.log(php.num(n)) : Math.log(php.num(n)) / Math.log(php.num(base))),
    log10: ([n], php) => Math.log10(php.num(n)),
    log2: ([n], php) => Math.log2(php.num(n)),
    sin: ([n], php) => Math.sin(php.num(n)),
    cos: ([n], php) => Math.cos(php.num(n)),
    tan: ([n], php) => Math.tan(php.num(n)),
    deg2rad: ([n], php) => (php.num(n) * Math.PI) / 180,
    rad2deg: ([n], php) => (php.num(n) * 180) / Math.PI,
    hypot: ([a, b], php) => Math.hypot(php.num(a), php.num(b)),
    is_nan: ([n], php) => Number.isNaN(php.num(n)),
    max: (args, php) => { const list = args.length === 1 && args[0] instanceof PhpArray ? args[0].values() : args; if (!list.length) fail("ValueError", "max(): Argument #1 ($value) must contain at least one element"); return list.reduce((a, b) => (php.compare(b, a) > 0 ? b : a)); },
    min: (args, php) => { const list = args.length === 1 && args[0] instanceof PhpArray ? args[0].values() : args; if (!list.length) fail("ValueError", "min(): Argument #1 ($value) must contain at least one element"); return list.reduce((a, b) => (php.compare(b, a) < 0 ? b : a)); },
    random_int: ([a, b], php) => randomInt(php.num(a), php.num(b)),
    rand: ([a, b], php) => (a === undefined ? randomInt(0, 2147483647) : randomInt(php.num(a), php.num(b))),
    mt_rand: (args, php) => BUILTINS.rand(args, php),
    mt_getrandmax: () => 2147483647,
    getrandmax: () => 2147483647,
    random_bytes: ([n], php) => { const b = new Uint8Array(php.num(n)); crypto.getRandomValues(b); return String.fromCharCode(...b); },
    dechex: ([n], php) => Math.trunc(php.num(n)).toString(16),
    hexdec: ([s], php) => parseInt(php.str(s), 16) || 0,
    decbin: ([n], php) => Math.trunc(php.num(n)).toString(2),
    bindec: ([s], php) => parseInt(php.str(s), 2) || 0,
    decoct: ([n], php) => Math.trunc(php.num(n)).toString(8),
    octdec: ([s], php) => parseInt(php.str(s), 8) || 0,
    base_convert: ([s, from, to], php) => parseInt(php.str(s), php.num(from)).toString(php.num(to)),
    intval: ([v, base = 10], php) => (typeof v === "string" && php.num(base) !== 10 ? parseInt(v, php.num(base)) || 0 : Math.trunc(php.numLoose(v)) || 0),
    floatval: ([v], php) => php.numLoose(v),
    boolval: ([v], php) => php.truthy(v),
    strval: ([v], php) => php.str(v),
    settype: () => true,

    // Types
    gettype: ([v], php) => ({ null: "NULL", bool: "boolean", int: "integer", float: "double", string: "string", array: "array" })[php.typeName(v)] || "object",
    get_debug_type: ([v], php) => php.typeName(v),
    get_class: ([v], php) => (v instanceof PhpObject ? v.cls : v instanceof Closure ? "Closure" : fail("TypeError", `get_class(): Argument #1 ($object) must be of type object, ${php.typeName(v)} given`)),
    is_int: ([v]) => typeof v === "number" && Number.isInteger(v),
    is_integer: ([v]) => typeof v === "number" && Number.isInteger(v),
    is_float: ([v]) => typeof v === "number" && !Number.isInteger(v),
    is_string: ([v]) => typeof v === "string",
    is_bool: ([v]) => typeof v === "boolean",
    is_array: ([v]) => v instanceof PhpArray,
    is_object: ([v]) => v instanceof PhpObject || v instanceof Closure,
    is_null: ([v]) => v === null || v === undefined,
    is_numeric: ([v]) => typeof v === "number" || isNumericString(v),
    is_callable: ([v], php) => v instanceof Closure || (typeof v === "string" && (!!php.builtins[v.toLowerCase()] || php.functions.has(v.toLowerCase()))),
    is_iterable: ([v]) => v instanceof PhpArray || (v instanceof PhpObject && !!v.items),
    is_countable: ([v]) => v instanceof PhpArray || (v instanceof PhpObject && !!v.items),
    function_exists: ([n], php) => !!php.builtins[php.str(n).toLowerCase()] || php.functions.has(php.str(n).toLowerCase()),
    class_exists: ([n], php) => { try { php.resolveClass(php.str(n)); return true; } catch { return false; } },
    method_exists: ([o, m], php) => o instanceof PhpObject && !!o.methods[php.str(m).toLowerCase()],
    property_exists: ([o, p], php) => o instanceof PhpObject && o.props.has(php.str(p)),
    spl_object_id: ([o]) => o.oid,
    spl_object_hash: ([o]) => o.oid.toString(16).padStart(32, "0"),
    get_object_vars: ([o]) => PhpArray.from(o.props.entries()),

    // Arrays
    count: ([v, mode], php) => {
      if (v instanceof PhpArray) return mode === 1 ? v.values().reduce((n, x) => n + 1 + (x instanceof PhpArray ? BUILTINS.count([x, 1], php) : 0), 0) : v.size;
      if (v instanceof PhpObject && v.items) return v.items.size;
      if (v instanceof PhpObject && v.count) return v.count();
      fail("TypeError", `count(): Argument #1 ($value) must be of type Countable|array, ${php.typeName(v)} given`);
    },
    sizeof: (args, php) => BUILTINS.count(args, php),
    array_sum: ([a], php) => arr(php, a, "array_sum").values().reduce((s, v) => s + php.numLoose(v), 0),
    array_product: ([a], php) => arr(php, a, "array_product").values().reduce((s, v) => s * php.numLoose(v), 1),
    array_map: ([cb, a, ...more], php) => {
      a = arr(php, a, "array_map", 2);
      if (more.length) { const n = Math.max(a.size, ...more.map((m) => m.size)); const lists = [a, ...more].map((m) => m.values()); return PhpArray.of(Array.from({ length: n }, (_, i) => (cb === null ? PhpArray.of(lists.map((l) => l[i] ?? null)) : php.callValue(cb, lists.map((l) => l[i] ?? null))))); }
      const out = PhpArray.from(a.entries().map(([k, v]) => [k, php.callValue(cb, [v])]));
      return a.isList() ? PhpArray.of(out.values()) : out;
    },
    array_filter: ([a, cb, mode = 0], php) => PhpArray.from(arr(php, a, "array_filter").entries().filter(([k, v]) => php.truthy(cb === undefined || cb === null ? v : php.callValue(cb, mode === 2 ? [k] : mode === 1 ? [v, k] : [v])))),
    array_reduce: ([a, cb, init = null], php) => arr(php, a, "array_reduce").values().reduce((acc, v) => php.callValue(cb, [acc, v]), init),
    array_walk: ([a, cb], php) => { for (const [k, v] of arr(php, a, "array_walk").entries()) php.callValue(cb, [v, k]); return true; },
    array_keys: ([a, search], php) => PhpArray.of(arr(php, a, "array_keys").entries().filter(([, v]) => search === undefined || php.looseEq(v, search)).map(([k]) => k)),
    array_values: ([a], php) => PhpArray.of(arr(php, a, "array_values").values()),
    array_merge: (args, php) => { const out = new PhpArray(); args.forEach((a, i) => { for (const [k, v] of arr(php, a, "array_merge", i + 1).entries()) typeof k === "number" ? out.push(v) : out.set(k, v); }); return out; },
    array_merge_recursive: (args, php) => BUILTINS.array_merge(args, php),
    array_replace: (args, php) => { const out = args[0].copy(); for (const a of args.slice(1)) for (const [k, v] of a.entries()) out.set(k, v); return out; },
    array_combine: ([k, v], php) => { if (k.size !== v.size) fail("ValueError", "array_combine(): Argument #1 ($keys) and argument #2 ($values) must have the same number of elements"); const vs = v.values(); return PhpArray.from(k.values().map((key, i) => [php.str(key), vs[i]])); },
    array_flip: ([a], php) => PhpArray.from(arr(php, a, "array_flip").entries().map(([k, v]) => [v, k])),
    array_reverse: ([a, keep = false], php) => { const e = arr(php, a, "array_reverse").entries().reverse(); const out = new PhpArray(); for (const [k, v] of e) typeof k === "number" && !keep ? out.push(v) : out.set(k, v); return out; },
    array_slice: ([a, off, len = null, keep = false], php) => { const e = arr(php, a, "array_slice").entries(); let s = php.num(off); if (s < 0) s += e.length; const part = len === null ? e.slice(s) : php.num(len) < 0 ? e.slice(s, e.length + php.num(len)) : e.slice(s, s + php.num(len)); const out = new PhpArray(); for (const [k, v] of part) typeof k === "number" && !keep ? out.push(v) : out.set(k, v); return out; },
    array_search: ([n, a, strict = false], php) => { for (const [k, v] of arr(php, a, "array_search", 2).entries()) if (strict ? php.strictEq(v, n) : php.looseEq(v, n)) return k; return false; },
    in_array: ([n, a, strict = false], php) => arr(php, a, "in_array", 2).values().some((v) => (strict ? php.strictEq(v, n) : php.looseEq(v, n))),
    array_key_exists: ([k, a], php) => (a instanceof PhpArray ? a.has(k) : a instanceof PhpObject && a.props.has(php.str(k))),
    key_exists: (args, php) => BUILTINS.array_key_exists(args, php),
    array_key_first: ([a]) => a.keys()[0] ?? null,
    array_key_last: ([a]) => a.keys().pop() ?? null,
    array_unique: ([a], php) => { const seen = []; return PhpArray.from(arr(php, a, "array_unique").entries().filter(([, v]) => { const s = php.str(v); if (seen.includes(s)) return false; seen.push(s); return true; })); },
    array_count_values: ([a], php) => { const out = new PhpArray(); for (const v of a.values()) out.set(v, (out.get(v) || 0) + 1); return out; },
    array_fill: ([start, n, v], php) => { const out = new PhpArray(); for (let i = 0; i < php.num(n); i++) out.set(php.num(start) + i, v); return out; },
    array_fill_keys: ([keys, v]) => PhpArray.from(keys.values().map((k) => [k, v])),
    array_pad: ([a, n, v], php) => { const vals = a.values(); while (vals.length < Math.abs(php.num(n))) php.num(n) > 0 ? vals.push(v) : vals.unshift(v); return PhpArray.of(vals); },
    array_column: ([a, col, idx = null], php) => { const out = new PhpArray(); for (const row of arr(php, a, "array_column").values()) { const get = (k) => (row instanceof PhpArray ? row.get(k) : row instanceof PhpObject ? row.props.get(php.str(k)) : undefined); const v = col === null ? row : get(col); if (v === undefined) continue; idx === null ? out.push(v) : out.set(get(idx), v); } return out; },
    array_chunk: ([a, size, keep = false], php) => { const e = arr(php, a, "array_chunk").entries(); const out = new PhpArray(); for (let i = 0; i < e.length; i += php.num(size)) out.push(keep ? PhpArray.from(e.slice(i, i + php.num(size))) : PhpArray.of(e.slice(i, i + php.num(size)).map(([, v]) => v))); return out; },
    array_diff: ([a, ...others], php) => PhpArray.from(a.entries().filter(([, v]) => !others.some((o) => o.values().some((x) => php.str(x) === php.str(v))))),
    array_intersect: ([a, ...others], php) => PhpArray.from(a.entries().filter(([, v]) => others.every((o) => o.values().some((x) => php.str(x) === php.str(v))))),
    array_diff_key: ([a, ...others]) => PhpArray.from(a.entries().filter(([k]) => !others.some((o) => o.has(k)))),
    array_intersect_key: ([a, ...others]) => PhpArray.from(a.entries().filter(([k]) => others.every((o) => o.has(k)))),
    array_rand: ([a, n = 1], php) => { const keys = a.keys(); if (php.num(n) === 1) return keys[randomInt(0, keys.length - 1)]; const picked = []; while (picked.length < php.num(n)) { const k = keys[randomInt(0, keys.length - 1)]; if (!picked.includes(k)) picked.push(k); } return PhpArray.of(keys.filter((k) => picked.includes(k))); },
    array_is_list: ([a]) => a.isList(),
    array_flip_keys: undefined,
    range: ([a, b, step = 1], php) => {
      const letters = typeof a === "string" && typeof b === "string" && a.length === 1 && b.length === 1 && !isNumericString(a);
      let s = letters ? a.charCodeAt(0) : php.num(a);
      const e = letters ? b.charCodeAt(0) : php.num(b);
      const st = Math.abs(php.num(step)) || 1;
      const out = [];
      if (Math.abs(e - s) / st > 100000) fail("ValueError", "The supplied range exceeds the maximum array size");
      if (s <= e) for (; s <= e + 1e-9; s += st) out.push(letters ? String.fromCharCode(s) : s);
      else for (; s >= e - 1e-9; s -= st) out.push(letters ? String.fromCharCode(s) : s);
      return PhpArray.of(out);
    },
    call_user_func: ([cb, ...args], php) => php.callValue(cb, args),
    call_user_func_array: ([cb, args], php) => php.callValue(cb, args.values()),
    func_get_args: () => new PhpArray(),
    iterator_to_array: ([v], php) => PhpArray.from(php.iterate(v)),

    // Output and inspection
    var_dump: (args, php) => { for (const v of args) php.write(php.varDump(v)); return null; },
    print_r: ([v, ret = false], php) => { const s = php.printR(v); if (php.truthy(ret)) return s; php.write(s); return true; },
    var_export: ([v, ret = false], php) => { const s = php.export(v); if (php.truthy(ret)) return s; php.write(s); return null; },
    dump: (args, php) => { for (const v of args) php.note(php.dump(v), "is-value"); return args[0] ?? null; },
    dd: (args, php) => { for (const v of args) php.note(php.dump(v), "is-value"); const h = new Halt(); h.dumped = true; throw h; },
    json_encode: ([v, flags = 0], php) => {
      let s = JSON.stringify(php.toJs(v), null, flags & 128 ? 4 : undefined);
      if (!(flags & 64)) s = s.replace(/\//g, "\\/");
      if (!(flags & 256)) s = s.replace(/[\u007f-￿]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`);
      return s;
    },
    json_decode: ([s, assoc = false], php) => { try { return php.fromJs(JSON.parse(php.str(s)), php.truthy(assoc)); } catch { return null; } },
    json_last_error: () => 0,
    serialize: ([v], php) => JSON.stringify(php.toJs(v)),
    phpversion: () => "8.4.0",
    php_uname: () => "Linux adwebdev 6.8.0 #1 SMP x86_64 (inside a browser tab)",
    memory_get_usage: () => 2097152,
    memory_get_peak_usage: () => 2097152,
    gc_collect_cycles: () => 0,
    error_reporting: () => 32767,
    ini_get: ([k], php) => ({ memory_limit: "128M", max_execution_time: "30", display_errors: "1", "date.timezone": TZ })[php.str(k)] ?? false,
    ini_set: () => false,
    set_time_limit: () => true,
    error_log: () => true,
    trigger_error: ([msg], php) => { php.warn(php.str(msg)); return true; },
    phpinfo: (args, php) => { php.write("phpinfo()\nPHP Version => 8.4.0\nSystem => your browser\nServer API => none, there is no server\n\nThis PHP is a few thousand lines of JavaScript. It has no extensions, no filesystem and no network.\n"); return true; },
    sleep: () => 0,
    usleep: () => null,
    time: () => Math.floor(Date.now() / 1000),
    microtime: ([asFloat = false], php) => (php.truthy(asFloat) ? Date.now() / 1000 : `${((Date.now() % 1000) / 1000).toFixed(8)} ${Math.floor(Date.now() / 1000)}`),
    hrtime: ([asNum = false], php) => (php.truthy(asNum) ? Math.round(performance.now() * 1e6) : PhpArray.of([Math.floor(performance.now() / 1000), Math.round((performance.now() % 1000) * 1e6)])),
    date: ([fmt, ts], php) => phpDate(php.str(fmt), ts === undefined || ts === null ? Date.now() : php.num(ts) * 1000),
    gmdate: ([fmt, ts], php) => phpDate(php.str(fmt), ts === undefined ? Date.now() : php.num(ts) * 1000),
    mktime: ([h = 0, mi = 0, s = 0, mo = 1, d = 1, y = 1970], php) => Math.floor(Date.UTC(php.num(y), php.num(mo) - 1, php.num(d), php.num(h), php.num(mi), php.num(s)) / 1000) - zoned(Date.now()).offset * 60,
    strtotime: ([s, base], php) => {
      s = php.str(s).trim().toLowerCase();
      const now = base === undefined ? Date.now() : php.num(base) * 1000;
      if (s === "now" || s === "") return Math.floor(now / 1000);
      if (s === "today") return Math.floor(now / 1000) - ((Math.floor(now / 1000) + zoned(now).offset * 60) % 86400);
      if (s === "tomorrow") return BUILTINS.strtotime(["today"], php) + 86400;
      if (s === "yesterday") return BUILTINS.strtotime(["today"], php) - 86400;
      const rel = /^([+-]?\d+)\s*(second|sec|minute|min|hour|day|week|month|year)s?(\s+ago)?$/.exec(s);
      if (rel) {
        const sizes = { second: 1, sec: 1, minute: 60, min: 60, hour: 3600, day: 86400, week: 604800, month: 2592000, year: 31536000 };
        return Math.floor(now / 1000) + Number(rel[1]) * sizes[rel[2]] * (rel[3] ? -1 : 1);
      }
      const t = Date.parse(s);
      return Number.isNaN(t) ? false : Math.floor(t / 1000);
    },
    checkdate: ([m, d, y], php) => { const dt = new Date(Date.UTC(php.num(y), php.num(m) - 1, php.num(d))); return dt.getUTCMonth() === php.num(m) - 1 && dt.getUTCDate() === php.num(d); },
    date_default_timezone_get: () => TZ,
    date_default_timezone_set: () => true,
    password_hash: ([p], php) => { const h = `$2y$10$${[...crypto.getRandomValues(new Uint8Array(40))].map((b) => "./ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"[b % 64]).join("").slice(0, 53)}`; php.hashes.set(h, php.str(p)); return h; },
    password_verify: ([p, h], php) => php.hashes.get(php.str(h)) === php.str(p),
    password_needs_rehash: () => false,

    // A browser tab has no shell, files or network.
    file_get_contents: ([f], php) => { php.warn(`file_get_contents(${php.str(f)}): Failed to open stream: there is no filesystem in here`); return false; },
    file_put_contents: ([f], php) => { php.warn(`file_put_contents(${php.str(f)}): Failed to open stream: there is no filesystem in here`); return false; },
    fopen: ([f], php) => { php.warn(`fopen(${php.str(f)}): Failed to open stream: there is no filesystem in here`); return false; },
    file_exists: () => false,
    is_file: () => false,
    is_dir: () => false,
    getcwd: () => "/var/www/html",
    gethostname: () => "adwebdev",
    getenv: () => false,
    curl_init: () => fail("Error", "Call to undefined function curl_init()", "No network from in here: this PHP runs inside your browser tab."),
  };
  delete BUILTINS.array_flip_keys;
  for (const name of ["exec", "shell_exec", "system", "passthru", "proc_open", "popen", "eval", "assert", "include", "require"]) {
    BUILTINS[name] = () => fail("Error", `Call to undefined function ${name}()`, "Disabled: this PHP runs in your browser, and there is no shell behind it.");
  }

  // Functions that change the array you pass them.
  const BYREF = {
    array_push: (a, vals) => { for (const v of vals) a.push(v); return a.size; },
    array_pop: (a) => { const k = a.keys().pop(); if (k === undefined) return null; const v = a.get(k); a.delete(k); a.next = 0; for (const key of a.keys()) if (typeof key === "number" && key >= a.next) a.next = key + 1; return v; },
    array_shift: (a) => { const e = a.entries(); if (!e.length) return null; const [, v] = e.shift(); rebuild(a, e, false); return v; },
    array_unshift: (a, vals) => { rebuild(a, [...vals.map((v) => [0, v]), ...a.entries()], false); return a.size; },
    array_splice: (a, [off, len, repl], php) => { const e = a.entries(); let s = php.num(off); if (s < 0) s += e.length; const n = len === undefined || len === null ? e.length - s : php.num(len); const removed = e.splice(s, n, ...(repl instanceof PhpArray ? repl.values() : repl === undefined ? [] : [repl]).map((v) => [0, v])); rebuild(a, e, false); return PhpArray.of(removed.map(([, v]) => v)); },
    sort: (a, [flags], php) => { rebuild(a, a.entries().sort(([, x], [, y]) => sorter(php, flags)(x, y)), false); return true; },
    rsort: (a, [flags], php) => { rebuild(a, a.entries().sort(([, x], [, y]) => sorter(php, flags)(y, x)), false); return true; },
    usort: (a, [cb], php) => { rebuild(a, a.entries().sort(([, x], [, y]) => php.num(php.callValue(cb, [x, y]))), false); return true; },
    uasort: (a, [cb], php) => { rebuild(a, a.entries().sort(([, x], [, y]) => php.num(php.callValue(cb, [x, y]))), true); return true; },
    uksort: (a, [cb], php) => { rebuild(a, a.entries().sort(([x], [y]) => php.num(php.callValue(cb, [x, y]))), true); return true; },
    asort: (a, [flags], php) => { rebuild(a, a.entries().sort(([, x], [, y]) => sorter(php, flags)(x, y)), true); return true; },
    arsort: (a, [flags], php) => { rebuild(a, a.entries().sort(([, x], [, y]) => sorter(php, flags)(y, x)), true); return true; },
    ksort: (a, [flags], php) => { rebuild(a, a.entries().sort(([x], [y]) => sorter(php, flags)(x, y)), true); return true; },
    krsort: (a, [flags], php) => { rebuild(a, a.entries().sort(([x], [y]) => sorter(php, flags)(y, x)), true); return true; },
    shuffle: (a) => { const e = a.entries(); for (let i = e.length - 1; i > 0; i--) { const j = randomInt(0, i); [e[i], e[j]] = [e[j], e[i]]; } rebuild(a, e, false); return true; },
    array_walk: (a, [cb], php) => { for (const [k, v] of a.entries()) php.callValue(cb, [v, k]); return true; },
  };

  globalThis.MiniPhp = {
    Php, PhpArray, PhpObject, Closure, PhpError, Halt, Raw, isNumericString,
    fail, phpDate, humanDiff, zoned, randomInt, md5, TZ,
    flavors: {},
    create(flavor, data) {
      const php = new Php(data);
      const setup = this.flavors[flavor];
      if (setup) setup(php, data);
      return php;
    },
  };
})();
