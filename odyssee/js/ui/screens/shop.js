// odyssee/js/ui/screens/shop.js — boutique
import { el, esc } from '../ui.js';
import { ITEMS, itemName } from '../../core/items.js';
import { ASSETS } from '../../assets.js';

/* ================= BOUTIQUE ================= */
export async function shopScreen(game, stock) {
  const ui = game.ui, st = game.state;
  for (;;) {
    const r = await ui.ask('Bonjour ! Que puis-je faire pour toi ?', ['Acheter', 'Vendre', 'Au revoir'], { keep: true, speaker: 'Vendeur' });
    if (r === 1) {
      const sellable = Object.keys(st.bag).filter((k) => st.bag[k] > 0 && ITEMS[k] && !ITEMS[k].key && ITEMS[k].price > 0);
      if (!sellable.length) { await ui.say('Tu n\'as rien à vendre.', { keep: true }); continue; }
      const k = await ui.list({ title: 'Vendre', items: sellable.map((it) => ({ label: itemName(it), right: `× ${st.bag[it]}` })).concat([{ label: 'Annuler' }]), cls: 'shop', cancel: sellable.length });
      if (k < 0 || k >= sellable.length) continue;
      const it = sellable[k], price = Math.floor(ITEMS[it].price / 2);
      const q = await ui.quantity(st.bag[it], { price });
      if (!q) continue;
      if (await ui.yesNo(`Je peux t'en donner ${(q * price).toLocaleString('fr-FR')} ₽. D'accord ?`, { keep: true })) { st.bag[it] -= q; if (st.bag[it] <= 0) delete st.bag[it]; st.money += q * price; ui.sound.sfx('buy'); }
      continue;
    }
    if (r !== 0) break;
    const money = el('div', 'box money'); ui.root.appendChild(money);
    for (;;) {
      money.innerHTML = `Argent<br><b>${st.money.toLocaleString('fr-FR')} ₽</b>`;
      const k = await ui.list({ title: 'Acheter', items: stock.map((it) => ({ html: `<img class="itm" src="${ASSETS.item(it)}" alt="">${esc(itemName(it))}`, right: `${ITEMS[it].price.toLocaleString('fr-FR')} ₽` })).concat([{ label: 'Annuler' }]), cls: 'shop', cancel: stock.length, start: game._shopIdx || 0, onMove: (i) => { game._shopIdx = i; } });
      if (k < 0 || k >= stock.length) break;
      const it = stock[k], price = ITEMS[it].price, max = Math.min(99, Math.floor(st.money / price));
      if (max < 1) { await ui.say('Tu n\'as pas assez d\'argent.', { keep: true }); continue; }
      const q = await ui.quantity(max, { price });
      if (!q) continue;
      if (!(await ui.yesNo(`${itemName(it)} × ${q}, ça fera ${(q * price).toLocaleString('fr-FR')} ₽. D'accord ?`, { keep: true }))) continue;
      st.money -= q * price; st.bag[it] = (st.bag[it] || 0) + q; ui.sound.sfx('buy');
      money.innerHTML = `Argent<br><b>${st.money.toLocaleString('fr-FR')} ₽</b>`;
      if (q >= 10 && it === 'poke-ball') { st.bag['poke-ball']++; await ui.say('Voici une Poké Ball en cadeau pour ton achat !', { keep: true }); }
      else await ui.say('Et voilà ! Merci !', { keep: true });
    }
    money.remove();
  }
  await ui.say('Reviens quand tu veux !');
}
