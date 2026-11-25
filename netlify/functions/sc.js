// Netlify version of server.py's /api/sc: proxies NASA JPL Horizons (browsers can't call it directly)
exports.handler = async (e) => {
  const pairs = ((e.queryStringParameters || {}).q || "").split(",").filter(p => /^-?\d+:\d+$/.test(p));
  const t = Math.floor(Date.now() / 60000) * 60 - 300;
  const f = s => new Date(s * 1000).toISOString().slice(0, 16).replace("T", " ");
  const one = async p => {
    const [id, c] = p.split(":");
    try {
      const q = new URLSearchParams({ format: "text", COMMAND: `'${id}'`, OBJ_DATA: "'NO'", MAKE_EPHEM: "'YES'", EPHEM_TYPE: "'VECTORS'",
        CENTER: `'500@${c}'`, START_TIME: `'${f(t)}'`, STOP_TIME: `'${f(t + 7800)}'`, STEP_SIZE: "'1 min'", VEC_TABLE: "'1'",
        REF_PLANE: "'ECLIPTIC'", OUT_UNITS: "'KM-S'", CSV_FORMAT: "'YES'" });
      const txt = await (await fetch("https://ssd.jpl.nasa.gov/api/horizons.api?" + q)).text();
      const m = txt.match(/\$\$SOE([\s\S]*?)\$\$EOE/);
      if (!m) return null;
      return [id, { t: t * 1000, d: 60000, p: m[1].trim().split("\n").map(l => l.split(",").slice(2, 5).map(Number)) }];
    } catch { return null; }
  };
  const out = Object.fromEntries((await Promise.all(pairs.map(one))).filter(Boolean));
  return { statusCode: 200, headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=1800" }, body: JSON.stringify(out) };
};
