(() => {
  const CATS = [["sub18", "Sub18"], ["sub20", "Sub20"], ["sub23", "Sub23"], ["absolut", "Absolut"]];
  const CAT_LABEL = Object.fromEntries(CATS);
  const TITLES = { agenda: "Competicions", news: "Novetats", cal: "Calendari" };
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
  const pad = (n) => String(n).padStart(2, "0");
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Madrid" });
  const d = (iso) => new Date(iso + "T12:00:00");
  const daysBetween = (a, b) => Math.round((d(b) - d(a)) / 864e5);
  const WD = ["dg", "dl", "dt", "dc", "dj", "dv", "ds"];
  const MONTHS = ["gener", "febrer", "març", "abril", "maig", "juny", "juliol", "agost", "setembre", "octubre", "novembre", "desembre"];
  const MONTHS_S = ["gen", "febr", "març", "abr", "maig", "juny", "jul", "ag", "set", "oct", "nov", "des"];
  const MONTHS_DE = ["de gener", "de febrer", "de març", "d’abril", "de maig", "de juny", "de juliol", "d’agost", "de setembre", "d’octubre", "de novembre", "de desembre"];
  const longDate = (iso) => { const x = d(iso); return `${WD[x.getDay()]} ${x.getDate()} ${MONTHS_DE[x.getMonth()]}`; };

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

  // ---------- Resum ----------
  function ring(label, p, cls = "") {
    const C = 2 * Math.PI * 21;
    return `<div class="ring ${cls}"><svg viewBox="0 0 48 48" aria-hidden="true"><circle class="trk" cx="24" cy="24" r="21"/><circle class="val" cx="24" cy="24" r="21" stroke-dasharray="${(C * Math.max(0.04, Math.min(1, p))).toFixed(1)} ${C.toFixed(1)}"/></svg><b>${label}</b></div>`;
  }

  function dash(list, upcoming) {
    if (!upcoming.length) return "";
    const next = upcoming[0];
    const left = Math.max(0, daysBetween(today, next.start));
    const nHor = upcoming.filter((e) => e.hasHorari).length;
    const in30 = upcoming.filter((e) => daysBetween(today, e.start) <= 30).length;
    const news7 = relevantChanges().filter((c) => Date.now() - Date.parse(c.at) < 7 * 864e5).length;

    // Dies amb competició (punts blancs) dels tres mesos vinents.
    const byDay = new Map();
    for (const e of list) {
      for (let t = d(e.start); t <= d(e.end); t = new Date(+t + 864e5)) {
        const k = `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`;
        if (!byDay.has(k)) byDay.set(k, e);
      }
    }
    const base = d(today);
    let months = "";
    for (let k = 0; k < 3; k++) {
      const first = new Date(base.getFullYear(), base.getMonth() + k, 1);
      const y = first.getFullYear(), m = first.getMonth();
      const n = new Date(y, m + 1, 0).getDate();
      let dots = "<span></span>".repeat((first.getDay() + 6) % 7);
      for (let day = 1; day <= n; day++) {
        const iso = `${y}-${pad(m + 1)}-${pad(day)}`;
        const cls = (iso < today ? " past" : "") + (iso === today ? " today" : "");
        const e = byDay.get(iso);
        dots += e
          ? `<button class="dot on${cls}" data-ev="${e.id}" title="${day} ${MONTHS_DE[m]}: ${esc(e.title)}" aria-label="${day} ${MONTHS_DE[m]}: ${esc(e.title)}"></button>`
          : `<span class="dot${cls}"></span>`;
      }
      months += `<div><div class="mname">${MONTHS_S[m]}</div><div class="dots">${dots}</div></div>`;
    }

    return `<div class="bento">
      <a class="card sq" href="#ev-${next.id}" data-ev="${next.id}">
        ${ring(left, 1 - left / 30)}
        <div><div class="ct">${esc(next.title)}</div>
        <div class="cs">${left === 0 ? "Avui" : left === 1 ? "Demà" : `D’aquí a ${left} dies`} · ${d(next.start).getDate()} ${MONTHS_S[d(next.start).getMonth()]}</div></div>
      </a>
      <div class="card sq">
        <div class="big">${nHor}<small>/ ${upcoming.length}</small></div>
        <div><div class="ct">Horaris publicats</div><div class="cs">de les pròximes competicions</div></div>
      </div>
      <div class="card wide">
        <div class="months">${months}</div>
        <div class="hrow">${ring(in30, in30 / 12, "sm")}
          <div><div class="ct">Pròxims 30 dies</div><div class="cs">${in30 === 1 ? "competició" : "competicions"} amb aquests filtres</div></div>
        </div>
      </div>
      <button class="card wide strip" id="goNews">
        <div><div class="ct">Novetats</div><div class="cs">Últims 7 dies</div></div>
        <div class="r"><span class="big">${news7}</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg></div>
      </button>
    </div>`;
  }

  // ---------- Agenda ----------
  function card(e, newIds) {
    const dt = d(e.start);
    const multi = e.end !== e.start;
    const past = e.end < today;
    const horari = e.links.find((l) => l.type === "horari") || e.links.find((l) => l.type === "directe");
    const status = horari
      ? `<a class="status ok" href="${esc(horari.url)}" target="_blank" rel="noopener" title="${esc(horari.text)}">Horari publicat</a>`
      : past ? "" : `<span class="status wait">Horari pendent</span>`;
    const docs = e.links.filter((l) => l !== horari)
      .map((l) => `<a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.text)}</a>`).join("");
    return `<article class="card ev${past ? " past" : ""}" id="ev-${e.id}">
      <div class="day${horari ? " ok" : ""}${multi ? " multi" : ""}"><b>${dt.getDate()}${multi ? "–" + d(e.end).getDate() : ""}</b><small>${WD[dt.getDay()]}</small></div>
      <div>
        <h3><a href="${esc(e.url)}" target="_blank" rel="noopener">${esc(e.title)}</a>${newIds.has(e.id) ? '<span class="new">Nova</span>' : ""}</h3>
        ${e.venue ? `<p class="where">${esc(e.venue)}${e.time ? " · " + e.time + " h" : ""}</p>` : ""}
        <div class="tags">
          ${e.cats.map((c) => `<span class="tag cat t-${c}">${CAT_LABEL[c]}</span>`).join("")}
          ${e.modalitats.map((m) => `<span class="tag mod">${esc(m)}</span>`).join("")}
        </div>
        ${status || docs ? `<div class="evfoot">${status}${docs}</div>` : ""}
      </div>
    </article>`;
  }

  function goTo(id) {
    const el = document.getElementById("ev-" + id);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.add("flash");
    setTimeout(() => el.classList.remove("flash"), 1600);
  }

  function renderAgenda() {
    const newIds = new Set(CHANGES.filter((c) => c.type === "nova" && isUnread(c)).map((c) => c.id));
    const list = EVENTS.filter(matches);
    const past = list.filter((e) => e.end < today);
    const upcoming = list.filter((e) => e.end >= today);
    const shown = state.showPast ? [...past, ...upcoming] : upcoming;
    let html = dash(list, upcoming);
    if (!shown.length) html += `<p class="empty">No hi ha competicions amb aquests filtres.</p>`;
    if (past.length) html += `<button class="more" id="togglePast">${state.showPast ? "Amaga" : "Mostra"} les competicions passades (${past.length})</button>`;
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
    const root = $("#tab-agenda");
    root.innerHTML = html;
    const tp = $("#togglePast");
    if (tp) tp.onclick = () => { state.showPast = !state.showPast; renderAgenda(); };
    const gn = $("#goNews");
    if (gn) gn.onclick = () => setTab("news");
    root.querySelectorAll("[data-ev]").forEach((b) => (b.onclick = (ev) => {
      ev.preventDefault();
      if (!document.getElementById("ev-" + b.dataset.ev)) { state.showPast = true; renderAgenda(); }
      goTo(b.dataset.ev);
    }));
  }

  // ---------- Novetats ----------
  const isUnread = (c) => !state.lastSeen || c.at > state.lastSeen;
  const CH = {
    nova: "Nova competició",
    horari: "Horari publicat",
    inscrits: "Llista d’inscrits publicada",
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
      $("#tab-news").innerHTML = `<p class="empty">Encara no hi ha novetats amb aquests filtres.<br>Aquí apareixeran les competicions noves, els horaris i les llistes d’inscrits que es publiquin i els canvis de data o lloc.</p>`;
      return;
    }
    $("#tab-news").innerHTML = `<ul class="news">${list.slice(0, 150).map((c) => {
      const e = byId.get(c.id);
      const detail = c.detail ? " · " + esc(c.detail.replace(/(\d{4})-(\d\d)-(\d\d)/g, (_, y, m, dd) => `${+dd}/${+m}`)) : "";
      const title = e ? `<a class="t" href="${esc(e.url)}" target="_blank" rel="noopener">${esc(c.title)}</a>` : `<span class="t">${esc(c.title)}</span>`;
      return `<li class="card${isUnread(c) ? " unread" : ""}">
        <span class="what ${c.type}">${CH[c.type] || esc(c.type)}</span>
        <span class="when">${ago(c.at)}</span>
        ${title}
        <span class="det">${longDate(c.start)} · ${(c.cats || []).map((k) => CAT_LABEL[k]).join(", ") || "sense categoria indicada"}${detail}</span>
      </li>`;
    }).join("")}</ul>`;
  }
  function updateBadge() {
    const n = relevantChanges().filter(isUnread).length;
    const b = $("#newsBadge");
    b.hidden = !n || state.tab === "news";
    b.textContent = n > 99 ? "99+" : n;
    $("#btnFilter").classList.toggle("active", !!(state.mods.length || state.unknown || state.onlyHorari || state.q));
  }

  // ---------- Calendari ----------
  function renderCal() {
    const base = new URL("cal/", location.href);
    const rows = [["totes", "Totes les categories"], ...CATS.map(([k, l]) => [k, "Només " + l])];
    $("#tab-cal").innerHTML = `<div class="card calbox">
      <h2>Afegeix-la al teu calendari</h2>
      <p>Subscriu-t’hi i les competicions apareixeran soles a Google Calendar o al calendari de l’iPhone. S’actualitza automàticament.</p>
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
    <div class="card calbox">
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
    document.querySelectorAll(".tabbar button").forEach((b) => b.setAttribute("aria-selected", b.dataset.tab === t));
    ["agenda", "news", "cal"].forEach((k) => ($("#tab-" + k).hidden = k !== t));
    $("#title").textContent = TITLES[t];
    $(".filters").hidden = t === "cal";
    $("#btnFilter").hidden = t === "cal";
    $("#btnCal").hidden = t === "cal";
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

  document.querySelectorAll(".tabbar button").forEach((b) => (b.onclick = () => setTab(b.dataset.tab)));
  $("#btnCal").onclick = () => setTab("cal");
  $("#btnFilter").onclick = () => {
    const p = $("#panel");
    p.hidden = !p.hidden;
    $("#btnFilter").setAttribute("aria-expanded", !p.hidden);
  };
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
