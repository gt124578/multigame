// The Backrooms - Filtre caméra : une image de caméscope propre (comme les vidéos des Backrooms), à peine marquée par
// la bande : léger grain, lignes de balayage discrètes, couleurs franches, noirs profonds, vignette douce. Les défauts
// de la cassette (bavure des couleurs, tracking, déchirures, parasites) ne reviennent que quand l'entité approche.
// Les néons, plus forts que le blanc, bavent autour d'eux (halo flouté en quart de définition). L'exposition suit la
// lumière (le caméscope pousse son gain dans le noir : l'image s'éclaircit et grésille). Plus l'entité est proche
// (uDanger), plus l'image se déchire.
import * as THREE from '../../shared/vendor/three/three.module.min.js';

const LINES = 720; // hauteur de rendu de la scène, en pixels

const vertexShader = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

const fragmentShader = `
uniform sampler2D tDiffuse;
uniform sampler2D tBloom;
uniform float uTime;
uniform float uDanger;
uniform float uExposure;
uniform vec2 uRes;
varying vec2 vUv;

float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

vec3 aces(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }

vec3 grab(vec2 uv) { return texture2D(tDiffuse, uv).rgb; }

void main() {
  // les défauts de la cassette ne montent que quand l'entité est vraiment proche, et moins fort qu'avant
  float dg = smoothstep(0.3, 1.0, uDanger) * 0.6;
  // objectif bombé
  vec2 c = vUv - 0.5;
  float r2 = dot(c, c);
  vec2 uv = 0.5 + c * (0.99 + 0.025 * r2);

  // bande de tracking qui défile lentement de bas en haut
  float bandY = fract(uTime * 0.06);
  float band = 1.0 - smoothstep(0.0, 0.04, abs(uv.y - bandY));
  float line = floor(uv.y * 240.0);
  float jitter = hash(vec2(line, floor(uTime * 24.0))) - 0.5;
  uv.x += jitter * dg * 0.008 + band * dg * 0.012 * (hash(vec2(uTime, line)) - 0.5);

  // déchirures quand l'entité approche
  float blk = floor(uv.y * 28.0);
  float tear = step(1.0 - dg * 0.16, hash(vec2(blk, floor(uTime * 14.0))));
  uv.x += tear * (hash(vec2(blk, uTime)) - 0.5) * 0.09 * dg;

  // bavure des couleurs (rouge et bleu décalés) et flou horizontal de la bande magnétique
  float ca = 0.0006 + dg * 0.007;
  vec3 col;
  col.r = grab(uv + vec2(ca, 0.0)).r;
  col.g = grab(uv).g;
  col.b = grab(uv - vec2(ca * 1.4, 0.0)).b;
  vec3 blur = (grab(uv + vec2(0.0035, 0.0)) + grab(uv - vec2(0.0035, 0.0)) + grab(uv + vec2(0.007, 0.0)) + grab(uv - vec2(0.007, 0.0))) * 0.25;
  col = mix(col, blur, 0.04 + dg * 0.12);
  // halo des néons et des lumières vives
  col += texture2D(tBloom, uv).rgb * 1.1;

  col = aces(col * uExposure);
  col = pow(col, vec3(1.0 / 2.2));

  // étalonnage : jaune franc et un peu vert comme dans les vidéos, noirs bien noirs
  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(lum), col, 1.08);
  col = col * vec3(1.0, 1.0, 0.86) + vec3(0.003, 0.003, 0.002);

  // lignes de balayage, grain, bande claire
  col *= 0.975 + 0.025 * sin(vUv.y * uRes.y * 1.7);
  float gain = clamp((uExposure - 1.0) * 0.06, 0.0, 0.04); // gain poussé dans le noir : un peu plus de grain
  col += (hash(vUv * uRes + fract(uTime) * 91.0) - 0.5) * (0.014 + gain + dg * 0.18);
  col += band * dg * 0.05;
  // parasites blancs : seulement quand l'entité est là
  if (dg > 0.05 && hash(vec2(floor(vUv.x * 160.0), floor(vUv.y * 120.0) + floor(uTime * 20.0))) > 1.0 - dg * 0.004) col += 0.5;

  // vignette
  col *= 1.0 - r2 * 0.95;
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) col = vec3(0.0);
  gl_FragColor = vec4(col, 1.0);
}`;

