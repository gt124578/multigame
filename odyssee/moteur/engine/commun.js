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

script MessageSauvegarde
  message "{JOUEUR} sauvegarde la partie."
  fin

# Arbre à baies (un panneau sur l'arbre, paramètres : baie, quantite, repousse)
script ArbreBaies
  cueillir
  si resultat = 1 aller ArbreBaies_Fin
  message "Il n'y a plus de baies.\\nElles repousseront."
ArbreBaies_Fin:
  liberer
  fin

# Petit arbre qu'on coupe avec COUPE ; il repousse quand on change de carte
script ArbreCoupe
  si non drapeau CS_COUPE aller ArbreCoupe_Non
  message "Cet arbre peut être coupé !\\nUtiliser COUPE ?"
  oui_non
  si resultat = 0 aller ArbreCoupe_Fin
  fermer_message
  son coupe
  retirer
  aller ArbreCoupe_Fin
ArbreCoupe_Non:
  message "Cet arbre a l'air coupable."
ArbreCoupe_Fin:
  liberer
  fin

# Infirmière d'un Centre POKéMON
script Infirmiere
  regarder_joueur
  message "Bienvenue au Centre POKéMON !\\nVoulez-vous soigner vos POKéMON ?"
  oui_non
  si resultat = 0 aller Infirmiere_Non
  message "Je prends vos POKéMON un instant."
  soigner
  point_de_soin
  message "Vos POKéMON sont en pleine forme !\\nÀ bientôt !"
  liberer
  fin
Infirmiere_Non:
  message "À bientôt !"
  liberer
  fin

# Vendeur d'une boutique (les articles sont dans les paramètres du script de la zone)
script PCdeLeo
  message "{JOUEUR} allume le PC.\\nLe système de stockage n'est pas encore branché."
  fin

script PasDeVeloIci
  message "Impossible d'utiliser le VÉLO ici."
  liberer
  fin
`;

/** les mêmes scripts, textes en anglais (le jeu HGSS en version anglaise) */
export const COMMUN_EN = `
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
  message "The water is a deep blue...\\nWould you like to Surf?"
  oui_non
  si resultat = 0 aller ProposerSurf_Non
  fermer_message
  commencer_surf
  liberer
  fin
ProposerSurf_Non:
  liberer
  fin

script MessageSauvegarde
  message "{JOUEUR} saved the game."
  fin

# Arbre à baies (un panneau sur l'arbre, paramètres : baie, quantite, repousse)
script ArbreBaies
  cueillir
  si resultat = 1 aller ArbreBaies_Fin
  message "There are no Berries here.\\nThey will grow back."
ArbreBaies_Fin:
  liberer
  fin

# Petit arbre qu'on coupe avec COUPE ; il repousse quand on change de carte
script ArbreCoupe
  si non drapeau CS_COUPE aller ArbreCoupe_Non
  message "This tree looks like it can be cut down!\\nWould you like to use Cut?"
  oui_non
  si resultat = 0 aller ArbreCoupe_Fin
  fermer_message
  son coupe
  retirer
  aller ArbreCoupe_Fin
ArbreCoupe_Non:
  message "This tree looks like it can be cut down."
ArbreCoupe_Fin:
  liberer
  fin

# Infirmière d'un Centre POKéMON
script Infirmiere
  regarder_joueur
  message "Hello, and welcome to the Pokémon Center.\\nWould you like to rest your Pokémon?"
  oui_non
  si resultat = 0 aller Infirmiere_Non
  message "OK, I'll take your Pokémon for a few seconds."
  soigner
  point_de_soin
  message "Thank you for waiting.\\nWe hope to see you again!"
  liberer
  fin
Infirmiere_Non:
  message "We hope to see you again!"
  liberer
  fin

# Vendeur d'une boutique (les articles sont dans les paramètres du script de la zone)
script PCdeLeo
  message "{JOUEUR} booted up the PC.\\nThe storage system isn't connected yet."
  fin

script PasDeVeloIci
  message "{JOUEUR} can't use the Bicycle here."
  liberer
  fin
`;
