// odyssee/js/render/weather3d.js — Système météo dynamique en temps réel pour le monde 3D
// Gère la pluie, la grêle/neige et les tempêtes de sable avec particules rétro Three.js.
import * as THREE from 'three';

export class WeatherSystem {
  constructor(scene) {
    this.scene = scene;
    this.current = 'none'; // 'none' | 'rain' | 'hail' | 'sandstorm'
    this.time = 0;
    this.count = 240;

    // Géométrie et buffers de particules
    this.geometry = new THREE.BufferGeometry();
    this.positions = new Float32Array(this.count * 3);
    this.velocities = new Float32Array(this.count * 3);

    // Initialisation
    for (let i = 0; i < this.count; i++) {
      this.resetParticle(i, true, 0, 0);
    }

    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));

    // Texture procédurale pixel art pour les particules
    this.canvas = document.createElement('canvas');
    this.canvas.width = 16;
    this.canvas.height = 16;
    this.drawParticleCanvas();
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.magFilter = THREE.NearestFilter;
    this.texture.minFilter = THREE.NearestFilter;

    this.material = new THREE.PointsMaterial({
      size: 0.9,
      map: this.texture,
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
      color: 0xffffff,
      opacity: 0.85,
    });

    this.points = new THREE.Points(this.geometry, this.material);
    this.points.visible = false;
    this.points.frustumCulled = false;
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
    this.points.visible = (w !== 'none');

    if (w === 'rain') {
      this.material.color.setHex(0x70b4ff);
      this.material.size = 0.95;
      this.material.opacity = 0.82;
    } else if (w === 'hail') {
      this.material.color.setHex(0xffffff);
      this.material.size = 1.15;
      this.material.opacity = 0.9;
    } else if (w === 'sandstorm') {
      this.material.color.setHex(0xf59e0b);
      this.material.size = 0.85;
      this.material.opacity = 0.75;
    }

    // Réinitialiser les particules autour du joueur lors d'un changement de météo
    for (let i = 0; i < this.count; i++) {
      this.resetParticle(i, true);
    }
  }

  resetParticle(i, initial = false, focusX = 0, focusZ = 0) {
    const rx = (Math.random() - 0.5) * 36;
    const rz = (Math.random() - 0.5) * 28;
    const idx = i * 3;

    this.positions[idx] = focusX + rx;
    this.positions[idx + 1] = initial ? Math.random() * 14 : 12 + Math.random() * 4;
    this.positions[idx + 2] = focusZ + rz;

    if (this.current === 'rain') {
      this.velocities[idx] = -0.07 - Math.random() * 0.03;
      this.velocities[idx + 1] = -0.45 - Math.random() * 0.12;
      this.velocities[idx + 2] = 0.04 + Math.random() * 0.03;
    } else if (this.current === 'hail') {
      this.velocities[idx] = (Math.random() - 0.5) * 0.08;
      this.velocities[idx + 1] = -0.12 - Math.random() * 0.06;
      this.velocities[idx + 2] = (Math.random() - 0.5) * 0.08;
    } else if (this.current === 'sandstorm') {
      this.velocities[idx] = 0.42 + Math.random() * 0.2;
      this.velocities[idx + 1] = -0.04 - Math.random() * 0.04;
      this.velocities[idx + 2] = 0.06 + Math.random() * 0.06;
    }
  }

  update(dt, focusX = 0, focusZ = 0) {
    if (this.current === 'none' || !this.points.visible) return;
    this.time += dt;

    const pos = this.positions;
    const vel = this.velocities;
    const count = this.count;
    const speedMultiplier = Math.min(2.5, dt * 60);

    for (let i = 0; i < count; i++) {
      const idx = i * 3;
      pos[idx] += vel[idx] * speedMultiplier;
      pos[idx + 1] += vel[idx + 1] * speedMultiplier;
      pos[idx + 2] += vel[idx + 2] * speedMultiplier;

      // Si particule touche le sol (y <= 0) ou s'éloigne trop de la caméra
      if (pos[idx + 1] <= 0 || Math.abs(pos[idx] - focusX) > 22 || Math.abs(pos[idx + 2] - focusZ) > 18) {
        this.resetParticle(i, false, focusX, focusZ);
      }
    }

    this.geometry.attributes.position.needsUpdate = true;
  }

  dispose() {
    this.points.visible = false;
    this.scene.remove(this.points);
    this.geometry.dispose();
    this.material.dispose();
    this.texture.dispose();
  }
}
