import * as THREE from "three";
import earcut from "earcut";
import type { Building, CityData, Park, Road, Vec2, WaterPoly } from "./types";

function pushV3(arr: number[], x: number, y: number, z: number) {
  arr.push(x, y, z);
}

function addTri(
  pos: number[],
  nrm: number[],
  uv: number[],
  col: number[],
  seed: number[],
  a: THREE.Vector3,
  b: THREE.Vector3,
  c: THREE.Vector3,
  color: THREE.Color,
  s: number,
  uvA: number[],
  uvB: number[],
  uvC: number[]
) {
  const ab = b.clone().sub(a);
  const ac = c.clone().sub(a);
  const n = new THREE.Vector3().crossVectors(ab, ac).normalize();
  pushV3(pos, a.x, a.y, a.z);
  pushV3(pos, b.x, b.y, b.z);
  pushV3(pos, c.x, c.y, c.z);
  for (let i = 0; i < 3; i++) pushV3(nrm, n.x, n.y, n.z);
  uv.push(...uvA, ...uvB, ...uvC);
  for (let i = 0; i < 3; i++) {
    col.push(color.r, color.g, color.b);
    seed.push(s);
  }
}

const USE_COLOR: Record<string, [number, number, number]> = {
  residential: [0.72, 0.62, 0.48],
  commercial: [0.62, 0.58, 0.54],
  mixed: [0.68, 0.56, 0.45],
  industrial: [0.55, 0.5, 0.46],
  civic: [0.78, 0.74, 0.68],
  worship: [0.86, 0.8, 0.7],
  school: [0.74, 0.66, 0.5],
};

function tint(use: string, seed: number) {
  const base = USE_COLOR[use] || USE_COLOR.mixed;
  const c = new THREE.Color().setRGB(
    base[0] * (0.85 + seed * 0.22),
    base[1] * (0.82 + seed * 0.2),
    base[2] * (0.8 + seed * 0.18)
  );
  return c;
}

export function buildBuildings(city: CityData) {
  const pos: number[] = [];
  const nrm: number[] = [];
  const uv: number[] = [];
  const col: number[] = [];
  const seed: number[] = [];
  const roofs: { pos: number[]; nrm: number[]; uv: number[]; col: number[] } = {
    pos: [],
    nrm: [],
    uv: [],
    col: [],
  };

  for (const b of city.buildings) {
    meshBuilding(b, pos, nrm, uv, col, seed, roofs);
  }

  const walls = new THREE.BufferGeometry();
  walls.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  walls.setAttribute("normal", new THREE.Float32BufferAttribute(nrm, 3));
  walls.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  walls.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  walls.setAttribute("aSeed", new THREE.Float32BufferAttribute(seed, 1));

  const roof = new THREE.BufferGeometry();
  roof.setAttribute("position", new THREE.Float32BufferAttribute(roofs.pos, 3));
  roof.setAttribute("normal", new THREE.Float32BufferAttribute(roofs.nrm, 3));
  roof.setAttribute("uv", new THREE.Float32BufferAttribute(roofs.uv, 2));
  roof.setAttribute("color", new THREE.Float32BufferAttribute(roofs.col, 3));

  return { walls, roof, count: city.buildings.length };
}

function meshBuilding(
  b: Building,
  pos: number[],
  nrm: number[],
  uv: number[],
  col: number[],
  seed: number[],
  roofs: { pos: number[]; nrm: number[]; uv: number[]; col: number[] }
) {
  const ring = b.ring;
  if (ring.length < 3) return;
  const s = ((b.id * 13) % 1000) / 1000;
  const color = tint(b.use, s);
  const h = b.height;
  const roofC = color.clone().multiplyScalar(0.78);
  if (b.use === "industrial") roofC.setRGB(0.42, 0.38, 0.34);
  if (b.use === "worship") roofC.setRGB(0.45, 0.22, 0.16);

  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const c = ring[(i + 1) % ring.length];
    const len = Math.hypot(c[0] - a[0], c[1] - a[1]);
    const p0 = new THREE.Vector3(a[0], 0, a[1]);
    const p1 = new THREE.Vector3(c[0], 0, c[1]);
    const p2 = new THREE.Vector3(c[0], h, c[1]);
    const p3 = new THREE.Vector3(a[0], h, a[1]);
    addTri(pos, nrm, uv, col, seed, p0, p1, p2, color, s, [0, 0], [len, 0], [len, h]);
    addTri(pos, nrm, uv, col, seed, p0, p2, p3, color, s, [0, 0], [len, h], [0, h]);
  }

  const flat: number[] = [];
  for (const p of ring) flat.push(p[0], p[1]);
  let idx: number[];
  try {
    idx = earcut(flat, null, 2);
  } catch {
    return;
  }
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < idx.length; i += 3) {
    const ia = idx[i];
    const ib = idx[i + 1];
    const ic = idx[i + 2];
    const a = new THREE.Vector3(ring[ia][0], h, ring[ia][1]);
    const bb = new THREE.Vector3(ring[ib][0], h, ring[ib][1]);
    const c = new THREE.Vector3(ring[ic][0], h, ring[ic][1]);
    const ab = bb.clone().sub(a);
    const ac = c.clone().sub(a);
    if (new THREE.Vector3().crossVectors(ab, ac).dot(up) < 0) {
      roofs.pos.push(a.x, a.y, a.z, c.x, c.y, c.z, bb.x, bb.y, bb.z);
    } else {
      roofs.pos.push(a.x, a.y, a.z, bb.x, bb.y, bb.z, c.x, c.y, c.z);
    }
    for (let k = 0; k < 3; k++) {
      roofs.nrm.push(0, 1, 0);
      roofs.col.push(roofC.r, roofC.g, roofC.b);
    }
    roofs.uv.push(ring[ia][0] * 0.05, ring[ia][1] * 0.05, ring[ib][0] * 0.05, ring[ib][1] * 0.05, ring[ic][0] * 0.05, ring[ic][1] * 0.05);
  }
}

