#!/usr/bin/env python3
"""Orbit Watch server (standard library only).
  /                 -> the app
  /textures/<file> -> Solar System Scope texture; downloaded once, then cached in ./textures
  /api/sc?q=id:centre,... -> live spacecraft positions from NASA JPL Horizons (browsers can't call it directly)
Run:  python server.py   then open http://localhost:8000
"""
import http.server, socketserver, urllib.request, urllib.parse, json, os, re, time, threading
from concurrent.futures import ThreadPoolExecutor

ROOT = os.path.dirname(os.path.abspath(__file__))
TEX = os.path.join(ROOT, "textures"); os.makedirs(TEX, exist_ok=True)
SSS = "https://www.solarsystemscope.com/textures/download/"
HORIZONS = "https://ssd.jpl.nasa.gov/api/horizons.api?"
PREFETCH = ["2k_sun.jpg", "2k_mercury.jpg", "2k_venus_atmosphere.jpg", "2k_earth_daymap.jpg", "2k_mars.jpg", "2k_jupiter.jpg", "2k_saturn.jpg", "2k_moon.jpg",
            "2k_saturn_ring_alpha.png", "2k_uranus.jpg", "2k_neptune.jpg", "8k_stars_milky_way.jpg", "8k_earth_daymap.jpg", "8k_earth_nightmap.jpg", "8k_earth_clouds.jpg",
            "8k_mercury.jpg", "4k_venus_atmosphere.jpg", "8k_mars.jpg", "8k_jupiter.jpg", "8k_saturn.jpg", "8k_saturn_ring_alpha.png", "8k_moon.jpg", "8k_sun.jpg"]
cache, lock = {}, threading.Lock()

def fetch(url, timeout=60):
    req = urllib.request.Request(url, headers={"User-Agent": "OrbitWatch/1.0", "Referer": "https://www.solarsystemscope.com/textures/"})
    return urllib.request.urlopen(req, timeout=timeout).read()

failed = {}
def ensure_texture(name):
    path = os.path.join(TEX, name)
    if os.path.exists(path): return True
    if not re.fullmatch(r"\d+k_[A-Za-z0-9_]+\.(?:jpg|png)", name): return False
    if time.time() < failed.get(name, 0): return False          # failed recently: don't hammer the site
    try:
        data = fetch(SSS + name, 180); tmp = path + ".part"
        with open(tmp, "wb") as f: f.write(data)
        os.replace(tmp, path); print("downloaded %-32s %6.1f MB" % (name, len(data) / 1e6)); return True
    except Exception as e:
        print("FAILED     %-32s %s" % (name, e)); failed[name] = time.time() + 600; return False   # the page falls back to a lower resolution itself

def horizons(cid, centre):
    key = (cid, centre)
    with lock:
        c = cache.get(key)
        if c and time.time() - c[0] < 1800: return c[1]
    t = int(time.time() // 60 * 60) - 300
    fmt = lambda s: time.strftime("%Y-%m-%d %H:%M", time.gmtime(s))
    q = urllib.parse.urlencode({"format": "text", "COMMAND": "'%s'" % cid, "OBJ_DATA": "'NO'", "MAKE_EPHEM": "'YES'", "EPHEM_TYPE": "'VECTORS'",
        "CENTER": "'500@%s'" % centre, "START_TIME": "'%s'" % fmt(t), "STOP_TIME": "'%s'" % fmt(t + 7800), "STEP_SIZE": "'1 min'",
        "VEC_TABLE": "'1'", "REF_PLANE": "'ECLIPTIC'", "OUT_UNITS": "'KM-S'", "CSV_FORMAT": "'YES'"})
    txt = fetch(HORIZONS + q).decode("utf8", "ignore")
    m = re.search(r"\$\$SOE(.*?)\$\$EOE", txt, re.S)
    if not m: return None
    rows = [[float(v) for v in l.split(",")[2:5]] for l in m.group(1).strip().splitlines()]
    r = {"t": t * 1000, "d": 60000, "p": rows}
    with lock: cache[key] = (time.time(), r)
    return r

def one(pair):
    cid, centre = pair.split(":")
    try: return cid, horizons(cid, centre)
    except Exception as e: print("horizons failed", cid, e); return cid, None

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k): super().__init__(*a, directory=ROOT, **k)
    def log_message(self, *a): pass
    def do_GET(self):
        u = urllib.parse.urlparse(self.path)
        if u.path.startswith("/textures/") and not ensure_texture(os.path.basename(u.path)):
            return self.send_error(404, "texture unavailable")
        if u.path == "/api/sc":
            pairs = [p for p in urllib.parse.parse_qs(u.query).get("q", [""])[0].split(",") if re.fullmatch(r"-?\d+:\d+", p)]
            with ThreadPoolExecutor(4) as ex: out = {k: v for k, v in ex.map(one, pairs) if v}
            body = json.dumps(out).encode()
            self.send_response(200); self.send_header("Content-Type", "application/json"); self.send_header("Content-Length", str(len(body))); self.end_headers()
            return self.wfile.write(body)
        return super().do_GET()

if __name__ == "__main__":
    threading.Thread(target=lambda: [ensure_texture(n) for n in PREFETCH], daemon=True).start()
    socketserver.ThreadingTCPServer.allow_reuse_address = True
    with socketserver.ThreadingTCPServer(("127.0.0.1", 8000), Handler) as s:
        print("Orbit Watch running at http://localhost:8000  (first run downloads textures; Ctrl+C to stop)")
        s.serve_forever()
