// Descarga las competiciones de la Federació Catalana d'Atletisme (API pública de
// The Events Calendar), detecta categorías (Sub18/Sub20/Sub23/Absolut), horarios
// publicados y cambios, y genera data/*.json y cal/*.ics para la web.
// Sin dependencias: Node 18+.

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const API = "https://fcatletisme.cat/wp-json/tribe/events/v1/events";
const CATS = ["sub18", "sub20", "sub23", "absolut"];
const MAX_CHANGES = 400;

const fmt = (d) => d.toISOString().slice(0, 10);

function decode(s = "") {
  return s
    .replace(/<[^>]+>/g, "")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&apos;|&#039;/g, "'")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ").trim();
}

// "Control Absolut-Sub20", "Sub 16-18", "S20-S18", "Sub20-Sub23-Absolut", "sub18 i sub16"…
export function detectCategories(title) {
  const t = title.toLowerCase();
  const found = new Set();
  if (/totes les categories/.test(t)) CATS.forEach((c) => found.add(c));
  if (/\babsolut/.test(t)) found.add("absolut");
  const re = /\b(?:sub|s)\s?-?(\d{1,2})\b((?:\s?(?:-|,|\bi\b|\by\b|\/)\s?(?:sub|s)?\s?\d{1,2}\b)*)/g;
  for (const m of t.matchAll(re)) {
    const nums = [m[1], ...(m[2].match(/\d{1,2}/g) || [])];
    for (const n of nums) if (["18", "20", "23"].includes(n)) found.add("sub" + n);
  }
  return CATS.filter((c) => found.has(c));
}

function classifyLink(text, url) {
  const s = (text + " " + url).toLowerCase();
  if (/horari/.test(s)) return "horari";
  if (/rfealive|resultats en directe|live/.test(s)) return "directe";
  if (/resultat|classific/.test(s)) return "resultats";
  if (/inscrit|admes|participants/.test(s)) return "inscrits";
  if (/inscripci/.test(s)) return "inscripcio";
  if (/reglament|\/reg-/.test(s)) return "reglament";
  return "altres";
}

function parseLinks(html = "") {
  const out = [];
  const seen = new Set();
  for (const m of html.matchAll(/<a\s[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)) {
    const url = m[1].replace(/&amp;/g, "&");
    if (seen.has(url) || url.startsWith("mailto:")) continue;
    seen.add(url);
    const text = decode(m[2]) || url.split("/").pop();
    out.push({ text, url, type: classifyLink(text, url) });
  }
  return out;
}

async function fetchJSON(url, tries = 3) {
  for (let i = 1; ; i++) {
    try {
      const r = await fetch(url, { headers: { "User-Agent": "agenda-atletisme-cat (bot de agenda pública)" } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } catch (e) {
      if (i >= tries) throw e;
      await new Promise((res) => setTimeout(res, 2000 * i));
    }
  }
}

async function fetchAll() {
  const start = new Date(Date.now() - 14 * 864e5);
  const end = new Date(Date.now() + 420 * 864e5);
  const all = [];
  for (let page = 1; ; page++) {
    const url = `${API}?per_page=50&page=${page}&start_date=${fmt(start)}&end_date=${fmt(end)}`;
    const d = await fetchJSON(url);
    all.push(...(d.events || []));
    if (!d.total_pages || page >= d.total_pages) break;
  }
  return all;
}

function normalize(e) {
  const title = decode(e.title);
  const links = parseLinks(e.description);
  const v = e.venue && !Array.isArray(e.venue) ? e.venue : null;
  return {
    id: e.id,
    title,
    url: e.url,
    start: e.start_date.slice(0, 10),
    end: e.end_date.slice(0, 10),
    time: e.all_day ? null : e.start_date.slice(11, 16),
    modalitats: (e.categories || []).map((c) => decode(c.name)),
    cats: detectCategories(title),
    championship: /campionat|championship|copa\b/i.test(title),
    venue: v ? decode(v.venue) : null,
    address: v ? [v.address, v.zip, v.city].filter(Boolean).map(decode).join(", ") : null,
    organizer: e.organizer?.[0]?.organizer ? decode(e.organizer[0].organizer) : null,
    links,
    hasHorari: links.some((l) => l.type === "horari" || l.type === "directe"),
    modified: e.modified,
  };
}

function diff(prev, next, now) {
  const changes = [];
  const add = (type, ev, detail, link) =>
    changes.push({ at: now, type, id: ev.id, title: ev.title, start: ev.start, cats: ev.cats, modalitats: ev.modalitats, detail, url: link || ev.url });
  const prevMap = new Map(prev.map((e) => [e.id, e]));
  for (const ev of next) {
    const p = prevMap.get(ev.id);
    if (!p) { add("nova", ev, ev.venue || null); continue; }
    if (p.start !== ev.start || p.end !== ev.end) add("data", ev, `${p.start} → ${ev.start}`);
    if ((p.venue || "") !== (ev.venue || "") && ev.venue) add("lloc", ev, ev.venue);
    const oldUrls = new Set(p.links.map((l) => l.url));
    for (const l of ev.links) {
      if (oldUrls.has(l.url)) continue;
      add(l.type === "horari" || l.type === "directe" ? "horari" : l.type === "inscrits" ? "inscrits" : "document", ev, l.text, l.url);
    }
  }
  const today = now.slice(0, 10);
  const nextIds = new Set(next.map((e) => e.id));
  for (const p of prev) if (!nextIds.has(p.id) && p.start >= today) add("eliminada", p, null);
  return changes;
}

// ---------- Notificacions (ntfy.sh) ----------
// Un canal per categoria i un amb totes. Només s'envia si NTFY_PREFIX està definit (ho fa el workflow).
const NTFY_TITLES = { nova: "Nova competició", horari: "Horari publicat", inscrits: "Llista d'inscrits publicada", data: "Canvi de data" };
const MESOS = ["de gener", "de febrer", "de març", "d'abril", "de maig", "de juny", "de juliol", "d'agost", "de setembre", "d'octubre", "de novembre", "de desembre"];
const CAT_NAMES = { sub18: "Sub18", sub20: "Sub20", sub23: "Sub23", absolut: "Absolut" };

async function notify(changes) {
  const prefix = process.env.NTFY_PREFIX;
  if (!prefix) return;
  const list = changes.filter((c) => NTFY_TITLES[c.type] && c.cats?.length);
  const MAX = 25; // per no inundar si la FCA publica molts canvis de cop
  let sent = 0, failed = 0;
  for (const c of list.slice(0, MAX)) {
    const [y, m, dd] = c.start.split("-").map(Number);
    const lines = [c.title, `${dd} ${MESOS[m - 1]} ${y} · ${c.cats.map((k) => CAT_NAMES[k]).join(", ")}`];
    if (c.type === "data") lines.push(`Abans: ${c.detail.split(" → ")[0]}`);
    for (const topic of [...c.cats, "totes"]) {
      try {
        const r = await fetch("https://ntfy.sh", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ topic: `${prefix}-${topic}`, title: NTFY_TITLES[c.type], message: lines.join("\n"), click: c.url }),
        });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        sent++;
      } catch (e) { failed++; console.error(`ntfy ${topic}: ${e.message}`); }
      await new Promise((res) => setTimeout(res, 400));
    }
  }
  console.log(`Notificacions: ${sent} enviades, ${failed} fallides${list.length > MAX ? `, ${list.length - MAX} omeses` : ""}`);
}

