// Estil de colors: es carrega abans de pintar la pàgina per evitar el salt de colors.
(() => {
  const KEY = "agendaAtletismeCat:theme";
  const PRESETS = {
    nit:    { name: "Nit",    bg: "#09090b", ink: "#ffffff", accent: "#b6f36a" },
    blanc:  { name: "Blanc",  bg: "#ffffff", ink: "#0d0d10", accent: "#ff5a36" },
    sorra:  { name: "Sorra",  bg: "#f2ede4", ink: "#2a2420", accent: "#c8553d" },
    tartan: { name: "Tartan", bg: "#0d3b86", ink: "#ffffff", accent: "#ffd84a" },
    argila: { name: "Argila", bg: "#190e0d", ink: "#fff1ea", accent: "#ff6b4a" },
    ocea:   { name: "Oceà",   bg: "#0a1220", ink: "#eaf2ff", accent: "#5cc8ff" },
    bosc:   { name: "Bosc",   bg: "#0c1510", ink: "#eef6ee", accent: "#9be37a" },
    lila:   { name: "Lila",   bg: "#120e1c", ink: "#f3eeff", accent: "#c4a1ff" },
    menta:  { name: "Menta",  bg: "#eef5f1", ink: "#10201a", accent: "#0f9d6b" },
  };
  const HEX = /^#[0-9a-f]{6}$/i;
  const lum = (hex) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  function get() {
    try {
      const t = JSON.parse(localStorage.getItem(KEY) || "{}");
      const c = t.custom || {};
      const custom = [c.bg, c.ink, c.accent].every((v) => HEX.test(v || "")) ? c : { ...PRESETS.nit };
      return { id: t.id === "custom" || PRESETS[t.id] ? t.id : "nit", custom };
    } catch { return { id: "nit", custom: { ...PRESETS.nit } }; }
  }
  function colors(t) { return t.id === "custom" ? t.custom : PRESETS[t.id]; }
  function apply(t) {
    const c = colors(t), s = document.documentElement.style;
    s.setProperty("--bg", c.bg);
    s.setProperty("--ink", c.ink);
    s.setProperty("--ok", c.accent);
    s.setProperty("--on-accent", lum(c.accent) > 0.4 ? "#000000" : "#ffffff");
    s.colorScheme = lum(c.bg) < 0.4 ? "dark" : "light";
    document.documentElement.dataset.theme = t.id;
    const m = document.querySelector('meta[name="theme-color"]');
    if (m) m.content = c.bg;
  }
  function set(t) { localStorage.setItem(KEY, JSON.stringify(t)); apply(t); }
  // El tartan blau de la pista tenyeix: cada toc deixa una taca blava que s'esvaeix.
  addEventListener("pointerdown", (e) => {
    if (document.documentElement.dataset.theme !== "tartan") return;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const el = document.createElement("i");
    el.className = "stain";
    el.style.left = e.clientX + "px";
    el.style.top = e.clientY + "px";
    el.style.setProperty("--rot", Math.round(Math.random() * 360) + "deg");
    el.style.setProperty("--size", 70 + Math.round(Math.random() * 40) + "px");
    document.body.appendChild(el);
    el.addEventListener("animationend", () => el.remove());
  }, { passive: true });

  window.Theme = { PRESETS, get, set, colors };
  apply(get());
})();
