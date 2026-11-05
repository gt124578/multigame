// odyssee/js/ui/screens/savecode.js — code de sauvegarde
import { el, esc } from '../ui.js';
import { screen, closer } from './common.js';

/* ================= CODE DE SAUVEGARDE ================= */
/** Affiche le code de la partie, à copier pour la reprendre sur un autre appareil. */
export function saveCodeScreen(ui, code, summary) {
  return new Promise((resolve) => {
    const s = screen(ui, 'code-scr', 'CODE DE SAUVEGARDE');
    const box = el('div', 'box code-box');
    box.innerHTML = `<div class="code-sum">${esc(summary)}</div>
      <p>Copie ce code puis, sur l'autre appareil, choisis <b>Charger un code</b> sur l'écran titre. Ta partie y reprend là où tu l'as sauvegardée.</p>
      <textarea class="code-ta" readonly spellcheck="false"></textarea>
      <div class="code-row"><button class="code-btn" data-k="copy">Copier le code</button><button class="code-btn ghost" data-k="close">Fermer</button></div>
      <div class="code-msg"></div>`;
    s.appendChild(box);
    const ta = box.querySelector('textarea'), msg = box.querySelector('.code-msg');
    ta.value = code;
    const copy = async () => {
      ta.focus(); ta.select();
      let ok = false;
      try { await navigator.clipboard.writeText(code); ok = true; } catch (e) { try { ok = document.execCommand('copy'); } catch (e2) { ok = false; } }
      msg.textContent = ok ? 'Code copié !' : 'Le code est sélectionné : copie-le avec Ctrl+C (⌘+C sur Mac).';
      ui.sound.sfx(ok ? 'select' : 'blip');
    };
    const close = closer(ui, s, () => pop, resolve);
    box.querySelector('[data-k=copy]').onclick = copy;
    box.querySelector('[data-k=close]').onclick = close;
    const pop = ui.input.push((k) => { if (k === 'b') close(); else if (k === 'a') copy(); });
    setTimeout(() => { ta.focus(); ta.select(); }, 30);
  });
}

/** Demande un code collé ; renvoie le texte, ou null si on annule. */
export function loadCodeScreen(ui, check) {
  return new Promise((resolve) => {
    const s = screen(ui, 'code-scr', 'CHARGER UN CODE');
    const box = el('div', 'box code-box');
    box.innerHTML = `<p>Sur ton autre appareil : menu (Échap) → <b>CODE</b>, copie le code, puis colle-le ici.</p>
      <textarea class="code-ta" spellcheck="false" placeholder="ODY1.…"></textarea>
      <div class="code-row"><button class="code-btn" data-k="ok">Charger cette partie</button><button class="code-btn ghost" data-k="close">Annuler</button></div>
      <div class="code-msg err"></div>`;
    s.appendChild(box);
    const ta = box.querySelector('textarea'), msg = box.querySelector('.code-msg');
    let busy = false;
    const done = (v) => { pop(); s.remove(); resolve(v); };
    const ok = async () => {
      if (busy) return; busy = true; msg.textContent = 'Vérification…';
      const r = await check(ta.value);
      busy = false;
      if (r.error) { msg.textContent = r.error; ui.sound.sfx('bump'); ta.focus(); return; }
      ui.sound.sfx('select'); done(r);
    };
    box.querySelector('[data-k=ok]').onclick = ok;
    box.querySelector('[data-k=close]').onclick = () => { ui.sound.sfx('cancel'); done(null); };
    // Échap ferme ; Entrée dans la zone de texte valide (Maj+Entrée pour aller à la ligne)
    ta.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); ui.sound.sfx('cancel'); done(null); }
      else if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ok(); }
      e.stopPropagation();
    });
    const pop = ui.input.push((k) => { if (k === 'b') { ui.sound.sfx('cancel'); done(null); } });
    setTimeout(() => ta.focus(), 30);
  });
}
