// Objets du sac.
export const ITEMS = {
  potion: { name: 'Potion', price: 300, pocket: 'soin', heal: 20, desc: 'Rend 20 PV à une créature.' },
  superpotion: { name: 'Super Potion', price: 700, pocket: 'soin', heal: 60, desc: 'Rend 60 PV à une créature.' },
  hyperpotion: { name: 'Hyper Potion', price: 1200, pocket: 'soin', heal: 200, desc: 'Rend 200 PV à une créature.' },
  antidote: { name: 'Antidote', price: 100, pocket: 'soin', cure: ['psn'], desc: 'Soigne l\'empoisonnement.' },
  totalsoin: { name: 'Total Soin', price: 400, pocket: 'soin', cure: ['psn', 'brn', 'par', 'slp', 'frz'], desc: 'Soigne tous les problèmes de statut.' },
  rappel: { name: 'Rappel', price: 1500, pocket: 'soin', revive: 0.5, desc: 'Ranime une créature K.O. avec la moitié de ses PV.' },
  sphere: { name: 'Sphère', price: 200, pocket: 'sphere', ball: 1, color: '#e04848', desc: 'Pour capturer les créatures sauvages.' },
  supersphere: { name: 'Super Sphère', price: 600, pocket: 'sphere', ball: 1.5, color: '#3a78d0', desc: 'Une Sphère plus efficace.' },
  hypersphere: { name: 'Hyper Sphère', price: 1200, pocket: 'sphere', ball: 2, color: '#f0c030', desc: 'Une Sphère très efficace.' },
  repousse: { name: 'Repousse', price: 350, pocket: 'objet', repel: 100, desc: 'Éloigne les créatures sauvages faibles pendant 100 pas.' },
};
export const POCKETS = [['soin', 'Soins'], ['sphere', 'Sphères'], ['objet', 'Objets']];
export function item(id) { return ITEMS[id]; }
