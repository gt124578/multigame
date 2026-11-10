// Fief Maudit : les personnages animés (KayKit, CC0). Héros et squelettes partagent le même squelette d'animation :
// les clips viennent de models/anims.glb (communs) et models/anims-squelettes.glb (réveil, chute, résurrection).
// Chaque métier garde son arme en main (la hache du bûcheron, l'épée et le bouclier du chevalier) ; les squelettes
// reçoivent les leurs (models/armes-squelettes.glb) dans la main. Pour porter une bûche, les bras prennent la pose d'une
// arme à deux mains pendant que les jambes marchent. Un nom flotte au-dessus des équipiers, une croix rouge au-dessus
// d'un équipier à terre ; les squelettes touchés montrent leur vie.
import * as THREE from '../../shared/vendor/three/three.module.min.js';
import { GLTFLoader } from '../../shared/vendor/three/GLTFLoader.js';
import { ACT, FOES, RISE, HP } from '../engine/sim.js';

export const JOBS = {
  bucheron: { model: 'barbarian', name: 'Bûcheron', show: ['1H_Axe'], strike: '1H_Melee_Attack_Chop' },
  chevalier: { model: 'knight', name: 'Chevalier', show: ['1H_Sword', 'Round_Shield'], strike: '1H_Melee_Attack_Slice_Diagonal' },
  chasseuse: { model: 'rogue', name: 'Chasseuse', show: ['Knife'], strike: '1H_Melee_Attack_Stab' },
  pretre: { model: 'mage', name: 'Prêtre', show: ['2H_Staff'], strike: '2H_Melee_Attack_Chop' },
  forgeronne: { model: 'rogue_hooded', name: 'Forgeronne', show: ['Knife'], strike: '1H_Melee_Attack_Stab' },
};
const SKEL = {
  minion: { model: 'skeleton_minion', right: 'Skeleton_Blade', left: null, walk: 'Running_C', attack: '1H_Melee_Attack_Chop' },
  warrior: { model: 'skeleton_warrior', right: 'Skeleton_Axe', left: 'Skeleton_Shield_Large_A', walk: 'Walking_C', attack: '1H_Melee_Attack_Slice_Diagonal' },
  knight: { model: 'skeleton_warrior', right: 'Skeleton_Axe', left: 'Skeleton_Axe', walk: 'Walking_C', attack: '1H_Melee_Attack_Chop', scale: 1.55, eyes: 0xff3a2a },
  // le Roi-Squelette : le mage des squelettes, immense, os brunis, yeux violets, couronne d'or et bâton
  king: { model: 'skeleton_mage', right: 'Skeleton_Staff', left: null, walk: 'Walking_C', attack: '2H_Melee_Attack_Chop', scale: 1.95, eyes: 0xb46aff, tint: 0.55, crown: true },
};
// le geste de chaque capacité (F)
const ABIL = { bucheron: '2H_Melee_Attack_Slice', chevalier: 'Block', chasseuse: 'Throw', pretre: 'Spellcast_Raise', forgeronne: 'Interact' };
const HELD = /(_Axe|Shield|Sword|Mug|Staff|Wand|Crossbow|Knife|Dagger|Spellbook|Throwable|Quiver)/i;
const SCALE = 0.8;
const ARM = /^(upperarm|lowerarm|wrist|hand|handslot|elbowIK|handIK)/;

// une couronne d'or à huit pointes
function makeCrown() {
  const gold = new THREE.MeshStandardMaterial({ color: 0xd8a63a, metalness: 0.85, roughness: 0.3, emissive: 0x3a2400 });
  const g = new THREE.Group();
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.31, 0.14, 16, 1, true), gold); band.material.side = THREE.DoubleSide; g.add(band);
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * Math.PI * 2, s = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.2, 4), gold);
    s.position.set(Math.sin(a) * 0.32, 0.16, Math.cos(a) * 0.32); g.add(s);
  }
  const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.05), new THREE.MeshStandardMaterial({ color: 0x8a2aff, emissive: 0x6a1aff, emissiveIntensity: 2 }));
  gem.position.set(0, 0.02, 0.33); g.add(gem);
  return g;
}

