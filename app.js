(() => {
  const CATS = [["sub18", "Sub18"], ["sub20", "Sub20"], ["sub23", "Sub23"], ["absolut", "Absolut"]];
  const CAT_LABEL = Object.fromEntries(CATS);
  const LS = "agendaAtletismeCat:v1";
  const saved = JSON.parse(localStorage.getItem(LS) || "{}");
  const state = {
    cats: saved.cats || [],          // buit = totes
    mods: saved.mods || [],          // buit = totes
    unknown: !!saved.unknown,
    onlyHorari: false,
    q: "",
    lastSeen: saved.lastSeen || null,
    showPast: false,
    tab: "agenda",
  };
  const persist = () => localStorage.setItem(LS, JSON.stringify({
    cats: state.cats, mods: state.mods, unknown: state.unknown, lastSeen: state.lastSeen,
  }));

  let EVENTS = [], CHANGES = [], UPDATED = null, pendingSeen = null;
  const $ = (s) => document.querySelector(s);
  const esc = (s = "") => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Madrid" });
  const d = (iso) => new Date(iso + "T12:00:00");
  const WD = ["dg", "dl", "dt", "dc", "dj", "dv", "ds"];
  const MONTHS = ["gener", "febrer", "març", "abril", "maig", "juny", "juliol", "agost", "setembre", "octubre", "novembre", "desembre"];
  const MONTHS_DE = ["de gener", "de febrer", "de març", "d’abril", "de maig", "de juny", "de juliol", "d’agost", "de setembre", "d’octubre", "de novembre", "de desembre"];

  function ago(iso) {
    const s = (Date.now() - Date.parse(iso)) / 1000;
    if (s < 90) return "ara mateix";
    if (s < 3600) return `fa ${Math.round(s / 60)} min`;
    if (s < 86400) return `fa ${Math.round(s / 3600)} h`;
    const n = Math.round(s / 86400);
    return n === 1 ? "ahir" : `fa ${n} dies`;
  }

  // ---------- Filtres ----------
  function matches(e) {
    if (e.cats.length) {
      if (state.cats.length && !e.cats.some((c) => state.cats.includes(c))) return false;
    } else if (!state.unknown) return false;
    if (state.mods.length && !e.modalitats.some((m) => state.mods.includes(m))) return false;
    if (state.onlyHorari && !e.hasHorari) return false;
    if (state.q) {
      const hay = (e.title + " " + (e.venue || "") + " " + (e.address || "")).toLowerCase();
      if (!state.q.split(/\s+/).every((w) => hay.includes(w))) return false;
    }
    return true;
  }

  const chip = (label, pressed) => `<button class="chip" aria-pressed="${pressed}">${esc(label)}</button>`;

  function renderChips() {
    $("#catChips").innerHTML = CATS.map(([k, l]) => chip(l, state.cats.includes(k))).join("");
    [...$("#catChips").children].forEach((b, i) => (b.onclick = () => toggle(state.cats, CATS[i][0])));
    const mods = [...new Set(EVENTS.flatMap((e) => e.modalitats))].sort((a, b) => a.localeCompare(b, "ca"));
    $("#modChips").innerHTML = mods.map((m) => chip(m, state.mods.includes(m))).join("");
    [...$("#modChips").children].forEach((b, i) => (b.onclick = () => toggle(state.mods, mods[i])));
  }
  function toggle(arr, v) {
    const i = arr.indexOf(v);
    i >= 0 ? arr.splice(i, 1) : arr.push(v);
    persist(); renderChips(); render();
  }

  // ---------- Agenda ----------
  function card(e, newIds) {
    const dt = d(e.start);
    const multi = e.end !== e.start ? `–${d(e.end).getDate()}` : "";
    const past = e.end < today;
    const horari = e.links.find((l) => l.type === "horari") || e.links.find((l) => l.type === "directe");
    const status = horari
      ? `<a class="status ok" href="${esc(horari.url)}" target="_blank" rel="noopener" title="${esc(horari.text)}">Horari publicat</a>`
      : past ? "<span></span>" : `<span class="status wait">Horari pendent</span>`;
    const docs = e.links.filter((l) => l !== horari)
      .map((l) => `<a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.text)}</a>`).join("");
    const cats = e.cats.length
      ? `<span class="cats">${e.cats.map((c) => `<span class="cat t-${c}">${CAT_LABEL[c]}</span>`).join("")}</span>` : "";
    return `<article class="ev${past ? " past" : ""}">
      <div class="date"><b>${dt.getDate()}${multi}</b><small>${WD[dt.getDay()]}</small></div>
      <h3><a href="${esc(e.url)}" target="_blank" rel="noopener">${esc(e.title)}</a>${newIds.has(e.id) ? '<span class="new">Nova</span>' : ""}</h3>
      ${status}
      <div class="meta">
        ${cats}
        <span>${e.modalitats.map(esc).join(" · ")}</span>
        ${e.venue ? `<span>${esc(e.venue)}${e.time ? " · " + e.time + " h" : ""}</span>` : ""}
      </div>
      ${docs ? `<div class="docs">${docs}</div>` : ""}
    </article>`;
  }

  function renderAgenda() {
    const newIds = new Set(CHANGES.filter((c) => c.type === "nova" && isUnread(c)).map((c) => c.id));
    const list = EVENTS.filter(matches);
    const past = list.filter((e) => e.end < today);
    const upcoming = list.filter((e) => e.end >= today);
    const shown = state.showPast ? [...past, ...upcoming] : upcoming;
    let html = "";
    if (past.length) html += `<button class="more" id="togglePast">${state.showPast ? "Amaga" : "Mostra"} les competicions passades (${past.length})</button>`;
    if (!shown.length) html += `<p class="empty">No hi ha competicions amb aquests filtres.</p>`;
    let curMonth = "";
    for (const e of shown) {
      const m = e.start.slice(0, 7);
      if (m !== curMonth) {
        curMonth = m;
        const n = shown.filter((x) => x.start.startsWith(m)).length;
        html += `<h2 class="month">${MONTHS[+m.slice(5) - 1]} ${m.slice(0, 4)} <span>${n} ${n === 1 ? "competició" : "competicions"}</span></h2>`;
      }
      html += card(e, newIds);
    }
    $("#tab-agenda").innerHTML = html;
    const tp = $("#togglePast");
    if (tp) tp.onclick = () => { state.showPast = !state.showPast; renderAgenda(); };
  }

  // ---------- Novetats ----------
  const isUnread = (c) => !state.lastSeen || c.at > state.lastSeen;
  const CH = {
    nova: "Nova competició",
    horari: "Horari publicat",
    document: "Nou document",
    data: "Canvi de data",
    lloc: "Canvi de lloc",
    eliminada: "Retirada del calendari",
  };
  function relevantChanges() {
    const byId = new Map(EVENTS.map((e) => [e.id, e]));
    return CHANGES.filter((c) => matches(byId.get(c.id) || { ...c, links: [], hasHorari: false, venue: "" }));
  }
  function renderNews() {
    const list = relevantChanges();
    const byId = new Map(EVENTS.map((e) => [e.id, e]));
    if (!list.length) {
      $("#tab-news").innerHTML = `<p class="empty">Encara no hi ha novetats amb aquests filtres.<br>Aquí apareixeran les competicions noves, els horaris publicats i els canvis de data o lloc.</p>`;
      return;
    }
    $("#tab-news").innerHTML = `<ul class="news">${list.slice(0, 150).map((c) => {
      const e = byId.get(c.id);
      const date = d(c.start);
      const detail = c.detail ? " · " + esc(c.detail.replace(/(\d{4})-(\d\d)-(\d\d)/g, (_, y, m, dd) => `${+dd}/${+m}`)) : "";
      const title = e ? `<a class="t" href="${esc(e.url)}" target="_blank" rel="noopener">${esc(c.title)}</a>` : `<span class="t">${esc(c.title)}</span>`;
      return `<li class="${isUnread(c) ? "unread" : ""}">
        <span class="what ${c.type}">${CH[c.type] || esc(c.type)}</span>
        <span class="when">${ago(c.at)}</span>
        ${title}
        <span class="det">${date.getDate()} ${MONTHS_DE[date.getMonth()]} · ${(c.cats || []).map((k) => CAT_LABEL[k]).join(", ") || "sense categoria indicada"}${detail}</span>
      </li>`;
    }).join("")}</ul>`;
  }
  function updateBadge() {
    const n = relevantChanges().filter(isUnread).length;
    const b = $("#newsBadge");
    b.hidden = !n || state.tab === "news";
    b.textContent = n > 99 ? "99+" : n;
  }

  // ---------- Calendari ----------
  function renderCal() {
    const base = new URL("cal/", location.href);
    const rows = [["totes", "Totes les categories"], ...CATS.map(([k, l]) => [k, "Només " + l])];
    $("#tab-cal").innerHTML = `<div class="calbox">
      <h2>Afegeix l’agenda al teu calendari</h2>
      <p>Subscriu-t’hi i les competicions apareixeran soles a Google Calendar o al calendari de l’iPhone. S’actualitza automàticament; quan es publiqui l’horari el veuràs a la descripció de l’esdeveniment.</p>
      ${rows.map(([k, l]) => {
        const https = new URL(k + ".ics", base).href;
        const webcal = https.replace(/^https?:/, "webcal:");
        const google = "https://calendar.google.com/calendar/render?cid=" + encodeURIComponent(webcal);
        return `<div class="calrow"><b>${l}</b>
          <a class="btn primary" href="${esc(webcal)}">iPhone / Mac</a>
          <a class="btn" href="${esc(google)}" target="_blank" rel="noopener">Google Calendar</a>
          <button class="btn" data-copy="${esc(https)}">Copia l’enllaç</button></div>`;
      }).join("")}
    </div>
    <div class="calbox">
      <h2>Instal·la-la com una app</h2>
      <p><b>iPhone:</b> obre aquesta web a Safari, toca Comparteix i tria «Afegeix a la pantalla d’inici».</p>
      <p><b>Android:</b> a Chrome, obre el menú ⋮ i tria «Afegeix a la pantalla d’inici».</p>
    </div>`;
    $("#tab-cal").querySelectorAll("[data-copy]").forEach((b) => (b.onclick = async () => {
      try { await navigator.clipboard.writeText(b.dataset.copy); b.textContent = "Copiat"; }
      catch { prompt("Copia aquest enllaç:", b.dataset.copy); }
    }));
  }

  // ---------- Pestanyes ----------
  function setTab(t) {
    state.tab = t;
    document.querySelectorAll(".tabs button").forEach((b) => b.setAttribute("aria-selected", b.dataset.tab === t));
    ["agenda", "news", "cal"].forEach((k) => ($("#tab-" + k).hidden = k !== t));
    $(".filters").hidden = t === "cal";
    render();
    if (t === "news" && CHANGES.length) {
      // Es marquen com a llegides en sortir de la pestanya, perquè es vegin destacades mentre es llegeixen.
      pendingSeen = CHANGES[0].at;
    } else if (pendingSeen) {
      state.lastSeen = pendingSeen; pendingSeen = null; persist(); render();
    }
    window.scrollTo(0, 0);
  }
  window.addEventListener("pagehide", () => { if (pendingSeen) { state.lastSeen = pendingSeen; persist(); } });

  function render() {
    if (state.tab === "agenda") renderAgenda();
    if (state.tab === "news") renderNews();
    if (state.tab === "cal") renderCal();
    updateBadge();
  }

  async function load() {
    const bust = "?t=" + Math.floor(Date.now() / 300000);
    const [ev, ch] = await Promise.all([
      fetch("data/events.json" + bust).then((r) => r.json()),
      fetch("data/changes.json" + bust).then((r) => r.json()).catch(() => []),
    ]);
    EVENTS = ev.events; UPDATED = ev.updated; CHANGES = ch;
    $("#updated").textContent = " · actualitzat " + ago(UPDATED);
    renderChips(); render();
  }

  document.querySelectorAll(".tabs button").forEach((b) => (b.onclick = () => setTab(b.dataset.tab)));
  $("#q").oninput = (e) => { state.q = e.target.value.trim().toLowerCase(); render(); };
  $("#onlyHorari").onchange = (e) => { state.onlyHorari = e.target.checked; render(); };
  $("#unknown").checked = state.unknown;
  $("#unknown").onchange = (e) => { state.unknown = e.target.checked; persist(); render(); };

  load().catch((err) => {
    $("#tab-agenda").innerHTML = `<p class="empty">No s’han pogut carregar les dades. Torna-ho a provar.</p>`;
    console.error(err);
  });
  setInterval(() => load().catch(() => {}), 10 * 60 * 1000);
})();
