// Le caméscope d'un coéquipier, en médaillon : tant qu'il filme, on voit ce qu'il voit, dans un petit écran en bas à
// droite (image basse définition, grain, lignes, roulement de bande). Rendu une image sur trois dans une petite
// texture, puis recopié dans le coin à chaque image.
import * as THREE from '../../shared/vendor/three/three.module.min.js';

const W = 320;
const H = 240;
const EVERY = 3; // une image du médaillon toutes les EVERY images du jeu

const frag = `
uniform sampler2D tScene;
uniform float uTime;
uniform float uExp;
uniform float uIn; // apparition (0 à 1) : neige avant que l'image arrive
varying vec2 vUv;
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
vec3 aces(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
void main() {
  vec2 uv = vUv;
  float line = floor(uv.y * 240.0);
  // la bande flotte un peu, et une barre de bruit remonte lentement
  uv.x += (hash(vec2(line, floor(uTime * 24.0))) - 0.5) * 0.004;
  float bar = smoothstep(0.06, 0.0, abs(fract(uv.y * 0.6 - uTime * 0.11) - 0.5));
  uv.x += bar * 0.01;
  vec3 col = texture2D(tScene, uv).rgb;
  col.r = texture2D(tScene, uv + vec2(0.003, 0.0)).r;
  col = pow(aces(col * uExp), vec3(1.0 / 2.2));
  float l = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(l), col, 0.8) * vec3(1.0, 1.0, 0.88);
  float n = hash(vUv * vec2(320.0, 240.0) + fract(uTime) * 71.0);
  col += (n - 0.5) * 0.08 + bar * 0.06;
  col *= 0.9 + 0.1 * sin(vUv.y * 240.0 * 3.14159);
  vec2 c = vUv - 0.5;
  col *= 1.0 - dot(c, c) * 0.9;
  col = mix(vec3(n), col, uIn);
  gl_FragColor = vec4(col, 1.0);
}`;

export function createInset(renderer, container) {
  const rt = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: true });
  const cam = new THREE.PerspectiveCamera(50, W / H, 0.08, 60);
  cam.rotation.order = 'YXZ';
  const aim = cam.clone(); // (son double, pour connaître son champ sans toucher à la vraie)
  const aimM = new THREE.Matrix4();
  const mat = new THREE.ShaderMaterial({
    uniforms: { tScene: { value: rt.texture }, uTime: { value: 0 }, uExp: { value: 1.05 }, uIn: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: frag,
    depthTest: false,
    depthWrite: false,
  });
  const post = new THREE.Scene();
  post.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat));
  const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  // l'étiquette : le nom de celui qui filme, et le point rouge
  const label = document.createElement('div');
  label.style.cssText = 'position:absolute;z-index:3;pointer-events:none;font:16px/1 VT323,monospace;color:#fff;text-shadow:0 0 3px #000;letter-spacing:1px;display:none;white-space:nowrap';
  const dot = document.createElement('span');
  dot.style.color = '#ff3b30';
  dot.textContent = '●';
  const name = document.createElement('span');
  label.append(dot, name);
  container.appendChild(label);
  const frame = document.createElement('div');
  frame.style.cssText = 'position:absolute;z-index:3;pointer-events:none;border:2px solid rgba(255,255,255,0.55);box-shadow:0 0 0 1px #000;display:none';
  container.appendChild(frame);

  let tick = 0;
  let curId = null;
  let inT = 0;
  const size = new THREE.Vector2();

  return {
    // pour le tri des objets : le médaillon se refait-il à cette image (avec ce coéquipier) ? Et le champ qu'il filmera,
    // cadré exactement comme dans render
    due(Q) {
      return !!Q && (Q.id !== curId || tick % EVERY === 0);
    },
    frustum(Q, eye, fov, out) {
      aim.fov = fov;
      aim.position.set(eye.x, eye.y, eye.z);
      aim.rotation.set(Q.pitch || 0, Q.yaw || 0, 0);
      aim.updateProjectionMatrix();
      aim.updateMatrixWorld(true);
      return out.setFromProjectionMatrix(aimM.multiplyMatrices(aim.projectionMatrix, aim.matrixWorldInverse));
    },
    // Q : le coéquipier qui filme (ou null) ; eye : { x, y, z } ; fov : son champ (zoom du caméscope compris) ;
    // draw(hide) : rend la scène vue de sa tête, en cachant son propre corps
    render(Q, eye, fov, scene, avatars, time, dt, me = null) {
      if (!Q) {
        curId = null;
        inT = 0;
        label.style.display = frame.style.display = 'none';
        return;
      }
      if (Q.id !== curId) {
        curId = Q.id;
        inT = 0;
        tick = 0;
      }
      renderer.getSize(size);
      const w = Math.round(Math.min(300, Math.max(150, size.x * 0.2)));
      const h = Math.round((w * 3) / 4);
      const x = size.x - w - 18;
      const y = Math.round(size.y * 0.2); // au-dessus des incrustations du bas
      if (tick++ % EVERY === 0) {
        cam.fov = fov;
        cam.position.set(eye.x, eye.y, eye.z);
        cam.rotation.set(Q.pitch || 0, Q.yaw || 0, 0);
        cam.updateProjectionMatrix();
        const shown = avatars.setShown(Q.id, false);
        // soi-même, vu par lui : on montre son corps et on range sa lampe tenue en main
        if (me) me.show();
        renderer.setRenderTarget(rt);
        renderer.render(scene, cam);
        if (me) me.hide();
        avatars.setShown(Q.id, shown);
      }
      inT = Math.min(1, inT + dt * 2.5);
      mat.uniforms.uTime.value = time;
      mat.uniforms.uIn.value = inT;
      renderer.setRenderTarget(null);
      renderer.setScissorTest(true);
      renderer.setScissor(x, y, w, h);
      renderer.setViewport(x, y, w, h);
      renderer.render(post, ortho);
      renderer.setScissorTest(false);
      renderer.setViewport(0, 0, size.x, size.y);
      // l'étiquette et le cadre, en coordonnées de page (le bas du canvas est en haut du style)
      frame.style.display = label.style.display = '';
      frame.style.left = `${x - 2}px`;
      frame.style.top = `${size.y - y - h - 2}px`;
      frame.style.width = `${w}px`;
      frame.style.height = `${h}px`;
      label.style.left = `${x}px`;
      label.style.top = `${size.y - y - h - 20}px`;
      dot.style.visibility = (time * 1.4) % 1 < 0.6 ? 'visible' : 'hidden';
      const txt = ` ${String(Q.name || 'PLAYER').toUpperCase()} · CAM`;
      if (name.textContent !== txt) name.textContent = txt;
    },
    dispose() {
      rt.dispose();
      mat.dispose();
      label.remove();
      frame.remove();
    },
  };
}