export function cloneSkinned(src) {
  const clone = src.clone(true), map = new Map();
  const walk = (a, b) => { map.set(a, b); for (let i = 0; i < a.children.length; i++) walk(a.children[i], b.children[i]); };
  walk(src, clone);
  clone.traverse((o) => {
    if (!o.isSkinnedMesh) return;
    let s = null;
    for (const [a, b] of map) if (b === o) { s = a; break; }
    const sk = s.skeleton.clone();
    sk.bones = s.skeleton.bones.map((b) => map.get(b));
    o.bind(sk, s.bindMatrix);
  });
  return clone;
}
const isArm = (b) => ARM.test(b);
const only = (clip, keep, tag) => { const c = clip.clone(); c.tracks = c.tracks.filter((t) => keep(t.name.split('.')[0])); c.name = clip.name + tag; return c; };

// petite étiquette dessinée (nom, croix)
function label(text, { color = '#f2e4c4', bg = 'rgba(30,20,10,0.6)', size = 30 } = {}) {
  const cv = document.createElement('canvas'), x = cv.getContext('2d');
  x.font = `800 ${size}px 'Alegreya Sans', sans-serif`;
  const w = Math.ceil(x.measureText(text).width) + 24; cv.width = w; cv.height = size + 16;
  x.font = `800 ${size}px 'Alegreya Sans', sans-serif`;
  x.fillStyle = bg; x.beginPath(); x.roundRect(0, 0, w, cv.height, 10); x.fill();
  x.fillStyle = color; x.textBaseline = 'middle'; x.fillText(text, 12, cv.height / 2 + 1);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true }));
  s.scale.set(w / cv.height * 0.22, 0.22, 1); s.renderOrder = 10;
  return s;
}
function crossSprite() {
  const cv = document.createElement('canvas'); cv.width = cv.height = 64; const x = cv.getContext('2d');
  x.fillStyle = '#fff4e0'; x.beginPath(); x.arc(32, 32, 30, 0, 7); x.fill();
  x.fillStyle = '#d23a2a'; x.fillRect(26, 12, 12, 40); x.fillRect(12, 26, 40, 12);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true })); s.scale.set(0.5, 0.5, 1); s.renderOrder = 11;
  return s;
}
function hpBar() {
  const g = new THREE.Group();
  const bg = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0x140c08, depthTest: false, transparent: true, opacity: 0.75 })); bg.scale.set(0.8, 0.09, 1);
  const fg = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0xe0563a, depthTest: false })); fg.scale.set(0.76, 0.06, 1); fg.center.set(0, 0.5); fg.position.x = -0.38;
  bg.renderOrder = 10; fg.renderOrder = 11; g.add(bg, fg);
  g.userData.set = (k) => { fg.scale.x = 0.76 * Math.max(0, k); };
  return g;
}

