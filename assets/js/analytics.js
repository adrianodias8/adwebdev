// Analytics: Umami, cookieless, counting on the live site only (the tracker's
// data-domains), so local builds send nothing. Events never carry what a
// visitor types: only which app, button or command, and where it was used.
// os.js adds the desktop's own events through window.analytics.
(() => {
  const framed = window.top !== window.self;
  const queue = [];
  const send = (name, data) => window.umami.track(name, data);

  // Events wait here while the tracker loads; it is async so it never holds
  // the desktop up.
  function track(name, data) {
    try {
      if (window.umami?.track) send(name, data);
      else if (queue.length < 50) queue.push([name, data]);
    } catch {}
  }
  document.getElementById("umami")?.addEventListener("load", () => {
    queue.splice(0).forEach(([name, data]) => track(name, data));
  });

  // Where on the page something happened, in the desktop's own terms: the
  // dock, the menu bar, the desktop, a window (by its id), or the browser.
  function where(el) {
    if (framed) return "browser";
    if (el.closest?.(".dock")) return "dock";
    if (el.closest?.(".menubar")) return "menubar";
    if (el.closest?.(".desk-icons")) return "desktop";
    const win = el.closest?.("[data-window]");
    if (win) return win.id;
    return document.body.classList.contains("web") ? "page" : "desktop";
  }

  // What the visitor last clicked, or pressed Enter in, so a window that
  // opens can say what opened it. Anything older came from the address.
  let last = { from: "url", at: 0 };
  const note = (e) => {
    if (e.type === "click" || e.key === "Enter") last = { from: where(e.target), at: performance.now() };
  };
  addEventListener("click", note, true);
  addEventListener("keydown", note, true);
  const from = () => (performance.now() - last.at < 1500 ? last.from : "url");

  // Links: a call booked, an email started, or a visitor leaving for another
  // site. Files in the folders open in the desktop's browser, so they are
  // counted there instead.
  addEventListener("click", (e) => {
    const a = e.target.closest?.("a[href]");
    if (!a || a.classList.contains("file")) return;
    const url = new URL(a.href, location.href);
    const at = where(a);
    if (url.hostname === "calendar.google.com") track("book-call", { from: at });
    else if (url.protocol === "mailto:") track("email-click", { from: at });
    else if (/^https?:$/.test(url.protocol) && url.origin !== location.origin) track("outbound", { host: url.hostname, from: at });
  }, true);

  // Tools: the first use of each in a visit, then every button pressed in
  // one (by its label, never by what is in the fields).
  const used = new Set();
  const useTool = (e) => {
    const win = e.target.closest?.(".window--tool, .window--console");
    if (!win || !e.target.closest(".app, [data-console]")) return;
    const tool = win.id.replace(/^tool-/, "");
    if (!used.has(tool)) {
      used.add(tool);
      track("use-tool", { tool });
    }
    const button = e.type === "click" && e.target.closest("button");
    if (button) track("tool-action", { tool, action: button.textContent.trim().toLowerCase().slice(0, 30) || "button" });
  };
  for (const type of ["click", "input", "keydown"]) addEventListener(type, useTool, true);

  window.analytics = { track, from };
})();
