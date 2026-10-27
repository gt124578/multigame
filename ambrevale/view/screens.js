// Les deux écrans façon DS (256 × 192 chacun) et leur mise à l'échelle dans la fenêtre.
export const SW = 256, SH = 192;

export function createScreens(root) {
  root.innerHTML = `
    <div id="ds">
      <div class="scr" id="top"><canvas id="gl" width="${SW}" height="${SH}"></canvas><div id="tint"></div><canvas id="ui" width="${SW}" height="${SH}"></canvas></div>
      <div class="hinge"></div>
      <div class="scr" id="bot"><canvas id="sub" width="${SW}" height="${SH}"></canvas></div>
    </div>`;
  const gl = root.querySelector('#gl'), ui = root.querySelector('#ui'), sub = root.querySelector('#sub');
  const uctx = ui.getContext('2d'), sctx = sub.getContext('2d');
  uctx.imageSmoothingEnabled = false; sctx.imageSmoothingEnabled = false;
  const ds = root.querySelector('#ds'), top = root.querySelector('#top'), bot = root.querySelector('#bot'), tint = root.querySelector('#tint');
  const S = { gl, ui, sub, uctx, sctx, top, bot, tint, layout: 'stack', scaleTop: 2, scaleBot: 2 };
  function fit() {
    const W = innerWidth, H = innerHeight, gap = 10;
    // empilé comme une DS, ou côte à côte (grand écran du haut + écran tactile à droite)
    const sStack = Math.min((W - 16) / SW, (H - 16 - gap) / (SH * 2));
    const sSideTop = Math.min((W - 24 - gap) / (SW * 1.55), (H - 16) / SH);
    let lay, st, sb;
    if (sSideTop > sStack * 1.25) { lay = 'side'; st = sSideTop; sb = st * 0.55; } else { lay = 'stack'; st = sStack; sb = sStack; }
    const snap = (s) => (s >= 2 && s - Math.floor(s) < 0.2 ? Math.floor(s) : s);
    st = snap(st); sb = lay === 'stack' ? st : snap(sb);
    S.layout = lay; S.scaleTop = st; S.scaleBot = sb;
    ds.className = lay;
    for (const [el, s] of [[top, st], [bot, sb]]) { el.style.width = SW * s + 'px'; el.style.height = SH * s + 'px'; }
  }
  addEventListener('resize', fit); fit();
  S.fit = fit;
  /** coordonnées d'un clic sur l'écran du bas, en pixels DS */
  S.subPoint = (e) => { const r = sub.getBoundingClientRect(); return { x: ((e.clientX - r.left) / r.width) * SW, y: ((e.clientY - r.top) / r.height) * SH }; };
  return S;
}
