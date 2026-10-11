import * as THREE from "three";
import { MapControls } from "three/addons/controls/MapControls.js";
import { Sky } from "three/addons/objects/Sky.js";
import { Water } from "three/addons/objects/Water.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { SMAAPass } from "three/addons/postprocessing/SMAAPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import GUI from "lil-gui";
import { AREAS, type AreaId } from "../data/areas";
import { fallbackCity } from "./fallback";
import { buildBuildings, buildParks, buildRails, buildRoads, buildWater } from "./geom";
import {
  facadeMaterial,
  groundMaterial,
  makeWaterNormals,
  parkMaterial,
  roadMaterial,
  roofMaterial,
  uniforms,
  waterMaterial,
} from "./materials";
import {
  createBirds,
  createBridge,
  createClouds,
  createCranes,
  createLamps,
  createShips,
  createTraffic,
  createTrees,
} from "./life";
import type { Building, CityData, EngineSettings, InspectInfo } from "./types";

type Handlers = {
  onProgress: (p: number, step: string) => void;
  onReady: (city: CityData) => void;
  onInspect: (info: InspectInfo | null) => void;
};

const STORE = "procedural-douala";

export class CityApp {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  controls: MapControls;
  composer: EffectComposer;
  bloom: UnrealBloomPass;
  clock = new THREE.Clock();
  sun = new THREE.DirectionalLight("#fff3d6", 3.2);
  hemi = new THREE.HemisphereLight("#b7d0e8", "#6a4e32", 0.55);
  sky = new Sky();
  settings: EngineSettings;
  keys = new Set<string>();
  disposed = false;
  city!: CityData;
  traffic: ReturnType<typeof createTraffic> = null;
  birds: ReturnType<typeof createBirds> | null = null;
  lamps: ReturnType<typeof createLamps> = null;
  ships: ReturnType<typeof createShips> = null;
  clouds: ReturnType<typeof createClouds> | null = null;
  estuary: Water | null = null;
  gui: GUI | null = null;
  raycaster = new THREE.Raycaster();
  pointer = new THREE.Vector2();
  buildingIndex: { c: THREE.Vector2; b: Building }[] = [];
  private raf = 0;
  private host: HTMLElement;
  private envReady = false;

