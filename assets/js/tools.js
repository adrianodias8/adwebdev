// More tools for the Tools folder: diff, ASCII art, docker run to compose,
// hashes, lorem ipsum, a fake person and colours. Each one works on this
// page alone and sends nothing anywhere. os.js opens the windows and wires
// the Copy buttons; this file only fills them in.
(() => {
  const $ = (root, sel) => root.querySelector(sel);
  const debounce = (fn, ms = 120) => {
    let t = 0;
    return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  };
  const randomInt = (min, max) => {
    const span = max - min + 1;
    const buf = new Uint32Array(1);
    const limit = Math.floor(0x100000000 / span) * span;
    do crypto.getRandomValues(buf); while (buf[0] >= limit);
    return min + (buf[0] % span);
  };
  const pick = (list) => list[randomInt(0, list.length - 1)];
  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  };

  // ---- Diff: line by line, with the changed words marked inside a pair.

  function lcs(a, b, eq = (x, y) => x === y) {
    const n = a.length;
    const m = b.length;
    const w = m + 1;
    const t = new Uint32Array((n + 1) * w);
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        t[i * w + j] = eq(a[i], b[j]) ? t[(i + 1) * w + j + 1] + 1 : Math.max(t[(i + 1) * w + j], t[i * w + j + 1]);
      }
    }
    const ops = [];
    let i = 0;
    let j = 0;
    while (i < n && j < m) {
      if (eq(a[i], b[j])) { ops.push(["=", a[i], b[j]]); i++; j++; }
      else if (t[(i + 1) * w + j] >= t[i * w + j + 1]) ops.push(["-", a[i++]]);
      else ops.push(["+", b[j++]]);
    }
    while (i < n) ops.push(["-", a[i++]]);
    while (j < m) ops.push(["+", b[j++]]);
    return ops;
  }
  function diffTool() {
    const box = document.querySelector("[data-diff]");
    if (!box) return;
    const before = $(box, "[data-diff-a]");
    const after = $(box, "[data-diff-b]");
    const ignore = $(box, "[data-diff-ws]");
    const out = $(box, "[data-diff-out]");
    const stats = $(box, "[data-diff-stats]");
    const words = (s) => s.split(/(\s+|\b)/).filter((x) => x !== "");
    const marked = (line, other, side) => {
      const span = el("span", "diff__text");
      const a = words(line);
      const b = words(other);
      if (a.length * b.length > 40000) { span.textContent = line; return span; }
      // Removed lines show what went, added lines what came: either way
      // the line itself is the side that carries the marks.
      const ops = side === "-" ? lcs(a, b) : lcs(b, a);
      for (const [op, x] of ops) {
        if (op === "=") span.append(x);
        else if (op === side) span.append(el("mark", "", x));
      }
      return span;
    };
    const row = (kind, n1, n2, content) => {
      const r = el("span", `diff__row diff__row--${kind}`);
      r.append(el("span", "diff__n", n1 ?? ""), el("span", "diff__n", n2 ?? ""), el("span", "diff__sign", kind === "add" ? "+" : kind === "del" ? "-" : " "));
      r.append(typeof content === "string" ? el("span", "diff__text", content) : content);
      return r;
    };
    const run = () => {
      const a = before.value.split("\n");
      const b = after.value.split("\n");
      const norm = (s) => (ignore.checked ? s.trim().replace(/\s+/g, " ") : s);
      out.replaceChildren();
      // Common head and tail first, so a long file with a small change stays quick.
      let head = 0;
      while (head < a.length && head < b.length && norm(a[head]) === norm(b[head])) head++;
      let tail = 0;
      while (tail < a.length - head && tail < b.length - head && norm(a[a.length - 1 - tail]) === norm(b[b.length - 1 - tail])) tail++;
      const midA = a.slice(head, a.length - tail);
      const midB = b.slice(head, b.length - tail);
      if (midA.length * midB.length > 4e6) {
        stats.textContent = "Too big to compare here: try fewer than about 2,000 changed lines.";
        return;
      }
      const ops = [...a.slice(0, head).map((x) => ["=", x, x]), ...lcs(midA, midB, (x, y) => norm(x) === norm(y)), ...a.slice(a.length - tail).map((x, i) => ["=", x, b[b.length - tail + i]])];
      let n1 = 0;
      let n2 = 0;
      let added = 0;
      let removed = 0;
      for (let k = 0; k < ops.length; k++) {
        const [op, x, y] = ops[k];
        if (op === "=") { n1++; n2++; out.append(row("same", n1, n2, y ?? x)); continue; }
        // A run of removals followed by additions reads as lines that changed.
        if (op === "-") {
          let end = k;
          while (end < ops.length && ops[end][0] === "-") end++;
          let addEnd = end;
          while (addEnd < ops.length && ops[addEnd][0] === "+") addEnd++;
          const dels = ops.slice(k, end).map((o) => o[1]);
          const adds = ops.slice(end, addEnd).map((o) => o[1]);
          dels.forEach((d, i) => { n1++; removed++; out.append(row("del", n1, null, adds[i] !== undefined ? marked(d, adds[i], "-") : d)); });
          adds.forEach((d, i) => { n2++; added++; out.append(row("add", null, n2, dels[i] !== undefined ? marked(d, dels[i], "+") : d)); });
          k = addEnd - 1;
          continue;
        }
        n2++;
        added++;
        out.append(row("add", null, n2, x));
      }
      stats.textContent = added || removed ? `${added} line${added === 1 ? "" : "s"} added, ${removed} removed.` : "No differences.";
    };
    const later = debounce(run);
    before.addEventListener("input", later);
    after.addEventListener("input", later);
    ignore.addEventListener("change", run);
    $(box, "[data-diff-swap]").addEventListener("click", () => {
      [before.value, after.value] = [after.value, before.value];
      run();
    });
    run();
  }

  // ---- ASCII art: the text drawn on a canvas in one of the site's fonts,
  // then read back cell by cell and turned into characters.

  const RAMPS = { blocks: " █", hashes: " #", shades: " ░▒▓█", classic: " .:-=+*#%@" };
  function asciiTool() {
    const box = document.querySelector("[data-ascii]");
    if (!box) return;
    const input = $(box, "[data-ascii-in]");
    const font = $(box, "[data-ascii-font]");
    const style = $(box, "[data-ascii-style]");
    const rows = $(box, "[data-ascii-rows]");
    const rowsOut = $(box, "[data-ascii-rows-out]");
    const out = $(box, "[data-ascii-out]");
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const render = async () => {
      const text = input.value.slice(0, 40) || " ";
      const n = Number(rows.value);
      rowsOut.textContent = n;
      const family = font.value;
      const size = 96;
      await document.fonts.load(`${size}px ${family}`).catch(() => {});
      ctx.font = `${size}px ${family}`;
      const width = Math.ceil(ctx.measureText(text).width) + 8;
      const height = Math.ceil(size * 1.25);
      canvas.width = width;
      canvas.height = height;
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = "#000";
      ctx.font = `${size}px ${family}`;
      ctx.textBaseline = "middle";
      ctx.fillText(text, 4, height / 2);
      const data = ctx.getImageData(0, 0, width, height).data;
      // Spread the rows over the ink itself, not the whole line box, so the
      // height asked for is the height you get.
      let top = height;
      let bottom = 0;
      let left = width;
      let right = 0;
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          if (data[(y * width + x) * 4] < 128) {
            if (y < top) top = y;
            if (y > bottom) bottom = y;
            if (x < left) left = x;
            if (x > right) right = x;
          }
        }
      }
      if (bottom < top) { out.textContent = ""; return; }
      // Character cells are about twice as tall as they are wide.
      const cellH = (bottom - top + 1) / n;
      const cellW = cellH / 2;
      const ramp = RAMPS[style.value];
      const lines = [];
      for (let y = top; y < bottom + 1 - cellH / 2; y += cellH) {
        let line = "";
        for (let x = left; x < right + 1 - cellW / 3; x += cellW) {
          let dark = 0;
          let count = 0;
          for (let yy = Math.floor(y); yy < Math.min(height, Math.ceil(y + cellH)); yy++) {
            for (let xx = Math.floor(x); xx < Math.min(width, Math.ceil(x + cellW)); xx++) {
              dark += 255 - data[(yy * width + xx) * 4];
              count++;
            }
          }
          const v = count ? dark / count / 255 : 0;
          line += ramp.length === 2 ? (v > 0.42 ? ramp[1] : " ") : ramp[Math.min(ramp.length - 1, Math.floor(v * ramp.length))];
        }
        lines.push(line.replace(/\s+$/, ""));
      }
      while (lines.length && !lines[0].trim()) lines.shift();
      while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
      const indent = Math.min(...lines.filter((l) => l.trim()).map((l) => l.match(/^ */)[0].length));
      out.textContent = lines.map((l) => l.slice(indent)).join("\n");
    };
    const later = debounce(render, 80);
    for (const c of [input, font, style, rows]) c.addEventListener("input", later);
    render();
  }

  // ---- docker run → compose

  const VALUE_FLAGS = {
    name: "name", p: "publish", publish: "publish", v: "volume", volume: "volume", e: "env", env: "env", "env-file": "env-file",
    restart: "restart", network: "network", net: "network", w: "workdir", workdir: "workdir", u: "user", user: "user",
    h: "hostname", hostname: "hostname", entrypoint: "entrypoint", l: "label", label: "label", "cap-add": "cap-add",
    "cap-drop": "cap-drop", device: "device", dns: "dns", "add-host": "add-host", m: "memory", memory: "memory", cpus: "cpus",
    "health-cmd": "health-cmd", "health-interval": "health-interval", "health-timeout": "health-timeout", "health-retries": "health-retries",
    "health-start-period": "health-start-period", "log-driver": "log-driver", "log-opt": "log-opt", tmpfs: "tmpfs", platform: "platform",
    ulimit: "ulimit", expose: "expose", mount: "mount", "network-alias": "network-alias", "shm-size": "shm-size", "stop-signal": "stop-signal",
    "stop-timeout": "stop-timeout", pid: "pid", ipc: "ipc", "security-opt": "security-opt", sysctl: "sysctl", gpus: "gpus", link: "link",
    pull: "pull", "volumes-from": "volumes-from", "mac-address": "mac-address", ip: "ip", runtime: "runtime", "memory-reservation": "memory-reservation",
    "cpu-shares": "cpu-shares", c: "cpu-shares", "group-add": "group-add", "label-file": "label-file", "add-host-gateway": "add-host",
  };
  const BOOL_FLAGS = { d: "detach", detach: "detach", i: "interactive", interactive: "interactive", t: "tty", tty: "tty", rm: "rm", privileged: "privileged", init: "init", "read-only": "read-only", "no-healthcheck": "no-healthcheck", P: "publish-all", "publish-all": "publish-all", q: "quiet", quiet: "quiet" };

  function shellWords(cmd) {
    const out = [];
    let cur = "";
    let quote = null;
    let has = false;
    for (let i = 0; i < cmd.length; i++) {
      const c = cmd[i];
      if (quote) {
        if (c === quote) quote = null;
        else if (c === "\\" && quote === '"' && i + 1 < cmd.length) cur += cmd[++i];
        else cur += c;
        continue;
      }
      if (c === "'" || c === '"') { quote = c; has = true; continue; }
      if (c === "\\" && i + 1 < cmd.length) { cur += cmd[++i]; has = true; continue; }
      if (/\s/.test(c)) { if (has) out.push(cur); cur = ""; has = false; continue; }
      cur += c;
      has = true;
    }
    if (has) out.push(cur);
    return out;
  }
  const yamlStr = (v) => {
    const s = String(v);
    if (/^[A-Za-z_./@~-][\w./@~:=+-]*$/.test(s) && !/^(true|false|yes|no|on|off|null|~)$/i.test(s) && !/:\s|:$/.test(s) && !/^[-?:]/.test(s)) return s;
    return JSON.stringify(s);
  };
  function convertRun(words, notes, index) {
    let i = 0;
    if (words[i] === "sudo") i++;
    if (words[i] === "docker") i++;
    if (words[i] === "container") i++;
    if (words[i] !== "run") return null;
    i++;
    const opts = {};
    const add = (k, v) => (opts[k] ??= []).push(v);
    while (i < words.length && words[i].startsWith("-") && words[i] !== "-") {
      const w = words[i++];
      if (w === "--") break;
      if (w.startsWith("--")) {
        const [flag, inline] = w.slice(2).split(/=(.*)/s);
        if (VALUE_FLAGS[flag]) add(VALUE_FLAGS[flag], inline !== undefined ? inline : words[i++]);
        else if (BOOL_FLAGS[flag]) add(BOOL_FLAGS[flag], inline === undefined ? true : inline !== "false");
        else { notes.push(`--${flag} is not converted.`); if (inline === undefined && words[i] && !words[i].startsWith("-") && i < words.length - 1) i++; }
        continue;
      }
      // Short flags can be bunched (-dit) and can carry their value (-p80:80).
      const letters = w.slice(1);
      for (let k = 0; k < letters.length; k++) {
        const f = letters[k];
        if (VALUE_FLAGS[f]) {
          const rest = letters.slice(k + 1);
          add(VALUE_FLAGS[f], rest ? rest.replace(/^=/, "") : words[i++]);
          break;
        }
        if (BOOL_FLAGS[f]) add(BOOL_FLAGS[f], true);
        else notes.push(`-${f} is not converted.`);
      }
    }
    const image = words[i++];
    if (!image) { notes.push("No image found after the options."); return null; }
    const command = words.slice(i);
    const name = opts.name?.[0];
    const service = (name || image.split("/").pop().split(":")[0].split("@")[0] || `service${index}`).replace(/[^a-zA-Z0-9_.-]/g, "-");
    const lines = [`  ${service}:`, `    image: ${yamlStr(image)}`];
    const list = (key, values, fmt = yamlStr) => { if (values?.length) { lines.push(`    ${key}:`); for (const v of values) lines.push(`      - ${fmt(v)}`); } };
    const scalar = (key, v) => { if (v !== undefined) lines.push(`    ${key}: ${typeof v === "boolean" || typeof v === "number" ? v : yamlStr(v)}`); };
    const volumes = [];
    const networks = [];
    if (name) scalar("container_name", name);
    if (opts.hostname) scalar("hostname", opts.hostname.at(-1));
    if (opts.platform) scalar("platform", opts.platform.at(-1));
    if (opts.entrypoint) scalar("entrypoint", opts.entrypoint.at(-1));
    if (command.length) lines.push(`    command: [${command.map((c) => JSON.stringify(c)).join(", ")}]`);
    if (opts.workdir) scalar("working_dir", opts.workdir.at(-1));
    if (opts.user) scalar("user", opts.user.at(-1));
    if (opts.restart) scalar("restart", opts.restart.at(-1));
    if (opts.pull) scalar("pull_policy", opts.pull.at(-1));
    list("ports", opts.publish, (p) => JSON.stringify(p));
    if (opts["publish-all"]) notes.push("-P publishes every exposed port to a random one; compose needs the ports listed.");
    list("expose", opts.expose, (p) => JSON.stringify(p));
    const vols = [...(opts.volume || [])];
    for (const m of opts.mount || []) {
      const kv = Object.fromEntries(m.split(",").map((p) => p.split("=")));
      const src = kv.source || kv.src;
      const dst = kv.target || kv.destination || kv.dst;
      if (dst) vols.push(`${src ? `${src}:` : ""}${dst}${kv.readonly !== undefined || kv.ro !== undefined ? ":ro" : ""}`);
      else notes.push(`--mount ${m} is not converted.`);
    }
    for (const v of vols) {
      const src = v.split(":")[0];
      if (v.includes(":") && !/^[./~$]/.test(src) && !/^[A-Za-z]:\\/.test(v)) volumes.push(src);
    }
    list("volumes", vols);
    list("volumes_from", opts["volumes-from"]);
    list("tmpfs", opts.tmpfs);
    list("env_file", opts["env-file"]);
    list("environment", opts.env);
    list("labels", opts.label);
    list("cap_add", opts["cap-add"]);
    list("cap_drop", opts["cap-drop"]);
    list("devices", opts.device);
    list("dns", opts.dns);
    list("extra_hosts", opts["add-host"]);
    list("security_opt", opts["security-opt"]);
    list("group_add", opts["group-add"]);
    list("links", opts.link);
    if (opts.network) {
      const net = opts.network.at(-1);
      if (["host", "bridge", "none"].includes(net) || net.startsWith("container:")) scalar("network_mode", net);
      else {
        networks.push(net);
        if (opts["network-alias"]) {
          lines.push("    networks:", `      ${yamlStr(net)}:`, "        aliases:");
          for (const a of opts["network-alias"]) lines.push(`          - ${yamlStr(a)}`);
        } else list("networks", [net]);
      }
    }
    if (opts.privileged) scalar("privileged", true);
    if (opts.init) scalar("init", true);
    if (opts["read-only"]) scalar("read_only", true);
    if (opts.tty) scalar("tty", true);
    if (opts.interactive) scalar("stdin_open", true);
    if (opts.memory) scalar("mem_limit", opts.memory.at(-1));
    if (opts["memory-reservation"]) scalar("mem_reservation", opts["memory-reservation"].at(-1));
    if (opts.cpus) scalar("cpus", Number(opts.cpus.at(-1)));
    if (opts["cpu-shares"]) scalar("cpu_shares", Number(opts["cpu-shares"].at(-1)));
    if (opts["shm-size"]) scalar("shm_size", opts["shm-size"].at(-1));
    if (opts["stop-signal"]) scalar("stop_signal", opts["stop-signal"].at(-1));
    if (opts["stop-timeout"]) scalar("stop_grace_period", `${opts["stop-timeout"].at(-1)}s`);
    if (opts.pid) scalar("pid", opts.pid.at(-1));
    if (opts.ipc) scalar("ipc", opts.ipc.at(-1));
    if (opts["mac-address"]) scalar("mac_address", opts["mac-address"].at(-1));
    if (opts.runtime) scalar("runtime", opts.runtime.at(-1));
    if (opts.sysctl) { lines.push("    sysctls:"); for (const s of opts.sysctl) { const [k, v] = s.split("="); lines.push(`      ${k}: ${yamlStr(v)}`); } }
    if (opts.ulimit) {
      lines.push("    ulimits:");
      for (const u of opts.ulimit) {
        const [k, v] = u.split("=");
        const [soft, hard] = v.split(":");
        if (hard) lines.push(`      ${k}:`, `        soft: ${soft}`, `        hard: ${hard}`);
        else lines.push(`      ${k}: ${soft}`);
      }
    }
    if (opts["health-cmd"] || opts["no-healthcheck"]) {
      lines.push("    healthcheck:");
      if (opts["no-healthcheck"]) lines.push("      disable: true");
      else {
        lines.push(`      test: ["CMD-SHELL", ${JSON.stringify(opts["health-cmd"].at(-1))}]`);
        if (opts["health-interval"]) lines.push(`      interval: ${opts["health-interval"].at(-1)}`);
        if (opts["health-timeout"]) lines.push(`      timeout: ${opts["health-timeout"].at(-1)}`);
        if (opts["health-retries"]) lines.push(`      retries: ${opts["health-retries"].at(-1)}`);
        if (opts["health-start-period"]) lines.push(`      start_period: ${opts["health-start-period"].at(-1)}`);
      }
    }
    if (opts["log-driver"] || opts["log-opt"]) {
      lines.push("    logging:");
      if (opts["log-driver"]) lines.push(`      driver: ${yamlStr(opts["log-driver"].at(-1))}`);
      if (opts["log-opt"]) { lines.push("      options:"); for (const o of opts["log-opt"]) { const [k, v] = o.split("="); lines.push(`        ${k}: ${yamlStr(v)}`); } }
    }
    if (opts.gpus) lines.push("    deploy:", "      resources:", "        reservations:", "          devices:", "            - driver: nvidia", `              count: ${opts.gpus.at(-1) === "all" ? "all" : Number(opts.gpus.at(-1)) || 1}`, "              capabilities: [gpu]");
    if (opts.ip) notes.push("--ip needs a network with a fixed subnet in compose; set ipv4_address under that network.");
    if (opts.detach) notes.push("-d is not needed: run docker compose up -d instead.");
    if (opts.rm) notes.push("--rm has no compose equivalent: docker compose down removes the containers.");
    return { lines, volumes, networks };
  }
  function composeTool() {
    const box = document.querySelector("[data-compose-tool]");
    if (!box) return;
    const input = $(box, "[data-compose-in]");
    const out = $(box, "[data-compose-out]");
    const notesOut = $(box, "[data-compose-notes]");
    const run = () => {
      const joined = input.value.replace(/\\\r?\n/g, " ");
      const commands = joined.split(/\n|&&|;/).map((s) => s.trim()).filter((s) => /^(sudo\s+)?docker\s+(container\s+)?run\b/.test(s));
      const notes = [];
      const services = [];
      const volumes = new Set();
      const networks = new Set();
      commands.forEach((c, i) => {
        const r = convertRun(shellWords(c), notes, i + 1);
        if (!r) return;
        services.push(...r.lines);
        r.volumes.forEach((v) => volumes.add(v));
        r.networks.forEach((n) => networks.add(n));
      });
      if (!services.length) {
        out.textContent = "";
        notesOut.textContent = "Paste one or more docker run commands.";
        return;
      }
      const yaml = ["services:", ...services];
      if (volumes.size) { yaml.push("", "volumes:"); for (const v of volumes) yaml.push(`  ${yamlStr(v)}:`); }
      if (networks.size) { yaml.push("", "networks:"); for (const n of networks) yaml.push(`  ${yamlStr(n)}:`, "    external: true"); }
      out.textContent = `${yaml.join("\n")}\n`;
      notesOut.replaceChildren(...[...new Set(notes)].map((n) => el("li", "", n)));
    };
    input.addEventListener("input", debounce(run));
    run();
  }

  // ---- Hashes

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
    return new Uint8Array([a0, b0, c0, d0].flatMap((x) => [x & 255, (x >>> 8) & 255, (x >>> 16) & 255, x >>> 24]));
  }
  function hashTool() {
    const box = document.querySelector("[data-hash]");
    if (!box) return;
    const input = $(box, "[data-hash-in]");
    const encoding = $(box, "[data-hash-enc]");
    const upper = $(box, "[data-hash-upper]");
    const fields = [...box.querySelectorAll("[data-h]")];
    const encode = (bytes) => {
      if (encoding.value === "base64") return btoa(String.fromCharCode(...bytes));
      const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
      return upper.checked ? hex.toUpperCase() : hex;
    };
    let turn = 0;
    const run = async () => {
      const mine = ++turn;
      const data = new TextEncoder().encode(input.value);
      const results = { md5: md5(input.value) };
      if (crypto.subtle) {
        for (const algo of ["SHA-1", "SHA-256", "SHA-384", "SHA-512"]) results[algo.toLowerCase().replace("-", "")] = new Uint8Array(await crypto.subtle.digest(algo, data));
      }
      if (mine !== turn) return;
      for (const f of fields) f.textContent = results[f.dataset.h] ? encode(results[f.dataset.h]) : "Needs a secure (https) page";
    };
    input.addEventListener("input", debounce(run, 80));
    encoding.addEventListener("change", run);
    upper.addEventListener("change", run);
    run();
  }

  // ---- Lorem ipsum

  const LOREM = "lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua enim ad minim veniam quis nostrud exercitation ullamco laboris nisi aliquip ex ea commodo consequat duis aute irure in reprehenderit voluptate velit esse cillum fugiat nulla pariatur excepteur sint occaecat cupidatat non proident sunt culpa qui officia deserunt mollit anim id est laborum curabitur pretium tincidunt lacus nulla gravida orci a odio nullam varius turpis et commodo pharetra est eros bibendum elit nec luctus magna felis sollicitudin mauris integer in mauris eu nibh euismod gravida".split(" ");
  function loremTool() {
    const box = document.querySelector("[data-lorem]");
    if (!box) return;
    const count = $(box, "[data-lorem-count]");
    const countOut = $(box, "[data-lorem-count-out]");
    const unit = $(box, "[data-lorem-unit]");
    const classic = $(box, "[data-lorem-classic]");
    const html = $(box, "[data-lorem-html]");
    const out = $(box, "[data-lorem-out]");
    const stats = $(box, "[data-lorem-stats]");
    const sentence = () => {
      const n = randomInt(6, 14);
      const words = Array.from({ length: n }, () => pick(LOREM));
      if (n > 9 && randomInt(0, 1)) words[randomInt(3, n - 4)] += ",";
      const s = words.join(" ");
      return `${s[0].toUpperCase()}${s.slice(1)}.`;
    };
    const paragraph = () => Array.from({ length: randomInt(4, 7) }, sentence).join(" ");
    const run = () => {
      const n = Number(count.value);
      countOut.textContent = n;
      let parts;
      if (unit.value === "words") {
        const w = Array.from({ length: n }, () => pick(LOREM));
        parts = [`${w.join(" ").replace(/^./, (c) => c.toUpperCase())}.`];
      } else if (unit.value === "sentences") parts = [Array.from({ length: n }, sentence).join(" ")];
      else parts = Array.from({ length: n }, paragraph);
      if (classic.checked) {
        const opening = "Lorem ipsum dolor sit amet, consectetur adipiscing elit.";
        if (unit.value === "words") {
          const w = parts[0].replace(/\.$/, "").split(" ");
          const lead = opening.replace(/[,.]/g, "").split(" ").slice(0, w.length);
          parts[0] = `${[...lead, ...w.slice(lead.length)].join(" ")}.`;
        } else parts[0] = parts[0].replace(/^[^.]*\./, opening);
      }
      out.value = html.checked ? parts.map((p) => `<p>${p}</p>`).join("\n") : parts.join("\n\n");
      const words = parts.join(" ").split(/\s+/).length;
      stats.textContent = `${words} words, ${out.value.length} characters.`;
    };
    count.addEventListener("input", run);
    for (const c of [unit, classic, html]) c.addEventListener("change", run);
    $(box, "[data-lorem-gen]").addEventListener("click", run);
    run();
  }

  // ---- A fake person, for forms and test data

  const PEOPLE = {
    be: {
      label: "Belgium",
      first: ["Lucas", "Emma", "Louis", "Olivia", "Noah", "Louise", "Arthur", "Mila", "Jules", "Elena", "Adam", "Lina", "Victor", "Juliette", "Finn", "Nora", "Wout", "Lotte"],
      last: ["Peeters", "Janssens", "Maes", "Jacobs", "Mertens", "Willems", "Claes", "Goossens", "Wouters", "Dubois", "Lambert", "Dupont", "Martin", "Lemaire", "De Smet", "Van Damme"],
      streets: ["Rue de la Loi", "Avenue Louise", "Chaussée d'Ixelles", "Rue Haute", "Kerkstraat", "Stationsstraat", "Dorpstraat", "Rue Neuve", "Boulevard Anspach", "Meir", "Veldstraat", "Rue Sainte-Catherine"],
      towns: [["1000", "Brussels"], ["1050", "Ixelles"], ["1060", "Saint-Gilles"], ["2000", "Antwerp"], ["9000", "Ghent"], ["3000", "Leuven"], ["4000", "Liège"], ["8000", "Bruges"], ["5000", "Namur"], ["2800", "Mechelen"]],
      address: (n, street, [pc, town]) => [`${street} ${n}`, `${pc} ${town}`],
      phone: () => `+32 4${randomInt(70, 99)} ${randomInt(10, 99)} ${randomInt(10, 99)} ${randomInt(10, 99)}`,
      country: "Belgium",
    },
    pt: {
      label: "Portugal",
      first: ["João", "Maria", "Francisco", "Leonor", "Santiago", "Matilde", "Afonso", "Beatriz", "Tomás", "Carolina", "Duarte", "Inês", "Rodrigo", "Mariana", "Gonçalo", "Sofia"],
      last: ["Silva", "Santos", "Ferreira", "Pereira", "Oliveira", "Costa", "Rodrigues", "Martins", "Sousa", "Fernandes", "Gonçalves", "Gomes", "Lopes", "Marques", "Almeida", "Ribeiro"],
      streets: ["Rua Augusta", "Avenida da Liberdade", "Rua de Santa Catarina", "Rua das Flores", "Avenida dos Aliados", "Rua do Carmo", "Rua Garrett", "Rua da Prata", "Rua de Cedofeita", "Avenida Central"],
      towns: [["1100", "Lisboa"], ["1200", "Lisboa"], ["4000", "Porto"], ["4050", "Porto"], ["3000", "Coimbra"], ["4700", "Braga"], ["8000", "Faro"], ["3800", "Aveiro"], ["2900", "Setúbal"], ["4800", "Guimarães"]],
      address: (n, street, [pc, town]) => [`${street}, ${n}`, `${pc}-${String(randomInt(1, 999)).padStart(3, "0")} ${town}`],
      phone: () => `+351 9${pick(["1", "2", "3", "6"])}${randomInt(0, 9)} ${randomInt(100, 999)} ${randomInt(100, 999)}`,
      country: "Portugal",
    },
  };
  const JOBS = ["Web developer", "Drupal developer", "Laravel developer", "Site builder", "DevOps engineer", "Product owner", "UX designer", "Photographer", "Copywriter", "Project manager", "Data analyst", "Teacher", "Baker", "Tram driver"];
  const COMPANIES = ["Waffle Works", "Atomium Digital", "Pastel Labs", "Manneken Media", "Tram 81", "Azulejo Studio", "Frites & Code", "Galo Software", "Peeters & Silva", "Moules Marketing"];
  const ascii = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z]+/g, "");
  function fakerTool() {
    const box = document.querySelector("[data-faker]");
    if (!box) return;
    const locale = $(box, "[data-faker-locale]");
    const avatar = $(box, "[data-faker-avatar]");
    const nameOut = $(box, "[data-faker-name]");
    const jobOut = $(box, "[data-faker-job]");
    const facts = $(box, "[data-faker-facts]");
    const json = $(box, "[data-faker-json]");
    const run = () => {
      const L = PEOPLE[locale.value];
      const first = pick(L.first);
      const last = locale.value === "pt" ? `${pick(L.last)} ${pick(L.last)}` : pick(L.last);
      const user = `${ascii(first)}.${ascii(last.split(" ").pop())}${randomInt(1, 99)}`;
      const age = randomInt(19, 70);
      const born = new Date(Date.UTC(new Date().getFullYear() - age, randomInt(0, 11), randomInt(1, 28)));
      const [line1, line2] = L.address(randomInt(1, 180), pick(L.streets), pick(L.towns));
      const company = pick(COMPANIES);
      const person = {
        name: `${first} ${last}`,
        username: user,
        email: `${user}@${pick(["example.com", "example.org", "example.net"])}`,
        phone: L.phone(),
        birthday: born.toISOString().slice(0, 10),
        age,
        address: { street: line1, city: line2, country: L.country },
        job: pick(JOBS),
        company,
        website: `https://${user.replace(/\./g, "-")}.example`,
        uuid: crypto.randomUUID(),
        password: Array.from({ length: 14 }, () => pick("ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!#$%&*")).join(""),
        favourite_colour: `#${randomInt(0, 0xffffff).toString(16).padStart(6, "0")}`,
      };
      avatar.textContent = `${first[0]}${last.split(" ").pop()[0]}`;
      avatar.style.background = person.favourite_colour;
      avatar.style.color = luminance(hexToRgb(person.favourite_colour)) > 0.35 ? "#121312" : "#f2f1ec";
      nameOut.textContent = person.name;
      jobOut.textContent = `${person.job} at ${company}`;
      const rows = [
        ["Username", person.username], ["Email", person.email], ["Phone", person.phone],
        ["Birthday", `${person.birthday} (${age})`], ["Address", `${line1}\n${line2}\n${L.country}`],
        ["Website", person.website], ["UUID", person.uuid], ["Password", person.password],
      ];
      facts.replaceChildren(...rows.map(([k, v]) => {
        const d = el("div");
        d.append(el("dt", "", k), el("dd", "", v));
        return d;
      }));
      json.textContent = JSON.stringify(person, null, 2);
    };
    locale.addEventListener("change", run);
    $(box, "[data-faker-gen]").addEventListener("click", run);
    run();
  }

  // ---- Colours: HEX, RGB, HSL and OKLCH, contrast, and a scale.

  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const fromLinear = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
  function hexToRgb(hex) {
    let h = hex.replace("#", "");
    if (h.length === 3 || h.length === 4) h = [...h.slice(0, 3)].map((c) => c + c).join("");
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  }
  const rgbToHex = (rgb) => `#${rgb.map((c) => Math.round(clamp(c) * 255).toString(16).padStart(2, "0")).join("")}`;
  function rgbToHsl([r, g, b]) {
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;
    if (max === min) return [0, 0, l];
    const d = max - min;
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return [h * 60, s, l];
  }
  function hslToRgb([h, s, l]) {
    const k = (n) => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    return [0, 8, 4].map((n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1))));
  }
  function rgbToOklch(rgb) {
    const [r, g, b] = rgb.map(toLinear);
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
    const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
    const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
    const C = Math.hypot(A, B);
    const H = (Math.atan2(B, A) * 180) / Math.PI;
    return [L, C, C < 0.0001 ? 0 : (H + 360) % 360];
  }
  function oklchToRgbRaw([L, C, H]) {
    const A = C * Math.cos((H * Math.PI) / 180);
    const B = C * Math.sin((H * Math.PI) / 180);
    const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
    const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
    const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
    return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s].map(fromLinear);
  }
  // Keeps lightness and hue, and gives up chroma until the colour fits sRGB.
  function oklchToRgb([L, C, H]) {
    let c = C;
    let rgb = oklchToRgbRaw([L, c, H]);
    while (rgb.some((v) => v < -0.0005 || v > 1.0005) && c > 0) {
      c = Math.max(0, c - 0.002);
      rgb = oklchToRgbRaw([L, c, H]);
    }
    return rgb.map((v) => clamp(v));
  }
  const luminance = (rgb) => {
    const [r, g, b] = rgb.map(toLinear);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const contrast = (a, b) => {
    const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05);
  };
  const probe = document.createElement("canvas").getContext("2d");
  function parseColour(text) {
    const s = text.trim().toLowerCase();
    let m;
    if ((m = /^#?([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/.exec(s))) return hexToRgb(m[1]);
    const nums = (inner) => inner.split(/[\s,/]+/).filter(Boolean);
    if ((m = /^rgba?\((.*)\)$/.exec(s))) {
      const [r, g, b] = nums(m[1]);
      return [r, g, b].map((v) => (v.endsWith("%") ? parseFloat(v) / 100 : parseFloat(v) / 255));
    }
    if ((m = /^hsla?\((.*)\)$/.exec(s))) {
      const [h, sat, l] = nums(m[1]);
      return hslToRgb([parseFloat(h), parseFloat(sat) / 100, parseFloat(l) / 100]);
    }
    if ((m = /^oklch\((.*)\)$/.exec(s))) {
      const [l, c, h] = nums(m[1]);
      return oklchToRgb([l.endsWith("%") ? parseFloat(l) / 100 : parseFloat(l), c.endsWith("%") ? (parseFloat(c) / 100) * 0.4 : parseFloat(c), parseFloat(h) || 0]);
    }
    // Anything else the browser knows, such as a colour name.
    probe.fillStyle = "#010203";
    probe.fillStyle = s;
    const got = probe.fillStyle;
    if (got === "#010203" && s !== "#010203") return null;
    return /^#/.test(got) ? hexToRgb(got) : null;
  }
  function colourTool() {
    const box = document.querySelector("[data-colour]");
    if (!box) return;
    const text = $(box, "[data-colour-in]");
    const picker = $(box, "[data-colour-pick]");
    const swatch = $(box, "[data-colour-swatch]");
    const note = $(box, "[data-colour-note]");
    const field = (k) => $(box, `[data-c="${k}"]`);
    const scale = $(box, "[data-colour-scale]");
    const vsBlack = $(box, "[data-colour-black]");
    const vsWhite = $(box, "[data-colour-white]");
    const grade = (r) => (r >= 7 ? "AAA" : r >= 4.5 ? "AA" : r >= 3 ? "AA large text only" : "not enough for text");
    const show = (rgb) => {
      const hex = rgbToHex(rgb);
      const [h, s, l] = rgbToHsl(rgb);
      const [L, C, H] = rgbToOklch(rgb);
      swatch.style.background = hex;
      picker.value = hex;
      field("hex").textContent = hex;
      field("rgb").textContent = `rgb(${rgb.map((c) => Math.round(c * 255)).join(" ")})`;
      field("hsl").textContent = `hsl(${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%)`;
      field("oklch").textContent = `oklch(${(L * 100).toFixed(1)}% ${C.toFixed(3)} ${H.toFixed(1)})`;
      const cb = contrast(rgb, [0, 0, 0]);
      const cw = contrast(rgb, [1, 1, 1]);
      vsBlack.style.background = hex;
      vsWhite.style.background = hex;
      vsBlack.querySelector("span").textContent = `${cb.toFixed(2)}:1, ${grade(cb)}`;
      vsWhite.querySelector("span").textContent = `${cw.toFixed(2)}:1, ${grade(cw)}`;
      scale.replaceChildren(...[0.95, 0.87, 0.78, 0.69, 0.6, 0.51, 0.42, 0.33, 0.24].map((step) => {
        const c = rgbToHex(oklchToRgb([step, C, H]));
        const b = el("button", "colour__step");
        b.type = "button";
        b.style.background = c;
        b.title = c;
        b.setAttribute("aria-label", `Use ${c}`);
        b.addEventListener("click", () => { text.value = c; show(hexToRgb(c)); });
        return b;
      }));
      const comp = rgbToHex(oklchToRgb([L, C, (H + 180) % 360]));
      const compBtn = $(box, "[data-colour-comp]");
      compBtn.style.background = comp;
      compBtn.dataset.value = comp;
      compBtn.setAttribute("aria-label", `Use the complement, ${comp}`);
      note.textContent = "";
    };
    const read = () => {
      const rgb = parseColour(text.value);
      if (rgb) show(rgb);
      else note.textContent = "Not a colour I can read. Try #e2572b, rgb(226 87 43), hsl(15 76% 53%), oklch(65% 0.18 40) or a name.";
    };
    text.addEventListener("input", debounce(read, 100));
    picker.addEventListener("input", () => { text.value = picker.value; show(hexToRgb(picker.value)); });
    $(box, "[data-colour-comp]").addEventListener("click", (e) => { text.value = e.currentTarget.dataset.value; read(); });
    $(box, "[data-colour-random]").addEventListener("click", () => {
      const c = rgbToHex(oklchToRgb([randomInt(35, 85) / 100, randomInt(5, 20) / 100, randomInt(0, 359)]));
      text.value = c;
      read();
    });
    read();
  }

  function start() {
    diffTool();
    asciiTool();
    composeTool();
    hashTool();
    loremTool();
    fakerTool();
    colourTool();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
