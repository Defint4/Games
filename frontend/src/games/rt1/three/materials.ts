/* Matières et textures procédurales de RT1 : asphalte marqué, grain du terrain, ciel,
   lagon, vent dans la végétation. Tout est calculé une fois au chargement. */

import {
  CanvasTexture,
  FrontSide,
  Color,
  LinearMipmapLinearFilter,
  type Material,
  RepeatWrapping,
  ShaderMaterial,
  type Side,
  SRGBColorSpace,
  type Texture,
  UniformsLib,
  UniformsUtils,
  Vector3,
  Vector4,
} from "three";

export const PALETTE = {
  zenith: "#3F8ED6",
  horizon: "#CFE4EE",
  sun: "#FFF1D8",
  shallow: "#8CE6D2",
  lagoon: "#2EC4C6",
  deep: "#0E6E8C",
  ocean: "#0A4C6E",
};

export const FOG = { color: PALETTE.horizon, near: 170, far: 1500 };

/* Temps partagé par les matières animées (eau, vent). */
export const clock = { value: 0 };

function rand(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* Bruit de valeur périodique (tuile sans raccord). */
function tileNoise(size: number, cells: number, r: () => number): Float32Array {
  const g = new Float32Array(cells * cells).map(() => r());
  const out = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const fx = (x / size) * cells, fy = (y / size) * cells;
      const x0 = Math.floor(fx), y0 = Math.floor(fy);
      const tx = fx - x0, ty = fy - y0;
      const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
      const a = g[(y0 % cells) * cells + (x0 % cells)];
      const b = g[(y0 % cells) * cells + ((x0 + 1) % cells)];
      const c = g[((y0 + 1) % cells) * cells + (x0 % cells)];
      const d = g[((y0 + 1) % cells) * cells + ((x0 + 1) % cells)];
      out[y * size + x] = a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
    }
  }
  return out;
}

let road: CanvasTexture | null = null;

/* Asphalte d'une section de 12 m × 12 m : grain, traces de roues, lignes de rive,
   axe en tirets de 3 m. u traverse la route (gauche → droite), v la suit. */
export function roadTexture(anisotropy: number): CanvasTexture {
  if (road) return road;
  const S = 1024;
  const cv = document.createElement("canvas");
  cv.width = cv.height = S;
  const ctx = cv.getContext("2d")!;
  const img = ctx.createImageData(S, S);
  const r = rand(42);
  const n1 = tileNoise(S, 64, r);
  const n2 = tileNoise(S, 8, r);
  const m = (x: number) => x / 12; // mètres → fraction
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const u = x / S, v = y / S;
      const grain = r();
      let c = 0.29 + (n1[y * S + x] - 0.5) * 0.05 + (n2[y * S + x] - 0.5) * 0.06 + (grain - 0.5) * 0.07;
      if (grain > 0.985) c += 0.12;
      // traces de roues (légèrement plus sombres et lisses)
      for (const lane of [0.25, 0.75]) {
        for (const off of [-0.8, 0.8]) {
          const d = Math.abs(u - lane - m(off)) / m(0.45);
          if (d < 1) c -= 0.035 * (1 - d * d);
        }
      }
      let paint = 0;
      const edge = Math.min(Math.abs(u - m(0.45)), Math.abs(u - (1 - m(0.45))));
      if (edge < m(0.075)) paint = 1;
      const dash = (v * 12) % 6;
      if (Math.abs(u - 0.5) < m(0.075) && dash < 3) paint = 1;
      if (paint) c = 0.86 - (n1[((y * 7) % S) * S + ((x * 5) % S)] < 0.35 ? 0.25 : 0) - grain * 0.06;
      const k = Math.max(0, Math.min(255, Math.round(Math.pow(c, 1 / 1.0) * 255)));
      const i = (y * S + x) * 4;
      img.data[i] = k;
      img.data[i + 1] = k;
      img.data[i + 2] = Math.min(255, k + 4);
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  road = new CanvasTexture(cv);
  road.colorSpace = SRGBColorSpace;
  road.wrapS = road.wrapT = RepeatWrapping;
  road.minFilter = LinearMipmapLinearFilter;
  road.anisotropy = anisotropy;
  return road;
}

let detail: CanvasTexture | null = null;