// ---------- iCalendar ----------
const icsEsc = (s = "") => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
const icsDate = (d) => d.replace(/-/g, "");
function fold(line) {
  const out = [];
  while (line.length > 74) { out.push(line.slice(0, 74)); line = " " + line.slice(74); }
  out.push(line);
  return out.join("\r\n");
}
function buildICS(events, name, stamp) {
  const lines = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//agenda-atletisme-cat//ES", "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH", `X-WR-CALNAME:${icsEsc(name)}`, "X-WR-TIMEZONE:Europe/Madrid",
    "REFRESH-INTERVAL;VALUE=DURATION:PT6H", "X-PUBLISHED-TTL:PT6H",
  ];
  for (const e of events) {
    const endPlus = fmt(new Date(Date.parse(e.end + "T12:00:00Z") + 864e5));
    const desc = [
      e.cats.length ? "Categories: " + e.cats.join(", ") : null,
      e.modalitats.join(" · "),
      e.hasHorari ? "✅ Horari publicat" : "⏳ Horari pendent",
      ...e.links.map((l) => `${l.text}: ${l.url}`),
      e.url,
    ].filter(Boolean).join("\n");
    lines.push(
      "BEGIN:VEVENT", `UID:fca-${e.id}@agenda-atletisme-cat`, `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${icsDate(e.start)}`, `DTEND;VALUE=DATE:${icsDate(endPlus)}`,
      `SUMMARY:${icsEsc((e.hasHorari ? "" : "") + e.title)}`,
      e.venue ? `LOCATION:${icsEsc([e.venue, e.address].filter(Boolean).join(", "))}` : null,
      `DESCRIPTION:${icsEsc(desc)}`, `URL:${e.url}`, "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.filter(Boolean).map(fold).join("\r\n") + "\r\n";
}

async function readJSON(p, fallback) {
  try { return JSON.parse(await fs.readFile(p, "utf8")); } catch { return fallback; }
}

async function main() {
  const dataDir = path.join(ROOT, "data");
  const calDir = path.join(ROOT, "cal");
  await fs.mkdir(dataDir, { recursive: true });
  await fs.mkdir(calDir, { recursive: true });

  const now = new Date().toISOString().slice(0, 19) + "Z";
  const raw = await fetchAll();
  const events = raw.map(normalize).sort((a, b) => a.start.localeCompare(b.start) || a.title.localeCompare(b.title));

  const prevPath = path.join(dataDir, "events.json");
  const prevFile = await readJSON(prevPath, null);
  const changesPath = path.join(dataDir, "changes.json");
  let changes = await readJSON(changesPath, []);

  if (prevFile) {
    // Los eventos que ya han pasado y salen de la ventana no cuentan como "eliminados".
    const newChanges = diff(prevFile.events, events, now);
    await notify(newChanges);
    changes = [...newChanges.reverse(), ...changes].slice(0, MAX_CHANGES);
    console.log(`Cambios detectados: ${newChanges.length}`);
  } else {
    console.log("Primera ejecución: se guarda la base sin generar novedades.");
  }

  const relevant = events.filter((e) => e.cats.length);
  await fs.writeFile(prevPath, JSON.stringify({ updated: now, count: events.length, events }, null, 1));
  await fs.writeFile(changesPath, JSON.stringify(changes, null, 1));

  const stamp = now.replace(/[-:]/g, "").replace(/\.\d+/, "");
  await fs.writeFile(path.join(calDir, "totes.ics"), buildICS(relevant, "Atletisme CAT · Sub18-Sub20-Sub23-Absolut", stamp));
  for (const c of CATS) {
    const label = c === "absolut" ? "Absolut" : "Sub" + c.slice(3);
    await fs.writeFile(path.join(calDir, `${c}.ics`), buildICS(relevant.filter((e) => e.cats.includes(c)), `Atletisme CAT · ${label}`, stamp));
  }
  console.log(`Eventos: ${events.length} (con categoría Sub18/20/23/Absolut: ${relevant.length})`);
}

if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
