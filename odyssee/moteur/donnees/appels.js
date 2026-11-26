// odyssee/moteur/donnees/appels.js — ce que disent les appels du Pokégear (PhoneCall des scripts du jeu) et les
// échanges des habitants (LoadNPCTrade). Les paroles des appels ne sont pas dans les fichiers publiés par la
// décompilation : ce sont ici de courts résumés écrits pour le moteur (pas le texte du jeu). Les échanges sont repris de
// ce que disent les habitants dans leurs dialogues (« Do you have a KRABBY? Want to trade it for my VOLTORB? »).

/** appels : contact (PHONE_CONTACT_…) et numéro de l'appel dans le script → { fr, en } */
const APPELS = {
  'PROF__ELM 0': {
    fr: 'Drrring… C\'est le Prof. Orme ! {JOUEUR}, c\'est terrible, il s\'est passé quelque chose au labo ! Reviens vite !',
    en: 'Ring ring… It\'s PROF. ELM! {JOUEUR}, something terrible has happened at the lab! Please come back right away!',
  },
  'PROF__ELM 1': {
    fr: 'Drrring… C\'est le Prof. Orme ! Mon assistant t\'attend à la BOUTIQUE de Mauville : il a quelque chose à te confier.',
    en: 'Ring ring… It\'s PROF. ELM! My assistant is waiting for you at the POKé MART in Violet City. He has something for you.',
  },
  'PROF__ELM 2': {
    fr: 'Drrring… C\'est le Prof. Orme ! J\'ai appris que tu progressais vite. Continue comme ça, {JOUEUR} !',
    en: 'Ring ring… It\'s PROF. ELM! I hear you\'re doing great. Keep it up, {JOUEUR}!',
  },
  'PROF__ELM 3': {
    fr: 'Drrring… C\'est le Prof. Orme ! Passe au labo quand tu pourras, j\'ai des nouvelles pour toi.',
    en: 'Ring ring… It\'s PROF. ELM! Drop by the lab when you can, I have news for you.',
  },
  'PROF__OAK 0': {
    fr: 'Drrring… C\'est le Prof. Chen ! Ton POKéDEX avance bien ? Passe me voir à Bourg Palette.',
    en: 'Ring ring… It\'s PROF. OAK! How is your POKéDEX coming along? Come and see me in Pallet Town.',
  },
  'MOTHER 0': {
    fr: 'Drrring… C\'est maman ! Tu vas bien ? N\'oublie pas de prendre soin de toi et de tes POKéMON.',
    en: 'Ring ring… It\'s Mom! Are you doing OK? Take good care of yourself and your POKéMON.',
  },
  'BAOBA 0': {
    fr: 'Drrring… Ici Baoba, du PARC SAFARI ! Le parc est prêt : viens nous voir à l\'ouest d\'Oliville.',
    en: 'Ring ring… This is BAOBA from the SAFARI ZONE! The park is ready: come visit us west of Olivine.',
  },
};
/** le texte d'un appel (null s'il n'est pas connu : le moteur dit seulement qui appelle) */
export function appels(qui, k, langue = 'fr') {
  const a = APPELS[`${qui} ${k}`] || APPELS[`${qui} 0`];
  return a ? a[langue === 'en' ? 'en' : 'fr'] : null;
}

/** échanges des habitants : numéro (LoadNPCTrade) → { demande, donne } (numéros du Pokédex national) */
export const ECHANGES = {
  0: { demande: 69, donne: 95 },      // Mauville : CHÉTIFLOR contre ONIX
  1: { demande: 96, donne: 66 },      // Doublonville, Centre commercial 5e : SOPORIFIK contre MACHOC
  2: { demande: 98, donne: 100 },     // Oliville : KRABBY contre VOLTORBE
  3: { demande: 148, donne: 85 },     // Ébènelle : DRAGMOLOSSE ♀ contre DODRIO
  5: { demande: null, donne: 208 },   // Jasmine : son STEELIX (le script choisit lui-même ce qu'elle accepte)
  8: { demande: 51, donne: 82 },      // Route 10 : TRIOPIKEUR contre MAGNÉTON
  9: { demande: 93, donne: 178 },     // Azuria : SPECTRUM contre XATU
  10: { demande: 25, donne: 25 },     // Major Bob : PIKACHU contre PIKACHU
  11: { demande: 438, donne: 111 },   // Pierre : MANZAÏ contre RHINOCORNE
  12: { demande: 205, donne: 374 },   // Pierre Rochard : FORETRESS contre TERHAL
};