/* Grain du sol : multiplié à la couleur du terrain, à deux échelles. */
export function detailTexture(): CanvasTexture {
  if (detail) return detail;
  const S = 256;
  const cv = document.createElement("canvas");
  cv.width = cv.height = S;
  const ctx = cv.getContext("2d")!;
  const img = ctx.createImageData(S, S);
  const r = rand(7);
  const a = tileNoise(S, 16, r);
  const b = tileNoise(S, 64, r);
  for (let i = 0; i < S * S; i++) {
    const v = 0.55 * a[i] + 0.35 * b[i] + 0.1 * r();
    const k = Math.round(v * 255);
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = k;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  detail = new CanvasTexture(cv);
  detail.wrapS = detail.wrapT = RepeatWrapping;
  return detail;
}

/* Terrain : grain en coordonnées du monde, à deux échelles pour casser la répétition. */
export function withGroundDetail(mat: Material, tex: Texture) {
  mat.onBeforeCompile = (s) => {
    s.uniforms.uDetail = { value: tex };
    s.vertexShader = s.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec2 vGround;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvGround = (modelMatrix * vec4(position, 1.0)).xz;");
    s.fragmentShader = s.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform sampler2D uDetail;\nvarying vec2 vGround;")
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        float dA = texture2D(uDetail, vGround * 0.19).r;
        float dB = texture2D(uDetail, vGround * 0.017).r;
        diffuseColor.rgb *= mix(0.84, 1.12, dA) * mix(0.88, 1.1, dB);`,
      );
  };
  mat.customProgramCacheKey = () => "rt1-ground";
}

/* Vent : balancement proportionnel au carré de la hauteur, déphasé par instance. */
export function withWind(mat: Material, amp: number, start: number) {
  mat.onBeforeCompile = (s) => {
    s.uniforms.uTime = clock;
    s.vertexShader = s.vertexShader
      .replace("#include <common>", "#include <common>\nuniform float uTime;")
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec3 ip = instanceMatrix[3].xyz;
        #else
          vec3 ip = vec3(0.0);
        #endif
        float ph = ip.x * 0.043 + ip.z * 0.061;
        float hh = max(0.0, transformed.y - ${start.toFixed(2)});
        float k = hh * hh * ${amp.toFixed(5)};
        transformed.x += (sin(uTime * 1.3 + ph) * 0.6 + sin(uTime * 2.9 + ph * 1.7) * 0.25) * k;
        transformed.z += (cos(uTime * 1.1 + ph * 1.3) * 0.4) * k;`,
      );
  };
  mat.customProgramCacheKey = () => `rt1-wind-${amp}-${start}`;
}

function lin(hex: string): Color {
  return new Color(hex);
}

export function skyMaterial(sun: Vector3, side: Side = FrontSide): ShaderMaterial {
  return new ShaderMaterial({
    side,
    uniforms: {
      uZenith: { value: lin(PALETTE.zenith) },
      uHorizon: { value: lin(PALETTE.horizon) },
      uSunCol: { value: lin(PALETTE.sun) },
      uSun: { value: sun.clone().normalize() },
    },
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = p.xyww;
      }`,
    fragmentShader: `
      uniform vec3 uZenith; uniform vec3 uHorizon; uniform vec3 uSunCol; uniform vec3 uSun;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        float h = max(d.y, 0.0);
        vec3 col = mix(uHorizon, uZenith, pow(h, 0.55));
        col = mix(col, uHorizon * 0.96, smoothstep(0.0, -0.08, d.y));
        float s = max(dot(d, uSun), 0.0);
        col += uSunCol * (pow(s, 900.0) * 6.0 + pow(s, 24.0) * 0.28 + pow(s, 4.0) * 0.08);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    depthWrite: false,
    fog: false,
  });
}

/* Le lagon : couleur selon la profondeur (texture cuite), écume sur le rivage et sur le
   récif, vaguelettes, reflets du ciel et scintillement du soleil. Opaque : le fond est
   « dans » la couleur, pas de rendu de transparence. */
