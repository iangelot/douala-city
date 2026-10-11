import type { Building, CityData, Road, Vec2 } from "./types";
import { AREAS, type AreaId } from "../data/areas";

function hash(n: number) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function rect(cx: number, cz: number, w: number, d: number, rot = 0): Vec2[] {
  const hw = w / 2;
  const hd = d / 2;
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  const pts: Vec2[] = [
    [-hw, -hd],
    [hw, -hd],
    [hw, hd],
    [-hw, hd],
  ];
  return pts.map(([x, z]) => [cx + x * c - z * s, cz + x * s + z * c] as Vec2);
}

export function fallbackCity(areaId: AreaId): CityData {
  const area = AREAS[areaId];
  const buildings: Building[] = [];
  const roads: Road[] = [];
  const hw = area.width / 2;
  const hd = area.depth / 2;

  let id = 1;
  for (let i = 0; i < 1400; i++) {
    const u = hash(i + 11);
    const v = hash(i + 91);
    const x = (u - 0.5) * area.width * 0.92;
    const z = (v - 0.5) * area.depth * 0.92;
    if (areaId !== "newbell" && areaId !== "deido" && x < -area.width * 0.28 && Math.abs(z) < area.depth * 0.22) {
      continue;
    }
    const w = 8 + hash(i + 3) * 22;
    const d = 8 + hash(i + 7) * 18;
    const uses = ["residential", "residential", "mixed", "commercial", "industrial"] as const;
    const use = uses[Math.floor(hash(i + 17) * uses.length)];
    const height =
      use === "commercial" ? 10 + hash(i) * 24 : use === "industrial" ? 8 + hash(i) * 10 : 4.5 + hash(i) * 11;
    buildings.push({
      id: id++,
      ring: rect(x, z, w, d, (hash(i + 21) - 0.5) * 0.4),
      height,
      use,
      name: "",
      levels: Math.max(1, Math.round(height / 3.1)),
    });
  }

  buildings.push({
    id: id++,
    ring: rect(40, -30, 38, 52, 0.1),
    height: 28,
    use: "civic",
    name: "Hotel de Ville",
    levels: 8,
  });
  buildings.push({
    id: id++,
    ring: rect(-20, 80, 22, 42, -0.2),
    height: 22,
    use: "worship",
    name: "Cathedrale",
    levels: 2,
  });

  let rid = 1;
  for (let z = -hd + 80; z < hd; z += 90) {
    roads.push({
      id: rid++,
      pts: [
        [-hw + 40, z],
        [hw - 40, z + (hash(z) - 0.5) * 20],
      ],
      width: Math.abs(z) < 40 ? 16 : 8,
      kind: Math.abs(z) < 40 ? "primary" : "residential",
      oneway: false,
      bridge: false,
      tunnel: false,
      name: Math.abs(z) < 40 ? "Boulevard de la Liberte" : "",
    });
  }
  for (let x = -hw + 90; x < hw; x += 110) {
    roads.push({
      id: rid++,
      pts: [
        [x, -hd + 40],
        [x + (hash(x) - 0.5) * 16, hd - 40],
      ],
      width: 7,
      kind: "residential",
      oneway: false,
      bridge: false,
      tunnel: false,
      name: "",
    });
  }

  return {
    id: area.id,
    name: area.name,
    subtitle: area.subtitle,
    origin: { lat: area.lat, lon: area.lon },
    bounds: { width: area.width, depth: area.depth },
    view: area.view,
    counts: { buildings: buildings.length, roads: roads.length, water: 1, parks: 0, trees: 0 },
    buildings,
    roads,
    rails: [],
    water: [
      {
        kind: "river",
        ring: [
          [-hw, -hd * 0.08],
          [-hw * 0.15, -hd * 0.45],
          [-hw * 0.05, hd * 0.18],
          [-hw, hd * 0.32],
        ],
      },
    ],
    parks: [],
    trees: Array.from({ length: 400 }, (_, i) => ({
      x: (hash(i + 4) - 0.5) * area.width,
      z: (hash(i + 8) - 0.5) * area.depth,
      r: 2 + hash(i + 9) * 4,
    })),
    signals: [],
    wouriHint: { plane: [], districts: true },
  };
}
