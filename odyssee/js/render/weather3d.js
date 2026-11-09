// odyssee/js/render/weather3d.js — Système météo dynamique en temps réel pour le monde 3D
// Gère la pluie, la grêle/neige, les tempêtes de sable et les cendres (particules rétro Three.js)
// et la brume (voile à l'écran, par-dessus le canvas).
import * as THREE from 'three';

// Particules dessinées au pixel près (comme les sprites du jeu : la taille d'un point est en pixels d'écran, calée sur
// la grille) : la pluie tombe en traits fins un peu penchés et éclabousse le sol, la grêle en grêlons, le sable en
// traînées, la cendre en flocons. (Un PointsMaterial d'une taille en unités du monde n'affichait qu'un pixel dans la vue
// orthographique du relief : la météo était presque invisible.)
const TAN_EL = Math.tan(55 * Math.PI / 180);
/** points utilisés par chaque météo (la géométrie en garde assez pour la pluie) */
const N_METEO = { rain: 720, hail: 320, sandstorm: 720, ash: 260 };
const VERT = /* glsl */`
  attribute float aVie;
  uniform vec2 uRes; uniform float uEch; uniform float uTaille;
  varying float vVie;
  void main() {
    vec4 c = projectionMatrix * viewMatrix * vec4( position, 1.0 );
    float s = max( 1.0, floor( uTaille / uEch + 0.5 ) );
    vec2 px = floor( ( c.xy / c.w * 0.5 + 0.5 ) * uRes ) + ( mod( s, 2.0 ) > 0.5 ? 0.5 : 0.0 );
    gl_Position = vec4( ( px / uRes * 2.0 - 1.0 ) * c.w, c.z, c.w );
    gl_PointSize = s; vVie = aVie;
  }`;
const FRAG = /* glsl */`
  uniform vec3 uCoul; uniform float uOpac; uniform int uForme; uniform float uTaille;
  varying float vVie;
  void main() {
    vec2 q = floor( gl_PointCoord * uTaille );
    float a = uOpac; vec3 col = uCoul;
    if ( vVie < 0.0 ) {
      // éclaboussure de pluie : une petite couronne de 5 × 3 pixels
      if ( !( ( q.y == 2.0 && ( q.x == 1.0 || q.x == 5.0 ) ) || ( q.y == 1.0 && ( q.x == 2.0 || q.x == 4.0 ) ) || ( q.y == 3.0 && q.x > 1.0 && q.x < 5.0 ) ) ) discard;
      a *= 0.75;
    } else if ( uForme == 0 ) {
      // goutte : trait d'un pixel, sept de haut, qui penche d'un pixel vers la gauche à mi-hauteur
      float x = q.y < 4.0 ? 4.0 : 3.0;
      if ( q.x != x || q.y < 1.0 ) discard;
      if ( q.y < 3.0 ) a *= 0.55;
    } else if ( uForme == 1 ) {
      // grêlon : disque de 3 pixels, ombré en bas
      vec2 d = q - 1.0; if ( dot( d, d ) > 1.5 ) discard;
      if ( q.y > 1.5 ) col *= 0.78;
    } else if ( uForme == 2 ) {
      // sable : traînée horizontale de 4 pixels, plus pâle à la queue
      if ( q.y != 3.0 || q.x < 1.0 ) discard;
      if ( q.x < 2.5 ) a *= 0.5;
    } else {
      // cendre : flocon en croix de 3 × 3, centre clair, bras plus sombres
      vec2 d = abs( q - 1.0 ); if ( d.x + d.y > 1.5 ) discard;
      if ( d.x + d.y > 0.5 ) col *= 0.82;
    }
    gl_FragColor = vec4( col, a );
    #include <colorspace_fragment>
  }`;