export async function createActors(scene, { makeLog }) {
  const loader = new GLTFLoader();
  const [animG, animS, armes] = await Promise.all(['anims', 'anims-squelettes', 'armes-squelettes'].map((n) => loader.loadAsync(`models/${n}.glb`)));
  const clips = new Map([...animG.animations, ...animS.animations].map((c) => [c.name, c]));
  clips.set('carryLegs', only(clips.get('Walking_A'), (b) => !isArm(b), '#jambes'));
  clips.set('carryIdleLegs', only(clips.get('Idle'), (b) => !isArm(b), '#jambes'));
  clips.set('carryArms', only(clips.get('2H_Melee_Idle'), isArm, '#bras'));
  const models = new Map();
  const getModel = (name) => { if (!models.has(name)) models.set(name, loader.loadAsync(`models/persos/${name}.glb`)); return models.get(name); };
  await Promise.all(['barbarian', 'knight', 'skeleton_minion', 'skeleton_warrior'].map(getModel));
  const weapon = (name) => { const o = armes.scene.getObjectByName(name); return o ? o.clone(true) : null; };

  // un personnage générique : modèle cloné, mixeur, fondus entre clips
  function rig(root) {
    const mixer = new THREE.AnimationMixer(root), actions = new Map();
    const act = (n) => { if (!actions.has(n)) { const c = clips.get(n); if (!c) return null; actions.set(n, mixer.clipAction(c)); } return actions.get(n); };
    return { mixer, act, cur: new Set(), key: null };
  }
  function play(a, names, { fade = 0.18, once = false, dur = null, from = 0 } = {}) {
    const key = names.join('+') + (once ? '!' + (a.tag || '') : '');
    if (a.key === key) return;
    a.key = key;
    const next = new Set();
    for (const n of names) {
      const ac = a.act(n); if (!ac) continue;
      next.add(ac);
      if (!a.cur.has(ac) || once) {
        ac.reset(); ac.enabled = true; ac.setEffectiveWeight(1);
        ac.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, once ? 1 : Infinity);
        ac.clampWhenFinished = once;
        ac.timeScale = once && dur ? ac.getClip().duration / dur : 1;
        if (from) ac.time = from * ac.getClip().duration;
        ac.fadeIn(fade).play();
      }
    }
    for (const ac of a.cur) if (!next.has(ac)) ac.fadeOut(fade);
    a.cur = next;
  }
  const shadowGeo = new THREE.CircleGeometry(0.42, 18).rotateX(-Math.PI / 2), shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.25, depthWrite: false });

  // ------------------------------------------------------------------ joueurs
  const heroes = new Map();
  async function addHero(p, me) {
    const job = JOBS[p.job] || JOBS.bucheron;
    const g = await getModel(job.model);
    const root = cloneSkinned(g.scene); root.scale.setScalar(SCALE);
    const mats = [];
    root.traverse((o) => {
      if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; o.material = o.material.clone(); o.material.envMapIntensity = 0.5; mats.push(o.material); }
      if (HELD.test(o.name) && !o.isBone) o.visible = job.show.includes(o.name);
    });
    const holder = new THREE.Group(); holder.add(root); scene.add(holder);
    const log = makeLog(); log.scale.set(0.8, 0.9, 0.9); log.position.set(0, 1.12, 0.42); log.visible = false; holder.add(log);
    // les bûches empilées au-dessus de la première (jusqu'à trois)
    const more = [1, 2].map((i) => { const m = makeLog(); m.scale.set(0.8, 0.9, 0.9); m.position.set((i === 1 ? -0.08 : 0.08), 1.12 + i * 0.2, 0.42 - i * 0.02); m.rotation.y = i === 1 ? 0.08 : -0.06; m.visible = false; holder.add(m); return m; });
    // panier de baies
    const basket = new THREE.Group();
    basket.add(new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.18, 0.22, 10, 1, true), new THREE.MeshStandardMaterial({ color: 0x9a6a38, roughness: 0.9, side: THREE.DoubleSide })));
    for (let i = 0; i < 7; i++) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 5), new THREE.MeshStandardMaterial({ color: 0xc8243a, roughness: 0.4 })); b.position.set(Math.cos(i * 0.9) * 0.12, 0.1, Math.sin(i * 0.9) * 0.12); basket.add(b); }
    basket.position.set(0, 1.0, 0.38); basket.visible = false; holder.add(basket);
    const shadow = new THREE.Mesh(shadowGeo, shadowMat); shadow.renderOrder = 1; scene.add(shadow);
    const nameTag = p.id !== me ? label(p.name, { color: p.bot ? '#bcd4ff' : '#ffe2a8' }) : null; if (nameTag) { nameTag.position.y = 2.25; holder.add(nameTag); }
    const cross = crossSprite(); cross.visible = false; cross.position.y = 1.0; holder.add(cross);
    const a = { p, jobKey: p.job, root, holder, log, more, basket, shadow, nameTag, cross, mats, job, tools: job.show.map((n) => root.getObjectByName(n)).filter(Boolean), yaw: p.yaw, wasDown: false, upT: 0, ...rig(root) };
    heroes.set(p.id, a);
  }
  function updateHero(a, p, dt, sim, t) {
    a.holder.position.set(p.x, p.y, p.z);
    let d = p.yaw - a.yaw; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
    a.yaw += d * (1 - Math.exp(-dt * 16)); a.holder.rotation.y = a.yaw;
    a.shadow.position.set(p.x, sim.map.heightAt(p.x, p.z) + 0.04, p.z); a.shadow.visible = !p.down;
    a.holder.visible = !p.dead;
    a.basket.visible = p.carry === 'vivres';
    a.more.forEach((m, i) => { m.visible = p.carry === 'bois' && (p.load || 1) > i + 1 && p.act !== 'store'; });
    a.log.visible = p.carry === 'poutre' || p.carry === 'vivres' ? false : p.carry === 'bois' && !(p.act === 'pick' && p.actT < ACT.pick.at) && !(p.act === 'take' && p.actT < ACT.take.at) || (p.act === 'store' && p.actT < ACT.store.at) || (p.act === 'feed' && p.actT < ACT.feed.at) || (p.act === 'drop' && p.actT < ACT.drop.at);
    for (const o of a.tools) o.visible = !p.carry && !['pick', 'store', 'feed', 'take', 'gather', 'eat'].includes(p.act);
    a.cross.visible = p.down; if (p.down) { a.cross.material.opacity = 0.6 + 0.4 * Math.sin(t * 6); }
    if (a.nameTag) a.nameTag.visible = !p.down;
    // un éclat rouge quand on est touché
    for (const m of a.mats) m.emissive.setRGB(p.hurtT > 0.28 ? 0.28 : 0, 0, 0);
    if (a.wasDown && !p.down) a.upT = 1.2;
    a.wasDown = p.down;
    a.upT = Math.max(0, a.upT - dt);
    const ONCE = { chop: '1H_Melee_Attack_Chop', strike: a.job.strike, pick: 'PickUp', store: 'Interact', drop: 'PickUp', feed: 'Interact', take: 'Interact', build: '1H_Melee_Attack_Chop', gather: 'PickUp', eat: 'Use_Item', repair: 'Interact', relight: 'Interact', ability: ABIL[a.p.job] || 'Cheer' };
    if (p.down) play(a, ['Lie_Down'], { once: true, dur: 0.9 });
    else if (a.upT > 0) { a.tag = 'up'; play(a, ['Lie_StandUp'], { once: true, dur: 1.2 }); }
    else if (p.act) {
      // le même geste deux fois de suite repart du début
      const tag = p.act + ':' + (p.act === a.lastAct && p.actT < a.lastT ? (a.n = (a.n || 0) + 1) : (a.n || 0));
      a.lastT = p.actT; a.lastAct = p.act;
      if (a.tag !== tag) { a.tag = tag; a.key = null; }
      play(a, [ONCE[p.act]], { once: true, dur: ACT[p.act].dur, fade: 0.1 });
    } else if (p.reviving !== null && p.reviving !== undefined) play(a, ['Use_Item'], { fade: 0.2 });
    else if (p.lever >= 0) play(a, ['Interact'], { fade: 0.2 });
    else if (!p.ground) play(a, ['Jump_Idle'], { fade: 0.12 });
    else if (p.carry) play(a, p.speed > 0.4 ? ['carryLegs', 'carryArms'] : ['carryIdleLegs', 'carryArms']);
    else if (p.speed > 3.6) play(a, ['Running_A'], { fade: 0.2 });
    else if (p.speed > 0.4) play(a, ['Walking_A'], { fade: 0.2 });
    else play(a, [sim.night ? '2H_Melee_Idle' : 'Idle'], { fade: 0.25 });
    if (!p.act) a.lastAct = null;
    const run = a.act('Running_A'), walk = a.act('Walking_A'), legs = a.act('carryLegs');
    if (run && !p.act) run.timeScale = Math.max(0.6, p.speed / 5.2);
    if (walk && !p.act) walk.timeScale = Math.max(0.6, p.speed / 2.6);
    if (legs) legs.timeScale = Math.max(0.6, p.speed / 2.4);
    a.mixer.update(dt);
  }

  // ------------------------------------------------------------------ squelettes
  const foes = new Map(), pending = new Set();
  const glow = new THREE.MeshStandardMaterial({ color: 0x9fe8ff, emissive: 0x6fd8ff, emissiveIntensity: 2.4 });
  async function addFoe(f) {
    const S = SKEL[f.kind];
    const g = await getModel(S.model);
    const root = cloneSkinned(g.scene); root.scale.setScalar(SCALE * (S.scale || (f.kind === 'warrior' ? 1.06 : 1)));
    const eyes = S.eyes ? new THREE.MeshStandardMaterial({ color: S.eyes, emissive: S.eyes, emissiveIntensity: 3 }) : glow;
    // le chevalier noir : os noircis
    root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; if (/glow/i.test(o.material.name || '')) o.material = eyes; else if (S.eyes) { o.material = o.material.clone(); o.material.color.multiplyScalar(S.tint || 0.32); } } });
    if (S.crown) {
      const hat = root.getObjectByName('Skeleton_Mage_Hat'); if (hat) hat.visible = false;
      const head = root.getObjectByName('head') || root.getObjectByName('Head');
      const crown = makeCrown();
      if (head) { crown.position.set(0, 0.68, 0); crown.scale.setScalar(1.1); head.add(crown); } else { crown.position.y = 2.1 / SCALE; root.add(crown); }
    }
    for (const [slot, name] of [['handslotr', S.right], ['handslotl', S.left]]) {
      if (!name) continue; const bone = root.getObjectByName(slot), w = weapon(name);
      if (bone && w) { w.traverse((o) => { if (o.isMesh) o.castShadow = true; }); bone.add(w); }
    }
    const holder = new THREE.Group(); holder.add(root); scene.add(holder);
    const bar = hpBar(); bar.position.y = 2.15 * (S.scale || 1); bar.visible = false; holder.add(bar);
    const a = { f, root, holder, bar, S, yaw: f.yaw, gone: 0, hitAt: -9, castAt: -9, lastHp: f.hp, ...rig(root) };
    if (S.crown) bar.visible = false;
    foes.set(f.id, a);
  }
  function updateFoe(a, f, dt, sim) {
    a.holder.position.set(f.x, f.y, f.z);
    let d = f.yaw - a.yaw; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
    a.yaw += d * (1 - Math.exp(-dt * 12)); a.holder.rotation.y = a.yaw;
    if (f.hp < a.lastHp - 0.5 && f.state !== 'dead') a.hitAt = 0;
    a.lastHp = f.hp; a.hitAt += dt;
    const F = FOES[f.kind], max = f.maxHp || F.hp;
    a.bar.visible = !a.S.crown && f.hp < max - 0.5 && (f.state === 'walk' || f.state === 'attack');
    a.bar.userData.set(f.hp / max);
    a.castAt += dt;
    if (a.state !== f.state) { a.state = f.state; a.tag = f.state + ':' + sim.t; }
    if (f.state === 'sleep') { a.tag = 'z'; play(a, ['Skeletons_Awaken_Floor'], { once: true, dur: 1e6, fade: 0.01 }); }
    else if (f.state === 'awaken') { if (a.tag === 'z') a.tag = 'w'; play(a, ['Skeletons_Awaken_Floor'], { once: true, dur: RISE.awaken, fade: 0.01 }); }
    else if (f.state === 'dead') play(a, ['Death_C_Skeletons'], { once: true, dur: 1.4, fade: 0.08 });
    else if (f.state === 'rise') play(a, ['Death_C_Skeletons_Resurrect'], { once: true, dur: RISE.dur, fade: 0.08 });
    else if (f.state === 'attack') play(a, [a.S.attack], { once: true, dur: F.dur, fade: 0.1 });
    else if (a.castAt < 1.4) { a.tag = 'cast' + a.castN; play(a, ['Spellcast_Summon'], { once: true, dur: 1.4, fade: 0.1 }); }
    else if (a.hitAt < 0.35 && !a.S.crown) { a.tag = 'hit' + Math.floor(sim.t * 3); play(a, ['Hit_A'], { once: true, dur: 0.4, fade: 0.05 }); }
    else play(a, [a.S.walk], { fade: 0.2 });
    const w = a.act(a.S.walk); if (w && f.state === 'walk') w.timeScale = f.kind === 'warrior' ? 1.05 : 0.85;
    a.mixer.update(dt);
  }

  function update(sim, dt, me, t = 0) {
    for (const p of sim.players) if (!heroes.has(p.id) && !pending.has('p' + p.id)) { pending.add('p' + p.id); addHero(p, me).then(() => pending.delete('p' + p.id)); }
    for (const [id, a] of heroes) {
      const p = sim.player(id);
      if (!p) { scene.remove(a.holder, a.shadow); heroes.delete(id); continue; }
      // changement de métier : on refait le personnage
      if (a.jobKey !== p.job) { scene.remove(a.holder, a.shadow); heroes.delete(id); continue; }
      a.p = p; updateHero(a, p, dt, sim, t);
    }
    const alive = new Set();
    for (const f of sim.foes) {
      alive.add(f.id);
      if (!foes.has(f.id)) { if (!pending.has('f' + f.id)) { pending.add('f' + f.id); addFoe(f).then(() => pending.delete('f' + f.id), (e) => { console.error('squelette', f.kind, e); pending.delete('f' + f.id); }); } continue; }
      const a = foes.get(f.id); a.f = f; updateFoe(a, f, dt, sim);
    }
    // les squelettes partis tombent en poussière : ils s'enfoncent et disparaissent
    for (const [id, a] of foes) {
      if (alive.has(id)) continue;
      a.gone += dt; a.holder.position.y -= dt * 0.7; a.mixer.update(dt);
      if (a.gone > 1.3) { scene.remove(a.holder); foes.delete(id); }
    }
  }
  // remise à zéro (partie rejouée) : les squelettes affichés repartent de l'état du moteur
  function reset() { for (const [, a] of foes) scene.remove(a.holder); foes.clear(); for (const [, a] of heroes) { a.wasDown = false; a.upT = 0; a.key = null; } }
  // le Roi lève son bâton quand il appelle ses morts
  function cast(id) { const a = foes.get(id); if (a) { a.castAt = 0; a.castN = (a.castN || 0) + 1; } }
  return { update, reset, cast, heroes, foes };
}
