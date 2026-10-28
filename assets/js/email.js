// Email links copy the address instead of opening a mail app, which many
// visitors don't have set up. Without JavaScript they stay mailto links.
(() => {
  const status = document.createElement("p");
  status.className = "visually-hidden";
  status.setAttribute("role", "status");
  document.body.append(status);

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  }

  // Say what happened on the control itself for a moment, and to screen readers.
  function show(el, ok, what, fallback) {
    el.dataset.label ??= el.textContent;
    el.textContent = ok ? "Copied" : fallback;
    status.textContent = ok ? `${what} copied to the clipboard.` : `Couldn't copy. ${fallback}`;
    clearTimeout(el.copyTimer);
    el.copyTimer = setTimeout(() => (el.textContent = el.dataset.label), ok ? 1600 : 4000);
  }

  addEventListener("click", async (e) => {
    const a = e.target.closest?.('a[href^="mailto:"]');
    if (!a) return;
    e.preventDefault();
    const address = decodeURIComponent(a.href.slice(7).split("?")[0]);
    show(a, await copyText(address), address, address);
  });

  window.clipboard = { copyText, show };
})();
