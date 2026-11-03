// odyssee/js/ui/cinematic.js — Cinématique d'éveil de Lugia Obscur
import { el, wait } from './ui.js';

/**
 * Lance la cinématique ultra-cinématique de Lugia Obscur :
 * - Vidéo MP4 de Lugia Obscur émergeant des ténèbres et déchaînant la Tornade Obscure
 * - Sound design synthétisé avec Web Audio API (secousses sismiques, rugissement démoniaque, cyclone de vent, cataclysme)
 * - Barres de cinéma (Cinemascope letterbox)
 * - Aura violette, flashs stroboscopiques sombres et particules d'énergie obscure
 * - Tremblements d'écran synchronisés avec les impacts
 * - Carte de titre dorée/violette « LUGIA OBSCUR »
 * - Touche de passage (Échap / Entrée / Clic)
 */
export async function playLugiaCinematic(game) {
  const ui = game.ui;
  const sound = game.sound;
  const input = ui.input;

  game.busy = true;
  sound.stopMusic(0.25);
  await ui.fade(true, 280);

  // Construction du DOM de la cinématique
  const scr = el('div', 'screen lugia-cine-scr');
  scr.innerHTML = `
    <div class="lugia-cine-bars">
      <div class="lugia-cine-bar top"></div>
      <div class="lugia-cine-bar bot"></div>
    </div>
    <div class="lugia-cine-viewport">
      <video class="lugia-cine-video" src="video/lugia_dark.mp4" playsinline preload="auto"></video>
      <canvas class="lugia-cine-canvas"></canvas>
      <div class="lugia-cine-aura"></div>
      <div class="lugia-cine-vignette"></div>
      <div class="lugia-cine-flash"></div>
      <div class="lugia-cine-hud">
        <div class="lugia-cine-title-wrap">
          <div class="lugia-cine-badge">
            <span class="lugia-badge-dot"></span>
            <span>SANCTUAIRE DES MARÉES · ÉVEIL DU MONSTRE</span>
          </div>
          <h1 class="lugia-cine-title">LUGIA OBSCUR</h1>
          <div class="lugia-cine-sub">LE GARDIEN CORROMPU DU PRISME NOIR</div>
        </div>
      </div>
    </div>
    <button type="button" class="lugia-cine-skip">Passer la cinématique (Entrée / Échap / Clic)</button>
  `;

  ui.root.appendChild(scr);

  const vid = scr.querySelector('.lugia-cine-video');
  const viewport = scr.querySelector('.lugia-cine-viewport');
  const canvas = scr.querySelector('.lugia-cine-canvas');
  const flashEl = scr.querySelector('.lugia-cine-flash');
  const titleWrap = scr.querySelector('.lugia-cine-title-wrap');
  const skipBtn = scr.querySelector('.lugia-cine-skip');

  // Configuration du volume vidéo (si audio présent, sinon géré par le synthétiseur audio)
  vid.volume = Math.max(0, Math.min(1, sound.vol ?? 0.7));

  // Canvas & système de particules obscures
  const ctx = canvas.getContext('2d');
  let cw = (canvas.width = viewport.clientWidth || 800);
  let ch = (canvas.height = viewport.clientHeight || 450);

  const onResize = () => {
    cw = canvas.width = viewport.clientWidth || 800;
    ch = canvas.height = viewport.clientHeight || 450;
  };
  window.addEventListener('resize', onResize);

  const particles = [];
  for (let i = 0; i < 45; i++) {
    particles.push({
      x: Math.random() * cw,
      y: Math.random() * ch,
      vx: (Math.random() - 0.5) * 0.9,
      vy: -1.0 - Math.random() * 2.2,
      r: 1.5 + Math.random() * 2.5,
      alpha: 0.2 + Math.random() * 0.7,
      color: Math.random() > 0.4 ? '#a855f7' : Math.random() > 0.5 ? '#7e22ce' : '#f43f5e',
    });
  }

  const shockwaves = [];
  const addShockwave = (x, y, maxR = 250, color = 'rgba(192, 132, 252, ') => {
    shockwaves.push({ x, y, r: 10, maxR, color, alpha: 1.0 });
  };

  let animRunning = true;
  const loop = () => {
    if (!animRunning) return;
    ctx.clearRect(0, 0, cw, ch);

    // Particules
    particles.forEach((p) => {
      p.x += p.vx;
      p.y += p.vy;
      if (p.y < -10) {
        p.y = ch + 10;
        p.x = Math.random() * cw;
      }
      ctx.save();
      ctx.globalAlpha = p.alpha;
      ctx.fillStyle = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });

    // Ondes de choc
    for (let i = shockwaves.length - 1; i >= 0; i--) {
      const sw = shockwaves[i];
      sw.r += 9.5;
      sw.alpha = Math.max(0, 1 - sw.r / sw.maxR);
      if (sw.alpha <= 0.01) {
        shockwaves.splice(i, 1);
        continue;
      }
      ctx.save();
      ctx.strokeStyle = sw.color + sw.alpha + ')';
      ctx.lineWidth = 3.5;
      ctx.shadowColor = '#c084fc';
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.arc(sw.x, sw.y, sw.r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);

  // Tremblements d'écran
  let shakeIntensity = 0;
  let shakeTimer = null;
  const shake = (intensity, durationMs) => {
    shakeIntensity = intensity;
    const startTime = performance.now();
    if (shakeTimer) cancelAnimationFrame(shakeTimer);
    const tickShake = (now) => {
      const elapsed = now - startTime;
      if (elapsed >= durationMs || !animRunning) {
        viewport.style.transform = '';
        return;
      }
      const decay = 1 - elapsed / durationMs;
      const curAmp = shakeIntensity * decay;
      const ox = (Math.random() - 0.5) * curAmp * 2;
      const oy = (Math.random() - 0.5) * curAmp * 1.5;
      viewport.style.transform = `translate(${ox.toFixed(1)}px, ${oy.toFixed(1)}px)`;
      shakeTimer = requestAnimationFrame(tickShake);
    };
    shakeTimer = requestAnimationFrame(tickShake);
  };

  // Flashs d'écran
  const flash = async (color = '#ffffff', ms = 180) => {
    flashEl.style.background = color;
    flashEl.style.opacity = '0.9';
    await wait(ms);
    flashEl.style.opacity = '0';
  };

  // Apparition des barres de cinéma
  setTimeout(() => scr.classList.add('in'), 40);
  await ui.fade(false, 300);

  // Démarrage du design sonore et de la vidéo
  const audioCtrl = sound.playLugiaCinematicAudio ? sound.playLugiaCinematicAudio() : { stop: () => {} };

  // Timers d'effets synchronisés avec la vidéo (durée totale ~14.9s)
  const timeouts = [];
  const at = (ms, fn) => timeouts.push(setTimeout(() => { if (animRunning) fn(); }, ms));

  // 1. Début : tremblement sourd
  at(500, () => shake(3, 800));

  // 2. Réveil de Lugia & Rugissement (2.8s)
  at(2800, () => {
    flash('#d8b4fe', 160);
    shake(16, 1500);
    addShockwave(cw / 2, ch / 2, Math.max(cw, ch) * 0.9, 'rgba(192, 132, 252, ');
  });

  // 3. Titre cinématographique (3.3s)
  at(3300, () => {
    titleWrap.classList.add('in');
  });

  // 4. Déchaînement de la Tornade Obscure (6.8s)
  at(6800, () => {
    shake(6, 2800);
    addShockwave(cw / 2, ch / 2, cw * 0.7, 'rgba(147, 51, 234, ');
  });

  // 5. Impact Cataclysmique & Plongeon Final (10.8s)
  at(10800, () => {
    flash('#ffffff', 140);
    setTimeout(() => flash('#7e22ce', 220), 160);
    shake(22, 1800);
    addShockwave(cw / 2, ch / 2, Math.max(cw, ch) * 1.1, 'rgba(255, 255, 255, ');
  });

  // 6. Retrait du titre avant la fin (12.2s)
  at(12200, () => {
    titleWrap.classList.remove('in');
    titleWrap.classList.add('out');
  });

  // Attente de la fin de la vidéo ou de l'annulation
  await new Promise((resolve) => {
    let finished = false;
    const end = () => {
      if (finished) return;
      finished = true;
      pop();
      resolve();
    };

    const pop = input.push((k) => {
      if (k === 'a' || k === 'b' || k === 'menu') {
        sound.sfx('select');
        end();
      }
    });

    skipBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      sound.sfx('select');
      end();
    });

    vid.addEventListener('ended', end, { once: true });
    vid.addEventListener('error', end, { once: true });

    // Lancer la lecture
    const p = vid.play();
    if (p && typeof p.catch === 'function') {
      p.catch(() => {
        // En cas de politique autoplay restrictive, on coupe le flux natif et relance
        vid.muted = true;
        vid.play().catch(end);
      });
    }

    // Sécurité timeout à 16.5 secondes
    timeouts.push(setTimeout(end, 16500));
  });

  // Nettoyage et fin
  animRunning = false;
  timeouts.forEach((id) => clearTimeout(id));
  window.removeEventListener('resize', onResize);
  audioCtrl.stop();

  try { vid.pause(); } catch (e) {}

  await ui.fade(true, 300);
  scr.remove();

  // Enregistrer le flag d'histoire
  if (game.state?.flags) {
    game.state.flags.seenLugiaCinematic = true;
    game.save?.(true);
  }

  await ui.fade(false, 250);
}
