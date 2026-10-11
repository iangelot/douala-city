import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { AREAS, DEFAULT_AREA } from "./config.mjs";
import { bboxForArea } from "./geo.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const UA = "douala-city/0.1 (https://github.com/procedural-douala; OSM 3D city)";
const ENDPOINTS = [
  "https://overpass.kumi.systems/api/interpreter",
  "https://lz4.overpass-api.de/api/interpreter",
  "https://overpass-api.de/api/interpreter",
];

function arg(name, fallback) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}

function query(bbox) {
  const b = `${bbox.south},${bbox.west},${bbox.north},${bbox.east}`;
  return `[out:json][timeout:180];(way["building"](${b});way["highway"](${b});way["railway"](${b});way["waterway"](${b});way["natural"="water"](${b});way["landuse"](${b});way["leisure"="park"](${b});node["natural"="tree"](${b});relation["natural"="water"](${b}););(._;>;);out body;`;
}

async function post(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      Accept: "application/json, application/osm3s+xml, */*",
      "User-Agent": UA,
    },
    body: "data=" + encodeURIComponent(body),
    signal: AbortSignal.timeout(90000),
  });
  if (!res.ok) throw new Error(`${url} ${res.status}`);
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${url} non-json`);
  }
}

function attr(tag, name) {
  const m = tag.match(new RegExp(`${name}="([^"]*)"`));
  return m ? m[1] : "";
}

function parseOsmXml(xml) {
  const elements = [];
  const nodeRe = /<node([^>]*)(?:\/>|>([\s\S]*?)<\/node>)/g;
  let m;
  while ((m = nodeRe.exec(xml))) {
    const head = m[1];
    const inner = m[2] || "";
    const el = {
      type: "node",
      id: Number(attr(head, "id")),
      lat: Number(attr(head, "lat")),
      lon: Number(attr(head, "lon")),
    };
    const tags = tagsFrom(inner);
    if (tags) el.tags = tags;
    elements.push(el);
  }
  const wayRe = /<way([^>]*)>([\s\S]*?)<\/way>/g;
  while ((m = wayRe.exec(xml))) {
    const nds = [...m[2].matchAll(/<nd ref="(\d+)"/g)].map((x) => Number(x[1]));
    const el = { type: "way", id: Number(attr(m[1], "id")), nodes: nds };
    const tags = tagsFrom(m[2]);
    if (tags) el.tags = tags;
    elements.push(el);
  }
  const relRe = /<relation([^>]*)>([\s\S]*?)<\/relation>/g;
  while ((m = relRe.exec(xml))) {
    const members = [...m[2].matchAll(/<member type="([^"]+)" ref="(\d+)" role="([^"]*)"/g)].map((x) => ({
      type: x[1],
      ref: Number(x[2]),
      role: x[3],
    }));
    const el = { type: "relation", id: Number(attr(m[1], "id")), members };
    const tags = tagsFrom(m[2]);
    if (tags) el.tags = tags;
    elements.push(el);
  }
  return { elements };
}

function tagsFrom(inner) {
  const tags = {};
  let n = 0;
  for (const t of inner.matchAll(/<tag k="([^"]*)" v="([^"]*)"/g)) {
    tags[t[1]] = t[2].replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"');
    n++;
  }
  return n ? tags : undefined;
}

function splitBbox(bbox, nx, ny) {
  const tiles = [];
  const dw = (bbox.east - bbox.west) / nx;
  const dh = (bbox.north - bbox.south) / ny;
  for (let y = 0; y < ny; y++) {
    for (let x = 0; x < nx; x++) {
      tiles.push({
        west: bbox.west + x * dw,
        east: bbox.west + (x + 1) * dw,
        south: bbox.south + y * dh,
        north: bbox.south + (y + 1) * dh,
      });
    }
  }
  return tiles;
}

async function fetchOsmTile(bbox) {
  const url = `https://api.openstreetmap.org/api/0.6/map?bbox=${bbox.west},${bbox.south},${bbox.east},${bbox.north}`;
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "application/xml" },
    signal: AbortSignal.timeout(60000),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`osm map ${res.status} ${text.slice(0, 180)}`);
  return parseOsmXml(text);
}

async function fetchOsmMap(bbox) {
  const tiles = splitBbox(bbox, 3, 3);
  const seen = new Set();
  const elements = [];
  for (let i = 0; i < tiles.length; i++) {
    console.log("osm tile", i + 1, "/", tiles.length);
    let last;
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const part = await fetchOsmTile(tiles[i]);
        for (const el of part.elements || []) {
          const key = `${el.type}:${el.id}`;
          if (seen.has(key)) continue;
          seen.add(key);
          elements.push(el);
        }
        last = null;
        break;
      } catch (err) {
        last = err;
        await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
      }
    }
    if (last) throw last;
    await new Promise((r) => setTimeout(r, 250));
  }
  return { elements };
}

async function fetchOverpass(q) {
  let last;
  for (const url of ENDPOINTS) {
    try {
      console.log("overpass", url);
      return await post(url, q);
    } catch (err) {
      last = err;
      console.warn(String(err));
    }
  }
  throw last;
}

const id = arg("area", DEFAULT_AREA);
const area = AREAS[id];
if (!area) {
  console.error("unknown area", id, "options:", Object.keys(AREAS).join(", "));
  process.exit(1);
}

const bbox = bboxForArea(area);
console.log("fetch", area.name, bbox);
let data;
try {
  data = await fetchOsmMap(bbox);
} catch (err) {
  console.warn("osm map API failed, trying Overpass", err);
  data = await fetchOverpass(query(bbox));
}
const dir = join(root, "data/raw", id);
await mkdir(dir, { recursive: true });
const out = join(dir, "osm.json");
await writeFile(out, JSON.stringify(data));
console.log("wrote", out, "elements", data.elements?.length ?? 0);
