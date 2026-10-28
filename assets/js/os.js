// adwebdev os: turns the portfolio page into a small desktop on a CRT. The
// page is complete without this script; here we add the boot, windows that
// open, focus, drag, minimise, zoom and close, files and folders, the dock,
// a browser for the posts, mail, a terminal, a screensaver and the clock.
(() => {
  const root = document.documentElement;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const coarse = () => matchMedia("(pointer: coarse)").matches;
  const phone = () => matchMedia("(max-width: 720px)").matches;
  const store = {
    get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
  };
  // Analytics (analytics.js): what was opened and used, and from where.
  const track = (name, data) => window.analytics?.track(name, data);
  const from = () => window.analytics?.from() ?? "url";

  // ---- Sound: short blips, off unless the visitor turns it on.
  let audio = null;
  let soundOn = store.get("os.sound") === "on";
  function blip(freq = 880, ms = 40, gain = 0.03) {
    if (!soundOn) return;
    audio ??= new (window.AudioContext || window.webkitAudioContext)();
    const o = audio.createOscillator();
    const g = audio.createGain();
    o.type = "square";
    o.frequency.value = freq;
    g.gain.value = gain;
    o.connect(g).connect(audio.destination);
    o.start();
    o.stop(audio.currentTime + ms / 1000);
  }

  // ---- Menu bar: the clock (Brussels time) and the CRT and sound switches.
  function clock() {
    const t = document.querySelector("[data-clock]");
    if (!t) return;
    const fmt = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Brussels" });
    const tick = () => (t.textContent = fmt.format(new Date()));
    tick();
    setInterval(tick, 15000);
  }
  function switches() {
    const crt = document.querySelector('[data-toggle="crt"]');
    const setCrt = (on) => {
      root.classList.toggle("no-crt", !on);
      crt?.setAttribute("aria-pressed", on);
    };
    setCrt(store.get("os.crt") !== "off");
    crt?.addEventListener("click", () => {
      const on = root.classList.contains("no-crt");
      setCrt(on);
      store.set("os.crt", on ? "on" : "off");
      track("toggle", { setting: "crt", on });
      blip(on ? 990 : 330, 50);
    });
    const snd = document.querySelector('[data-toggle="sound"]');
    snd?.setAttribute("aria-pressed", soundOn);
    snd?.addEventListener("click", () => {
      soundOn = !soundOn;
      snd.setAttribute("aria-pressed", soundOn);
      store.set("os.sound", soundOn ? "on" : "off");
      track("toggle", { setting: "sound", on: soundOn });
      blip(660, 60);
    });
  }

  // ---- Boot: once per visit, skippable, instant with reduced motion.
  function boot(done) {
    const screen = document.querySelector("[data-boot]");
    let seen = false;
    try { seen = sessionStorage.getItem("os.booted") === "1"; } catch {}
    if (!screen || seen || location.hash.length > 1) return done();
    const lines = [...screen.querySelectorAll("[data-boot-log] li")];
    const bar = screen.querySelector("[data-boot-bar]");
    const enter = screen.querySelector("[data-boot-enter]");
    screen.hidden = false;
    document.body.style.overflow = "hidden";
    let i = 0;
    let timer = null;
    const finishLog = () => {
      clearInterval(timer);
      lines.forEach((l) => l.classList.add("is-on"));
      bar.style.width = "100%";
      enter.classList.add("is-on");
    };
    const leave = () => {
      track("boot", { action: enter.classList.contains("is-on") ? "entered" : "skipped" });
      finishLog();
      try { sessionStorage.setItem("os.booted", "1"); } catch {}
      screen.hidden = true;
      document.body.style.overflow = "";
      removeEventListener("keydown", leave);
      blip(1320, 70);
      done();
    };
    if (reduced) finishLog();
    else {
      timer = setInterval(() => {
        if (i >= lines.length) return finishLog();
        lines[i].classList.add("is-on");
        bar.style.width = `${((i + 1) / lines.length) * 100}%`;
        blip(lines[i].hasAttribute("data-warn") ? 220 : 520 + i * 40, 25);
        i += 1;
      }, 170);
    }
    addEventListener("keydown", leave, { once: true });
    screen.addEventListener("click", leave, { once: true });
  }

  // ---- Windows
  const windows = new Map();
  let z = 10;
  let cascade = 0;

  const visible = () => [...windows.values()].filter((w) => !w.hidden);
  const topWindow = () => visible().sort((a, b) => b.style.zIndex - a.style.zIndex)[0];

  function front(win) {
    windows.forEach((w) => w.classList.remove("is-front"));
    win.classList.add("is-front");
    win.style.zIndex = ++z;
  }

  function settle() {
    const top = topWindow();
    if (top) front(top);
    dockState();
  }

  function place(win) {
    if (phone() || win.dataset.placed) return;
    const w = win.offsetWidth;
    const h = win.offsetHeight;
    const room = innerHeight - parseFloat(getComputedStyle(root).fontSize) * 9;
    const left = Math.min(innerWidth - w - 16, (innerWidth - w) / 2 - 100 + cascade * 36);
    const top = Math.min(Math.max(16, room - h), 24 + cascade * 30);
    cascade = (cascade + 1) % 6;
    win.style.left = `${Math.max(8, left)}px`;
    win.style.top = `${Math.max(8, top)}px`;
    win.dataset.placed = "1";
  }

  function open(id, { focus = true, via } = {}) {
    const win = windows.get(id);
    if (!win) return;
    const wasHidden = win.hidden;
    delete win.dataset.min;
    win.classList.remove("is-minimising");
    win.hidden = false;
    place(win);
    front(win);
    if (wasHidden) {
      if (!reduced) {
        win.classList.remove("is-opening");
        void win.offsetWidth;
        win.classList.add("is-opening");
      }
      launch(id);
      blip(880, 40);
      win.dataset.since = Date.now();
      track("open-app", { app: id, via: via ?? from() });
    }
    dockState();
    if (focus) (win.querySelector("[data-focus-first]") || win).focus({ preventScroll: true });
    if (location.hash !== `#${id}`) history.replaceState(null, "", `#${id}`);
    if (id === "terminal") win.querySelector(".terminal__line input")?.focus();
  }

  function close(win) {
    if (win.dataset.since) track("close-app", { app: win.id, seconds: Math.round((Date.now() - win.dataset.since) / 1000) });
    win.hidden = true;
    delete win.dataset.min;
    win.classList.remove("is-front", "is-zoomed");
    blip(440, 40);
    history.replaceState(null, "", location.pathname);
    settle();
    win.dispatchEvent(new Event("os:close"));
  }

  function minimise(win) {
    win.dataset.min = "1";
    const done = () => {
      win.hidden = true;
      win.classList.remove("is-minimising", "is-front");
      settle();
    };
    if (reduced) return done();
    win.classList.add("is-minimising");
    win.addEventListener("animationend", done, { once: true });
  }

  function drag(win) {
    const bar = win.querySelector("[data-drag]");
    bar?.addEventListener("pointerdown", (e) => {
      if (phone() || win.classList.contains("is-zoomed") || e.target.closest("a, button")) return;
      front(win);
      const sx = e.clientX - win.offsetLeft;
      const sy = e.clientY - win.offsetTop;
      bar.setPointerCapture(e.pointerId);
      const move = (ev) => {
        win.style.left = `${Math.max(-win.offsetWidth + 80, Math.min(ev.clientX - sx, innerWidth - 80))}px`;
        win.style.top = `${Math.max(0, ev.clientY - sy)}px`;
      };
      const up = () => {
        bar.removeEventListener("pointermove", move);
        bar.removeEventListener("pointerup", up);
      };
      bar.addEventListener("pointermove", move);
      bar.addEventListener("pointerup", up);
    });
    bar?.addEventListener("dblclick", (e) => {
      if (!e.target.closest("a, button")) minimise(win);
    });
  }

  function windowsUp() {
    document.querySelectorAll("[data-window]").forEach((win) => {
      windows.set(win.id, win);
      win.hidden = true;
      win.tabIndex = -1;
      win.setAttribute("role", "dialog");
      win.addEventListener("pointerdown", () => front(win));
      win.querySelector("[data-close]")?.addEventListener("click", (e) => { e.preventDefault(); close(win); });
      win.querySelector("[data-min]")?.addEventListener("click", () => minimise(win));
      win.querySelector("[data-zoom]")?.addEventListener("click", () => win.classList.toggle("is-zoomed"));
      drag(win);
    });
    document.querySelectorAll("[data-open]").forEach((a) => {
      if (!windows.has(a.dataset.open) || a.classList.contains("file")) return;
      a.addEventListener("click", (e) => {
        e.preventDefault();
        const id = a.dataset.open;
        if (id === "browser") return browse();
        open(id);
      });
    });
    addEventListener("keydown", (e) => {
      if (e.key !== "Escape" || e.target.closest?.("input, textarea")) return;
      const top = topWindow();
      if (top) close(top);
    });
    const id = location.hash.slice(1);
    if (windows.has(id)) open(id, { focus: false });
  }

  // ---- Files and folders: one click selects, a double click (or Enter, or a
  // tap on a touch screen) opens, as in the Finder.
  function activate(a) {
    if (a.dataset.slug) track("open-project", { project: a.dataset.slug });
    else if (a.closest("#posts")) track("open-post", { post: new URL(a.href).pathname });
    if (a.dataset.open) return open(a.dataset.open);
    if (a.dataset.kind === "browser") return browse(a.href);
    if (a.dataset.kind === "info") return open(a.dataset.info);
  }
  function files() {
    const all = [...document.querySelectorAll(".file")];
    const select = (a) => {
      all.forEach((f) => f.classList.toggle("is-selected", f === a));
    };
    all.forEach((a) => {
      a.addEventListener("click", (e) => {
        e.preventDefault();
        if (coarse()) return activate(a);
        select(a);
      });
      a.addEventListener("dblclick", (e) => { e.preventDefault(); activate(a); });
      a.addEventListener("keydown", (e) => {
        if (e.key === "Enter") { e.preventDefault(); select(a); activate(a); }
      });
    });
    document.querySelector("[data-desktop]")?.addEventListener("pointerdown", (e) => {
      if (!e.target.closest(".file, .window")) select(null);
    });
  }

  // ---- The dock: running triangles, a bounce on launch, magnification.
  function dockState() {
    document.querySelectorAll(".dock__item[data-open]").forEach((d) => {
      const w = windows.get(d.dataset.open);
      d.classList.toggle("is-running", !!w && (!w.hidden || !!w.dataset.min));
    });
  }
  function launch(id) {
    if (reduced) return;
    document.querySelectorAll(`.dock__item[data-open="${id}"]`).forEach((d) => {
      d.classList.remove("is-launching");
      void d.offsetWidth;
      d.classList.add("is-launching");
      d.addEventListener("animationend", () => d.classList.remove("is-launching"), { once: true });
    });
  }
  function dockUp() {
    const shelf = document.querySelector(".dock__shelf");
    const items = [...document.querySelectorAll(".dock__item")];
    if (!shelf || reduced) return;
    shelf.addEventListener("pointermove", (e) => {
      if (coarse() || phone()) return;
      for (const it of items) {
        const r = it.getBoundingClientRect();
        const d = Math.abs(e.clientX - (r.left + r.width / 2));
        it.style.setProperty("--mag", (1 + 0.55 * Math.max(0, 1 - d / 150)).toFixed(3));
      }
    });
    shelf.addEventListener("pointerleave", () => items.forEach((it) => it.style.removeProperty("--mag")));
  }

  // ---- Browser: its own history, an address bar, and posts as web pages.
  // Other sites mostly refuse to be framed, so their links open in a real tab.
  const nav = { list: [], at: -1 };
  let counted = "";
  let browser = null;
  function browse(url) {
    if (!browser) return;
    open("browser");
    if (!url) {
      if (nav.at >= 0) return;
      url = browser.home;
    }
    nav.list = nav.list.slice(0, nav.at + 1);
    nav.list.push(url);
    nav.at = nav.list.length - 1;
    browser.load(url);
  }
  function browserUp() {
    const win = document.getElementById("browser");
    if (!win) return;
    let frame = win.querySelector("[data-frame]");
    const address = win.querySelector("[data-address]");
    const back = win.querySelector("[data-back]");
    const forward = win.querySelector("[data-forward]");
    const external = win.querySelector("[data-external]");
    const title = win.querySelector(".window__title");
    const home = win.querySelector("[data-browser-home]")?.href || "/";
    const buttons = () => {
      back.disabled = nav.at <= 0;
      forward.disabled = nav.at >= nav.list.length - 1;
    };
    const show = (url, name) => {
      address.value = url;
      external.href = url;
      title.textContent = name || "browser";
      buttons();
    };
    // A frame that shows another site can be refused the way back to this
    // one, so it is swapped for a fresh frame first.
    const foreign = () => {
      try { return !frame.contentWindow.location.href; } catch { return true; }
    };
    browser = {
      home,
      load(url) {
        show(url, "Loading…");
        if (foreign()) {
          const fresh = frame.cloneNode(false);
          fresh.removeAttribute("src");
          fresh.addEventListener("load", loaded);
          frame.replaceWith(fresh);
          frame = fresh;
        }
        frame.src = url;
      },
    };
    function loaded() {
      let url = nav.list[nav.at] || "";
      let name = "";
      try {
        const doc = frame.contentDocument;
        url = frame.contentWindow.location.href;
        if (url === "about:blank") return;
        name = doc.title;
        if (url !== nav.list[nav.at]) {
          nav.list = nav.list.slice(0, nav.at + 1);
          nav.list.push(url);
          nav.at = nav.list.length - 1;
        }
        doc.addEventListener("click", (e) => {
          const a = e.target.closest?.("a[href]");
          if (!a || a.target === "_top") return;
          if (a.hasAttribute("data-browse")) {
            e.preventDefault();
            browse(a.href);
          } else if (new URL(a.href, url).origin !== location.origin) {
            e.preventDefault();
            window.open(a.href, "_blank", "noopener");
          }
        });
      } catch {
        name = new URL(url, location.href).hostname;
      }
      // Other sites can fire load twice for one visit, so count each once.
      const u = new URL(url, location.href);
      const page = u.origin === location.origin ? u.pathname : u.hostname;
      if (counted !== `${nav.at} ${page}`) track("browser-page", { page });
      counted = `${nav.at} ${page}`;
      show(url, name);
    }
    frame.addEventListener("load", loaded);
    back.addEventListener("click", () => { if (nav.at > 0) browser.load(nav.list[--nav.at]); });
    forward.addEventListener("click", () => { if (nav.at < nav.list.length - 1) browser.load(nav.list[++nav.at]); });
    win.querySelector("[data-reload]").addEventListener("click", () => {
      try { frame.contentWindow.location.reload(); } catch { frame.src = frame.src; }
    });
    win.querySelector("[data-go]").addEventListener("submit", (e) => {
      e.preventDefault();
      let v = address.value.trim();
      if (!v) return;
      if (!/^[a-z]+:/i.test(v) && !v.startsWith("/") && /\.[a-z]{2,}/i.test(v)) v = `https://${v}`;
      const u = new URL(v, location.href);
      if (u.origin === location.origin) browse(u.href);
      else window.open(u.href, "_blank", "noopener");
    });
    buttons();
    // A few other sites are glad to be framed, the booking page among them.
    document.querySelectorAll("a[data-browse]").forEach((a) => {
      a.addEventListener("click", (e) => { e.preventDefault(); browse(a.href); });
    });
  }

  // ---- Mail: send through the visitor's own mail app.
  function compose() {
    const form = document.querySelector("[data-compose]");
    form?.addEventListener("submit", (e) => {
      e.preventDefault();
      const subject = form.querySelector('[name="subject"]').value;
      const body = form.querySelector('[name="body"]').value;
      track("send-mail");
      location.href = `mailto:${form.dataset.to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    });
  }

  // ---- Tools: small ports of tools.adwebdev.xyz. Each runs in its window,
  // on this page, and sends nothing anywhere.
  function copyButtons() {
    document.querySelectorAll("[data-copy]").forEach((b) => {
      b.addEventListener("click", async () => {
        const target = b.closest(".app").querySelector(b.dataset.copy);
        const text = target?.value ?? target?.textContent ?? "";
        try {
          await navigator.clipboard.writeText(text);
          b.textContent = "Copied";
        } catch {
          b.textContent = "Select and copy";
        }
        blip(990, 30);
        setTimeout(() => (b.textContent = "Copy"), 1400);
      });
    });
  }

  // A fair random index below n, without the bias of a plain modulo.
  function randomBelow(n) {
    const limit = Math.floor(0x100000000 / n) * n;
    const buf = new Uint32Array(1);
    do crypto.getRandomValues(buf); while (buf[0] >= limit);
    return buf[0] % n;
  }

  function keygen() {
    const box = document.querySelector("[data-keygen]");
    if (!box || !window.crypto?.getRandomValues) return;
    const sets = {
      upper: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
      lower: "abcdefghijklmnopqrstuvwxyz",
      digits: "0123456789",
      symbols: "!#$%&*+-=?@^_~",
    };
    const out = box.querySelector("[data-pass]");
    const len = box.querySelector("[data-len]");
    const lenOut = box.querySelector("[data-len-out]");
    const crack = box.querySelector("[data-crack]");
    const checks = [...box.querySelectorAll("[data-set]")];
    // How long a guess-everything attack at a trillion tries a second needs,
    // on average, to find it.
    const howLong = (bits) => {
      const log10s = (bits - 1) * Math.log10(2) - 12;
      const units = [["years", 31557600], ["days", 86400], ["hours", 3600], ["minutes", 60], ["seconds", 1]];
      const years = log10s - Math.log10(31557600);
      if (years > Math.log10(1.38e10)) return "longer than the universe has existed";
      if (years > 6) return `about ${Math.round(10 ** (years - 6)).toLocaleString("en-GB")} million years`;
      const secs = 10 ** log10s;
      for (const [name, size] of units) if (secs >= size) return `about ${Math.round(secs / size).toLocaleString("en-GB")} ${name}`;
      return "less than a second";
    };
    const make = () => {
      const pool = checks.filter((c) => c.checked).map((c) => sets[c.dataset.set]).join("");
      const n = Number(len.value);
      let pass = "";
      for (let i = 0; i < n; i++) pass += pool[randomBelow(pool.length)];
      out.textContent = pass;
      lenOut.textContent = n;
      const bits = n * Math.log2(pool.length);
      crack.textContent = `${Math.round(bits)} bits. At a trillion guesses a second, cracking it takes ${howLong(bits)}.`;
    };
    len.addEventListener("input", make);
    checks.forEach((c) => c.addEventListener("change", () => {
      if (!checks.some((x) => x.checked)) c.checked = true;
      make();
    }));
    box.querySelector("[data-gen]").addEventListener("click", () => { make(); blip(660, 25); });
    const uuid = box.querySelector("[data-uuid]");
    const newUuid = () => (uuid.textContent = crypto.randomUUID?.() || "Needs a secure (https) page");
    box.querySelector("[data-new-uuid]").addEventListener("click", () => { newUuid(); blip(660, 25); });
    make();
    newUuid();
  }

  function stopwatch() {
    const box = document.querySelector("[data-stopwatch]");
    if (!box) return;
    const time = box.querySelector("[data-time]");
    const startBtn = box.querySelector("[data-start]");
    const lapBtn = box.querySelector("[data-lap]");
    const resetBtn = box.querySelector("[data-reset]");
    const laps = box.querySelector("[data-laps]");
    let base = 0;
    let since = 0;
    let raf = 0;
    let lastLap = 0;
    const now = () => base + (since ? performance.now() - since : 0);
    const fmt = (ms) => {
      const cs = Math.floor(ms / 10) % 100;
      const s = Math.floor(ms / 1000) % 60;
      const m = Math.floor(ms / 60000) % 60;
      const h = Math.floor(ms / 3600000);
      const two = (n) => String(n).padStart(2, "0");
      return `${h ? `${h}:` : ""}${two(m)}:${two(s)}.${two(cs)}`;
    };
    const tick = () => {
      time.textContent = fmt(now());
      raf = requestAnimationFrame(tick);
    };
    startBtn.addEventListener("click", () => {
      if (since) {
        base = now();
        since = 0;
        cancelAnimationFrame(raf);
        time.textContent = fmt(base);
        startBtn.textContent = "Start";
        lapBtn.disabled = true;
      } else {
        since = performance.now();
        tick();
        startBtn.textContent = "Stop";
        lapBtn.disabled = false;
        resetBtn.disabled = false;
      }
      blip(since ? 880 : 440, 30);
    });
    lapBtn.addEventListener("click", () => {
      const t = now();
      const li = document.createElement("li");
      li.innerHTML = `<span>Lap ${laps.children.length + 1}</span><span></span><span></span>`;
      li.children[1].textContent = `+${fmt(t - lastLap)}`;
      li.children[2].textContent = fmt(t);
      laps.prepend(li);
      lastLap = t;
      blip(1046, 20);
    });
    resetBtn.addEventListener("click", () => {
      cancelAnimationFrame(raf);
      base = since = lastLap = 0;
      time.textContent = fmt(0);
      laps.replaceChildren();
      startBtn.textContent = "Start";
      lapBtn.disabled = resetBtn.disabled = true;
    });
  }

  function chmod() {
    const box = document.querySelector("[data-chmod]");
    if (!box) return;
    const boxes = [...box.querySelectorAll("[data-bit]")];
    const octal = box.querySelector("[data-octal]");
    const symbolic = box.querySelector("[data-symbolic]");
    const cmd = box.querySelector("[data-cmd]");
    const note = box.querySelector("[data-chmod-note]");
    const notes = {
      "777": "Everyone can do everything. Almost never what you want on a server.",
      "755": "The usual for folders and scripts: you change them, everyone can read and run them.",
      "644": "The usual for files: you change them, everyone can read them.",
      "600": "Only you can read or change it. Good for keys and .env files.",
      "400": "Read-only, and only for you. SSH likes its private keys like this.",
      "444": "Read-only for everyone. Drupal sets settings.php like this.",
    };
    const show = (digits) => {
      symbolic.textContent = digits.map((d) => `${d & 4 ? "r" : "-"}${d & 2 ? "w" : "-"}${d & 1 ? "x" : "-"}`).join("");
      cmd.textContent = `chmod ${digits.join("")} file`;
      note.textContent = notes[digits.join("")] || "";
    };
    const fromBoxes = () => {
      const digits = [0, 0, 0];
      boxes.forEach((b) => { if (b.checked) digits[b.dataset.who] += Number(b.dataset.bit); });
      octal.value = digits.join("");
      show(digits);
    };
    const fromOctal = () => {
      if (!/^[0-7]{3}$/.test(octal.value)) return;
      const digits = [...octal.value].map(Number);
      boxes.forEach((b) => (b.checked = (digits[b.dataset.who] & b.dataset.bit) > 0));
      show(digits);
    };
    boxes.forEach((b) => b.addEventListener("change", fromBoxes));
    octal.addEventListener("input", fromOctal);
    fromOctal();
  }

  function statusCodes() {
    const box = document.querySelector("[data-http-status]");
    if (!box) return;
    const rows = [...box.querySelectorAll("[data-code]")];
    const input = box.querySelector("[data-status-in]");
    const code = box.querySelector("[data-status-code]");
    const name = box.querySelector("[data-status-name]");
    const about = box.querySelector("[data-status-about]");
    const show = (row) => {
      code.textContent = row.dataset.code;
      name.textContent = row.dataset.name;
      about.textContent = row.dataset.about;
    };
    const look = () => {
      const v = input.value.trim();
      const row = rows.find((r) => r.dataset.code === v);
      if (row) return show(row);
      code.textContent = v || "…";
      name.textContent = v.length === 3 ? "Not one I know" : "";
      about.textContent = v.length === 3 ? "Try 404, 418 or 419." : "";
    };
    input.addEventListener("input", look);
    box.querySelector("[data-status-form]").addEventListener("submit", (e) => e.preventDefault());
    box.querySelector("[data-status-random]").addEventListener("click", () => {
      const row = rows[randomBelow(rows.length)];
      input.value = row.dataset.code;
      show(row);
      blip(row.dataset.code[0] === "2" ? 880 : row.dataset.code[0] >= "4" ? 220 : 520, 40);
    });
    rows.forEach((r) => r.addEventListener("click", () => { input.value = r.dataset.code; show(r); }));
    look();
  }

  function keycode() {
    const box = document.querySelector("[data-keycode]");
    if (!box) return;
    const pad = box.querySelector("[data-keypad]");
    const big = box.querySelector("[data-key-big]");
    const field = (k) => box.querySelector(`[data-k="${k}"]`);
    const where = ["Standard", "Left", "Right", "Numpad"];
    pad.addEventListener("keydown", (e) => {
      if (e.key === "Tab") return;
      e.preventDefault();
      e.stopPropagation();
      big.textContent = e.key === " " ? "Space" : e.key;
      field("key").textContent = JSON.stringify(e.key);
      field("code").textContent = e.code || "–";
      field("keyCode").textContent = e.keyCode;
      field("location").textContent = `${e.location} (${where[e.location] || "?"})`;
      field("mods").textContent = ["Meta", "Control", "Alt", "Shift"].filter((m) => e.getModifierState(m)).join(" + ") || "none";
      pad.textContent = "Press another";
      blip(520 + (e.keyCode % 40) * 12, 20);
    });
    pad.addEventListener("blur", () => (pad.textContent = "Click here, then press any key"));
  }

  function radio() {
    const box = document.querySelector("[data-radio]");
    if (!box) return;
    const words = "Alfa Bravo Charlie Delta Echo Foxtrot Golf Hotel India Juliett Kilo Lima Mike November Oscar Papa Quebec Romeo Sierra Tango Uniform Victor Whiskey X-ray Yankee Zulu".split(" ");
    const digits = "Zero One Two Three Four Five Six Seven Eight Niner".split(" ");
    const marks = { "@": "At", ".": "Dot", "-": "Dash", "_": "Underscore", "/": "Slash", ":": "Colon" };
    const input = box.querySelector("[data-radio-in]");
    const out = box.querySelector("[data-radio-out]");
    const speak = box.querySelector("[data-speak]");
    const spell = () => {
      out.replaceChildren();
      for (const ch of input.value) {
        const lower = ch.toLowerCase();
        let word = null;
        if (lower >= "a" && lower <= "z") word = words[lower.charCodeAt(0) - 97];
        else if (ch >= "0" && ch <= "9") word = digits[ch];
        else if (marks[ch]) word = marks[ch];
        else if (ch === " ") word = "(space)";
        else word = ch;
        const w = document.createElement("span");
        w.className = "radio__word";
        if (/[a-z0-9]/i.test(ch)) {
          const first = document.createElement("b");
          first.textContent = word[0];
          w.append(first, word.slice(1));
        } else w.textContent = word;
        out.append(w, " ");
      }
    };
    input.addEventListener("input", spell);
    if ("speechSynthesis" in window) {
      speak.hidden = false;
      speak.addEventListener("click", () => {
        speechSynthesis.cancel();
        const say = new SpeechSynthesisUtterance(out.textContent.replace(/\(space\)/g, ",").replace(/\s+/g, ", "));
        say.lang = "en-GB";
        say.rate = 0.95;
        speechSynthesis.speak(say);
      });
    }
    spell();
  }

  function tools() {
    copyButtons();
    keygen();
    stopwatch();
    chmod();
    statusCodes();
    keycode();
    radio();
  }

  // ---- Screensaver: the logo bouncing round an idle desktop. Only when
  // no window is open, so it never interrupts reading,
  // and never on touch screens or with reduced motion.
  let saver = null;
  function screensaver() {
    if (reduced || !matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    const mark = document.querySelector(".menubar__mark svg")?.cloneNode(true);
    if (!mark) return;
    mark.removeAttribute("role");
    mark.removeAttribute("aria-label");
    const screen = document.createElement("div");
    screen.className = "saver";
    screen.hidden = true;
    screen.setAttribute("aria-hidden", "true");
    const logo = document.createElement("div");
    logo.className = "saver__logo";
    logo.append(mark);
    const note = document.createElement("p");
    note.className = "saver__note";
    screen.append(logo, note);
    document.body.append(screen);

    const IDLE_MS = 45000;
    let idle = 0;
    let raf = 0;
    let x = 0;
    let y = 0;
    let vx = 150;
    let vy = 115;
    let last = 0;
    let corners = 0;
    const frame = (t) => {
      const dt = Math.min((t - last) / 1000, 0.05);
      last = t;
      const maxX = innerWidth - logo.offsetWidth;
      const maxY = innerHeight - logo.offsetHeight;
      x += vx * dt;
      y += vy * dt;
      const hitX = x <= 0 || x >= maxX;
      const hitY = y <= 0 || y >= maxY;
      if (hitX) { vx = -vx; x = Math.max(0, Math.min(x, maxX)); }
      if (hitY) { vy = -vy; y = Math.max(0, Math.min(y, maxY)); }
      if (hitX || hitY) {
        logo.classList.toggle("is-lit");
        blip(hitX && hitY ? 1320 : 440, 30, 0.02);
      }
      if (hitX && hitY) {
        corners += 1;
        note.textContent = corners === 1 ? "It hit the corner." : `It hit the corner. ${corners} times now.`;
        if (corners === 1) track("screensaver-corner");
      }
      logo.style.transform = `translate(${x}px, ${y}px)`;
      raf = requestAnimationFrame(frame);
    };
    const reading = () => visible().some((w) => w.id !== "agent");
    const booting = () => !!document.querySelector("[data-boot]:not([hidden])");
    const show = (how = "idle") => {
      if (booting()) return arm();
      track("screensaver", { how });
      screen.hidden = false;
      x = Math.random() * Math.max(1, innerWidth - logo.offsetWidth);
      y = Math.random() * Math.max(1, innerHeight - logo.offsetHeight);
      last = performance.now();
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(frame);
    };
    const hide = () => {
      if (screen.hidden) return;
      cancelAnimationFrame(raf);
      screen.hidden = true;
    };
    const arm = () => {
      clearTimeout(idle);
      idle = setTimeout(() => (reading() ? arm() : show()), IDLE_MS);
    };
    const wake = () => { hide(); arm(); };
    for (const ev of ["pointermove", "pointerdown", "keydown", "wheel", "scroll", "touchstart"]) {
      addEventListener(ev, wake, { passive: true });
    }
    document.addEventListener("visibilitychange", () => (document.hidden ? (clearTimeout(idle), hide()) : arm()));
    arm();
    saver = () => show("command");
  }

  // ---- Tinker and Drush: consoles over a small PHP interpreter (php.js and
  // its Laravel and Drupal layers). The scripts are fetched the first time
  // either console is used, so the desktop itself stays light.
  let phpReady = null;
  function loadPhp() {
    phpReady ??= [...document.querySelectorAll("link[data-php]")].reduce((chain, link) => chain.then(() => new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = link.href;
      s.onload = resolve;
      s.onerror = () => reject(new Error(`Could not load ${link.href}`));
      document.head.append(s);
    })), Promise.resolve());
    return phpReady;
  }

  // What the pretend frameworks know about this site, read from the page.
  function siteData() {
    const root = document.querySelector(".menubar__mark")?.href || location.origin;
    return {
      email: document.querySelector("[data-compose]")?.dataset.to || "",
      siteUrl: root.replace(/\/$/, ""),
      posts: [...document.querySelectorAll("#posts tbody tr")].map((tr) => ({
        title: tr.querySelector(".file__name")?.textContent || "",
        url: new URL(tr.querySelector("a").href).pathname,
        date: tr.querySelector("time")?.getAttribute("datetime") || "",
      })),
      projects: [...document.querySelectorAll("#projects .file[data-slug]")].map((a) => ({
        slug: a.dataset.slug, name: a.querySelector(".file__name").textContent,
        kind: a.dataset.type || "", status: a.dataset.status || "", about: a.dataset.about || "",
      })),
    };
  }

  function makeConsole(term, onLine) {
    const line = document.createElement("form");
    line.className = "terminal__line";
    const id = `${term.dataset.console}-in`;
    line.innerHTML = `<label for="${id}"></label><input id="${id}" autocomplete="off" autocapitalize="off" spellcheck="false">`;
    term.append(line);
    const label = line.querySelector("label");
    const input = line.querySelector("input");
    input.setAttribute("aria-label", `${term.dataset.console} input`);
    const history = [];
    let at = 0;
    const api = {
      busy: false,
      say(text, cls, href) {
        const p = document.createElement("p");
        if (href) {
          const a = document.createElement("a");
          a.href = href;
          a.textContent = text;
          a.addEventListener("click", (e) => { e.preventDefault(); browse(href); });
          p.append(a);
        } else p.textContent = text;
        if (cls) p.className = cls;
        line.before(p);
        term.scrollTop = term.scrollHeight;
      },
      lines(list) { for (const l of list) api.say(l.text, l.cls); },
      prompt(text) { label.textContent = text; },
      clear() { term.querySelectorAll(":scope > p").forEach((n) => n.remove()); },
      submit(text) { input.value = text; line.requestSubmit(); },
    };
    line.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (api.busy) return;
      const raw = input.value;
      input.value = "";
      if (raw.trim()) history.push(raw);
      at = history.length;
      api.busy = true;
      try {
        await onLine(raw, api);
      } catch (err) {
        api.say(`   Error  ${err.message}`, "is-error");
      } finally {
        api.busy = false;
      }
      blip(740, 20);
    });
    input.addEventListener("keydown", (e) => {
      if (e.key === "ArrowUp" && at > 0) { input.value = history[--at]; e.preventDefault(); }
      else if (e.key === "ArrowDown") { at = Math.min(history.length, at + 1); input.value = history[at] ?? ""; e.preventDefault(); }
    });
    return api;
  }

  // A PsySH-style REPL over one interpreter; shared by Tinker and drush php.
  function repl(c, make, done) {
    let php = null;
    let buffer = "";
    const examples = {
      laravel: ["collect([1, 2, 3])->map(fn($n) => $n * 2)->sum()", "Post::latest()->first()->title", "Project::pluck('name')", "Str::slug('Olá, Bruxelas!')", "now()->diffForHumans(Carbon::parse('2011-01-05'))", "User::factory()->count(3)->create()->pluck('name')", "fake()->name()"],
      drupal: ["\\Drupal::VERSION", "Node::load(1)->label()", "\\Drupal::entityQuery('node')->accessCheck(FALSE)->execute()", "\\Drupal::config('system.site')->get('name')", "\\Drupal::messenger()->addStatus(t('Hello @name', ['@name' => 'you']))", "drupal_set_message('old habits')"],
    };
    const shell = make === "laravel" ? "tinker" : "drush-php";
    const SHELL = { help: "help", ls: "ls", wtf: "wtf", "wtf?": "wtf", clear: "clear", exit: "exit", quit: "exit", q: "exit", "exit;": "exit", "exit()": "exit" };
    return async (raw) => {
      const cmd = raw.trim();
      c.say(`${buffer ? "..." : ">"} ${raw}`, "is-cmd");
      if (!buffer && Object.hasOwn(SHELL, cmd)) track("console-command", { console: shell, command: SHELL[cmd] });
      if (!buffer) {
        if (cmd === "") return;
        if (["exit", "quit", "q", "exit;", "exit()"].includes(cmd)) {
          c.say("   INFO  Goodbye.", "is-dim");
          php = null;
          done();
          return;
        }
        if (cmd === "clear") { c.clear(); return; }
        if (cmd === "help") {
          c.say("A few things to try:", "is-dim");
          for (const ex of examples[make]) c.say(`  ${ex}`);
          c.say("Also: ls (your variables), wtf (the last error again), clear, exit. Arrow keys bring back what you typed.", "is-dim");
          return;
        }
        if (cmd === "wtf" || cmd === "wtf?") {
          const err = php?.lastError;
          c.say(err ? `   ${err.type}  ${err.text}\n  at {main}()\n  at psy-shell-code:1` : "   INFO  No exception yet. Try harder.", err ? "is-error" : "is-dim");
          return;
        }
        if (cmd === "ls") {
          const vars = php ? php.variables() : [];
          c.say(vars.length ? `Variables: ${vars.map((v) => `$${v}`).join(", ")}` : "Variables: none yet.", "is-dim");
          return;
        }
      }
      buffer += (buffer ? "\n" : "") + raw;
      if (!php) {
        await loadPhp();
        php = MiniPhp.create(make, siteData());
      }
      const r = php.run(buffer);
      if (r.incomplete) { c.prompt("..."); return; }
      buffer = "";
      c.prompt(">");
      c.lines(r.lines);
      track("console-command", { console: shell, command: "php", result: r.lines.some((l) => l.cls === "is-error") ? "error" : "ok" });
    };
  }
  const BANNER = "Psy Shell v0.12.9 (PHP 8.4.0 — cli) by Justin Hileman";

  function tinker() {
    const term = document.querySelector('[data-console="tinker"]');
    if (!term) return;
    let run;
    const c = makeConsole(term, (raw) => run(raw));
    const begin = () => {
      run = repl(c, "laravel", () => { begin(); });
      c.say(BANNER, "is-dim");
      c.say("A pretend Tinker: a small PHP in your browser, over this site's posts and projects. Type help for ideas.", "is-dim");
      c.prompt(">");
    };
    begin();
  }

  let drushRun = null;
  function drush() {
    const term = document.querySelector('[data-console="drush"]');
    if (!term) return;
    let php = null;
    let inRepl = null;
    const site = () => php.drupal;
    const ready = async () => {
      if (!php) {
        await loadPhp();
        php = MiniPhp.create("drupal", siteData());
      }
      return php;
    };
    const wait = (ms) => new Promise((r) => setTimeout(r, reduced ? 0 : ms));
    const table = (rows) => {
      const widths = rows[0].map((_, i) => Math.max(...rows.map((r) => String(r[i]).length)));
      return rows.map((r) => ` ${r.map((v, i) => String(v).padEnd(widths[i])).join("   ")}`.trimEnd());
    };
    const ts = () => MiniPhp.phpDate("d/M H:i", Date.now());
    const root = (document.querySelector(".menubar__mark")?.href || "/").replace(/\/?$/, "/");
    const LIST = [
      ["cache:rebuild (cr)", "Rebuild a Drupal site and clear all its caches."],
      ["core:cron (cron)", "Run all cron hooks in all active modules."],
      ["core:status (st)", "An overview of the environment."],
      ["config:get (cget)", "Display a config value."],
      ["config:export (cex)", "Export Drupal configuration to a directory."],
      ["config:import (cim)", "Import config from the sync directory."],
      ["deploy", "Run several commands after a deploy."],
      ["php:cli (php)", "Open an interactive shell on a Drupal site."],
      ["php:eval (ev)", "Evaluate arbitrary PHP code after bootstrapping Drupal."],
      ["pm:install (en)", "Enable one or more modules."],
      ["pm:list (pml)", "Show a list of modules."],
      ["pm:uninstall (pmu)", "Uninstall one or more modules."],
      ["sql:query (sqlq)", "Execute a query against a database."],
      ["state:get (sget)", "Display a state value."],
      ["updatedb (updb)", "Apply any database updates required."],
      ["user:login (uli)", "Display a one-time login link for user ID 1."],
      ["watchdog:show (ws)", "Show watchdog messages."],
    ];
    const ALIASES = { cr: "cache:rebuild", rebuild: "cache:rebuild", "cache-rebuild": "cache:rebuild", cron: "core:cron", st: "core:status", status: "core:status", cget: "config:get", cex: "config:export", cim: "config:import", php: "php:cli", "core:cli": "php:cli", ev: "php:eval", eval: "php:eval", en: "pm:install", "pm-enable": "pm:install", pml: "pm:list", "pm-list": "pm:list", pmu: "pm:uninstall", sqlq: "sql:query", sqlc: "sql:cli", "sql-cli": "sql:cli", sget: "state:get", sset: "state:set", updb: "updatedb", uli: "user:login", ws: "watchdog:show", "wd-show": "watchdog:show", si: "site:install", gen: "generate", list: "list", help: "list", "--version": "version", upwd: "user:password" };
    const COMMANDS = {
      list: (a, c) => {
        c.say("Drush Commandline Tool 13.x", "is-dim");
        for (const line of table(LIST)) c.say(line);
      },
      version: (a, c) => c.say(" Drush version : 13.x"),
      "core:status": (a, c) => {
        const d = site();
        for (const line of table([
          ["Drupal version", ":", d.VERSION], ["Site URI", ":", root.replace(/\/$/, "")], ["DB driver", ":", "none (a static site)"],
          ["PHP version", ":", "8.4.0 (in your browser)"], ["Drush version", ":", "13.x"], ["Install profile", ":", "minimal"],
          ["Default theme", ":", "phosphor"], ["Admin theme", ":", "claro"], ["Drupal root", ":", "/var/www/html/web"], ["Site path", ":", "sites/default"],
        ])) c.say(line);
      },
      "cache:rebuild": async (a, c) => {
        await wait(700);
        c.say(" [success] Cache rebuild complete.", "is-ok");
      },
      "core:cron": async (a, c) => {
        c.say(" [notice] Starting execution of node_cron().", "is-dim");
        await wait(400);
        site().state.set("system.cron_last", Math.floor(Date.now() / 1000));
        c.say(" [notice] Cron run completed.", "is-ok");
      },
      updatedb: (a, c) => c.say(" [success] No pending updates.", "is-ok"),
      "config:import": (a, c) => c.say(" [notice] There are no changes to import.", "is-ok"),
      "config:export": (a, c) => c.say(" [notice] The active configuration is identical to the configuration in the export directory (../config/sync).", "is-ok"),
      deploy: async (a, c) => {
        c.say(" [notice] Database updates start.", "is-dim");
        c.say(" [success] No pending updates.", "is-ok");
        c.say(" [notice] Config import start.", "is-dim");
        c.say(" [notice] There are no changes to import.", "is-ok");
        await wait(600);
        c.say(" [success] Cache rebuild complete.", "is-ok");
        c.say(" [success] Deploy hooks done.", "is-ok");
      },
      "config:get": ([name, key], c) => {
        if (!name) return c.say(" [error]  Not enough arguments (missing: \"config_name\").", "is-error");
        const r = php.run(`\\Drupal::config(${JSON.stringify(name)})->get(${JSON.stringify(key || "")})`);
        if (r.value === null || r.value === undefined) return c.say(` [error]  Config ${name}${key ? `:${key}` : ""} does not exist`, "is-error");
        c.say(`'${name}${key ? `:${key}` : ""}': ${typeof r.value === "object" ? php.printR(r.value).trim() : php.str(r.value)}`);
      },
      "state:get": ([key], c) => {
        const v = site().state.get(key);
        c.say(v === undefined ? " [error]  No state value for that key." : php.str(v), v === undefined ? "is-error" : "");
      },
      "state:set": ([key, value], c) => { site().state.set(key, value); c.say(` [success] ${key} set.`, "is-ok"); },
      "pm:list": (a, c) => {
        const rows = [["Package", "Name", "Status"]];
        const pkg = { admin_toolbar: "Contrib", pathauto: "Contrib", devel: "Contrib", adwebdev_desktop: "Custom" };
        for (const [m, on] of Object.entries(site().modules)) rows.push([pkg[m] || "Core", m, on ? "Enabled" : "Disabled"]);
        for (const line of table(rows)) c.say(line);
      },
      "pm:install": (names, c) => {
        if (!names.length) return c.say(" [error]  Not enough arguments (missing: \"modules\").", "is-error");
        for (const m of names) {
          if (!(m in site().modules)) { c.say(` [error]  Unable to install modules ${m} due to missing modules ${m}.`, "is-error"); continue; }
          site().modules[m] = true;
          c.say(` [success] Module ${m} has been installed.`, "is-ok");
        }
      },
      "pm:uninstall": (names, c) => {
        for (const m of names) {
          if (["node", "user", "system"].includes(m)) { c.say(` [error]  The following reasons prevent the modules from being uninstalled: Required by Drupal (core)`, "is-error"); continue; }
          if (m in site().modules) site().modules[m] = false;
          c.say(` [success] Successfully uninstalled: ${m}`, "is-ok");
        }
      },
      "user:login": (a, c) => {
        const hash = MiniPhp.md5(String(Math.random())).slice(0, 22);
        const link = `${root}user/reset/1/${Math.floor(Date.now() / 1000)}/${hash}/login`;
        c.say(link, "is-out", link);
        c.say("   (It goes where every login on a static site goes.)", "is-dim");
      },
      "user:password": ([name], c) => c.say(` [success] Changed password for ${name || "adriano"}.`, "is-ok"),
      "watchdog:show": (a, c) => {
        const rows = [["ID", "Date", "Type", "Severity", "Message"],
          ["512", ts(), "page not found", "Warning", "/wp-login.php"],
          ["511", ts(), "cron", "Info", "Cron run completed."],
          ["510", ts(), "page not found", "Warning", "/.env"],
          ["509", ts(), "user", "Notice", "Session opened for adriano."],
          ["508", ts(), "php", "Notice", "Deprecated function: drupal_set_message() called from a 2011 memory."],
          ["507", ts(), "system", "Info", "adwebdev_desktop module installed."]];
        for (const line of table(rows)) c.say(line);
      },
      "sql:query": (a, c) => c.say(" [error]  No database here. The site is static files on GitHub Pages; that is rather the point.", "is-error"),
      "sql:cli": (a, c) => COMMANDS["sql:query"](a, c),
      "sql:dump": (a, c) => COMMANDS["sql:query"](a, c),
      "site:install": (a, c) => c.say(" [error]  Already installed. Since 2011, as it happens.", "is-error"),
      generate: (a, c) => c.say(" [error]  Code generation needs a real disk. Try drush php.", "is-error"),
      "php:eval": (args, c) => {
        const code = args.join(" ");
        if (!code) return c.say(" [error]  Not enough arguments (missing: \"code\").", "is-error");
        const r = php.run(code);
        for (const l of r.lines) if (!l.text.startsWith("= ")) c.say(l.text.replace(/⏎$/, ""), l.cls);
        if (r.hasValue && r.value !== null && r.value !== undefined) c.say(typeof r.value === "object" ? php.printR(r.value).trimEnd() : php.str(r.value), "is-out");
      },
      "php:cli": (a, c) => {
        inRepl = repl(c, "drupal", () => { inRepl = null; c.prompt("$"); });
        c.say(BANNER, "is-dim");
        c.say("Drupal is bootstrapped, more or less. Type help for ideas, exit to leave.", "is-dim");
        c.prompt(">");
      },
    };
    const words = (s) => [...s.matchAll(/"([^"]*)"|'([^']*)'|(\S+)/g)].map((m) => m[1] ?? m[2] ?? m[3]);
    const c = makeConsole(term, async (raw, c) => {
      if (inRepl) return inRepl(raw);
      const cmd = raw.trim();
      c.say(`$ ${raw}`, "is-cmd");
      if (!cmd) return;
      if (cmd === "clear") { c.clear(); return; }
      const [bin, sub, ...args] = words(cmd);
      if (!["drush", "vendor/bin/drush", "./vendor/bin/drush"].includes(bin)) {
        track("console-command", { console: "drush", command: "not-drush" });
        c.say(`${bin}: only drush lives in here. Try drush list.`, "is-dim");
        return;
      }
      const name = sub === undefined ? "list" : ALIASES[sub] || sub;
      const run = Object.hasOwn(COMMANDS, name) ? COMMANDS[name] : null;
      track("console-command", { console: "drush", command: run ? name : "unknown" });
      if (!run) {
        c.say(` [error]  Command "${sub}" is not defined.`, "is-error");
        return;
      }
      await ready();
      await run(args, c);
    });
    c.say("A pretend Drush over a pretend Drupal, both running in your browser. Try drush status, drush cr, drush uli, drush php or drush list.", "is-dim");
    c.prompt("$");
    drushRun = (text) => c.submit(text);
  }

  // ---- The agent: a pretend coding agent that turns up a few seconds into a
  // visit and rewrites this site's own code in fake diffs, its mascot changing
  // with the model, back and forth. Closed once, it comes back a minute
  // later; closed twice, it stays closed for the visit. Never on phones.
  const SPRITES = {
    claude: { colours: { O: "#d97757" }, rows: [
      "..OOOOOOOO..",
      "..OkOOOOkO..",
      "..OkOOOOkO..",
      "OOOOOOOOOOOO",
      "OOOOOOOOOOOO",
      "..OOOOOOOO..",
      "..O.O..O.O..",
      "..O.O..O.O..",
    ] },
    deepseek: { colours: { B: "#4d6bfe", b: "#9db0ff", W: "#cfe0ff" }, rows: [
      "..W.W.........",
      "...W..........",
      "..BBBBB.....BB",
      ".BBBBBBB...BB.",
      "BBkBBBBBB.BB..",
      "BBBBBBBBBBBB..",
      "BbbbbbbBBBB...",
      ".bbbbbbbBB....",
      "..bbbbbb......",
    ] },
    gemini: { colours: { a: "#4f8bf7", c: "#9b72f2", d: "#d96570" }, rows: [
      "....a....",
      "....a....",
      "...aac...",
      "..aaccc..",
      "aaaacccdd",
      "..accdd..",
      "...cdd...",
      "....d....",
      "....d....",
    ] },
    ollama: { colours: { W: "#f1f0ea", n: "#bdbcb4" }, rows: [
      "WW....WW",
      "WW....WW",
      "WWWWWWWW",
      "WkWWWWkW",
      "WWWWWWWW",
      ".WWnnWW.",
      ".WWWWWW.",
      "..WWWW..",
      "..WWWW..",
    ] },
  };
  const MODELS = [
    { id: "claude", name: "Claude Code", model: "claude-opus", verbs: ["Clauding", "Pondering", "Noodling", "Percolating", "Schlepping", "Honking"] },
    { id: "deepseek", name: "DeepSeek", model: "deepseek-coder", verbs: ["Thinking", "Reasoning", "Diving deep", "Surfacing"] },
    { id: "gemini", name: "Gemini CLI", model: "gemini-pro", verbs: ["Sparkling", "Considering", "Twinkling", "Weighing it up"] },
    { id: "ollama", name: "Ollama", model: "llama3, on this machine", verbs: ["Grazing", "Chewing it over", "Running locally", "Warming the GPU"] },
  ];
  // There and back again: Claude, DeepSeek, Gemini, Ollama, Gemini, DeepSeek…
  const ROUTE = [0, 1, 2, 3, 2, 1];
  const THOUGHTS = {
    "os.js": ["I'll tighten how windows take focus.", "The terminal could use one more command.", "The dock should bounce a little nicer.", "Making the boot log a touch quicker."],
    "tools.js": ["One of the tools trips on an edge case. Fixing it.", "The diff tool can be smarter about whitespace."],
    "php": ["Teaching the pretend PHP another builtin.", "Drush deserves one more command.", "Tinker's dump output can look more like PsySH."],
    "css": ["Now the styles, so this holds up on a phone.", "Nudging the CRT glow.", "Evening out the spacing in the windows."],
    "analytics.js": ["Counting one more thing, without counting people."],
    any: ["Small refactor: one helper instead of three.", "I'll leave a comment so future me understands this.", "Reading before writing."],
  };

  function drawSprite(svg, { colours, rows }) {
    const width = Math.max(...rows.map((r) => r.length));
    svg.setAttribute("viewBox", `0 0 ${width} ${rows.length}`);
    svg.innerHTML = rows.flatMap((row, y) => [...row].map((c, x) => (colours[c] ? `<rect x="${x}" y="${y}" width="1" height="1" fill="${colours[c]}"/>` : ""))).join("");
  }

  // The site's own code, as it is served: the scripts and the stylesheet.
  async function agentFiles() {
    const urls = new Set([...document.querySelectorAll('script[src*="/assets/"], link[rel="stylesheet"][href*="/assets/"], link[data-php]')].map((el) => el.src || el.href));
    const files = [];
    for (const url of urls) {
      try {
        const res = await fetch(url);
        const lines = res.ok ? (await res.text()).split("\n") : [];
        const path = new URL(url).pathname.replace(/^.*?(assets\/)/, "$1").replace(/\.[0-9a-f]{8}(\.\w+)$/, "$1");
        if (lines.length > 60) files.push({ path, lines });
      } catch {}
    }
    return files;
  }

  let agentArm = null;
  function agent() {
    const win = document.getElementById("agent");
    const body = win?.querySelector("[data-agent]");
    if (!body) return;
    const log = body.querySelector("[data-agent-log]");
    const spin = body.querySelector("[data-agent-spin]");
    const sprite = body.querySelector("[data-agent-sprite]");
    const pick = (list) => list[randomBelow(list.length)];
    const between = (a, b) => a + randomBelow(b - a + 1);
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    // Work only while someone can see it.
    const wait = async (ms) => {
      await sleep(ms);
      while (win.hidden || document.hidden) await sleep(500);
    };

    let route = 0;
    let current = MODELS[0];
    const become = (m, animate = true) => {
      current = m;
      body.dataset.model = m.id;
      body.querySelector("[data-agent-name]").textContent = m.name;
      body.querySelector("[data-agent-model]").textContent = m.model;
      drawSprite(sprite, SPRITES[m.id]);
      if (animate && !reduced) {
        sprite.classList.remove("is-swapping");
        void sprite.getBoundingClientRect();
        sprite.classList.add("is-swapping");
      }
    };
    become(current, false);

    const say = (text, cls) => {
      const stick = log.scrollHeight - log.scrollTop - log.clientHeight < 48;
      const p = document.createElement("p");
      p.textContent = text;
      if (cls) p.className = cls;
      log.append(p);
      while (log.childElementCount > 300) log.firstElementChild.remove();
      if (stick) log.scrollTop = log.scrollHeight;
    };
    const stream = async (rows) => {
      for (const [text, cls] of rows) {
        say(text, cls);
        await wait(between(30, 70));
      }
    };

    let tokens = 0;
    const think = async (ms) => {
      const verb = pick(current.verbs);
      const glyphs = reduced ? ["✻"] : ["·", "✢", "✳", "✶", "✻", "✽", "✻", "✶", "✳", "✢"];
      const began = performance.now();
      let i = 0;
      const tick = () => {
        tokens += between(3, 40);
        const secs = Math.round((performance.now() - began) / 1000);
        const k = tokens >= 1000 ? `${(tokens / 1000).toFixed(1)}k` : tokens;
        spin.innerHTML = "";
        spin.append(`${glyphs[i++ % glyphs.length]} ${verb}… `);
        const meta = document.createElement("span");
        meta.textContent = `(${secs}s · ↑ ${k} tokens · esc to interrupt)`;
        spin.append(meta);
      };
      tick();
      const timer = setInterval(tick, 120);
      await wait(ms);
      clearInterval(timer);
      spin.textContent = "";
    };

    const pad = (n) => String(n).padStart(4);
    const clip = (line) => (line.length > 96 ? `${line.slice(0, 95)}…` : line);
    function hunk({ path, lines }) {
      let at = between(2, lines.length - 24);
      // Start at the top of something: a comment, a declaration or a rule.
      for (let i = 0; i < 40 && !/^\s*(\/\/|\/\*|function|const|let|async|[.#a-z][\w.#:() -]*\{)/.test(lines[at]); i++) at += 1;
      const dels = pick([0, 0, 1, 1, 2]);
      const adds = between(4, 12);
      const rows = [];
      for (let n = Math.max(0, at - 2); n < at; n++) rows.push([`${pad(n + 1)}   ${clip(lines[n])}`, "is-ctx"]);
      for (let n = at; n < at + dels; n++) rows.push([`${pad(n + 1)} - ${clip(lines[n])}`, "is-del"]);
      for (let n = at + dels; n < at + dels + adds; n++) rows.push([`${pad(n + 1 - dels)} + ${clip(lines[n])}`, "is-add"]);
      rows.push([`${pad(at + adds + 1)}   ${clip(lines[at + dels + adds] ?? "")}`, "is-ctx"]);
      const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
      return { rows, adds, dels, summary: `  ⎿  Updated ${path} with ${plural(adds, "addition")}${dels ? ` and ${plural(dels, "removal")}` : ""}` };
    }
    const thoughtFor = (path) => {
      const key = Object.keys(THOUGHTS).find((k) => path.includes(k.replace(/^css$/, ".css")));
      return pick(key ? THOUGHTS[key].concat(THOUGHTS.any) : THOUGHTS.any);
    };

    let changed = { files: new Set(), adds: 0, dels: 0 };
    async function run() {
      const files = await agentFiles();
      if (!files.length) return say("Nothing to work on. Rather restful.", "is-result");
      const names = [...new Set(files.flatMap((f) => [...f.lines.join("\n").matchAll(/function (\w{4,})/g)].map((m) => m[1])))];
      say("> make the portfolio better while nobody's looking", "is-user");
      await think(2200);
      let scene = 0;
      for (;;) {
        const file = pick(files);
        scene += 1;
        if (scene % 5 === 0) {
          route = (route + 1) % ROUTE.length;
          const next = MODELS[ROUTE[route]];
          say(`> /model ${next.id}`, "is-user");
          await wait(400);
          become(next);
          say(`  ⎿  Set model to ${next.name} (${next.model})`, "is-result");
          await think(between(1200, 2200));
        }
        say(`⏺ ${thoughtFor(file.path)}`, "is-say");
        await wait(500);
        const roll = randomBelow(10);
        if (roll < 2 && names.length) {
          const name = pick(names);
          const hits = files.reduce((n, f) => n + f.lines.filter((l) => l.includes(name)).length, 0);
          say(`⏺ Search(pattern: "${name}", path: "assets")`, "is-tool");
          await think(between(700, 1500));
          say(`  ⎿  Found ${hits} line${hits === 1 ? "" : "s"}`, "is-result");
        } else if (roll < 4) {
          say(`⏺ Read(${file.path})`, "is-tool");
          await think(between(700, 1500));
          say(`  ⎿  Read ${file.lines.length} lines`, "is-result");
        }
        const h = hunk(file);
        say(`⏺ Update(${file.path})`, "is-tool");
        await think(between(1200, 3200));
        say(h.summary, "is-result");
        await stream(h.rows);
        changed.files.add(file.path);
        changed.adds += h.adds;
        changed.dels += h.dels;
        if (scene % 4 === 0) {
          const check = pick([
            ["statico check --strict", `✓ 5 page(s), ${between(130, 150)} link(s) checked: 0 error(s), 0 warning(s)`],
            ["statico build", `⚡ Built 5 page(s) (1 from markdown) into _site in ${between(38, 64)} ms`],
            ["git diff --stat", `${changed.files.size} files changed, ${changed.adds} insertions(+), ${changed.dels} deletions(-)`],
          ]);
          say(`⏺ Bash(${check[0]})`, "is-tool");
          await think(between(900, 2000));
          say(`  ⎿  ${check[1]}`, "is-result");
        }
        if (scene % 7 === 0) {
          say("⏺ Update Todos", "is-tool");
          await wait(300);
          const todos = [...new Set([thoughtFor(file.path), pick(THOUGHTS.any), thoughtFor(pick(files).path)])];
          await stream(todos.map((t, i) => [`  ${i === 0 ? "☒" : "☐"} ${t}`, i === 0 ? "is-done" : "is-todo"]));
        }
        await wait(between(600, 1400));
      }
    }

    let started = false;
    const KEY = "os.agent.closed";
    let closes = 0;
    try { closes = Number(sessionStorage.getItem(KEY)) || 0; } catch {}
    const pop = () => {
      if (!win.hidden || phone()) return;
      open("agent", { focus: false, via: "popup" });
      // The first time, tuck it into the bottom right, clear of the dock.
      if (!win.dataset.tucked) {
        win.dataset.tucked = "1";
        const box = win.offsetParent?.getBoundingClientRect();
        const dockTop = document.querySelector(".dock")?.getBoundingClientRect().top ?? innerHeight;
        if (box) {
          win.style.left = `${Math.max(8, box.width - win.offsetWidth - 20)}px`;
          win.style.top = `${Math.max(8, dockTop - box.top - win.offsetHeight - 16)}px`;
        }
      }
    };
    win.addEventListener("os:close", () => {
      closes += 1;
      try { sessionStorage.setItem(KEY, closes); } catch {}
      if (closes === 1) setTimeout(pop, 60000);
    });
    // However it opens, the agent starts working the first time it is seen.
    const begin = () => {
      if (!win.hidden && !started) {
        started = true;
        run();
      }
    };
    new MutationObserver(begin).observe(win, { attributes: true, attributeFilter: ["hidden"] });
    begin();
    agentArm = () => {
      if (closes < 2) setTimeout(pop, 6000);
    };
  }

  // ---- Terminal
  function terminal() {
    const term = document.querySelector("[data-terminal]");
    if (!term) return;
    const line = document.createElement("form");
    line.className = "terminal__line";
    line.innerHTML = '<label for="term-in">$</label><input id="term-in" autocomplete="off" spellcheck="false" aria-label="Terminal command">';
    term.append(line);
    const input = line.querySelector("input");
    const say = (text, cls) => {
      const p = document.createElement("p");
      p.textContent = text;
      if (cls) p.className = cls;
      line.before(p);
      term.scrollTop = term.scrollHeight;
    };
    const book = document.querySelector(".menubar__book")?.href;
    // Everything `open` knows, by the names a visitor would type.
    const targets = {
      about: "profile", me: "profile", profile: "profile", services: "services",
      experience: "experience", mail: "contact", contact: "contact", browser: "browser",
      terminal: "terminal", projects: "projects", posts: "posts", writing: "posts",
      adwebdev: "info-adwebdev", berth: "info-berth", tools: "tools",
      keygen: "tool-keygen", stopwatch: "tool-stopwatch", chmod: "tool-chmod",
      status: "tool-status", http: "tool-status", keycode: "tool-keycode",
      radio: "tool-radio", nato: "tool-radio", tinker: "tool-tinker", drush: "tool-drush",
      diff: "tool-diff", ascii: "tool-ascii", compose: "tool-compose", hash: "tool-hash", lorem: "tool-lorem",
      faker: "tool-person", person: "tool-person", colour: "tool-colour", color: "tool-colour", colours: "tool-colour",
      agent: "agent", ai: "agent", claude: "agent",
    };
    const statico = document.querySelector('.file[data-kind="browser"][href*="/statico/"]');
    const playground = document.querySelector('.file[data-kind="browser"][href*="statico-playground"]');

    const neofetch = () => {
      const box = document.createElement("div");
      box.className = "neofetch";
      const mark = document.querySelector(".menubar__mark svg")?.cloneNode(true);
      if (mark) {
        mark.removeAttribute("role");
        mark.removeAttribute("aria-label");
        mark.setAttribute("aria-hidden", "true");
        box.append(mark);
      }
      const years = new Date().getFullYear() - 2011;
      const services = document.querySelectorAll(".config__row").length;
      const roles = document.querySelectorAll(".log__row").length;
      const facts = [
        ["OS", "adwebdev os"],
        ["Host", "Brussels, Belgium"],
        ["Kernel", "PHP (Drupal, Laravel)"],
        ["Uptime", `${years} years, since Drupal 7`],
        ["Packages", `${services} services, ${roles} roles`],
        ["Shell", "Linux, Docker"],
        ["WM", "Statico (Rust)"],
        ["Terminal", "you're in it"],
        ["Camera", "Minolta SR-1, 35 mm film"],
        ["Resolution", `${screen.width}x${screen.height}`],
      ];
      const list = document.createElement("dl");
      const head = document.createElement("p");
      head.className = "neofetch__user";
      head.innerHTML = "<span>adriano</span>@<span>adwebdev</span>";
      list.append(head);
      for (const [k, v] of facts) {
        const row = document.createElement("div");
        const dt = document.createElement("dt");
        const dd = document.createElement("dd");
        dt.textContent = k;
        dd.textContent = v;
        row.append(dt, dd);
        list.append(row);
      }
      const swatches = document.createElement("p");
      swatches.className = "neofetch__swatches";
      swatches.setAttribute("aria-hidden", "true");
      for (let i = 0; i < 6; i++) swatches.append(document.createElement("span"));
      list.append(swatches);
      box.append(list);
      line.before(box);
      term.scrollTop = term.scrollHeight;
      return null;
    };
    const commands = {
      help: () => "help, ls, open <name>, whoami, neofetch, uuid, php artisan tinker, drush, book, date, screensaver, clear",
      ls: () => "About Me  Services  Experience  Mail  Browser  Terminal  Projects/  Posts/  Tools/",
      uuid: () => crypto.randomUUID?.() || "uuid: needs a secure (https) page.",
      whoami: () => "Adriano Dias. Web developer, Brussels. Drupal, Laravel, static sites, private AI.",
      neofetch,
      date: () => new Intl.DateTimeFormat("en-GB", { dateStyle: "full", timeStyle: "short", timeZone: "Europe/Brussels" }).format(new Date()),
      book: () => {
        track("book-call", { from: "terminal" });
        if (book) browse(book);
        return "Opening the booking page…";
      },
      screensaver: () => {
        if (!saver) return "screensaver: not available here.";
        setTimeout(saver, 400);
        return "Starting the screensaver. Move or press anything to wake it.";
      },
      clear: () => {
        term.querySelectorAll(":scope > p, :scope > .neofetch").forEach((n) => n.remove());
        return null;
      },
      sudo: () => "Nice try.",
      rm: () => "Everything here is in git. Nothing is lost.",
    };
    line.addEventListener("submit", (e) => {
      e.preventDefault();
      const raw = input.value.trim();
      input.value = "";
      if (!raw) return;
      say(`$ ${raw}`, "is-cmd");
      const [cmd, ...rest] = raw.split(/\s+/);
      const known = Object.hasOwn(commands, cmd) || ["drush", "vendor/bin/drush", "php", "composer", "open", "cat"].includes(cmd);
      if (cmd !== "open" && cmd !== "cat") track("terminal-command", { command: known ? cmd : "unknown" });
      if (cmd === "drush" || cmd === "vendor/bin/drush") {
        say("Opening Drush…");
        open("tool-drush");
        drushRun?.(raw);
        return;
      }
      if (cmd === "php") {
        const what = rest.join(" ");
        if (what === "-v" || what === "--version") say("PHP 8.4.0 (cli) (pretend: it runs in your browser)");
        else if (what === "-a" || what.startsWith("artisan tinker")) { say("Opening Tinker…"); open("tool-tinker"); }
        else if (what.startsWith("artisan")) say("Only tinker is installed here: php artisan tinker");
        else say("php: try php artisan tinker, or php -v");
        return;
      }
      if (cmd === "composer") { say("Nothing to install. That is rather the point of a static site."); return; }
      if (cmd === "open" || cmd === "cat") {
        const name = rest.join(" ").toLowerCase().replace(/\/$/, "").replace(/\.app$/, "");
        const found = Object.hasOwn(targets, name) || (name === "statico" && statico) || (name === "playground" && playground);
        track("terminal-command", { command: "open", target: found ? name : "unknown" });
        if (name === "statico" && statico) { say("Opening Statico…"); browse(statico.href); }
        else if (name === "playground" && playground) { say("Opening the Statico Playground…"); browse(playground.href); }
        else if (targets[name]) { say(`Opening ${rest.join(" ")}…`); targets[name] === "browser" ? browse() : open(targets[name]); }
        else say(`open: no such file: ${rest.join(" ") || "(nothing)"}. Try ls.`);
        return;
      }
      const out = Object.hasOwn(commands, cmd) ? commands[cmd]() : `${cmd}: command not found. Try help.`;
      if (out) say(out);
      blip(740, 20);
    });
  }

  // ---- 404: the restart curtain. Any key goes back to the desktop.
  function panic() {
    const page = document.querySelector("[data-panic]");
    if (!page) return false;
    const path = page.querySelector("[data-panic-path]");
    if (path) path.textContent = decodeURIComponent(location.pathname);
    track("not-found", { path: location.pathname });
    const reboot = page.querySelector("[data-reboot]");
    // Inside the desktop's browser, restarting means the whole desktop.
    const framed = window.top !== window.self;
    if (framed && reboot) reboot.target = "_top";
    addEventListener("keydown", (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.key === "Tab" || e.key === "Shift") return;
      if (reboot) (framed ? window.top : window).location.href = reboot.href;
    });
    return true;
  }

  function start() {
    root.classList.add("os");
    clock();
    switches();
    if (panic()) return;
    if (!document.querySelector("[data-desktop]")) return;
    windowsUp();
    files();
    dockUp();
    browserUp();
    compose();
    tools();
    tinker();
    drush();
    screensaver();
    terminal();
    dockState();
    agent();
    boot(() => agentArm?.());
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
