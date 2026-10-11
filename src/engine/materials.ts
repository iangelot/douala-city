import * as THREE from "three";

export const uniforms = {
  uNight: { value: 0 },
  uHour: { value: 16 },
  uAbstract: { value: 0 },
  uTime: { value: 0 },
};

const facadeChunk = /* glsl */ `
uniform float uNight;
uniform float uAbstract;
uniform float uTime;
varying vec3 vWp;
varying float vSeed;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
`;

export function facadeMaterial() {
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.68,
    metalness: 0.06,
    envMapIntensity: 0.85,
  });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
        attribute float aSeed;
        varying float vSeed;
        varying vec3 vWp;`
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        vSeed = aSeed;
        vWp = (modelMatrix * vec4(transformed, 1.0)).xyz;`
      );
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\n${facadeChunk}`)
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        vec2 grid = vec2(vWp.x + vWp.z, vWp.y);
        float floors = 0.34;
        float wx = fract(grid.x * 0.26 + vSeed * 5.0);
        float wy = fract(vWp.y * floors + 0.08);
        float win = step(0.18, wx) * step(wx, 0.82) * step(0.16, wy) * step(wy, 0.82);
        float frame = step(0.12, abs(wx-0.5)*2.0) * step(0.16, abs(wy-0.5)*2.0);
        win *= frame * step(2.4, vWp.y);
        float laterite = 0.55 + 0.18 * hash(vec2(vSeed, 2.2));
        vec3 plaster = mix(vec3(0.78, 0.68, 0.52), vec3(0.62, 0.48, 0.34), laterite);
        vec3 paint = mix(diffuseColor.rgb, plaster, 0.35);
        float rust = hash(floor(vec2(grid.x * 0.08, vWp.y * 0.1)) + vSeed);
        paint = mix(paint, vec3(0.42, 0.28, 0.18), step(0.86, rust) * 0.35);
        float shutter = step(0.92, hash(floor(vec2(grid.x*0.26, vWp.y*floors))+vSeed*3.0));
        vec3 shutterCol = vec3(0.15, 0.38, 0.28);
        paint = mix(paint, mix(vec3(0.10,0.12,0.14), shutterCol, shutter), win);
        float lit = step(0.48, hash(floor(vec2(grid.x*0.26, vWp.y*floors)) + vSeed + floor(uTime*0.04)));
        vec3 nightWin = vec3(1.0, 0.84, 0.48);
        vec3 shop = vec3(1.0, 0.52, 0.16);
        float isShop = step(vWp.y, 4.4) * step(2.2, vWp.y);
        vec3 glow = mix(nightWin, shop, isShop);
        paint = mix(paint, mix(vec3(0.09,0.10,0.12), glow, lit * uNight), win);
        diffuseColor.rgb = mix(paint, diffuseColor.rgb * 0.5 + vec3(0.38,0.46,0.52)*0.5, uAbstract);
        `
      )
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
        vec2 g2 = vec2(vWp.x + vWp.z, vWp.y);
        float wx2 = fract(g2.x * 0.26 + vSeed * 5.0);
        float wy2 = fract(vWp.y * 0.34 + 0.08);
        float win2 = step(0.18, wx2) * step(wx2, 0.82) * step(0.16, wy2) * step(wy2, 0.82) * step(2.4, vWp.y);
        float lit2 = step(0.48, hash(floor(vec2(g2.x*0.26, vWp.y*0.34)) + vSeed));
        float isShop2 = step(vWp.y, 4.4) * step(2.2, vWp.y);
        vec3 glow2 = mix(vec3(1.0, 0.84, 0.48), vec3(1.0, 0.48, 0.14), isShop2);
        totalEmissiveRadiance += glow2 * win2 * lit2 * uNight * 2.8 * (1.0 - uAbstract);
        `
      );
  };
  mat.customProgramCacheKey = () => "facade-dla-2";
  return mat;
}

export function roofMaterial() {
  return new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.88,
    metalness: 0.12,
  });
}

export function roadMaterial() {
  const mat = new THREE.MeshStandardMaterial({
    color: new THREE.Color("#3a3734"),
    roughness: 0.9,
    metalness: 0.02,
  });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\nuniform float uAbstract;\nuniform float uNight;\n`)
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        vec2 ru = vMapUv;
        float lane = smoothstep(0.46, 0.485, ru.x) * smoothstep(0.54, 0.515, ru.x);
        float dash = step(0.42, fract(ru.y * 0.07));
        float edge = smoothstep(0.04, 0.0, ru.x) + smoothstep(0.96, 1.0, ru.x);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.88,0.84,0.68), lane * dash * 0.9);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.78,0.76,0.7), edge * 0.35);
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 0.45, uNight * 0.55);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.56,0.57,0.59), uAbstract);
        `
      );
  };
  mat.customProgramCacheKey = () => "road-dla-2";
  return mat;
}

export function waterMaterial() {
  const mat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color("#1a4a4e"),
    roughness: 0.12,
    metalness: 0.08,
    transmission: 0.18,
    thickness: 2.4,
    transparent: true,
    opacity: 0.94,
    envMapIntensity: 1.2,
  });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\nuniform float uTime;\nvarying vec2 vWuv;`)
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        vWuv = uv;
        transformed.y += sin(uv.x * 22.0 + uTime * 0.55) * 0.12 + cos(uv.y * 16.0 + uTime * 0.4) * 0.09;`
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>\nuniform float uTime; uniform float uNight; uniform float uAbstract;\nvarying vec2 vWuv;`
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        float w = sin(vWuv.x * 36.0 + uTime * 0.8) * 0.5 + 0.5;
        vec3 silt = vec3(0.22, 0.38, 0.34);
        vec3 deep = vec3(0.04, 0.13, 0.16);
        vec3 night = vec3(0.02, 0.04, 0.07);
        diffuseColor.rgb = mix(deep, silt, w * 0.4);
        diffuseColor.rgb = mix(diffuseColor.rgb, night, uNight * 0.78);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.40,0.62,0.74), uAbstract);
        `
      );
  };
  mat.customProgramCacheKey = () => "water-dla-2";
  return mat;
}

export function groundMaterial() {
  const mat = new THREE.MeshStandardMaterial({
    color: new THREE.Color("#6a5a42"),
    roughness: 0.96,
    metalness: 0,
  });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\nvarying vec3 vGp;`)
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        vGp = (modelMatrix * vec4(transformed, 1.0)).xyz;`
      );
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\nvarying vec3 vGp;\nuniform float uAbstract;\nuniform float uNight;\nfloat gh(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }`)
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        float n = gh(floor(vGp.xz * 0.08));
        vec3 laterite = vec3(0.48, 0.32, 0.18);
        vec3 dust = vec3(0.62, 0.52, 0.36);
        vec3 grass = vec3(0.22, 0.38, 0.18);
        vec3 gnd = mix(laterite, dust, n);
        gnd = mix(gnd, grass, smoothstep(0.62, 0.9, gh(floor(vGp.xz * 0.035))) * 0.65);
        diffuseColor.rgb = mix(gnd, vec3(0.5,0.52,0.48), uAbstract);
        diffuseColor.rgb *= mix(1.0, 0.35, uNight);
        `
      );
  };
  mat.customProgramCacheKey = () => "ground-dla-2";
  return mat;
}

export function parkMaterial() {
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color("#355a30"),
    roughness: 0.92,
  });
}

export function makeWaterNormals() {
  const size = 256;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const nx = Math.sin(x * 0.11) * Math.cos(y * 0.09);
      const ny = Math.cos(x * 0.07) * Math.sin(y * 0.13);
      data[i] = 128 + nx * 48;
      data[i + 1] = 128 + ny * 48;
      data[i + 2] = 255;
      data[i + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.needsUpdate = true;
  return tex;
}
