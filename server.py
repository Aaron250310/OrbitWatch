#!/usr/bin/env python3
"""Orbit Watch server (standard library only).
  /                 -> the app
  /textures/<file> -> Solar System Scope (or, for moons, Celestia) texture; downloaded once, then cached in ./textures
  /models/<file>    -> NASA 3D Resources spacecraft model (.glb); downloaded once, then cached in ./models
  /api/sc?q=id:centre,... -> live spacecraft positions from NASA JPL Horizons (browsers can't call it directly)
Run:  python server.py   then open http://localhost:8000
"""
import http.server, socketserver, urllib.request, urllib.parse, json, os, re, time, threading
from concurrent.futures import ThreadPoolExecutor

ROOT = os.path.dirname(os.path.abspath(__file__))
TEX = os.path.join(ROOT, "textures"); os.makedirs(TEX, exist_ok=True)
MOD = os.path.join(ROOT, "models"); os.makedirs(MOD, exist_ok=True)
NASA3D = "https://raw.githubusercontent.com/nasa/NASA-3D-Resources/master/3D%20Models/"
# our name -> NASA's folder/file (real, CC0 models; a handful of recognisable ones — most spacecraft still use the generic procedural stand-in)
MODEL_SRC = {
    "iss.glb": "International%20Space%20Station%20(ISS)%20(A)/International%20Space%20Station%20(ISS)%20(A).glb",
    "hubble.glb": "Hubble%20Space%20Telescope%20(A)/Hubble%20Space%20Telescope%20(A).glb",
    "jwst.glb": "James%20Webb%20Space%20Telescope%20(A)/James%20Webb%20Space%20Telescope%20(A).glb",
    "juno.glb": "Juno%20(A)/Juno%20(A).glb",
    "mro.glb": "Mars%20Reconnaissance%20Orbiter%20(MRO)%20(A)/Mars%20Reconnaissance%20Orbiter%20(MRO)%20(A).glb",
    "voyager.glb": "Voyager%20Probe%20(A)/Voyager%20Probe%20(A).glb",
    "perseverance.glb": "Mars%202020%20Perseverance%20Rover/Mars%202020%20Perseverance%20Rover.glb"}
SSS = "https://www.solarsystemscope.com/textures/download/"
CELESTIA = "https://raw.githubusercontent.com/CelestiaProject/CelestiaContent/master/textures/"  # moon surface photos (CC BY-NC-SA, community-maintained)
MOON_SRC = {  # our name -> Celestia's path for it
    "moon/moon.jpg": "hires/moon.jpg", "moon/phobos.jpg": "hires/phobos.jpg", "moon/deimos.jpg": "hires/deimos.jpg",
    "moon/io.png": "hires/io.png", "moon/europa.jpg": "hires/europa.jpg", "moon/ganymede.jpg": "hires/ganymede.jpg", "moon/callisto.jpg": "hires/callisto.jpg",
    "moon/mimas.jpg": "hires/mimas.jpg", "moon/enceladus.jpg": "hires/enceladus.jpg", "moon/tethys.jpg": "hires/tethys.jpg", "moon/dione.jpg": "hires/dione.jpg",
    "moon/rhea.jpg": "hires/rhea.jpg", "moon/titan.png": "hires/titan.png", "moon/iapetus.jpg": "hires/iapetus.jpg",
    "moon/miranda.jpg": "hires/miranda.jpg", "moon/ariel.jpg": "hires/ariel.jpg", "moon/umbriel.jpg": "medres/umbriel.jpg",
    "moon/titania.jpg": "medres/titania.jpg", "moon/oberon.jpg": "medres/oberon.jpg", "moon/triton.jpg": "hires/triton.jpg"}
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
    if time.time() < failed.get(name, 0): return False          # failed recently: don't hammer the site
    if name in MOON_SRC:  # moon/asteroid photos come from a different free source (Celestia), not Solar System Scope
        try:
            os.makedirs(os.path.dirname(path), exist_ok=True)
            data = fetch(CELESTIA + MOON_SRC[name], 60); tmp = path + (".part-%d" % os.getpid())
            with open(tmp, "wb") as f: f.write(data)
            os.replace(tmp, path); print("downloaded %-32s %6.1f MB (Celestia)" % (name, len(data) / 1e6)); return True
        except Exception as e:
            if os.path.exists(path): return True  # another thread finished it first
            print("FAILED     %-32s %s" % (name, e)); failed[name] = time.time() + 600; return False
    if not re.fullmatch(r"\d+k_[A-Za-z0-9_]+\.(?:jpg|png)", name): return False
    try:
        data = fetch(SSS + name, 180); tmp = path + (".part-%d" % os.getpid())
        with open(tmp, "wb") as f: f.write(data)
        os.replace(tmp, path); print("downloaded %-32s %6.1f MB" % (name, len(data) / 1e6)); return True
    except Exception as e:
        if os.path.exists(path): return True  # another thread finished it first
        print("FAILED     %-32s %s" % (name, e)); failed[name] = time.time() + 600; return False   # the page falls back to a lower resolution itself

def ensure_model(name):
    path = os.path.join(MOD, name)
    if os.path.exists(path): return True
    if name not in MODEL_SRC: return False
    if time.time() < failed.get("m:" + name, 0): return False
    try:
        data = fetch(NASA3D + MODEL_SRC[name], 120); tmp = path + (".part-%d" % os.getpid())
        with open(tmp, "wb") as f: f.write(data)
        os.replace(tmp, path); print("downloaded %-20s %6.1f MB (NASA 3D Resources)" % (name, len(data) / 1e6)); return True
    except Exception as e:
        if os.path.exists(path): return True  # another thread (e.g. the background prefetch) finished it first
        print("FAILED     %-20s %s" % (name, e)); failed["m:" + name] = time.time() + 600; return False

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
        if u.path.startswith("/textures/") and not ensure_texture(urllib.parse.unquote(u.path[len("/textures/"):])):
            return self.send_error(404, "texture unavailable")
        if u.path.startswith("/models/") and not ensure_model(urllib.parse.unquote(u.path[len("/models/"):])):
            return self.send_error(404, "model unavailable")
        if u.path == "/api/sc":
            pairs = [p for p in urllib.parse.parse_qs(u.query).get("q", [""])[0].split(",") if re.fullmatch(r"-?\d+:\d+", p)]
            with ThreadPoolExecutor(4) as ex: out = {k: v for k, v in ex.map(one, pairs) if v}
            body = json.dumps(out).encode()
            self.send_response(200); self.send_header("Content-Type", "application/json"); self.send_header("Content-Length", str(len(body))); self.end_headers()
            return self.wfile.write(body)
        return super().do_GET()

if __name__ == "__main__":
    threading.Thread(target=lambda: [ensure_texture(n) for n in PREFETCH], daemon=True).start()
    threading.Thread(target=lambda: [ensure_model(n) for n in MODEL_SRC], daemon=True).start()
    socketserver.ThreadingTCPServer.allow_reuse_address = True
    with socketserver.ThreadingTCPServer(("127.0.0.1", 8000), Handler) as s:
        print("Orbit Watch running at http://localhost:8000  (first run downloads textures; Ctrl+C to stop)")
        s.serve_forever()
