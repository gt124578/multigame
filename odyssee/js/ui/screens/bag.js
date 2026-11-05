// odyssee/js/ui/screens/bag.js — sac
import { esc } from '../ui.js';
import { ITEMS, itemName, giveHeldItem } from '../../core/items.js';
import { monName } from '../../core/mon.js';
import { ASSETS } from '../../assets.js';
import { screen, closer } from './common.js';
import { partyScreen } from './party.js';

/* ================= SAC (Style 5G Noir 2 / Blanc 2) ================= */
/** renvoie { item } choisi pour « Utiliser », ou null — Style B2W2 (Proposition 1 : Dual Panel & Roue Animée) */
export function bagScreen(game, o = {}) {
  const ui = game.ui, bag = game.state.bag, st = game.state;
  return new Promise((resolve) => {
    const s = screen(ui, 'bag-scr b2w2-bag');
    let i = 0, busy = false;

    // Poches officielles B2W2 Concept 1 avec arc sci-fi, arrière-plans réactifs et coordonnées exactes sur l'arc
    const POCKET_CFG = [
      { id: 'objets', label: 'Objets', sub: 'Pierres, Bonbons et Objets tenus', color: '#00e0ff', glow: 'rgba(0, 224, 255, 0.45)', bg: 'img/bag/backpack_objets.jpg', icon: 'img/bag/icon_objets.png', arcX: 40.2, arcY: 11.6 },
      { id: 'soin', label: 'Soins', sub: 'Médicaments, Potions et Guérisons', color: '#34d870', glow: 'rgba(52, 216, 112, 0.45)', bg: 'img/bag/backpack_soin.jpg', icon: 'img/bag/icon_soin.png', arcX: 62.1, arcY: 25.2 },
      { id: 'balls', label: 'Poké Balls', sub: 'Capsules de capture de créatures', color: '#ff4c4c', glow: 'rgba(255, 76, 76, 0.45)', bg: 'img/bag/backpack_balls.jpg', icon: 'img/bag/icon_balls.png', arcX: 70.9, arcY: 40.1 },
      { id: 'ct', label: 'CT & CS', sub: 'Capsules Techniques et Secrètes', color: '#b966ff', glow: 'rgba(185, 102, 255, 0.45)', bg: 'img/bag/backpack_ct.jpg', icon: 'img/bag/icon_ct.png', arcX: 70.5, arcY: 54.8 },
      { id: 'baies', label: 'Baies', sub: 'Baies naturelles et remèdes doux', color: '#ff77a8', glow: 'rgba(255, 119, 168, 0.45)', bg: 'img/bag/backpack_baies.jpg', icon: 'img/bag/icon_baies.png', arcX: 59.1, arcY: 74.4 },
      { id: 'cles', label: 'Objets Rares', sub: 'Objets précieux, Carte et Bicyclette', color: '#ffe058', glow: 'rgba(255, 224, 88, 0.45)', bg: 'img/bag/backpack_cles.jpg', icon: 'img/bag/icon_cles.png', arcX: 34.2, arcY: 87.8 },
    ];

    let pocket = 0;
    if (typeof o.pocket === 'number') pocket = (o.pocket % POCKET_CFG.length + POCKET_CFG.length) % POCKET_CFG.length;
    else if (typeof o.pocket === 'string') {
      const idx = POCKET_CFG.findIndex((p) => p.id === o.pocket);
      if (idx >= 0) pocket = idx;
    }

    const itemPocketId = (k) => {
      const it = ITEMS[k];
      if (!it) return 'objets';
      if (it.pocket === 'baies' || k.includes('berry') || k.includes('baie')) return 'baies';
      if (it.pocket === 'ct' || k.startsWith('cs-') || k.startsWith('ct-')) return 'ct';
      if (it.pocket === 'balls') return 'balls';
      if (it.pocket === 'soin') return 'soin';
      if (it.pocket === 'cles' || it.key) return 'cles';
      return 'objets';
    };

    const entriesFor = (p) => {
      const target = POCKET_CFG[p].id;
      return Object.keys(bag)
        .filter((k) => ITEMS[k] && itemPocketId(k) === target && bag[k] > 0)
        .sort((a, b) => Object.keys(ITEMS).indexOf(a) - Object.keys(ITEMS).indexOf(b));
    };

    const entries = () => entriesFor(pocket);
    const close = closer(ui, s, () => pop, resolve, null);

    s.innerHTML = `
      <div class="scr-bar">
        <div class="scr-bar-left">
          <img class="scr-bar-ico" src="img/hud/bag.png" alt="">
          <span class="scr-bar-title">${o.battle ? 'SAC DE COMBAT' : "SAC D'OBJETS"}</span>
          <span class="scr-bar-sub b2w2-pocket-name">OBJETS</span>
        </div>
        <div class="scr-bar-right">
          <span class="scr-money-pill"><img src="img/hud/coin.png" alt=""> ${(st?.money || 0).toLocaleString('fr-FR')} ₽</span>
          <button type="button" class="scr-close-btn" data-act="back">FERMER ✕</button>
        </div>
      </div>
      <div class="b2w2-bag-body">
        <!-- PANNEAU GAUCHE : SAC SUR SOCLE & ARC DE POCHES GLISSANT (CONCEPT 1) -->
        <div class="b2w2-bag-left">
          <div class="b2w2-backpack-stage">
            <div class="b2w2-backpack-beams"></div>
            <img class="b2w2-backpack-img" src="${POCKET_CFG[pocket].bg}" alt="Sac d'Unys">
            <!-- ARC INCURVÉ DES 6 POCHES B2W2 -->
            <div class="b2w2-arc-wrap">
              <img class="b2w2-arc-img" src="img/bag/pocket_arc.png" alt="Arc des 6 poches">
              <!-- CURSEUR LUMINEUX GLISSANT LE LONG DE LA COURBE -->
              <div class="b2w2-arc-glider" style="left:${POCKET_CFG[pocket].arcX}%; top:${POCKET_CFG[pocket].arcY}%; --glider-col:${POCKET_CFG[pocket].color};">
                <span class="glider-ring"></span>
                <span class="glider-dot"></span>
              </div>
              <!-- 6 ZONES INTERACTIVES CLIQUABLES -->
              ${POCKET_CFG.map((cfg, idx) => `
                <button type="button" class="b2w2-arc-node ${idx === pocket ? 'on' : ''}" data-pocket="${idx}" style="left:${cfg.arcX}%; top:${cfg.arcY}%;" title="Poche ${cfg.label}">
                  <span class="arc-node-halo"></span>
                </button>
              `).join('')}
            </div>
          </div>
          <!-- BANDEAU D'ÉTAT DE LA POCHE -->
          <div class="b2w2-pocket-status">
            <div class="b2w2-pocket-badge" style="color:${POCKET_CFG[pocket].color};">◀ ${POCKET_CFG[pocket].label.toUpperCase()} ▶</div>
            <div class="b2w2-pocket-sub">${POCKET_CFG[pocket].sub}</div>
          </div>
        </div>
        <!-- PANNEAU DROIT : LISTE DES OBJETS DE LA POCHE -->
        <div class="b2w2-bag-right">
          <div class="b2w2-list-header">
            <div class="b2w2-list-title">
              <span class="b2w2-pocket-tag" style="color:${POCKET_CFG[pocket].color};">POCHE ${POCKET_CFG[pocket].label.toUpperCase()}</span>
              <span class="b2w2-pocket-items-cnt">0 objet</span>
            </div>
            <div class="b2w2-list-hint">
              <span><kbd>▲</kbd><kbd>▼</kbd> Naviguer</span>
              <span><kbd>◀</kbd><kbd>▶</kbd> Poches</span>
            </div>
          </div>
          <div class="b2w2-items-viewport">
            <div class="b2w2-items-list"></div>
          </div>
        </div>
      </div>
      <!-- BANDEAU INFÉRIEUR : INSPECTEUR D'OBJET & GRILLE 2X2 DE BOUTONS TACTILES -->
      <div class="b2w2-bag-inspector">
        <div class="b2w2-insp-left">
          <div class="b2w2-insp-frame">
            <img class="b2w2-insp-img" src="img/items/potion.png" alt="">
          </div>
        </div>
        <div class="b2w2-insp-mid">
          <div class="b2w2-insp-topline">
            <span class="b2w2-insp-name">---</span>
            <span class="b2w2-insp-cat"></span>
            <span class="b2w2-insp-qty">---</span>
          </div>
          <div class="b2w2-insp-desc">---</div>
        </div>
        <!-- GRILLE 2X2 DE BOUTONS TACTILES DS (CONCEPT 1) -->
        <div class="b2w2-btn-grid">
          <button type="button" class="b2w2-touch-btn b2w2-btn-use" data-act="use" title="Utiliser (Entrée / A)">
            <span class="touch-btn-lbl">UTILISER</span>
          </button>
          <button type="button" class="b2w2-touch-btn b2w2-btn-give" data-act="give" title="Donner à un Pokémon (D)">
            <span class="touch-btn-lbl">DONNER</span>
          </button>
          <button type="button" class="b2w2-touch-btn b2w2-btn-toss" data-act="toss" title="Jeter une quantité (J)">
            <span class="touch-btn-lbl">JETER</span>
          </button>
          <button type="button" class="b2w2-touch-btn b2w2-btn-back" data-act="back" title="Fermer le sac (Échap / B)">
            <span class="touch-btn-lbl">RETOUR</span>
          </button>
        </div>
      </div>
    `;

    // Références DOM
    const scrBarSub = s.querySelector('.b2w2-pocket-name');
    const backpackStage = s.querySelector('.b2w2-backpack-stage');
    const backpackImg = s.querySelector('.b2w2-backpack-img');
    const glider = s.querySelector('.b2w2-arc-glider');
    const arcNodes = [...s.querySelectorAll('.b2w2-arc-node')];
    const pocketBadge = s.querySelector('.b2w2-pocket-badge');
    const pocketSub = s.querySelector('.b2w2-pocket-sub');
    const pocketTag = s.querySelector('.b2w2-pocket-tag');
    const pocketItemsCnt = s.querySelector('.b2w2-pocket-items-cnt');
    const itemsListEl = s.querySelector('.b2w2-items-list');
    const inspSpriteEl = s.querySelector('.b2w2-insp-img');
    const inspNameEl = s.querySelector('.b2w2-insp-name');
    const inspCatEl = s.querySelector('.b2w2-insp-cat');
    const inspQtyEl = s.querySelector('.b2w2-insp-qty');
    const inspDescEl = s.querySelector('.b2w2-insp-desc');
    const useBtn = s.querySelector('.b2w2-btn-use');
    const giveBtn = s.querySelector('.b2w2-btn-give');
    const tossBtn = s.querySelector('.b2w2-btn-toss');
    const backBtn = s.querySelector('.b2w2-btn-back');
    const leftPanel = s.querySelector('.b2w2-bag-left');

    const updateCounts = () => {
      const es = entries();
      pocketItemsCnt.textContent = `${es.length} objet${es.length > 1 ? 's' : ''}`;
    };

    const updatePocket = () => {
      const cfg = POCKET_CFG[pocket];
      // 1. Déplacement physique fluide du curseur glider le long de l'arc incurvé
      glider.style.left = `${cfg.arcX}%`;
      glider.style.top = `${cfg.arcY}%`;
      glider.style.setProperty('--glider-col', cfg.color);

      // 2. Nœuds de l'arc
      arcNodes.forEach((node) => {
        const p = +node.dataset.pocket;
        node.classList.toggle('on', p === pocket);
      });

      // 3. Sac HD correspondant avec rétro-éclairage coloré
      backpackImg.src = cfg.bg;
      backpackStage.style.setProperty('--stage-glow', cfg.glow);

      // 4. Badges et sous-titres
      pocketBadge.textContent = `◀ ${cfg.label.toUpperCase()} ▶`;
      pocketBadge.style.color = cfg.color;
      pocketBadge.style.textShadow = `0 0 calc(var(--px) * 3) ${cfg.color}`;
      pocketSub.textContent = cfg.sub;

      // 5. En-têtes
      scrBarSub.textContent = cfg.label.toUpperCase();
      pocketTag.textContent = `POCHE ${cfg.label.toUpperCase()}`;
      pocketTag.style.color = cfg.color;
      updateCounts();
    };

    const updateInspector = () => {
      const es = entries();
      if (i > es.length) i = es.length;
      const sel = es[i];
      if (sel) {
        const it = ITEMS[sel];
        inspSpriteEl.src = ASSETS.item(sel);
        inspSpriteEl.style.display = '';
        inspNameEl.textContent = itemName(sel);
        inspCatEl.textContent = `[${POCKET_CFG[pocket].label}]`;
        inspCatEl.style.color = POCKET_CFG[pocket].color;
        inspQtyEl.textContent = it.key ? 'Objet Unique Rare' : `Quantité : × ${bag[sel]}`;
        inspDescEl.textContent = it.desc || '';

        const canUse = o.battle
          ? (it.heal || it.cure || it.revive || it.ball || it.pp || it.ppAll)
          : (!it.key || it.field || sel === 'town-map' || sel === 'velo');
        useBtn.disabled = !canUse;
        useBtn.classList.toggle('disabled', !canUse);

        const canGive = !o.battle && !it.key;
        giveBtn.disabled = !canGive;
        giveBtn.classList.toggle('disabled', !canGive);

        const canToss = !o.battle && !it.key;
        tossBtn.disabled = !canToss;
        tossBtn.classList.toggle('disabled', !canToss);
      } else {
        // Ligne de fermeture sélectionnée
        inspSpriteEl.style.display = 'none';
        inspNameEl.textContent = 'Fermer le Sac';
        inspCatEl.textContent = '';
        inspQtyEl.textContent = '';
        inspDescEl.textContent = "Revenir à l'aventure sans utiliser d'objet.";
        useBtn.disabled = false;
        useBtn.classList.remove('disabled');
        giveBtn.disabled = true;
        giveBtn.classList.add('disabled');
        tossBtn.disabled = true;
        tossBtn.classList.add('disabled');
      }
    };

    const renderList = () => {
      const es = entries();
      updateCounts();
      if (i > es.length) i = es.length;

      if (es.length === 0) {
        itemsListEl.innerHTML = `
          <div class="b2w2-empty-msg">Cette poche est vide pour le moment.</div>
          <div class="list-row b2w2-item-row b2w2-close-row on" data-row="0">
            <span class="cur">▶</span>
            <span class="b2w2-item-name" style="color:#ff9898;">FERMER LE SAC</span>
            <span class="b2w2-item-qty" style="color:#98a8c0;">Échap / B</span>
          </div>`;
        i = 0;
      } else {
        itemsListEl.innerHTML = es.map((k, n) => {
          const it = ITEMS[k];
          const heldTag = it.hold ? `<span class="b2w2-held-tag">TENU</span>` : '';
          return `<div class="list-row b2w2-item-row ${n === i ? 'on' : ''}" data-row="${n}">
            <span class="cur">${n === i ? '▶' : ''}</span>
            <div class="b2w2-item-ico-wrap">
              <img class="b2w2-item-ico" src="${ASSETS.item(k)}" alt="">
            </div>
            <span class="b2w2-item-name">${esc(itemName(k))}</span>
            ${heldTag}
            <span class="b2w2-item-qty">${it.key ? 'CLÉ' : '× ' + bag[k]}</span>
          </div>`;
        }).join('') +
        `<div class="list-row b2w2-item-row b2w2-close-row ${i === es.length ? 'on' : ''}" data-row="${es.length}">
          <span class="cur">${i === es.length ? '▶' : ''}</span>
          <span class="b2w2-item-name" style="color:#ff9898;">FERMER LE SAC</span>
          <span class="b2w2-item-qty" style="color:#98a8c0;">Échap / B</span>
        </div>`;
      }

      // Liaisons événements sur les lignes de la liste
      itemsListEl.querySelectorAll('[data-row]').forEach((row) => {
        const idx = +row.dataset.row;
        row.addEventListener('mouseenter', () => {
          if (!busy && i !== idx) {
            i = idx;
            itemsListEl.querySelectorAll('.b2w2-item-row').forEach((r, k) => {
              r.classList.toggle('on', k === i);
              const cur = r.querySelector('.cur');
              if (cur) cur.textContent = k === i ? '▶' : '';
            });
            ui.sound.sfx('blip');
            updateInspector();
          }
        });
        row.addEventListener('click', (e) => {
          e.stopPropagation();
          triggerRow(idx);
        });
      });

      itemsListEl.querySelector('.b2w2-item-row.on')?.scrollIntoView({ block: 'nearest' });
    };

    const changePocket = (newP) => {
      if (busy) return;
      const count = POCKET_CFG.length;
      const target = (newP % count + count) % count;
      if (target === pocket) return;
      pocket = target;
      i = 0;
      ui.sound.sfx('blip');
      updatePocket();
      renderList();
      updateInspector();
    };

    const changeItem = (newI) => {
      const es = entries();
      const max = es.length;
      i = (newI + max + 1) % (max + 1);
      ui.sound.sfx('blip');
      itemsListEl.querySelectorAll('.b2w2-item-row').forEach((r, k) => {
        r.classList.toggle('on', k === i);
        const cur = r.querySelector('.cur');
        if (cur) cur.textContent = k === i ? '▶' : '';
      });
      itemsListEl.querySelector('.b2w2-item-row.on')?.scrollIntoView({ block: 'nearest' });
      updateInspector();
    };

    const triggerRow = async (idx) => {
      if (busy) return;
      const es = entries();
      if (idx === es.length) { ui.sound.sfx('cancel'); close(null); return; }
      if (idx < 0 || idx > es.length) return;
      i = idx;
      updateInspector();

      const item = es[i], it = ITEMS[item];
      const canUse = o.battle
        ? (it.heal || it.cure || it.revive || it.ball || it.pp || it.ppAll)
        : (!it.key || it.field || item === 'town-map' || item === 'velo');

      if (!canUse) {
        ui.sound.sfx('bump');
        return;
      }
      ui.sound.sfx('select');
      close({ item });
    };

    const handleGive = async () => {
      if (busy || o.battle) return;
      const es = entries();
      if (i >= es.length) return;
      const item = es[i];
      if (!item) return;
      const it = ITEMS[item];
      if (it.key) {
        ui.sound.sfx('bump');
        await ui.say("Cet objet rare ne peut pas être tenu.");
        return;
      }
      if (!st.party || !st.party.length) {
        ui.sound.sfx('bump');
        await ui.say("Tu n'as aucune créature dans ton équipe !");
        return;
      }
      busy = true;
      ui.sound.sfx('select');
      const targetIdx = await partyScreen(game, { mode: 'pick' });
      busy = false;
      if (targetIdx >= 0 && st.party[targetIdx]) {
        const m = st.party[targetIdx];
        const old = giveHeldItem(m, item, bag);
        ui.sound.sfx('item');
        if (old) {
          await ui.say([
            `${monName(m)} prend ${itemName(item)}.`,
            `L'ancien objet (${itemName(old)}) a été replacé dans le sac.`
          ]);
        } else {
          await ui.say(`${monName(m)} tient désormais ${itemName(item)} !`);
        }
        renderList();
        updateInspector();
      }
    };

    const handleToss = async () => {
      if (busy || o.battle) return;
      const es = entries();
      if (i >= es.length) return;
      const item = es[i];
      if (!item || ITEMS[item]?.key) return;
      busy = true;
      const q = await ui.quantity(bag[item]);
      if (q && await ui.yesNo(`Jeter ${q} ${itemName(item)} ?`)) {
        bag[item] -= q;
        if (bag[item] <= 0) delete bag[item];
        ui.sound.sfx('item');
      }
      busy = false;
      renderList();
      updateInspector();
    };

    // Initialisation
    updatePocket();
    renderList();
    updateInspector();

    // Clic sur les nœuds de l'arc
    arcNodes.forEach((node) => {
      node.addEventListener('click', () => {
        const p = +node.dataset.pocket;
        changePocket(p);
      });
    });

    // Molette de souris sur le panneau gauche pour faire glisser l'arc
    leftPanel?.addEventListener('wheel', (e) => {
      e.preventDefault();
      if (busy) return;
      if (e.deltaY > 15) changePocket(pocket + 1);
      else if (e.deltaY < -15) changePocket(pocket - 1);
    }, { passive: false });

    // Clics sur les 4 boutons tactiles DS
    useBtn?.addEventListener('click', () => {
      const es = entries();
      if (i >= es.length) { ui.sound.sfx('cancel'); close(null); return; }
      const item = es[i], it = ITEMS[item];
      // Si c'est un objet purement tenu (ex: baies de tenue, restes, orbe vie), rediriger naturellement vers Donner
      if (it && it.hold && !it.heal && !it.candy && !it.stone && !it.field) {
        handleGive();
      } else {
        triggerRow(i);
      }
    });
    giveBtn?.addEventListener('click', handleGive);
    tossBtn?.addEventListener('click', handleToss);
    backBtn?.addEventListener('click', () => { ui.sound.sfx('cancel'); close(null); });
    s.querySelector('.scr-close-btn')?.addEventListener('click', () => { ui.sound.sfx('cancel'); close(null); });

    // Contrôles Clavier / Manette
    const pop = ui.input.push(async (k) => {
      if (busy) return;
      if (k === 'left') { changePocket(pocket - 1); return; }
      if (k === 'right') { changePocket(pocket + 1); return; }
      if (k === 'up') { changeItem(i - 1); return; }
      if (k === 'down') { changeItem(i + 1); return; }
      if (k === 'b') { ui.sound.sfx('cancel'); close(null); return; }
      if (k === 'd' || k === 'g') { await handleGive(); return; }
      if (k === 'j' || k === 'x') { await handleToss(); return; }
      if (k === 'a') {
        const es = entries();
        if (i === es.length) { ui.sound.sfx('cancel'); close(null); return; }
        await triggerRow(i);
      }
    });
  });
}
