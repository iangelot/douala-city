import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { AREAS, DEFAULT_AREA } from "./config.mjs";
import { toLocal } from "./geo.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

function arg(name, fallback) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}

function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967295;
}

function ringArea(pts) {
  let a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    a += pts[j][0] * pts[i][1] - pts[i][0] * pts[j][1];
  }
  return a / 2;
}

function cleanRing(pts) {
  const out = [];
  for (const p of pts) {
    const prev = out[out.length - 1];
    if (!prev || Math.hypot(p[0] - prev[0], p[1] - prev[1]) > 0.4) out.push(p);
  }
  if (out.length > 1) {
    const a = out[0];
    const b = out[out.length - 1];
    if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 0.8) out.pop();
  }
  return out;
}

function useOf(tags = {}) {
  const b = (tags.building || tags["building:use"] || "").toLowerCase();
  if (["apartments", "residential", "house", "detached", "semidetached_house", "terrace", "hut"].includes(b))
    return "residential";
  if (["commercial", "retail", "supermarket", "office", "hotel"].includes(b)) return "commercial";
  if (["industrial", "warehouse", "manufacture"].includes(b)) return "industrial";
  if (["church", "cathedral", "mosque", "temple", "chapel"].includes(b) || tags.amenity === "place_of_worship")
    return "worship";
  if (["school", "university", "college", "kindergarten"].includes(b) || tags.amenity === "school") return "school";
  if (["hospital", "clinic"].includes(b) || tags.amenity === "hospital") return "civic";
  if (["public", "civic", "government", "train_station"].includes(b)) return "civic";
  if (tags.landuse === "industrial" || tags.man_made === "works") return "industrial";
  if (tags.shop || tags.amenity === "marketplace") return "commercial";
  return "mixed";
}

function heightOf(tags = {}, use, areaM2) {
  if (tags.height) {
    const n = parseFloat(String(tags.height).replace(",", "."));
    if (Number.isFinite(n) && n > 1.5) return Math.min(n, 160);
  }
  const levels = parseFloat(tags["building:levels"] || tags.levels || "");
  if (Number.isFinite(levels) && levels > 0) return Math.min(levels * 3.15 + 1.2, 160);
  const seed = hash(JSON.stringify(tags) + areaM2);
  if (use === "worship") return 14 + seed * 18;
  if (use === "civic") return 10 + seed * 16;
  if (use === "industrial") return 8 + seed * 10;
  if (use === "commercial") return 9 + seed * 22;
  if (use === "school") return 8 + seed * 8;
  if (areaM2 > 2500) return 8 + seed * 18;
  if (areaM2 < 80) return 3.4 + seed * 2.4;
  return 5.5 + seed * 9;
}

function roadWidth(tags = {}) {
  const w = parseFloat(tags.width || "");
  if (Number.isFinite(w) && w > 2) return Math.min(w, 36);
  const h = tags.highway;
  const lanes = parseFloat(tags.lanes || "") || 0;
  if (lanes) return Math.min(3.2 * lanes + 1.4, 28);
  if (h === "motorway" || h === "trunk") return 16;
  if (h === "primary") return 12;
  if (h === "secondary") return 10;
  if (h === "tertiary") return 8.5;
  if (h === "residential" || h === "unclassified") return 6.4;
  if (h === "service" || h === "living_street") return 4.4;
  if (h === "footway" || h === "path" || h === "steps") return 2.2;
  if (h === "pedestrian") return 8;
  return 6;
}

function wayCoords(way, nodes, origin) {
  const pts = [];
  for (const id of way.nodes || []) {
    const n = nodes.get(id);
    if (!n) continue;
    const p = toLocal(n.lat, n.lon, origin);
    pts.push([p.x, p.z]);
  }
  return pts;
}

const id = arg("area", DEFAULT_AREA);
const area = AREAS[id];
if (!area) {
  console.error("unknown area", id);
  process.exit(1);
}

const rawPath = join(root, "data/raw", id, "osm.json");
const raw = JSON.parse(await readFile(rawPath, "utf8"));
const origin = { lat: area.lat, lon: area.lon };
const nodes = new Map();
const ways = [];
const rels = [];

for (const el of raw.elements || []) {
  if (el.type === "node") nodes.set(el.id, el);
  else if (el.type === "way") ways.push(el);
  else if (el.type === "relation") rels.push(el);
}

const buildings = [];
const roads = [];
const rails = [];
const water = [];
const parks = [];
const trees = [];
const signals = [];

