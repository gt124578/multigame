// Créatures sauvages par zone : [espèce, niveau min, niveau max, poids]
export const ENCOUNTERS = {
  r1: [['grignou', 2, 4, 35], ['piaffu', 2, 4, 35], ['laineau', 3, 4, 15], ['chenillo', 2, 3, 15]],
  r2: [['grignou', 3, 5, 25], ['piaffu', 3, 5, 25], ['chenillo', 3, 5, 20], ['laineau', 4, 5, 15], ['voltis', 4, 5, 5], ['pousselin', 4, 5, 10]],
  bois: [['chenillo', 4, 6, 25], ['dardillon', 4, 7, 25], ['pousselin', 5, 7, 20], ['piaffu', 5, 7, 10], ['mousseron', 5, 7, 10], ['voltis', 5, 7, 6], ['papillune', 7, 8, 4]],
  r3: [['grignou', 8, 11, 20], ['piaffu', 8, 11, 15], ['sinueuse', 9, 12, 20], ['poingris', 9, 12, 15], ['bulleau', 9, 12, 15], ['lumignon', 10, 12, 8], ['laineau', 9, 11, 7]],
  r4: [['taupix', 13, 16, 22], ['galetin', 13, 16, 20], ['songeau', 14, 17, 18], ['sinueuse', 14, 17, 15], ['spectrelle', 14, 17, 12], ['rapacier', 18, 19, 8], ['poingris', 15, 17, 5]],
  r10: [['laineau', 18, 21, 20], ['voltis', 18, 21, 20], ['ferrolin', 18, 21, 18], ['fournelle', 18, 21, 15], ['lumignon', 19, 21, 12], ['rongemax', 20, 22, 10], ['ronflou', 22, 22, 5]],
  r5: [['bulleau', 19, 23, 25], ['nenufar', 19, 23, 25], ['rapacier', 20, 23, 15], ['voltis', 19, 22, 15], ['carpillon', 18, 22, 15], ['mousseron', 20, 22, 5]],
  lac: [['bulleau', 19, 23, 30], ['nenufar', 19, 23, 30], ['carpillon', 18, 22, 30], ['squalor', 22, 22, 10]],
  r6: [['bulleau', 25, 29, 22], ['nenufar', 25, 29, 18], ['nocturon', 25, 29, 18], ['taupix', 25, 28, 14], ['carpillon', 24, 28, 14], ['banquifoc', 27, 29, 8], ['viperonne', 27, 29, 6]],
  r11: [], r11b: [],
  r7: [['givrelin', 31, 35, 30], ['songeau', 31, 35, 18], ['nocturon', 32, 35, 18], ['banquifoc', 32, 35, 18], ['rocharde', 33, 35, 10], ['frimastoc', 35, 35, 6]],
  r8: [['givrelin', 34, 38, 22], ['frimastoc', 36, 39, 12], ['rocharde', 35, 38, 18], ['rapacier', 35, 38, 16], ['corbonuit', 37, 39, 12], ['dracolin', 35, 37, 10], ['banquifoc', 35, 38, 10]],
  r9: [['rocharde', 40, 44, 18], ['fouisseur', 40, 44, 18], ['dracolin', 40, 43, 12], ['hantombre', 41, 44, 14], ['corbonuit', 41, 44, 14], ['colossaing', 42, 45, 12], ['montagor', 44, 45, 6], ['orageon', 46, 46, 1]],
};
