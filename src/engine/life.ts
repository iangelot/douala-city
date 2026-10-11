import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { resampleRoad } from "./geom";
import type { CityData } from "./types";

function carGeometry() {
  const body = new THREE.BoxGeometry(3.7, 1.05, 1.7);
  body.translate(0, 0.72, 0);
  const cabin = new THREE.BoxGeometry(1.8, 0.78, 1.55);
  cabin.translate(-0.2, 1.5, 0);
  const merged = mergeGeometries([body, cabin], false);
  return merged ?? body;
}

export function createTraffic(city: CityData, count: number) {
  const paths = city.roads
    .filter((r) => r.width >= 5.5 && !r.tunnel && r.kind !== "footway" && r.kind !== "path")
    .map((r) => resampleRoad(r, 10))
    .filter((p) => p.length > 8);
  if (!paths.length) return null;

  const geo = carGeometry();
  const mat = new THREE.MeshStandardMaterial({
    color: "#c45c2a",
    roughness: 0.38,
    metalness: 0.28,
  });
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  mesh.castShadow = true;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const dummy = new THREE.Object3D();
  const palette = [0xe6c84a, 0xf2f0ea, 0xc45c2a, 0x1f3d2a, 0x222222, 0x8a1c1c, 0x2a4a6a, 0xd6c4a8];
  const color = new THREE.Color();
  const cars = Array.from({ length: count }, (_, i) => {
    const path = paths[i % paths.length];
    color.setHex(palette[i % palette.length]);
    mesh.setColorAt(i, color);
    return {
      path,
      t: Math.random() * path.length,
      speed: 7 + Math.random() * 12,
      lane: (i % 2 === 0 ? 1 : -1) * 1.7,
    };
  });
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

  const update = (dt: number) => {
    for (let i = 0; i < cars.length; i++) {
      const c = cars[i];
      c.t += (c.speed * dt) / 10;
      if (c.t >= c.path.length - 1) c.t = 0;
      const i0 = Math.floor(c.t);
      const a = c.path[i0];
      dummy.position.set(a.x + Math.cos(a.ang) * c.lane, 0.04, a.z + Math.sin(a.ang) * c.lane);
      dummy.rotation.set(0, a.ang + Math.PI / 2, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  };

  return { mesh, update };
}

export function createTrees(city: CityData) {
  const trees = city.trees.slice(0, 1600);
  if (!trees.length) return null;
  const group = new THREE.Group();
  const trunkG = new THREE.CylinderGeometry(0.16, 0.28, 2.6, 6);
  const canopyG = new THREE.SphereGeometry(1, 7, 6);
  const palmG = new THREE.ConeGeometry(1.8, 2.4, 7);
  const trunkM = new THREE.MeshStandardMaterial({ color: "#4a3424", roughness: 1 });
  const canopyM = new THREE.MeshStandardMaterial({ color: "#2c5c28", roughness: 0.88 });
  const palmM = new THREE.MeshStandardMaterial({ color: "#1f6a3a", roughness: 0.82 });
  const nPalm = Math.max(1, Math.floor(trees.length * 0.22));
  const nBroad = trees.length - nPalm;
  const trunks = new THREE.InstancedMesh(trunkG, trunkM, trees.length);
  const canopies = new THREE.InstancedMesh(canopyG, canopyM, nBroad);
  const palms = new THREE.InstancedMesh(palmG, palmM, nPalm);
  trunks.castShadow = true;
  canopies.castShadow = true;
  palms.castShadow = true;
  const dummy = new THREE.Object3D();
  let bi = 0;
  let pi = 0;
  trees.forEach((t, i) => {
    dummy.position.set(t.x, 1.3, t.z);
    dummy.scale.set(1, 1 + (t.r % 1), 1);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    trunks.setMatrixAt(i, dummy.matrix);
    if (i % 5 === 0 && pi < nPalm) {
      dummy.position.set(t.x, 3.4 + t.r * 0.1, t.z);
      dummy.scale.set(t.r * 0.45, t.r * 0.35, t.r * 0.45);
      dummy.updateMatrix();
      palms.setMatrixAt(pi++, dummy.matrix);
    } else if (bi < nBroad) {
      dummy.position.set(t.x, 2.8 + t.r * 0.12, t.z);
      dummy.scale.set(t.r * 0.55, t.r * 0.48, t.r * 0.55);
      dummy.updateMatrix();
      canopies.setMatrixAt(bi++, dummy.matrix);
    }
  });
  group.add(trunks, canopies, palms);
  return group;
}

export function createBirds(count: number) {
  const geo = new THREE.ConeGeometry(0.32, 1.05, 3);
  geo.rotateX(Math.PI / 2);
  const mat = new THREE.MeshStandardMaterial({ color: "#1a1a1a", roughness: 0.8 });
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  const dummy = new THREE.Object3D();
  const seeds = Array.from({ length: count }, () => ({
    r: 90 + Math.random() * 480,
    y: 38 + Math.random() * 110,
    s: 0.35 + Math.random() * 0.85,
    o: Math.random() * Math.PI * 2,
    z: (Math.random() - 0.5) * 240,
  }));
  const update = (t: number) => {
    for (let i = 0; i < count; i++) {
      const b = seeds[i];
      const a = t * b.s + b.o;
      dummy.position.set(Math.cos(a) * b.r, b.y + Math.sin(a * 3) * 5, Math.sin(a) * b.r * 0.72 + b.z);
      dummy.lookAt(dummy.position.x + Math.sin(a), dummy.position.y, dummy.position.z - Math.cos(a));
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  };
  return { mesh, update };
}

export function createLamps(city: CityData) {
  const pts: { x: number; z: number }[] = [];
  for (const r of city.roads) {
    if (r.width < 7) continue;
    const path = resampleRoad(r, 28);
    for (let i = 0; i < path.length; i += 1) {
      if (i % 2)
        pts.push({
          x: path[i].x + Math.cos(path[i].ang) * (r.width * 0.55),
          z: path[i].z + Math.sin(path[i].ang) * (r.width * 0.55),
        });
    }
  }
  const n = Math.min(pts.length, 800);
  if (!n) return null;
  const pole = new THREE.CylinderGeometry(0.07, 0.1, 6.4, 5);
  pole.translate(0, 3.2, 0);
  const head = new THREE.SphereGeometry(0.22, 6, 6);
  const poleM = new THREE.MeshStandardMaterial({ color: "#2b2b28" });
  const headM = new THREE.MeshStandardMaterial({
    color: "#ffd39a",
    emissive: "#ffb45a",
    emissiveIntensity: 0,
  });
  const poles = new THREE.InstancedMesh(pole, poleM, n);
  const heads = new THREE.InstancedMesh(head, headM, n);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < n; i++) {
    dummy.position.set(pts[i].x, 0, pts[i].z);
    dummy.updateMatrix();
    poles.setMatrixAt(i, dummy.matrix);
    dummy.position.set(pts[i].x, 6.35, pts[i].z);
    dummy.updateMatrix();
    heads.setMatrixAt(i, dummy.matrix);
  }
  const group = new THREE.Group();
  group.add(poles, heads);
  return { group, headMat: headM };
}

export function createCranes(city: CityData) {
  if (city.id !== "port" && city.id !== "bonanjo" && city.id !== "bonaberi") return null;
  const g = new THREE.Group();
  const steel = new THREE.MeshStandardMaterial({ color: "#c45a1c", metalness: 0.45, roughness: 0.4 });
  for (let i = 0; i < 7; i++) {
    const crane = new THREE.Group();
    const mast = new THREE.Mesh(new THREE.BoxGeometry(1.6, 46, 1.6), steel);
    mast.position.y = 23;
    mast.castShadow = true;
    const arm = new THREE.Mesh(new THREE.BoxGeometry(52, 1.2, 1.4), steel);
    arm.position.set(14, 44, 0);
    arm.castShadow = true;
    const leg = new THREE.Mesh(new THREE.BoxGeometry(14, 2.2, 9), steel);
    leg.position.y = 1.1;
    crane.add(mast, arm, leg);
    crane.position.set(-city.bounds.width * 0.34 + i * 78, 0, -90 + (i % 2) * 58);
    crane.rotation.y = 0.35 + i * 0.08;
    g.add(crane);
  }
  return g;
}

export function createShips(city: CityData) {
  if (!["port", "bonanjo", "bonaberi", "akwa"].includes(city.id)) return null;
  const hullM = new THREE.MeshStandardMaterial({ color: "#c9c2b4", metalness: 0.35, roughness: 0.45 });
  const stackM = new THREE.MeshStandardMaterial({ color: "#8a1c1c", roughness: 0.6 });
  const group = new THREE.Group();
  for (let i = 0; i < 5; i++) {
    const ship = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.BoxGeometry(48, 6, 12), hullM);
    hull.position.y = 2.2;
    const superstructure = new THREE.Mesh(new THREE.BoxGeometry(16, 8, 10), hullM);
    superstructure.position.set(-8, 8, 0);
    const stack = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.4, 7, 8), stackM);
    stack.position.set(-6, 14, 0);
    ship.add(hull, superstructure, stack);
    ship.position.set(-city.bounds.width * 0.38, 0, -160 + i * 90);
    ship.rotation.y = 0.2;
    group.add(ship);
  }
  const update = (t: number) => {
    group.children.forEach((s, i) => {
      s.position.y = Math.sin(t * 0.6 + i) * 0.25;
    });
  };
  return { group, update };
}

