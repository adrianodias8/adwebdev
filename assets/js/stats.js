// The Stats page: draws stats.json, which the deploy writes from Umami once
// an hour (.github/scripts/umami-stats.py). Only totals and counts, so the
// page never talks to Umami itself.
(() => {
  const page = document.querySelector("[data-stats]");
  if (!page) return;
  const $ = (sel) => page.querySelector(sel);
  const number = new Intl.NumberFormat("en-GB");
  const names = {
    agent: "The agent", projects: "Projects", posts: "Posts", tools: "Tools",
    ...Object.fromEntries([...page.querySelectorAll("[data-stats-names] li")].map((li) => [li.dataset.id, li.textContent.trim()])),
  };
  const countries = new Intl.DisplayNames(["en"], { type: "region" });

  const duration = (s) => (s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`);
  const label = (id) => names[id] || id.replace(/^(tool|info)-/, "").replace(/^\w/, (c) => c.toUpperCase());

  // Text bars, in the CRT's own characters.
  function bars(list, rows) {
    const max = Math.max(1, ...rows.map((r) => r.n));
    list.replaceChildren(...rows.map((r) => {
      const li = document.createElement("li");
      const name = document.createElement("span");
      name.className = "stats__name";
      name.textContent = r.name;
      const bar = document.createElement("span");
      bar.className = "stats__bar";
      bar.style.setProperty("--w", (r.n / max).toFixed(3));
      const n = document.createElement("span");
      n.className = "stats__n";
      n.textContent = number.format(r.n);
      li.append(name, bar, n);
      return li;
    }));
    if (!rows.length) list.outerHTML = '<p class="stats__none">Nothing counted yet.</p>';
  }

  // Visits per day as columns, page views behind them.
  function chart(box, days) {
    if (!days.length) return (box.innerHTML = '<p class="stats__none">Nothing counted yet.</p>');
    const max = Math.max(1, ...days.map((d) => d.pageviews));
    const w = 100 / days.length;
    const cols = days.map((d, i) => {
      const x = (i * w).toFixed(2);
      const pv = (d.pageviews / max) * 100;
      const v = (d.visits / max) * 100;
      return `<g><title>${d.day}: ${d.visits} visits, ${d.pageviews} page views</title>`
        + `<rect class="is-views" x="${x}" y="${100 - pv}" width="${(w * 0.8).toFixed(2)}" height="${pv}"/>`
        + `<rect class="is-visits" x="${x}" y="${100 - v}" width="${(w * 0.8).toFixed(2)}" height="${v}"/></g>`;
    }).join("");
    const fmt = (day) => new Date(`${day}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
    box.innerHTML = `<svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="Visits per day">${cols}</svg>`
      + `<p class="stats__axis"><span>${fmt(days[0].day)}</span><span><i class="is-visits"></i> visits <i class="is-views"></i> page views</span><span>${fmt(days.at(-1).day)}</span></p>`;
  }

  function draw(s) {
    $("[data-stats-empty]").hidden = true;
    $("[data-stats-body]").hidden = false;
    const updated = new Date(s.updated);
    const since = new Date(`${s.since}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
    $("[data-stats-updated]").textContent = `Since ${since}; updated ${updated.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}.`;
    for (const dd of page.querySelectorAll("[data-total]")) {
      const v = s.totals[dd.dataset.total] ?? 0;
      dd.textContent = dd.dataset.total === "avg_visit_seconds" ? duration(v) : number.format(v);
    }
    for (const dd of page.querySelectorAll("[data-counter]")) dd.textContent = number.format(s.counters[dd.dataset.counter] ?? 0);
    chart($("[data-stats-days]"), s.days);
    bars($("[data-stats-apps]"), s.apps.map((a) => ({ name: label(a.app), n: a.opens })));
    bars($("[data-stats-posts]"), s.posts.map((p) => ({ name: names[p.path] || p.path, n: p.views })));
    bars($("[data-stats-countries]"), s.countries.map((c) => ({ name: countries.of(c.code) || c.code, n: c.visitors })));
  }

  const home = document.querySelector(".web-header__mark")?.href || "/";
  fetch(new URL("stats.json", home), { cache: "no-cache" })
    .then((r) => (r.ok ? r.json() : null))
    .then((s) => s?.totals && draw(s))
    .catch(() => {});
})();