export function buildRoads(city: CityData) {
  const pos: number[] = [];
  const nrm: number[] = [];
  const uv: number[] = [];
  for (const road of city.roads) {
    if (road.tunnel) continue;
    ribbon(road.pts, road.width, road.bridge ? 7.5 : 0.05, pos, nrm, uv);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  return g;
}

export function buildRails(city: CityData) {
  const pos: number[] = [];
  const nrm: number[] = [];
  const uv: number[] = [];
  for (const r of city.rails) ribbon(r.pts, 3.2, 0.12, pos, nrm, uv);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  return g;
}

function ribbon(pts: Vec2[], width: number, y: number, pos: number[], nrm: number[], uv: number[]) {
  if (pts.length < 2) return;
  let dist = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const len = Math.hypot(dx, dz);
    if (len < 0.2) continue;
    const nx = (-dz / len) * (width / 2);
    const nz = (dx / len) * (width / 2);
    const a0 = new THREE.Vector3(a[0] + nx, y, a[1] + nz);
    const a1 = new THREE.Vector3(a[0] - nx, y, a[1] - nz);
    const b0 = new THREE.Vector3(b[0] + nx, y, b[1] + nz);
    const b1 = new THREE.Vector3(b[0] - nx, y, b[1] - nz);
    pos.push(a0.x, a0.y, a0.z, a1.x, a1.y, a1.z, b1.x, b1.y, b1.z);
    pos.push(a0.x, a0.y, a0.z, b1.x, b1.y, b1.z, b0.x, b0.y, b0.z);
    for (let k = 0; k < 6; k++) nrm.push(0, 1, 0);
    const d1 = dist;
    const d2 = dist + len;
    uv.push(0, d1, 1, d1, 1, d2, 0, d1, 1, d2, 0, d2);
    dist = d2;
  }
}

export function buildPolygons(list: { ring?: Vec2[] }[], y: number) {
  const pos: number[] = [];
  const nrm: number[] = [];
  const uv: number[] = [];
  for (const item of list) {
    const ring = item.ring;
    if (!ring || ring.length < 3) continue;
    const flat: number[] = [];
    for (const p of ring) flat.push(p[0], p[1]);
    let idx: number[];
    try {
      idx = earcut(flat, null, 2);
    } catch {
      continue;
    }
    for (let i = 0; i < idx.length; i += 3) {
      const pa = ring[idx[i]];
      const pb = ring[idx[i + 1]];
      const pc = ring[idx[i + 2]];
      pos.push(pa[0], y, pa[1], pb[0], y, pb[1], pc[0], y, pc[1]);
      nrm.push(0, 1, 0, 0, 1, 0, 0, 1, 0);
      uv.push(pa[0] * 0.02, pa[1] * 0.02, pb[0] * 0.02, pb[1] * 0.02, pc[0] * 0.02, pc[1] * 0.02);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  return g;
}

export function buildWater(city: CityData) {
  const pos: number[] = [];
  const nrm: number[] = [];
  const uv: number[] = [];
  const polys: WaterPoly[] = [...city.water];
  if (city.wouriHint?.districts && city.water.filter((w) => w.ring).length < 1) {
    polys.push({ ring: city.wouriHint.plane, kind: "wouri" });
  }
  for (const w of polys) {
    if (w.ring && w.ring.length >= 3) {
      const flat: number[] = [];
      for (const p of w.ring) flat.push(p[0], p[1]);
      let idx: number[];
      try {
        idx = earcut(flat, null, 2);
      } catch {
        continue;
      }
      for (let i = 0; i < idx.length; i += 3) {
        const pa = w.ring[idx[i]];
        const pb = w.ring[idx[i + 1]];
        const pc = w.ring[idx[i + 2]];
        pos.push(pa[0], 0.02, pa[1], pb[0], 0.02, pb[1], pc[0], 0.02, pc[1]);
        nrm.push(0, 1, 0, 0, 1, 0, 0, 1, 0);
        uv.push(pa[0] * 0.02, pa[1] * 0.02, pb[0] * 0.02, pb[1] * 0.02, pc[0] * 0.02, pc[1] * 0.02);
      }
    } else if (w.pts && w.width) {
      ribbon(w.pts, w.width, 0.02, pos, nrm, uv);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  return g;
}

export function buildParks(list: Park[]) {
  return buildPolygons(list, 0.03);
}

export function resampleRoad(road: Road, step = 14) {
  const pts: { x: number; z: number; ang: number }[] = [];
  for (let i = 0; i < road.pts.length - 1; i++) {
    const a = road.pts[i];
    const b = road.pts[i + 1];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const n = Math.max(1, Math.floor(len / step));
    for (let k = 0; k < n; k++) {
      const t = k / n;
      pts.push({
        x: a[0] + (b[0] - a[0]) * t,
        z: a[1] + (b[1] - a[1]) * t,
        ang: Math.atan2(b[0] - a[0], b[1] - a[1]),
      });
    }
  }
  return pts;
}