for (const n of nodes.values()) {
  const tags = n.tags || {};
  const p = toLocal(n.lat, n.lon, origin);
  if (Math.abs(p.x) > area.width / 2 + 40 || Math.abs(p.z) > area.depth / 2 + 40) continue;
  if (tags.natural === "tree") trees.push({ x: p.x, z: p.z, r: 2.2 + hash(String(n.id)) * 3.4 });
  if (tags.highway === "traffic_signals") signals.push({ x: p.x, z: p.z });
}

for (const way of ways) {
  const tags = way.tags || {};
  const pts = wayCoords(way, nodes, origin);
  if (pts.length < 2) continue;

  if (tags.building || tags["building:part"]) {
    const ring = cleanRing(pts);
    if (ring.length < 3) continue;
    const a = Math.abs(ringArea(ring));
    if (a < 8 || a > 90000) continue;
    const use = useOf(tags);
    buildings.push({
      id: way.id,
      ring,
      height: heightOf(tags, use, a),
      use,
      name: tags.name || tags["name:fr"] || "",
      levels: parseInt(tags["building:levels"] || "0", 10) || 0,
    });
    continue;
  }

  if (tags.highway && tags.highway !== "proposed" && tags.area !== "yes") {
    roads.push({
      id: way.id,
      pts,
      width: roadWidth(tags),
      kind: tags.highway,
      oneway: tags.oneway === "yes" || tags.oneway === "1",
      bridge: tags.bridge === "yes",
      tunnel: tags.tunnel === "yes",
      name: tags.name || "",
    });
  }

  if (tags.railway && tags.railway !== "abandoned") {
    rails.push({ pts, kind: tags.railway });
  }

  if (
    tags.natural === "water" ||
    tags.waterway === "riverbank" ||
    tags.water === "river" ||
    tags.landuse === "basin" ||
    tags.waterway === "dock"
  ) {
    const ring = cleanRing(pts);
    if (ring.length >= 3) water.push({ ring, kind: tags.waterway || tags.natural || "water" });
  }

  if (tags.waterway === "river" || tags.waterway === "canal" || tags.waterway === "stream") {
    water.push({ pts, kind: tags.waterway, width: tags.waterway === "river" ? 90 : 12 });
  }

  if (
    tags.leisure === "park" ||
    tags.landuse === "forest" ||
    tags.landuse === "grass" ||
    tags.natural === "wood"
  ) {
    const ring = cleanRing(pts);
    if (ring.length >= 3) parks.push({ ring, kind: tags.landuse || tags.leisure || tags.natural });
  }
}

if (trees.length < 180) {
  for (const park of parks) {
    const ring = park.ring;
    let cx = 0;
    let cz = 0;
    for (const p of ring) {
      cx += p[0];
      cz += p[1];
    }
    cx /= ring.length;
    cz /= ring.length;
    for (let i = 0; i < 14; i++) {
      trees.push({
        x: cx + (hash(String(i + cx)) - 0.5) * 40,
        z: cz + (hash(String(i + cz)) - 0.5) * 40,
        r: 2.4 + hash(String(i)) * 3.2,
      });
    }
  }
  for (const road of roads) {
    if (road.width < 8 || road.kind === "motorway") continue;
    for (let i = 0; i < road.pts.length; i += 4) {
      const p = road.pts[i];
      if (hash(String(road.id + i)) > 0.55) continue;
      trees.push({
        x: p[0] + (hash(String(i)) - 0.5) * (road.width + 6),
        z: p[1] + (hash(String(i + 3)) - 0.5) * (road.width + 6),
        r: 2 + hash(String(i + 9)) * 3,
      });
    }
  }
}

const hw = area.width / 2;
const hd = area.depth / 2;
const city = {
  id: area.id,
  name: area.name,
  subtitle: area.subtitle,
  origin,
  bounds: { width: area.width, depth: area.depth },
  view: area.view,
  counts: {
    buildings: buildings.length,
    roads: roads.length,
    water: water.length,
    parks: parks.length,
    trees: trees.length,
  },
  buildings,
  roads,
  rails,
  water,
  parks,
  trees,
  signals,
  wouriHint: {
    // broad estuary plane used if OSM water is thin
    plane: [
      [-hw, -hd * 0.15],
      [hw * 0.15, -hd * 0.55],
      [hw * 0.05, hd * 0.2],
      [-hw, hd * 0.35],
    ],
    districts: ["port", "bonanjo", "bonaberi", "akwa"].includes(area.id),
  },
};

const outDir = join(root, "public/tiles", id);
await mkdir(outDir, { recursive: true });
await writeFile(join(outDir, "city.json"), JSON.stringify(city));
console.log("compiled", id, city.counts);
