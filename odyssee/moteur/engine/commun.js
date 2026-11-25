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
  tester_capacite coupe
  si resultat = 0 aller ArbreCoupe_Non
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

# Capacités de terrain (données du jeu : badge et CS ; zone d'essai : drapeau CS_…)
script EclateRoc
  tester_capacite eclate
  si resultat = 0 aller EclateRoc_Non
  message "Ce rocher semble fragile.\\nUtiliser ÉCLATE-ROC ?"
  oui_non
  si resultat = 0 aller EclateRoc_Fin
  fermer_message
  son coupe
  retirer
  aller EclateRoc_Fin
EclateRoc_Non:
  message "C'est un rocher fissuré. Un POKéMON\\npourrait peut-être le briser."
EclateRoc_Fin:
  liberer
  fin

script Force
  si drapeau TMP_FORCE aller Force_Deja
  tester_capacite force
  si resultat = 0 aller Force_Non
  message "C'est un gros rocher.\\nUtiliser FORCE ?"
  oui_non
  si resultat = 0 aller Force_Fin
  drapeau TMP_FORCE
  message "FORCE permet de pousser les rochers."
  aller Force_Fin
Force_Deja:
  message "FORCE permet de pousser les rochers."
  aller Force_Fin
Force_Non:
  message "C'est un gros rocher.\\nUn POKéMON pourrait peut-être le pousser."
Force_Fin:
  liberer
  fin

script ProposerCascade
  message "Une grande cascade.\\nUtiliser CASCADE ?"
  oui_non
  si resultat = 0 aller Capacite_Fin
  fermer_message
  franchir
  aller Capacite_Fin
script ProposerSiphon
  message "C'est un tourbillon.\\nUtiliser SIPHON ?"
  oui_non
  si resultat = 0 aller Capacite_Fin
  fermer_message
  franchir
  aller Capacite_Fin
script ProposerEscalade
  message "Une paroi escarpée.\\nUtiliser ESCALADE ?"
  oui_non
  si resultat = 0 aller Capacite_Fin
  fermer_message
  franchir
Capacite_Fin:
  liberer
  fin
script ImpossibleCascade
  message "Une grande cascade."
  liberer
  fin
script ImpossibleSiphon
  message "C'est un tourbillon...\\nUn POKéMON pourrait peut-être le traverser."
  liberer
  fin
script ImpossibleEscalade
  message "Une paroi escarpée.\\nUn POKéMON pourrait peut-être la gravir."
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
  tester_capacite coupe
  si resultat = 0 aller ArbreCoupe_Non
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

# Field moves
script EclateRoc
  tester_capacite eclate
  si resultat = 0 aller EclateRoc_Non
  message "This rock appears to be breakable.\\nWould you like to use Rock Smash?"
  oui_non
  si resultat = 0 aller EclateRoc_Fin
  fermer_message
  son coupe
  retirer
  aller EclateRoc_Fin
EclateRoc_Non:
  message "It's a rugged rock, but a Pokémon\\nmay be able to smash it."
EclateRoc_Fin:
  liberer
  fin

script Force
  si drapeau TMP_FORCE aller Force_Deja
  tester_capacite force
  si resultat = 0 aller Force_Non
  message "It's a big boulder.\\nWould you like to use Strength?"
  oui_non
  si resultat = 0 aller Force_Fin
  drapeau TMP_FORCE
  message "Strength made it possible to move\\nboulders around!"
  aller Force_Fin
Force_Deja:
  message "Strength made it possible to move\\nboulders around!"
  aller Force_Fin
Force_Non:
  message "It's a big boulder, but a Pokémon\\nmay be able to push it aside."
Force_Fin:
  liberer
  fin

script ProposerCascade
  message "It's a large waterfall.\\nWould you like to use Waterfall?"
  oui_non
  si resultat = 0 aller Capacite_Fin
  fermer_message
  franchir
  aller Capacite_Fin
script ProposerSiphon
  message "It's a vicious whirlpool!\\nWould you like to use Whirlpool?"
  oui_non
  si resultat = 0 aller Capacite_Fin
  fermer_message
  franchir
  aller Capacite_Fin
script ProposerEscalade
  message "The wall is very rocky...\\nWould you like to use Rock Climb?"
  oui_non
  si resultat = 0 aller Capacite_Fin
  fermer_message
  franchir
Capacite_Fin:
  liberer
  fin
script ImpossibleCascade
  message "It's a large waterfall."
  liberer
  fin
script ImpossibleSiphon
  message "It's a vicious whirlpool!\\nA Pokémon may be able to pass it."
  liberer
  fin
script ImpossibleEscalade
  message "The wall is very rocky...\\nA Pokémon may be able to climb it."
  liberer
  fin
`;