export function createClouds() {
  const geo = new THREE.SphereGeometry(1, 8, 6);
  const mat = new THREE.MeshLambertMaterial({
    color: "#e8eef2",
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
  });
  const n = 28;
  const mesh = new THREE.InstancedMesh(geo, mat, n);
  const dummy = new THREE.Object3D();
  const seeds = Array.from({ length: n }, () => ({
    x: (Math.random() - 0.5) * 2400,
    z: (Math.random() - 0.5) * 2400,
    y: 280 + Math.random() * 160,
    s: 40 + Math.random() * 90,
    drift: 2 + Math.random() * 6,
  }));
  const update = (t: number) => {
    for (let i = 0; i < n; i++) {
      const c = seeds[i];
      dummy.position.set(((c.x + t * c.drift) % 2400) - 1200, c.y, c.z);
      dummy.scale.set(c.s * 1.6, c.s * 0.45, c.s);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  };
  return { mesh, update, mat };
}

export function createBridge(city: CityData) {
  if (!["akwa", "bonaberi", "deido", "port"].includes(city.id)) return null;
  const g = new THREE.Group();
  const conc = new THREE.MeshStandardMaterial({ color: "#8a8680", roughness: 0.82, metalness: 0.08 });
  const deck = new THREE.Mesh(new THREE.BoxGeometry(city.bounds.width * 0.42, 2.2, 18), conc);
  deck.position.set(-city.bounds.width * 0.22, 9, -40);
  deck.rotation.y = 0.18;
  deck.castShadow = true;
  deck.receiveShadow = true;
  g.add(deck);
  for (let i = -4; i <= 4; i++) {
    const pier = new THREE.Mesh(new THREE.BoxGeometry(3.2, 10, 4.2), conc);
    pier.position.set(-city.bounds.width * 0.22 + i * 48, 5, -40 + i * 8);
    g.add(pier);
  }
  return g;
}