  constructor(
    host: HTMLElement,
    public areaId: AreaId,
    public handlers: Handlers
  ) {
    this.host = host;
    this.settings = loadSettings();
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, this.settings.quality === "high" ? 1.75 : 1.15));
    this.renderer.setSize(host.clientWidth, host.clientHeight);
    this.renderer.shadowMap.enabled = this.settings.quality !== "low";
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(55, host.clientWidth / host.clientHeight, 0.8, 18000);
    this.controls = new MapControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.maxPolarAngle = Math.PI * 0.48;
    this.controls.minDistance = 24;
    this.controls.maxDistance = 2800;

    this.scene.background = new THREE.Color("#87a4b8");
    this.scene.fog = new THREE.FogExp2("#9bb4b0", 0.00018);
    this.sun.position.set(400, 600, 180);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(this.settings.quality === "high" ? 2048 : 1024, this.settings.quality === "high" ? 2048 : 1024);
    this.sun.shadow.camera.near = 10;
    this.sun.shadow.camera.far = 2800;
    this.sun.shadow.camera.left = -900;
    this.sun.shadow.camera.right = 900;
    this.sun.shadow.camera.top = 900;
    this.sun.shadow.camera.bottom = -900;
    this.sun.shadow.bias = -0.00015;
    this.scene.add(this.sun, this.hemi, this.sun.target);

    this.sky.scale.setScalar(8000);
    this.scene.add(this.sky);

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(host.clientWidth, host.clientHeight), 0.18, 0.4, 0.85);
    this.composer.addPass(this.bloom);
    if (this.settings.quality !== "low") {
      this.composer.addPass(new SMAAPass());
    }
    this.composer.addPass(new OutputPass());

    window.addEventListener("resize", this.onResize);
    window.addEventListener("keydown", this.onKey);
    window.addEventListener("keyup", this.onUp);
    this.renderer.domElement.addEventListener("pointerdown", this.onPointer);

    void this.boot();
  }

  private async boot() {
    this.handlers.onProgress(8, "reading the estuary");
    const city = await loadCity(this.areaId, (p, s) => this.handlers.onProgress(p, s));
    this.city = city;
    this.handlers.onProgress(45, "raising " + city.counts.buildings + " buildings");
    this.meshCity(city);
    this.handlers.onProgress(78, "laying the Wouri and the roads");
    this.setupView(city);
    this.buildGui();
    this.applyTime(this.settings.hour);
    uniforms.uAbstract.value = this.settings.abstract ? 1 : 0;
    this.handlers.onProgress(100, "Douala is up");
    this.handlers.onReady(city);
    this.loop();
  }

  private meshCity(city: CityData) {
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(city.bounds.width * 1.4, city.bounds.depth * 1.4, 64, 64),
      groundMaterial()
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    const pos = ground.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      pos.setZ(i, Math.sin(x * 0.008) * 1.6 + Math.cos(y * 0.01) * 1.2);
    }
    ground.geometry.computeVertexNormals();
    this.scene.add(ground);

    const { walls, roof } = buildBuildings(city);
    const wallMesh = new THREE.Mesh(walls, facadeMaterial());
    wallMesh.name = "walls";
    wallMesh.castShadow = true;
    wallMesh.receiveShadow = true;
    const roofMesh = new THREE.Mesh(roof, roofMaterial());
    roofMesh.castShadow = true;
    this.scene.add(wallMesh, roofMesh);

    this.buildingIndex = city.buildings.map((b) => {
      let x = 0;
      let z = 0;
      for (const p of b.ring) {
        x += p[0];
        z += p[1];
      }
      return { c: new THREE.Vector2(x / b.ring.length, z / b.ring.length), b };
    });

    const roads = new THREE.Mesh(buildRoads(city), roadMaterial());
    roads.receiveShadow = true;
    this.scene.add(roads);

    const rails = buildRails(city);
    if (rails.getAttribute("position") && rails.getAttribute("position").count) {
      this.scene.add(new THREE.Mesh(rails, new THREE.MeshStandardMaterial({ color: "#2a2a28", metalness: 0.4 })));
    }

    const water = new THREE.Mesh(buildWater(city), waterMaterial());
    this.scene.add(water);

    if (city.wouriHint?.districts) {
      const geo = new THREE.PlaneGeometry(city.bounds.width * 0.7, city.bounds.depth * 0.55, 32, 32);
      const estuary = new Water(geo, {
        textureWidth: 512,
        textureHeight: 512,
        waterNormals: makeWaterNormals(),
        sunDirection: this.sun.position.clone().normalize(),
        sunColor: 0xfff1d0,
        waterColor: 0x14535a,
        distortionScale: 2.8,
        fog: true,
      });
      estuary.rotation.x = -Math.PI / 2;
      estuary.position.set(-city.bounds.width * 0.28, 0.04, -20);
      this.estuary = estuary;
      this.scene.add(estuary);
    }

    const parks = new THREE.Mesh(buildParks(city.parks), parkMaterial());
    this.scene.add(parks);

    const trees = createTrees(city);
    if (trees) this.scene.add(trees);

    const cranes = createCranes(city);
    if (cranes) this.scene.add(cranes);

    const bridge = createBridge(city);
    if (bridge) this.scene.add(bridge);

    this.ships = createShips(city);
    if (this.ships) this.scene.add(this.ships.group);

    this.lamps = createLamps(city);
    if (this.lamps) this.scene.add(this.lamps.group);

    if (this.settings.traffic) {
      this.traffic = createTraffic(city, this.settings.cars);
      if (this.traffic) this.scene.add(this.traffic.mesh);
    }
    this.birds = createBirds(this.settings.birds);
    this.scene.add(this.birds.mesh);

    this.clouds = createClouds();
    this.clouds.mat.opacity = 0.2 + this.settings.clouds * 0.7;
    this.scene.add(this.clouds.mesh);
  }

  private setupView(city: CityData) {
    const v = city.view;
    this.camera.position.set(v.x, v.y, v.z);
    this.controls.target.set(0, 8, 0);
    this.controls.update();
  }

  private buildGui() {
    const gui = new GUI({ title: "Douala" });
    gui.domElement.style.right = "10px";
    gui.domElement.style.top = "10px";
    const s = this.settings;
    gui.add(s, "hour", 0, 24, 0.05).name("hour").onChange((v: number) => this.applyTime(v));
    gui.add(s, "liveClock").name("live clock").onChange(() => saveSettings(s));
    gui
      .add(s, "abstract")
      .name("abstract")
      .onChange((v: boolean) => {
        uniforms.uAbstract.value = v ? 1 : 0;
        saveSettings(s);
      });
    gui.add(s, "traffic").onChange(() => saveSettings(s));
    gui.add(s, "cars", 0, 1200, 10).onFinishChange(() => saveSettings(s));
    gui.add(s, "birds", 0, 400, 10).onFinishChange(() => saveSettings(s));
    gui.add(s, "clouds", 0, 1, 0.05).onChange((v: number) => {
      if (this.clouds) this.clouds.mat.opacity = 0.15 + v * 0.7;
      saveSettings(s);
    });
    gui.add(s, "quality", ["high", "med", "low"]).onFinishChange(() => {
      saveSettings(s);
      location.reload();
    });
    const areaCtrl = { area: this.areaId };
    gui.add(areaCtrl, "area", Object.keys(AREAS)).onChange((id: AreaId) => {
      const url = new URL(location.href);
      url.searchParams.set("area", id);
      location.href = url.toString();
    });
    this.gui = gui;
  }

  applyTime(hour: number) {
    this.settings.hour = hour;
    uniforms.uHour.value = hour;
    const solar = sunFromHour(hour);
    uniforms.uNight.value = solar.night;
    this.sun.position.copy(solar.dir).multiplyScalar(900);
    this.sun.intensity = 0.15 + solar.day * 3.4;
    this.sun.color.set(solar.sunColor);
    this.hemi.intensity = 0.18 + solar.day * 0.5;
    this.hemi.color.set(solar.sky);
    this.hemi.groundColor.set(solar.ground);
    (this.scene.fog as THREE.FogExp2).color.set(solar.fog);
    this.scene.background = new THREE.Color(solar.fog);
    const skyU = this.sky.material.uniforms;
    skyU["sunPosition"].value.copy(solar.dir);
    skyU["turbidity"].value = 8 + solar.night * 6;
    skyU["rayleigh"].value = 1.4 + solar.dusk * 1.8;
    skyU["mieCoefficient"].value = 0.005;
    skyU["mieDirectionalG"].value = 0.74;
    this.renderer.toneMappingExposure = 0.52 + solar.day * 0.72;
    this.bloom.strength = 0.12 + solar.night * 0.55;
    if (this.lamps) this.lamps.headMat.emissiveIntensity = solar.night * 4.6;
    if (this.estuary) {
      const u = (this.estuary.material as THREE.ShaderMaterial).uniforms;
      if (u.sunDirection) u.sunDirection.value.copy(solar.dir);
    }
    if (!this.envReady) {
      this.envReady = true;
      const pmrem = new THREE.PMREMGenerator(this.renderer);
      this.scene.environment = pmrem.fromScene(this.scene).texture;
      pmrem.dispose();
    }
    saveSettings(this.settings);
  }

  toggleMode() {
    this.settings.abstract = !this.settings.abstract;
    uniforms.uAbstract.value = this.settings.abstract ? 1 : 0;
    saveSettings(this.settings);
  }

  private loop = () => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(this.clock.getDelta(), 0.05);
    uniforms.uTime.value = this.clock.elapsedTime;
    if (this.settings.liveClock) {
      const d = new Date();
      const h = d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;
      this.applyTime(h);
    }
    this.fly(dt);
    this.controls.update();
    this.traffic?.update(dt);
    this.birds?.update(this.clock.elapsedTime);
    this.ships?.update(this.clock.elapsedTime);
    this.clouds?.update(this.clock.elapsedTime);
    if (this.estuary) {
      const u = (this.estuary.material as THREE.ShaderMaterial).uniforms;
      if (u.time) u.time.value = this.clock.elapsedTime;
    }
    this.sun.target.position.copy(this.controls.target);
    this.composer.render();
  };

  private fly(dt: number) {
    if (!this.keys.size) return;
    const speed = (this.keys.has("shift") ? 220 : 70) * dt;
    const forward = new THREE.Vector3();
    this.camera.getWorldDirection(forward);
    forward.y = 0;
    forward.normalize();
    const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();
    if (this.keys.has("w")) this.camera.position.addScaledVector(forward, speed);
    if (this.keys.has("s")) this.camera.position.addScaledVector(forward, -speed);
    if (this.keys.has("a")) this.camera.position.addScaledVector(right, -speed);
    if (this.keys.has("d")) this.camera.position.addScaledVector(right, speed);
    if (this.keys.has("w") || this.keys.has("s") || this.keys.has("a") || this.keys.has("d")) {
      const look = forward.clone().multiplyScalar(180);
      this.controls.target.set(this.camera.position.x + look.x, 8, this.camera.position.z + look.z);
    }
  }

  private onPointer = (e: PointerEvent) => {
    if (e.button !== 0) return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects(this.scene.children, true);
    const hit = hits.find((h) => h.object.name === "walls");
    if (!hit) {
      this.handlers.onInspect(null);
      return;
    }
    let best: { c: THREE.Vector2; b: Building } | null = null;
    let d = 40;
    for (const item of this.buildingIndex) {
      const dd = item.c.distanceTo(new THREE.Vector2(hit.point.x, hit.point.z));
      if (dd < d) {
        d = dd;
        best = item;
      }
    }
    if (!best) {
      this.handlers.onInspect(null);
      return;
    }
    this.handlers.onInspect({
      name: best.b.name || "Building",
      use: best.b.use,
      height: Math.round(best.b.height * 10) / 10,
      levels: best.b.levels || Math.max(1, Math.round(best.b.height / 3.1)),
    });
  };

  private onKey = (e: KeyboardEvent) => {
    const k = e.key.toLowerCase();
    this.keys.add(k);
    if (e.key === "Shift") this.keys.add("shift");
    if (k === "n") this.applyTime((this.settings.hour + 12) % 24);
  };

  private onUp = (e: KeyboardEvent) => {
    this.keys.delete(e.key.toLowerCase());
    if (e.key === "Shift") this.keys.delete("shift");
  };

  private onResize = () => {
    const w = this.host.clientWidth;
    const h = this.host.clientHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
  };

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener("resize", this.onResize);
    window.removeEventListener("keydown", this.onKey);
    window.removeEventListener("keyup", this.onUp);
    this.renderer.domElement.removeEventListener("pointerdown", this.onPointer);
    this.gui?.destroy();
    this.controls.dispose();
    this.composer.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}

