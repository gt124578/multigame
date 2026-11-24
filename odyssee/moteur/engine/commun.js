// odyssee/moteur/engine/commun.js — scripts communs à tout le jeu (défi des dresseurs, objets au sol, surf, vélo).
// Ils sont écrits dans le même langage que les scripts des zones : le moteur n'a aucune séquence en dur.
export const COMMUN = `
# Un dresseur voit le joueur : « ! », il approche, le joueur se tourne, puis le script propre au dresseur.
script DefiDresseur
  exclamation moi
  approcher_dresseur
  joueur_face_dresseur
  script_dresseur

# On parle à un dresseur pas encore battu.
script DefiDresseurParle
  regarder_joueur
  script_dresseur

script RamasserObjet
  ramasser
  liberer
  fin

script ProposerSurf
  message "L'eau est d'un bleu profond.\\nVoulez-vous utiliser SURF ?"
  oui_non
  si resultat = 0 aller ProposerSurf_Non
  fermer_message
  commencer_surf
  liberer
  fin
ProposerSurf_Non:
  liberer
  fin

script PasDeVeloIci
  message "Impossible d'utiliser le VÉLO ici."
  liberer
  fin
`;