export function waterMaterial(depth: Texture, bounds: Vector4, sun: Vector3): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: UniformsUtils.merge([
      UniformsLib.fog,
      {
        uDepth: { value: depth },
        uBounds: { value: bounds },
        uSun: { value: sun.clone().normalize() },
        uShallow: { value: lin(PALETTE.shallow) },
        uLagoon: { value: lin(PALETTE.lagoon) },
        uDeep: { value: lin(PALETTE.deep) },
        uOcean: { value: lin(PALETTE.ocean) },
        uSky: { value: lin(PALETTE.horizon) },
        uSunCol: { value: lin(PALETTE.sun) },
      },
    ]),
    vertexShader: `
      #include <common>
      #include <fog_pars_vertex>
      varying vec3 vWorld;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vWorld = w.xyz;
        vec4 mvPosition = viewMatrix * w;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `
      #include <common>
      #include <fog_pars_fragment>
      uniform sampler2D uDepth; uniform vec4 uBounds; uniform float uTime; uniform vec3 uSun;
      uniform vec3 uShallow; uniform vec3 uLagoon; uniform vec3 uDeep; uniform vec3 uOcean;
      uniform vec3 uSky; uniform vec3 uSunCol;
      varying vec3 vWorld;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float vnoise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
      }
      void main() {
        vec2 uv = vec2((vWorld.x - uBounds.x) / (uBounds.z - uBounds.x), (-vWorld.z - uBounds.y) / (uBounds.w - uBounds.y));
        float inside = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
        vec4 tex = texture2D(uDepth, clamp(uv, 0.0, 1.0));
        float dm = mix(40.0, tex.r * 8.0, inside);
        vec3 col = mix(uShallow, uLagoon, smoothstep(0.2, 2.6, dm));
        col = mix(col, uDeep, smoothstep(2.6, 7.2, dm));
        col = mix(col, uOcean, smoothstep(9.0, 30.0, dm));
        // fond sableux qui ondule sous l'eau peu profonde
        vec2 p = vWorld.xz;
        float caust = vnoise(p * 0.35 + vec2(uTime * 0.21, uTime * 0.13)) * vnoise(p * 0.5 - vec2(uTime * 0.17, -uTime * 0.11));
        col += vec3(0.10, 0.12, 0.09) * caust * (1.0 - smoothstep(0.3, 3.0, dm));
        // vaguelettes : normale par différences de bruit
        float t = uTime;
        vec2 q = p * 0.16;
        float n0 = vnoise(q + vec2(t * 0.35, t * 0.2)) + 0.5 * vnoise(q * 2.7 - vec2(t * 0.5, -t * 0.3));
        float nx = vnoise(q + vec2(0.07, 0.0) + vec2(t * 0.35, t * 0.2)) + 0.5 * vnoise((q + vec2(0.07, 0.0)) * 2.7 - vec2(t * 0.5, -t * 0.3));
        float nz = vnoise(q + vec2(0.0, 0.07) + vec2(t * 0.35, t * 0.2)) + 0.5 * vnoise((q + vec2(0.0, 0.07)) * 2.7 - vec2(t * 0.5, -t * 0.3));
        vec3 nrm = normalize(vec3((n0 - nx) * 1.6, 1.0, (n0 - nz) * 1.6));
        vec3 V = normalize(cameraPosition - vWorld);
        float fres = 0.02 + 0.4 * pow(1.0 - max(dot(nrm, V), 0.0), 5.0);
        col = mix(col, uSky * vec3(0.78, 0.9, 1.0), fres);
        vec3 R = reflect(-V, nrm);
        float s = max(dot(R, normalize(uSun)), 0.0);
        col += uSunCol * (pow(s, 220.0) * 2.4 + pow(s, 30.0) * 0.08);
        // écume : rivage et récif
        float shore = 1.0 - smoothstep(0.05, 0.9, dm);
        float band = 0.5 + 0.5 * sin(dm * 9.0 - t * 1.6 + vnoise(p * 0.2) * 4.0);
        float foam = shore * smoothstep(0.35, 0.8, band * 0.6 + vnoise(p * 0.9 + t * 0.3) * 0.6);
        foam = max(foam, (1.0 - smoothstep(0.0, 0.18, dm)) * 0.9);
        col = mix(col, vec3(0.97, 0.99, 1.0), clamp(foam, 0.0, 1.0) * 0.85);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
    fog: true,
  });
}