export class WeatherSystem {
  constructor(scene, canvas = null, uniforms = null) {
    this.scene = scene;
    this.hostCanvas = canvas;   // canvas du jeu : le voile de brume se pose juste après le canvas, sous l'interface
    this.fogEl = null;
    this.current = 'none'; // 'none' | 'rain' | 'hail' | 'sandstorm' | 'ash' | 'fog' | 'sun'
    this.time = 0;
    this.count = 720;   // points au plus (la pluie en prend le plus ; voir N_METEO)

    // Géométrie et buffers de particules
    this.geometry = new THREE.BufferGeometry();
    this.positions = new Float32Array(this.count * 3);
    this.velocities = new Float32Array(this.count * 3);

    // Initialisation
    for (let i = 0; i < this.count; i++) {
      this.resetParticle(i, true, 0, 0);
    }

    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    // éclaboussures : des points en plus au bout du tableau (aVie < 0 : éclaboussure)
    this.vie = new Float32Array(this.count);
    this.geometry.setAttribute('aVie', new THREE.BufferAttribute(this.vie, 1));

    // Texture procédurale pixel art pour les particules
    this.canvas = document.createElement('canvas');
    this.canvas.width = 16;
    this.canvas.height = 16;
    this.drawParticleCanvas();
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.magFilter = THREE.NearestFilter;
    this.texture.minFilter = THREE.NearestFilter;

    const U = uniforms || { uRes: { value: new THREE.Vector2(400, 240) }, uEch: { value: 1 } };
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, depthTest: false,   // la météo passe devant tout (comme sur DS)
      uniforms: { uRes: U.uRes, uEch: U.uEch, uTaille: { value: 7 }, uCoul: { value: new THREE.Color(1, 1, 1) }, uOpac: { value: 0.85 }, uForme: { value: 0 } },
    });
    // compatibilité (anciens appels) : la couleur et l'opacité du matériau sont celles des uniformes
    Object.defineProperty(this.material, 'color', { get: () => this.material.uniforms.uCoul.value, configurable: true });

    this.points = new THREE.Points(this.geometry, this.material);
    this.points.visible = false;
    this.points.frustumCulled = false; this.points.renderOrder = 10;
    this.scene.add(this.points);
  }

  drawParticleCanvas() {
    const ctx = this.canvas.getContext('2d');
    ctx.clearRect(0, 0, 16, 16);
    ctx.fillStyle = '#ffffff';
    // Pixel art diamant / losange net pour esthétique DS
    ctx.fillRect(7, 3, 2, 10);
    ctx.fillRect(5, 5, 6, 6);
    ctx.fillRect(3, 7, 10, 2);
  }

  setWeather(w) {
    w = w || 'none';
    if (this.current === w) return;
    this.current = w;
    // soleil : pas de particules (l'effet est porté par le combat et la lumière)
    this.points.visible = (w === 'rain' || w === 'hail' || w === 'sandstorm' || w === 'ash');
    this.setFog(w === 'fog');

    const u = this.material.uniforms, regle = (hex, taille, opac, forme) => { u.uCoul.value.set(hex); u.uTaille.value = taille; u.uOpac.value = opac; u.uForme.value = forme; };
    this.geometry.setDrawRange(0, N_METEO[w] || 0);
    if (w === 'rain') regle(0xd8e8ff, 7, 0.85, 0);
    else if (w === 'hail') regle(0xffffff, 3, 0.95, 1);
    else if (w === 'sandstorm') regle(0xfff2cc, 7, 0.8, 2);
    else if (w === 'ash') regle(0xe8e4de, 3, 0.95, 3);   // cendres volcaniques : flocons gris qui tombent en tourbillonnant

    // Réinitialiser les particules autour du joueur lors d'un changement de météo
    // (autour du dernier point de vue connu : sinon tout repart d'un bord de l'écran)
    for (let i = 0; i < this.count; i++) {
      this.resetParticle(i, true, this.fx || 0, this.fz || 0);
    }
  }

  resetParticle(i, initial = false, focusX = 0, focusZ = 0) {
    const rx = (Math.random() - 0.5) * 36;
    const rz = (Math.random() - 0.5) * 28;
    const idx = i * 3;

    const y = initial ? Math.random() * 14 : 12 + Math.random() * 4;
    this.positions[idx] = focusX + rx;
    this.positions[idx + 1] = (this.sol ?? 0) + y;
    // un point en hauteur se voit plus au nord : on le pose d'autant plus au sud, pour qu'il tombe à l'écran
    this.positions[idx + 2] = focusZ + rz * 0.6 + y / TAN_EL;
    if (this.vie) this.vie[i] = 1;

    if (this.current === 'rain') {
      this.velocities[idx] = -0.07 - Math.random() * 0.03;
      this.velocities[idx + 1] = -0.45 - Math.random() * 0.12;
      this.velocities[idx + 2] = 0.04 + Math.random() * 0.03;
    } else if (this.current === 'hail') {
      this.velocities[idx] = (Math.random() - 0.5) * 0.08;
      this.velocities[idx + 1] = -0.12 - Math.random() * 0.06;
      this.velocities[idx + 2] = (Math.random() - 0.5) * 0.08;
    } else if (this.current === 'sandstorm') {
      // le sable file à l'horizontale, bas au-dessus du sol ; il entre par le bord ouest de l'écran
      this.velocities[idx] = 0.26 + Math.random() * 0.14;
      this.velocities[idx + 1] = -0.004 - Math.random() * 0.006;
      this.velocities[idx + 2] = 0.01 + Math.random() * 0.02;
      const h = 0.3 + Math.random() * 2.5;
      if (!initial) this.positions[idx] = focusX - 20 - Math.random() * 2;
      this.positions[idx + 1] = (this.sol ?? 0) + h;
      this.positions[idx + 2] = focusZ + (Math.random() - 0.5) * 14 + h / TAN_EL;
    } else if (this.current === 'ash') {
      this.velocities[idx] = 0.02 + Math.random() * 0.03;
      this.velocities[idx + 1] = -0.035 - Math.random() * 0.025;
      this.velocities[idx + 2] = (Math.random() - 0.5) * 0.02;
    }
  }

  /** brume : un voile blanc qui dérive lentement au-dessus du décor (sans particules) */
  setFog(on) {
    if (!this.hostCanvas?.parentNode) return;
    if (on && !this.fogEl) {
      this.fogEl = document.createElement('div');
      this.fogEl.className = 'ow-fog';
      this.fogEl.innerHTML = '<i></i><i></i>';
      this.hostCanvas.insertAdjacentElement('afterend', this.fogEl);
    }
    if (this.fogEl) this.fogEl.classList.toggle('on', on);
  }

  update(dt, focusX = 0, focusZ = 0) {
    this.fx = focusX; this.fz = focusZ;
    if (this.current === 'none' || !this.points.visible) return;
    this.time += dt;

    const pos = this.positions;
    const vel = this.velocities;
    const count = this.count;
    const speedMultiplier = Math.min(2.5, dt * 60);

    const n = Math.min(count, N_METEO[this.current] || count);
    for (let i = 0; i < n; i++) {
      const idx = i * 3;
      pos[idx] += vel[idx] * speedMultiplier;
      pos[idx + 1] += vel[idx + 1] * speedMultiplier;
      pos[idx + 2] += vel[idx + 2] * speedMultiplier;
      // les cendres ondulent en tombant
      if (this.current === 'ash') pos[idx] += Math.sin(this.time * 1.7 + i) * 0.012 * speedMultiplier;

      // éclaboussure : la goutte arrivée au sol y reste un instant en couronne, puis repart d'en haut
      if (this.vie[i] < 0) {
        pos[idx] -= vel[idx] * speedMultiplier; pos[idx + 1] = this.sol ?? 0.02; pos[idx + 2] -= vel[idx + 2] * speedMultiplier;
        this.vie[i] += dt * 7;
        if (this.vie[i] >= 0) this.resetParticle(i, false, focusX, focusZ);
        continue;
      }
      // Si particule touche le sol (y <= 0) ou s'éloigne trop de la caméra
      if (pos[idx + 1] <= (this.sol ?? 0) || Math.abs(pos[idx] - focusX) > 23 || Math.abs(pos[idx + 2] - focusZ) > 30) {
        if (this.current === 'rain' && pos[idx + 1] <= (this.sol ?? 0) && Math.random() < 0.6) { this.vie[i] = -1; pos[idx + 1] = this.sol ?? 0.02; continue; }
        this.resetParticle(i, false, focusX, focusZ);
      }
    }

    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.aVie.needsUpdate = true;
  }

  dispose() {
    this.points.visible = false;
    this.scene.remove(this.points);
    this.geometry.dispose();
    this.material.dispose();
    this.texture.dispose();
    this.fogEl?.remove();
  }
}
