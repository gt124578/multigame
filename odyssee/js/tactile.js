// odyssee/js/tactile.js — jouer au doigt sur téléphone ou tablette : une croix à gauche, A et B à droite, Menu en haut.
// Affichés dès le premier contact du doigt sur l'écran (jamais à la souris), cachés si l'on reprend le clavier.
// Les boutons deviennent les touches du jeu (input.js), comme le clavier et la manette.
//   croix : glisser le doigt dessus, la direction suit le doigt (zone morte au centre) ; tenue = marche continue
//   A : parler, valider     B : annuler, menu     Menu : menu principal (la course : bouton COURSE du HUD)
const CSS = `
.tactile { position: fixed; inset: 0; pointer-events: none; z-index: 40; display: none; user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; }
html.doigt .tactile { display: block; }
html.doigt .keybar { display: none; }   /* les rappels du clavier ne servent pas au doigt */
.tactile > * { pointer-events: auto; touch-action: none; position: absolute; }
.tactile .croix { left: max(14px, env(safe-area-inset-left)); bottom: max(18px, env(safe-area-inset-bottom)); width: 132px; height: 132px; border-radius: 50%;
  background: radial-gradient(circle, rgba(20,28,48,.42) 0 58%, rgba(20,28,48,.24) 59%); border: 2px solid rgba(255,255,255,.28); }
.tactile .croix::before, .tactile .croix::after { content: ''; position: absolute; left: 50%; top: 50%; background: rgba(255,255,255,.34); border-radius: 6px; transform: translate(-50%, -50%); }
.tactile .croix::before { width: 38px; height: 104px; } .tactile .croix::after { width: 104px; height: 38px; }
.tactile .croix i { position: absolute; left: 50%; top: 50%; width: 34px; height: 34px; margin: -17px; border-radius: 50%; background: rgba(255,255,255,.55); z-index: 1; transition: transform .06s; }
.tactile .bt { width: 62px; height: 62px; border-radius: 50%; border: 2px solid rgba(255,255,255,.35); color: #fff; font: 700 22px/58px 'Chakra Petch', system-ui, sans-serif; text-align: center; background: rgba(20,28,48,.42); }
.tactile .bt.on { background: rgba(255,203,5,.55); }
.tactile .a { right: max(18px, env(safe-area-inset-right)); bottom: max(62px, calc(env(safe-area-inset-bottom) + 44px)); }
.tactile .b { right: max(92px, calc(env(safe-area-inset-right) + 74px)); bottom: max(18px, env(safe-area-inset-bottom)); }
.tactile .menu { left: max(14px, env(safe-area-inset-left)); bottom: max(168px, calc(env(safe-area-inset-bottom) + 150px)); width: 58px; height: 34px; border-radius: 10px; font-size: 13px; line-height: 30px; }
/* pendant un dialogue, la croix s'efface presque : le texte reste lisible dessous */
#ui:has(> .dlg) ~ .tactile .croix { opacity: .35; }
@media (max-height: 420px) { .tactile .croix { width: 112px; height: 112px; } .tactile .bt { width: 54px; height: 54px; line-height: 50px; } .tactile .menu { bottom: max(142px, calc(env(safe-area-inset-bottom) + 126px)); } }
`;

export function brancherTactile(input) {
  if (typeof document === 'undefined') return null;
  const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
  const root = document.createElement('div'); root.className = 'tactile';
  root.innerHTML = '<div class="croix"><i></i></div><div class="bt a">A</div><div class="bt b">B</div><div class="bt menu">Menu</div>';
  document.body.appendChild(root);
  const croix = root.querySelector('.croix'), bille = croix.querySelector('i');
  // le doigt montre les commandes ; le clavier les cache
  addEventListener('touchstart', () => document.documentElement.classList.add('doigt'), { passive: true, capture: true });
  addEventListener('keydown', (e) => { if (!e.isTrusted) return; document.documentElement.classList.remove('doigt'); }, { capture: true });

  // croix : la direction suit le doigt (la plus grande composante, zone morte de 18 % du rayon)
  let dir = null, doigt = null;
  const poser = (d) => { if (d === dir) return; if (dir) input.relache(dir); dir = d; if (d) input.appui(d, false); };
  const lire = (e) => {
    const r = croix.getBoundingClientRect(), dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2), R = r.width / 2;
    const n = Math.hypot(dx, dy), k = Math.min(1, R * 0.62 / Math.max(n, 1e-6));
    bille.style.transform = `translate(${dx * k}px, ${dy * k}px)`;
    poser(n < R * 0.18 ? null : Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'up' : 'down'));
  };
  croix.addEventListener('pointerdown', (e) => { e.preventDefault(); doigt = e.pointerId; croix.setPointerCapture?.(e.pointerId); lire(e); });
  croix.addEventListener('pointermove', (e) => { if (e.pointerId === doigt) lire(e); });
  const lacher = (e) => { if (e.pointerId !== doigt) return; doigt = null; bille.style.transform = ''; poser(null); };
  croix.addEventListener('pointerup', lacher); croix.addEventListener('pointercancel', lacher); croix.addEventListener('lostpointercapture', lacher);

  // boutons : A, B, Menu
  const bouton = (el, k) => {
    const bas = (e) => { e.preventDefault(); el.setPointerCapture?.(e.pointerId); el.classList.add('on'); input.appui(k, false); };
    const haut = () => { el.classList.remove('on'); input.relache(k); };
    el.addEventListener('pointerdown', bas); el.addEventListener('pointerup', haut); el.addEventListener('pointercancel', haut); el.addEventListener('lostpointercapture', haut);
  };
  bouton(root.querySelector('.a'), 'a'); bouton(root.querySelector('.b'), 'b'); bouton(root.querySelector('.menu'), 'menu');
  // une application qui passe en arrière-plan ne garde aucun bouton enfoncé
  addEventListener('visibilitychange', () => { if (document.hidden) { poser(null); for (const k of ['a', 'b', 'menu']) input.relache(k); } });
  return root;
}
