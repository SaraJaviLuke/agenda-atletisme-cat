(() => {
  const CATS = [
    ["sub18", "Sub18"], ["sub20", "Sub20"], ["sub23", "Sub23"], ["absolut", "Absolut"],
  ];
  const CAT_LABEL = Object.fromEntries(CATS);
  const LS = "agendaAtletismeCat:v1";
  const saved = JSON.parse(localStorage.getItem(LS) || "{}");
  const state = {
    cats: saved.cats || [],          // vacío = todas
    mods: saved.mods || [],          // vacío = todas
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

  let EVENTS = [], CHANGES = [], UPDATED = null;
  const $ = (s) => document.querySelector(s);
  const esc = (s = "") => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Madrid" });
  const d = (iso) => new Date(iso + "T12:00:00");
  const WD = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
  const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

  function ago(iso) {
    const s = (Date.now() - Date.parse(iso)) / 1000;
    if (s < 90) return "hace un momento";
    if (s < 3600) return `hace ${Math.round(s / 60)} min`;
    if (s < 86400) return `hace ${Math.round(s / 3600)} h`;
    const n = Math.round(s / 86400);
    return n === 1 ? "ayer" : `hace ${n} días`;
  }

  // ---------- Filtros ----------
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

  function chip(label, pressed, cls = "") {
    return `<button class="chip ${cls}" aria-pressed="${pressed}">${esc(label)}</button>`;
  }

  function renderChips() {
    $("#catChips").innerHTML = CATS.map(([k, l]) => chip(l, state.cats.includes(k), "c-" + k)).join("");
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
  const LINK_ICON = { horari: "🕒", directe: "📡", resultats: "🏁", inscrits: "👥", inscripcio: "✍️", reglament: "📄", altres: "🔗" };

  function card(e, newIds) {
    const dt = d(e.start);
    const multi = e.end !== e.start ? ` – ${d(e.end).getDate()}` : "";
    const past = e.end < today;
    const horari = e.links.find((l) => l.type === "horari") || e.links.find((l) => l.type === "directe");
    const status = horari
      ? `<a class="status ok" href="${esc(horari.url)}" target="_blank" rel="noopener">✅ Horario publicado · ${esc(horari.text)}</a>`
      : past ? "" : `<span class="status wait">⏳ Horario pendiente</span>`;
    const docs = e.links.filter((l) => l !== horari)
      .map((l) => `<a href="${esc(l.url)}" target="_blank" rel="noopener">${LINK_ICON[l.type] || "🔗"} ${esc(l.text)}</a>`).join("");
    return `<article class="ev${past ? " past" : ""}${newIds.has(e.id) ? " is-new" : ""}">
      <div class="date"><b>${dt.getDate()}${multi}</b><small>${WD[dt.getDay()]}</small></div>
      <div>
        <h3><a href="${esc(e.url)}" target="_blank" rel="noopener">${esc(e.title)}</a></h3>
        <div class="meta">
          ${newIds.has(e.id) ? '<span class="newpill">NUEVA</span>' : ""}
          ${e.cats.map((c) => `<span class="tag t-${c}">${CAT_LABEL[c]}</span>`).join("")}
          ${e.modalitats.map((m) => `<span class="mod">${esc(m)}</span>`).join("")}
          ${e.time ? `<span>· ${e.time} h</span>` : ""}
        </div>
        ${e.venue ? `<div class="venue">📍 ${esc(e.venue)}</div>` : ""}
        ${status}
        ${docs ? `<div class="docs">${docs}</div>` : ""}
      </div>
    </article>`;
  }

  function renderAgenda() {
    const newIds = new Set(CHANGES.filter((c) => c.type === "nova" && isUnread(c)).map((c) => c.id));
    const list = EVENTS.filter(matches);
    const past = list.filter((e) => e.end < today);
    const upcoming = list.filter((e) => e.end >= today);
    const shown = state.showPast ? [...past, ...upcoming] : upcoming;
    let html = "";
    if (past.length) html += `<button class="more" id="togglePast">${state.showPast ? "Ocultar" : "Ver"} competiciones pasadas (${past.length})</button>`;
    if (!shown.length) html += `<p class="empty">No hay competiciones con estos filtros.</p>`;
    let curMonth = "";
    for (const e of shown) {
      const m = e.start.slice(0, 7);
      if (m !== curMonth) {
        curMonth = m;
        const n = shown.filter((x) => x.start.startsWith(m)).length;
        html += `<h2 class="month">${MONTHS[+m.slice(5) - 1]} ${m.slice(0, 4)} <span>${n} ${n === 1 ? "competición" : "competiciones"}</span></h2>`;
      }
      html += card(e, newIds);
    }
    $("#tab-agenda").innerHTML = html;
    const tp = $("#togglePast");
    if (tp) tp.onclick = () => { state.showPast = !state.showPast; renderAgenda(); };
  }

  // ---------- Novedades ----------
  const isUnread = (c) => !state.lastSeen || c.at > state.lastSeen;
  const CH = {
    nova: ["🆕", "Nueva competición"],
    horari: ["🕒", "Horario publicado"],
    document: ["📄", "Nuevo documento"],
    data: ["📅", "Cambio de fecha"],
    lloc: ["📍", "Cambio de lugar"],
    eliminada: ["❌", "Retirada del calendario"],
  };
  function relevantChanges() {
    const byId = new Map(EVENTS.map((e) => [e.id, e]));
    return CHANGES.filter((c) => {
      const e = byId.get(c.id) || { ...c, links: [], hasHorari: false, venue: "" };
      return matches(e);
    });
  }
  function renderNews() {
    const list = relevantChanges();
    const byId = new Map(EVENTS.map((e) => [e.id, e]));
    if (!list.length) {
      $("#tab-news").innerHTML = `<p class="empty">Todavía no hay novedades con estos filtros.<br>La web revisa la Federació cada hora y aquí aparecerán las competiciones nuevas, los horarios publicados y los cambios.</p>`;
      return;
    }
    $("#tab-news").innerHTML = `<ul class="news">${list.slice(0, 150).map((c) => {
      const [ico, what] = CH[c.type] || ["•", c.type];
      const e = byId.get(c.id);
      const date = d(c.start);
      return `<li class="${isUnread(c) ? "unread" : ""}">
        <span class="ico">${ico}</span>
        <div>
          <span class="when">${ago(c.at)}</span>
          <div class="what ${c.type}">${what}</div>
          <a href="${esc(e ? e.url : "#")}" target="_blank" rel="noopener">${esc(c.title)}</a>
          <div class="det">${date.getDate()} ${MONTHS[date.getMonth()]} · ${(c.cats || []).map((k) => CAT_LABEL[k]).join(", ") || "sin categoría indicada"}${c.detail ? " · " + esc(c.detail.replace(/(\d{4})-(\d\d)-(\d\d)/g, (_, y, m, dd) => `${+dd}/${+m}`)) : ""}</div>
        </div></li>`;
    }).join("")}</ul>`;
  }
  function updateBadge() {
    const n = relevantChanges().filter(isUnread).length;
    const b = $("#newsBadge");
    b.hidden = !n || state.tab === "news";
    b.textContent = n > 99 ? "99+" : n;
  }

  // ---------- Calendario ----------
  function renderCal() {
    const base = new URL("cal/", location.href);
    const rows = [["totes", "Todas (Sub18, Sub20, Sub23, Absolut)"], ...CATS.map(([k, l]) => [k, "Solo " + l])];
    $("#tab-cal").innerHTML = `<div class="calbox">
      <h2>Añádelo a tu calendario</h2>
      <p>Suscríbete y las competiciones aparecerán solas en Google Calendar o en el calendario del iPhone. Se actualiza automáticamente: cuando la FCA publique el horario lo verás en la descripción del evento.</p>
      ${rows.map(([k, l]) => {
        const https = new URL(k + ".ics", base).href;
        const webcal = https.replace(/^https?:/, "webcal:");
        const google = "https://calendar.google.com/calendar/render?cid=" + encodeURIComponent(webcal);
        return `<div class="calrow"><b>${l}</b>
          <a class="btn primary" href="${esc(webcal)}">iPhone / Mac</a>
          <a class="btn" href="${esc(google)}" target="_blank" rel="noopener">Google Calendar</a>
          <button class="btn" data-copy="${esc(https)}">Copiar enlace</button></div>`;
      }).join("")}
    </div>
    <div class="calbox">
      <h2>Instalar como app</h2>
      <p><b>iPhone:</b> abre esta web en Safari → botón Compartir → “Añadir a pantalla de inicio”.<br>
      <b>Android:</b> en Chrome → menú ⋮ → “Añadir a pantalla de inicio”.</p>
    </div>`;
    $("#tab-cal").querySelectorAll("[data-copy]").forEach((b) => (b.onclick = async () => {
      try { await navigator.clipboard.writeText(b.dataset.copy); b.textContent = "¡Copiado!"; }
      catch { prompt("Copia este enlace:", b.dataset.copy); }
    }));
  }

  // ---------- Pestañas ----------
  function setTab(t) {
    state.tab = t;
    document.querySelectorAll(".tabs button").forEach((b) => b.setAttribute("aria-selected", b.dataset.tab === t));
    ["agenda", "news", "cal"].forEach((k) => ($("#tab-" + k).hidden = k !== t));
    $(".filters").hidden = t === "cal";
    render();
    if (t === "news" && CHANGES.length) {
      // Marca como leídas al salir de la pestaña, para que se vean resaltadas mientras se leen.
      pendingSeen = CHANGES[0].at;
    } else if (pendingSeen) {
      state.lastSeen = pendingSeen; pendingSeen = null; persist(); render();
    }
  }
  let pendingSeen = null;
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
    $("#updated").textContent = "· actualizado " + ago(UPDATED);
    renderChips(); render();
  }

  document.querySelectorAll(".tabs button").forEach((b) => (b.onclick = () => setTab(b.dataset.tab)));
  $("#q").oninput = (e) => { state.q = e.target.value.trim().toLowerCase(); render(); };
  $("#onlyHorari").onchange = (e) => { state.onlyHorari = e.target.checked; render(); };
  $("#unknown").checked = state.unknown;
  $("#unknown").onchange = (e) => { state.unknown = e.target.checked; persist(); render(); };

  load().catch((err) => {
    $("#tab-agenda").innerHTML = `<p class="empty">No se han podido cargar los datos. Prueba a recargar.</p>`;
    console.error(err);
  });
  setInterval(() => load().catch(() => {}), 10 * 60 * 1000);
})();
