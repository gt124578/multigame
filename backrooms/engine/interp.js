// Interpolation d'instantanés (sans DOM). Les positions des autres joueurs et de l'entité arrivent par paquets, 20
// fois par seconde, avec un peu d'irrégularité. Au lieu de courir après la dernière reçue (la vitesse à l'écran
// pulsait à 20 Hz et l'orientation sautait), on garde les dernières, horodatées par celui qui les envoie, et on
// affiche le passé proche (INTERP_DELAY) en interpolant entre les deux qui l'encadrent : un mouvement régulier.
// Utilisé pour l'affichage seulement : la logique du jeu garde les positions reçues telles quelles.

export const INTERP_DELAY = 0.1; // un intervalle entre deux instantanés (50 ms) et autant de gigue : rien ne manque
const EXTRAP_MAX = 0.08; // au-delà du dernier paquet reçu, on prolonge le mouvement au plus 80 ms, puis on attend
const KEEP = 16;
const WINDOW = 20; // l'écart d'horloge retenu : le plus petit des 20 derniers paquets (une seconde)
const SLEW = 0.05; // on le rattrape en accélérant ou ralentissant l'affichage d'au plus 5 % (invisible)

const angle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

export class Track {
  // floorCut : un changement d'étage coupe la piste (un joueur qui tombe) ; l'entité, elle, change d'étage en marchant
  constructor({ floorCut = true } = {}) {
    this.floorCut = floorCut;
    this.buf = [];
    this.off = undefined; // horloge locale - horloge de l'envoyeur, telle qu'affichée
    this.want = undefined; // celle qu'on vise : le plus petit écart de la dernière seconde (le paquet le plus rapide)
    this.os = [];
    this.lastNow = undefined;
  }

  reset() {
    this.buf.length = 0;
  }

  // t : l'heure de l'envoyeur ; now : l'heure locale à la réception ; f : l'étage (un changement d'étage, ou un saut
  // de plus de 3 m, n'est pas interpolé : on y va d'un coup) ; h : une hauteur, interpolée elle aussi
  push(t, now, x, z, yaw, f = 0, h = 0) {
    const b = this.buf;
    const last = b[b.length - 1];
    if (last) {
      if (t < last.t - 1 || t > last.t + 1) {
        // l'horloge de l'envoyeur est repartie (nouvelle partie, nouvel hôte) ou plus rien n'est venu depuis une seconde
        b.length = 0;
        this.off = undefined;
        this.os.length = 0;
      } else if (t <= last.t) return;
      else if ((this.floorCut && f !== last.f) || Math.hypot(x - last.x, z - last.z) > 3) b.length = 0;
    }
    b.push({ t, x, z, yaw, f, h });
    if (b.length > KEEP) b.shift();
    const os = this.os;
    os.push(now - t);
    if (os.length > WINDOW) os.shift();
    this.want = Math.min(...os);
    if (this.off === undefined) this.off = this.want;
  }

  // écrit dans out { x, z, yaw, f } la position à afficher maintenant ; false s'il n'y a encore rien
  sample(now, out) {
    const b = this.buf;
    if (!b.length) return false;
    // l'écart affiché glisse vers celui qu'on vise sans à-coup (sauf grand écart : on y va d'un coup)
    const dtf = this.lastNow === undefined ? 0 : Math.max(0, Math.min(0.1, now - this.lastNow));
    this.lastNow = now;
    const d = this.want - this.off;
    this.off = Math.abs(d) > 0.25 ? this.want : this.off + Math.max(-SLEW * dtf, Math.min(SLEW * dtf, d));
    const rt = now - this.off - INTERP_DELAY;
    if (b.length === 1 || rt <= b[0].t) return copy(out, b[0]);
    let i = 1;
    while (i < b.length && b[i].t < rt) i++;
    // on garde un peu d'avance : rien de plus ancien qu'il ne faut
    if (i > 2) b.splice(0, i - 2), (i = 2);
    if (i >= b.length) {
      const l = b[b.length - 1];
      const p = b[b.length - 2];
      const span = l.t - p.t || 1;
      const dt = Math.min(EXTRAP_MAX, rt - l.t);
      out.x = l.x + ((l.x - p.x) / span) * dt;
      out.z = l.z + ((l.z - p.z) / span) * dt;
      out.yaw = l.yaw + (angle(l.yaw - p.yaw) / span) * dt;
      out.f = l.f;
      out.h = l.h;
      return true;
    }
    const a = b[i - 1];
    const c = b[i];
    const k = Math.max(0, Math.min(1, (rt - a.t) / (c.t - a.t || 1)));
    out.x = a.x + (c.x - a.x) * k;
    out.z = a.z + (c.z - a.z) * k;
    out.yaw = a.yaw + angle(c.yaw - a.yaw) * k;
    out.f = c.f;
    out.h = a.h + (c.h - a.h) * k;
    return true;
  }
}

function copy(out, s) {
  out.x = s.x;
  out.z = s.z;
  out.yaw = s.yaw;
  out.f = s.f;
  out.h = s.h;
  return true;
}