function sunFromHour(hour: number) {
  const day = Math.max(0, Math.sin(((hour - 6) / 12) * Math.PI));
  const dusk =
    Math.max(0, 1 - Math.abs(hour - 6.4) * 0.55) + Math.max(0, 1 - Math.abs(hour - 18.1) * 0.55);
  const night = THREE.MathUtils.smoothstep(day, 0.22, 0);
  const az = ((hour - 6) / 12) * Math.PI;
  const el = day * 1.35;
  const dir = new THREE.Vector3(Math.cos(az), Math.sin(el) + 0.02, Math.sin(az) * 0.35).normalize();
  const sunColor = dusk > 0.2 ? "#ffb070" : night > 0.7 ? "#8899bb" : "#fff1d0";
  const sky = night > 0.6 ? "#0b1220" : dusk > 0.3 ? "#f0a070" : "#c5dde8";
  const ground = night > 0.6 ? "#1a140e" : "#7a5a3a";
  const fog = night > 0.6 ? "#0c1018" : dusk > 0.3 ? "#c98962" : "#9bb8b0";
  return { day, dusk: Math.min(1, dusk), night, dir, sunColor, sky, ground, fog };
}

async function loadCity(id: AreaId, onProgress: (p: number, s: string) => void): Promise<CityData> {
  onProgress(12, "streaming " + AREAS[id].name);
  try {
    const res = await fetch(`/tiles/${id}/city.json`);
    if (!res.ok) throw new Error("no tiles");
    onProgress(30, "meshing OpenStreetMap");
    return (await res.json()) as CityData;
  } catch {
    onProgress(30, "no compiled tiles — procedural Douala");
    return fallbackCity(id);
  }
}

function loadSettings(): EngineSettings {
  const url = new URL(location.href);
  const base: EngineSettings = {
    hour: 16.2,
    liveClock: false,
    traffic: true,
    cars: 420,
    birds: 120,
    clouds: 0.28,
    quality: "high",
    abstract: false,
    wholeCity: true,
  };
  try {
    Object.assign(base, JSON.parse(localStorage.getItem(STORE) || "{}"));
  } catch {
    /* ignore */
  }
  if (url.searchParams.has("time")) base.hour = parseFloat(url.searchParams.get("time") || "16");
  if (url.searchParams.get("night") === "1") base.hour = 21;
  if (url.searchParams.has("traffic")) base.traffic = url.searchParams.get("traffic") !== "0";
  if (url.searchParams.has("cars")) base.cars = parseInt(url.searchParams.get("cars") || "420", 10);
  return base;
}

function saveSettings(s: EngineSettings) {
  try {
    localStorage.setItem(STORE, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}