// Halo : on garde ce qui dépasse le blanc, en quart de définition, puis on le floute (horizontal, vertical, deux fois)
const brightShader = `
uniform sampler2D tDiffuse;
uniform vec2 uTexel;
varying vec2 vUv;
void main() {
  vec3 c = vec3(0.0);
  c += texture2D(tDiffuse, vUv + uTexel * vec2(-1.0, -1.0)).rgb;
  c += texture2D(tDiffuse, vUv + uTexel * vec2(1.0, -1.0)).rgb;
  c += texture2D(tDiffuse, vUv + uTexel * vec2(-1.0, 1.0)).rgb;
  c += texture2D(tDiffuse, vUv + uTexel * vec2(1.0, 1.0)).rgb;
  c *= 0.25;
  gl_FragColor = vec4(max(c - vec3(1.0), 0.0), 1.0);
}`;
const blurShader = `
uniform sampler2D tDiffuse;
uniform vec2 uDir;
varying vec2 vUv;
void main() {
  vec3 c = texture2D(tDiffuse, vUv).rgb * 0.227;
  c += (texture2D(tDiffuse, vUv + uDir * 1.385).rgb + texture2D(tDiffuse, vUv - uDir * 1.385).rgb) * 0.316;
  c += (texture2D(tDiffuse, vUv + uDir * 3.231).rgb + texture2D(tDiffuse, vUv - uDir * 3.231).rgb) * 0.070;
  gl_FragColor = vec4(c, 1.0);
}`;

export function createVhsFilter(renderer) {
  const target = new THREE.WebGLRenderTarget(4, 4, {
    type: THREE.HalfFloatType,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    depthBuffer: true,
  });
  const half = () => new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false });
  const bloomA = half();
  const bloomB = half();
  const bright = new THREE.ShaderMaterial({ uniforms: { tDiffuse: { value: target.texture }, uTexel: { value: new THREE.Vector2() } }, vertexShader, fragmentShader: brightShader, depthTest: false, depthWrite: false });
  const blurMat = new THREE.ShaderMaterial({ uniforms: { tDiffuse: { value: null }, uDir: { value: new THREE.Vector2() } }, vertexShader, fragmentShader: blurShader, depthTest: false, depthWrite: false });
  const material = new THREE.ShaderMaterial({
    uniforms: {
      tDiffuse: { value: target.texture },
      tBloom: { value: bloomA.texture },
      uTime: { value: 0 },
      uDanger: { value: 0 },
      uExposure: { value: 1.2 },
      uRes: { value: new THREE.Vector2(1, 1) },
    },
    vertexShader,
    fragmentShader,
    depthTest: false,
    depthWrite: false,
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  quad.frustumCulled = false;
  const post = new THREE.Scene();
  post.add(quad);
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  return {
    uniforms: material.uniforms,
    setSize(w, h) {
      const lines = Math.min(LINES, h);
      const tw = Math.max(1, Math.round((lines * w) / h));
      target.setSize(tw, lines);
      bloomA.setSize(Math.max(1, tw >> 2), Math.max(1, lines >> 2));
      bloomB.setSize(Math.max(1, tw >> 2), Math.max(1, lines >> 2));
      bright.uniforms.uTexel.value.set(1 / tw, 1 / lines);
      material.uniforms.uRes.value.set(w, h);
    },
    // exposure : l'exposition voulue par la caméra (1 en pleine lumière, plus haut dans le noir)
    render(scene, camera, time, danger, exposure = 1.2) {
      material.uniforms.uTime.value = time;
      material.uniforms.uDanger.value = danger;
      material.uniforms.uExposure.value = exposure;
      renderer.setRenderTarget(target);
      renderer.render(scene, camera);
      // halo des lumières vives
      quad.material = bright;
      renderer.setRenderTarget(bloomA);
      renderer.render(post, cam);
      quad.material = blurMat;
      const bw = bloomA.width;
      const bh = bloomA.height;
      for (let i = 0; i < 2; i++) {
        blurMat.uniforms.tDiffuse.value = bloomA.texture;
        blurMat.uniforms.uDir.value.set((1 + i) / bw, 0);
        renderer.setRenderTarget(bloomB);
        renderer.render(post, cam);
        blurMat.uniforms.tDiffuse.value = bloomB.texture;
        blurMat.uniforms.uDir.value.set(0, (1 + i) / bh);
        renderer.setRenderTarget(bloomA);
        renderer.render(post, cam);
      }
      quad.material = material;
      renderer.setRenderTarget(null);
      renderer.render(post, cam);
    },
  };
}
