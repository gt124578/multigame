// L'archipel vu du ciel : le vrai relief de la carte (la même grille que le moteur), peint de vraies photos aériennes
// (herbe, roche, falaise, plage, neige : Poly Haven, CC0) teintées aux couleurs du lieu, selon la pente et l'altitude,
// avec leur relief fin (normales et occlusion) ; des ravines dans le sens de la pente ;
// la vue satellite du lieu (Sentinel-2) pour la couleur, les forêts et la teinte des arbres ;
// les ombres des montagnes, calculées une fois selon le soleil ; la canopée des forêts, et leurs arbres (forest.js) ;
// les routes, champs, villages et ponts d'OpenStreetMap (osm.js) ;
// l'horizon (la grille lointaine, moins fine) ; les lacs ; la piste de la base, son tarmac et sa digue ;
// et la mer, claire au-dessus des hauts-fonds, frangée d'écume sur les côtes.
// L'île d'Island Rush garde son propre rendu (ground.js) : on n'y dessine rien.
import * as THREE from '../../shared/vendor/three/three.module.min.js';
import { buildArchipel, heightAt, runwayLocal, PLATFORM, fbm } from '../engine/archipel.js';
import { HAZE, FOG_DENSITY, cloudShadow, CLOUD_SHADOW } from './sky.js';
import { plantForest } from './forest.js';
import { loadPlaces, buildPlaces } from './osm.js';

const ISLAND = 1600;   // côté du carré d'Island Rush
const STEEP = [0.17, 0.36, 0.88];   // roche grise des fortes pentes : de pente en pente (1 - cosinus), et sa part ; une carte peut changer (look.steep)
// les clichés (couleur) et leur relief (_n : normales en rouge et vert, occlusion en bleu)
const TEXTURES = { herbe: 'herbe', roche: 'roche', falaise: 'falaise', plage: 'plage', neige: 'neige', herbeN: 'herbe_n', rocheN: 'roche_n', falaiseN: 'falaise_n' };

const COMMON = `uniform sampler2D uN; uniform vec3 uSun, uHaze, uCam; uniform float uFogD;
float fb(vec2 p){ return texture2D(uN,p).r*.6+texture2D(uN,p*2.3+.17).r*.3+texture2D(uN,p*5.1+.41).r*.1; }
vec3 lin(vec3 c){ return pow(c,vec3(2.2)); }
vec3 fog(vec3 c, vec3 V, float d){ float f=1.-exp(-pow(d*uFogD,1.45)); float sa=pow(max(dot(-V,uSun),0.),6.); return mix(c,mix(uHaze,vec3(1.,.93,.84),sa*.4),f); }
${CLOUD_SHADOW}`;

const TERRAIN_VERTEX = `varying vec3 vW; varying vec3 vN; void main(){ vec4 w=modelMatrix*vec4(position,1.); vW=w.xyz; vN=normal; gl_Position=projectionMatrix*viewMatrix*w; }`;
const TERRAIN_FRAGMENT = `varying vec3 vW; varying vec3 vN;
uniform sampler2D uGrass, uRock, uCliff, uSand, uSnow, uGrassN, uRockN, uCliffN, uLake, uMacro, uShade, uSat, uDet, uDetF; uniform vec3 uDetA, uDetFA;
uniform vec3 uLush, uDryC, uScrub, uRockC, uSandC, uArea, uMacroA; uniform vec2 uRockL, uSnowL; uniform vec4 uRunC, uRunV; uniform vec3 uSatC, uSteep; uniform float uMoist, uGroove, uSatK, uGrainK, uRelit; ${COMMON}
// deux échelles du même cliché : la répétition ne se voit plus d'en haut
vec3 two(sampler2D t, vec2 p, float s){ return mix(texture2D(t,p*s).rgb, texture2D(t,p*s*.23+.37).rgb, .42); }
// pareil, avec le relief du cliché : d.xy, la pente du détail ; d.z, son occlusion (les creux entre les pierres)
vec3 top(sampler2D t, sampler2D n, vec2 p, float s, out vec3 d){
  vec2 a=p*s, b=p*s*.27+.37; vec3 na=texture2D(n,a).rgb, nb=texture2D(n,b).rgb;
  d=vec3(mix(na.rg,nb.rg,.45)*2.-1.,mix(na.b,nb.b,.45));
  return mix(texture2D(t,a).rgb,texture2D(t,b).rgb,.45);
}
// la falaise, projetée sur les trois plans : elle ne s'étire pas, et son relief suit chaque face
vec3 tri(sampler2D t, sampler2D n, vec3 p, vec3 N, float s, out vec3 Nw, out float ao){
  vec3 b=pow(abs(N),vec3(6.)); b/=b.x+b.y+b.z; vec3 g=sign(N);
  vec2 ux=p.zy*s*vec2(g.x,1.), uy=p.xz*s*vec2(g.y,1.), uz=p.xy*s*vec2(-g.z,1.);
  vec3 nx=texture2D(n,ux).rgb, ny=texture2D(n,uy).rgb, nz=texture2D(n,uz).rgb;
  vec2 tx=(nx.rg*2.-1.)*vec2(g.x,1.), ty=(ny.rg*2.-1.)*vec2(g.y,1.), tz=(nz.rg*2.-1.)*vec2(-g.z,1.);
  Nw=normalize(vec3(tx+N.zy,N.x).zyx*b.x+vec3(ty+N.xz,N.y).xzy*b.y+vec3(tz+N.xy,N.z)*b.z);
  ao=nx.b*b.x+ny.b*b.y+nz.b*b.z;
  return texture2D(t,ux).rgb*b.x+texture2D(t,uy).rgb*b.y+texture2D(t,uz).rgb*b.z;
}
float rvf(vec2 p){ return texture2D(uN,p).r*.65+texture2D(uN,p*3.3+.3).r*.35; }
// la photo ne donne que le grain : divisée par sa propre moyenne, elle module la couleur du lieu (k : ce qu'elle garde de ses teintes)
vec3 grain(sampler2D t, vec3 c, float k){ vec3 r=c/max(texture2D(t,vec2(.5),20.).rgb,vec3(.01)); return mix(vec3(dot(r,vec3(.3,.59,.11))),r,k); }
void main(){
  vec3 N=normalize(vN); float h=vW.y; vec2 w=vW.xz, fl=normalize(N.xz+vec2(1e-5)); float sl=1.-N.y, ax=fl.x*fl.x;
  // la carte des couleurs : végétation (vallons et versants nord plus verts) et creux
  vec4 M=texture2D(uMacro,(w-uMacroA.xy)/uMacroA.z); float cav=M.g*2.-1.;
  float m=fb(w/1400.), m2=fb(w/260.+.5), veg=M.r+(m2-.5)*.22;
  // les ravines : des sillons dans le sens de la pente, que la lumière dessine (couloirs d'éboulis, roche à nu sur les arêtes)
  vec2 px=w*vec2(1./2400.,1./300.), pz=w*vec2(1./300.,1./2400.);
  float rx=rvf(px), rz=rvf(pz), slw=smoothstep(.06,.3,sl), rv=mix(rz,rx,ax), sk=(rv-.5)*slw;
  N=normalize(N+vec3((rz-rvf(pz+vec2(.004,0.)))*(1.-ax),0.,(rx-rvf(px+vec2(0.,.004)))*ax)*slw*uGroove);
  vec3 dG, dR, Nc; float aoC;
  vec3 gG=grain(uGrass,top(uGrass,uGrassN,w,1./42.,dG),.45), gR=grain(uRock,top(uRock,uRockN,w,1./120.,dR),.2+.35*uMoist);
  vec3 gC=grain(uCliff,tri(uCliff,uCliffN,vW,N,1./70.,Nc,aoC),.2), gS=grain(uSand,two(uSand,w,1./60.),.35);
  vec3 ground=mix(lin(uDryC),lin(uLush),smoothstep(.28,.6,veg)); ground=mix(ground,lin(uScrub),smoothstep(.58,.88,veg));
  ground*=gG*mix(.88,1.1,m);
  vec3 rock=lin(uRockC)*gR*mix(.84,1.12,m2)*(1.+sk*.6), cliff=lin(uRockC)*gC*.9*(1.+sk*.5);
  vec3 sand=lin(uSandC)*gS, snow=two(uSnow,w,1./190.)*1.08;
  // la vue satellite (Sentinel-2, 7 m le pixel) : la vraie couleur du lieu, ses forêts, ses éboulis, ses villages
  vec3 S=texture2D(uSat,(w-uMacroA.xy)/uMacroA.z).rgb*uSatC; float sg=smoothstep(0.,.01,S.g-max(S.r,S.b)*.92);
  // sous un climat humide, la végétation tient sur des pentes plus fortes ; les parois les plus raides sont de la falaise ;
  // sur la vue satellite, la roche est là où rien ne verdit
  float wRock=clamp(smoothstep(.24+.22*uMoist,.42+.25*uMoist,sl+(m2-.5)*.2+sk*.5)+smoothstep(uRockL.x,uRockL.y,h+(m-.5)*200.)+M.b*.8,0.,1.);
  wRock=mix(wRock,max(1.-sg,wRock*.4),uSatK);
  float wCliff=smoothstep(.3,.48,sl+(m2-.5)*.12+sk*.25);
  // sur les fortes pentes, la vue satellite (prise d'en haut) s'étire et reste verte : on y met la roche nue, grise
  float wSteep=smoothstep(uSteep.x,uSteep.y,sl+(m2-.5)*.14+sk*.3)*uSatK; wCliff=max(wCliff,wSteep*.9);
  float wSnow=clamp(smoothstep(uSnowL.x,uSnowL.y,h+(m-.5)*170.)*(1.-smoothstep(.45,.7,sl)),0.,1.)*(1.-uSatK);
  float wSand=(1.-smoothstep(1.,4.5,h+(m2-.5)*4.))*(1.-smoothstep(.25,.45,sl));
  vec3 c=mix(ground,rock,wRock); c=mix(c,cliff,wCliff); c=mix(c,sand,wSand); c=mix(c,snow,wSnow);
  // la canopée : des houppiers serrés, sombres, que les arbres en relief recouvrent de près
  float fo=M.a*(1.-wSnow)*(1.-wSand), cn=texture2D(uN,w/34.).r*.65+texture2D(uN,w/11.+.3).r*.35;
  c=mix(c,mix(lin(uScrub),lin(uLush),.55+.3*m2)*(.8+.45*cn),fo*.9);
  // sur la vue satellite, les clichés ne donnent plus que leur grain (pierres, fissures), les houppiers leur moutonnement,
  // et les prés leurs touffes de buissons : le détail que les 7 m du pixel n'ont pas
  vec3 gd=mix(gG,gR,wRock); gd=mix(gd,gC,wCliff); gd=mix(gd,gS,wSand*(1.-sg));
  float gl=dot(gd,vec3(.3,.59,.11)), bu=texture2D(uN,w/64.).r*.6+texture2D(uN,w/21.+.5).r*.4;
  float cr=smoothstep(.3,.75,texture2D(uN,w/9.).r*.6+texture2D(uN,w/3.7+.2).r*.4)*(.8+.4*cn);
  // et des touffes sombres (genêts, fougères, herbes hautes) dans les prés et le maquis
  float tu=smoothstep(.56,.8,texture2D(uN,w/7.3).r*.6+texture2D(uN,w/2.7+.3).r*.4);
  vec3 Sd=S*mix(1.,gl,uGrainK)*(1.+sk*.35)*mix(1.,.5+.75*cr,fo)*mix(1.,.78+.44*bu,sg*(1.-fo)*.8)*(1.-.42*tu*sg*(1.-fo));
  float rl=mix(dot(S,vec3(.3,.59,.11))*1.3,.058,.5)*mix(1.,dot(gC,vec3(.3,.59,.11)),.6)*(1.+sk*.4);
  c=mix(c,mix(Sd,rl*vec3(1.05,1.,.92),wSteep*uSteep.z),uSatK);
  // les lieux (osm.js) : routes, champs, ruisseaux, ombre des maisons ; la carte fine autour de la caméra, l'autre au-delà
  vec2 qn=(w-uDetA.xy)/uDetA.z, qf=(w-uDetFA.xy)/uDetFA.z; float en=min(min(qn.x,1.-qn.x),min(qn.y,1.-qn.y)), ef=min(min(qf.x,1.-qf.x),min(qf.y,1.-qf.y));
  vec4 D=mix(texture2D(uDetF,qf)*step(0.,ef),texture2D(uDet,qn),smoothstep(0.,.06,en));
  c=c*(1.-D.a)+D.rgb;
  // le relief fin des clichés : pierres, mottes et fissures accrochent la lumière (pas sur les routes)
  float dk=(1.-wSand)*(1.-wSnow*.7)*(1.-fo*.8)*(1.-D.a); vec3 dd=mix(dG,dR,wRock);
  vec3 Nd=normalize(mix(normalize(vec3(N.x+dd.x*dk,N.y,N.z+dd.y*dk)),Nc,wCliff*(1.-fo)));
  float ao=mix(1.,mix(mix(dG.z,dR.z,wRock),aoC,wCliff),dk);
  c*=mix(.5,1.,smoothstep(-4.,.6,h));
  // la base : la digue en enrochement, le tarmac devant les hangars, et la piste avec son balisage
  vec2 d=w-uRunC.xy; float ra=dot(d,uRunC.zw), rb=dot(d,uRunV.xy), hl=uRunV.z*.5, hw=uRunV.w*.5;
  float pd=length(vec2(max(0.,abs(ra)-hl-${PLATFORM.end}.),max(0.,max(rb-${PLATFORM.apron}.,-${PLATFORM.side}.-rb))));
  c=mix(c,rock*.8,step(.5,pd)*step(pd,60.)*step(h,9.8));
  float apron=step(hl-1250.,ra)*step(ra,hl-150.)*step(hw,rb)*step(rb,158.);
  float strip=step(abs(ra),hl+6.)*step(abs(rb),hw+6.);
  vec3 tar=lin(vec3(.36,.36,.35))*(.84+.3*texture2D(uN,w*.043).r);
  c=mix(c,tar*1.25,apron); c=mix(c,tar,strip);
  float run=step(abs(ra),hl)*step(abs(rb),hw);
  float paint=step(hw-2.6,abs(rb))*step(abs(rb),hw-1.2)+step(abs(rb),.9)*step(.45,fract(ra/60.))*step(abs(ra),hl-90.)
    +step(hl-58.,abs(ra))*step(abs(ra),hl-12.)*step(.5,fract(rb/3.6))*step(abs(rb),hw-5.)+step(hl-210.,abs(ra))*step(abs(ra),hl-160.)*step(5.,abs(rb))*step(abs(rb),12.);
  c=mix(c,lin(vec3(.86,.86,.84)),min(paint,1.)*run);
  // l'ombre portée des montagnes : il ne reste que la lumière bleutée du ciel
  float sh=texture2D(uShade,(w-uMacroA.xy)/uMacroA.z).r, nl=max(dot(Nd,uSun),0.)*sh; vec3 amb=mix(vec3(.3,.3,.27),vec3(.46,.52,.62),Nd.y*.5+.5)+vec3(.03,.05,.09)*(1.-sh);
  vec3 sunC=vec3(1.,.94,.84), L=(amb*ao+sunC*nl*1.15*mix(1.,ao,.6))*1.2*mix(1.,.58,max(cav,0.))*(1.+.18*max(-cav,0.));
  // la vue satellite porte déjà la lumière et les ombres du jour où elle a été prise : on n'y ajoute que le relief fin
  // (l'éclairage avec le détail, rapporté à celui du relief seul) et une part des ombres portées
  vec3 N0=normalize(vN), Ld=mix(vec3(.3,.3,.27),vec3(.46,.52,.62),Nd.y*.5+.5)*ao+sunC*max(dot(Nd,uSun),0.)*1.15*mix(1.,ao,.6);
  vec3 L0=mix(vec3(.3,.3,.27),vec3(.46,.52,.62),N0.y*.5+.5)+sunC*max(dot(N0,uSun),0.)*1.15;
  c*=mix(L,1.4*clamp(Ld/L0,.45,1.6)*mix(1.,.6+.4*sh,uRelit),uSatK);
  c*=mix(1.,cloudShade(vW),sh);   // l'ombre des nuages (déjà là si la montagne fait de l'ombre)
  vec3 V=normalize(uCam-vW);
  // les lacs : une eau sombre qui reflète le ciel
  vec2 st=(w-uArea.xy)/uArea.z; float lk=texture2D(uLake,st).r*step(0.,st.x)*step(0.,st.y)*step(st.x,1.)*step(st.y,1.);
  float fr=pow(1.-max(V.y,0.),3.); vec3 lw=mix(lin(vec3(.12,.24,.28)),uHaze*.9,.12+.7*fr)+vec3(1.,.93,.8)*pow(max(dot(reflect(-V,vec3(0.,1.,0.)),uSun),0.),200.)*1.4;
  c=mix(c,lw,smoothstep(.4,.62,lk));
  gl_FragColor=vec4(fog(c,V,length(uCam-vW)),1.);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const SEA_VERTEX = `varying vec3 vW; void main(){ vec4 w=modelMatrix*vec4(position,1.); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }`;
const SEA_FRAGMENT = `varying vec3 vW; uniform sampler2D uDepth, uDepthF, uDepthI; uniform vec3 uDeep, uShallow, uArea, uAreaF, uAreaI; uniform float uTime; ${COMMON}
void main(){
  vec2 st=(vW.xz-uArea.xy)/uArea.z, sf=(vW.xz-uAreaF.xy)/uAreaF.z, si=(vW.xz-uAreaI.xy)/uAreaI.z; float dep=1.;
  float ei=min(min(si.x,1.-si.x),min(si.y,1.-si.y));
  if(st.x>0.&&st.y>0.&&st.x<1.&&st.y<1.) dep=mix(texture2D(uDepth,st).r,texture2D(uDepthI,si).r,smoothstep(0.,.05,ei));
  else if(sf.x>0.&&sf.y>0.&&sf.x<1.&&sf.y<1.) dep=texture2D(uDepthF,sf).r;
  vec3 V=normalize(uCam-vW); float d=length(uCam-vW);
  vec3 c=mix(lin(uShallow),uDeep,smoothstep(.02,.75,dep));
  vec2 p=vW.xz*.012; float t=uTime*.012; float n1=texture2D(uN,p+vec2(t,t*.6)).r-.5,n2=texture2D(uN,p*3.1+.3-vec2(t*1.7,t)).r-.5;
  vec3 Nw=normalize(vec3((n1+n2*.5)*.09,1.,(n2+n1*.4)*.09)); float fr=pow(1.-max(dot(Nw,V),0.),3.5);
  vec3 R=reflect(-V,Nw); vec3 sky=mix(uHaze,vec3(.13,.3,.55),smoothstep(0.,.5,R.y));
  float cs=cloudShade(vW); c*=mix(1.,cs,.8); c=mix(c,sky,.12+.8*fr); c+=vec3(1.,.93,.8)*pow(max(dot(R,uSun),0.),260.)*1.6*smoothstep(.6,1.,cs);
  float foam=(1.-smoothstep(.0,.07,dep+(texture2D(uN,vW.xz*.03+uTime*.006).r-.5)*.06))*smoothstep(.35,.7,texture2D(uN,vW.xz*.05-uTime*.01).r)*step(.001,dep);
  c=mix(c,vec3(.86,.9,.92),foam*.75);
  gl_FragColor=vec4(fog(c,V,d),1.);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

// Un relief en grille régulière, seulement là où il dépasse de l'eau ; `skip(i, j)` écarte des cases
// (l'île d'Island Rush, ou le carré déjà couvert par la grille proche)
function terrainGeometry(G, stride, skip) {
  const n = G.n, h = G.h, step = G.step * stride, m = Math.floor((n - 1) / stride) + 1;
  const at = (i, j) => h[Math.min(n - 1, j * stride) * n + Math.min(n - 1, i * stride)];
  const index = new Int32Array(m * m).fill(-1), pos = [], nor = [], idx = [];
  const vert = (i, j) => {
    const k = j * m + i;
    if (index[k] < 0) {
      const x = G.x0 + i * step, z = G.z0 + j * step, y = at(i, j);
      const gx = (at(Math.min(m - 1, i + 1), j) - at(Math.max(0, i - 1), j)) / (2 * step), gz = (at(i, Math.min(m - 1, j + 1)) - at(i, Math.max(0, j - 1))) / (2 * step), l = Math.hypot(gx, 1, gz);
      index[k] = pos.length / 3; pos.push(x, y, z); nor.push(-gx / l, 1 / l, -gz / l);
    }
    return index[k];
  };
  for (let j = 0; j < m - 1; j++) for (let i = 0; i < m - 1; i++) {
    const x = G.x0 + i * step, z = G.z0 + j * step;
    if (skip(x, z, step)) continue;
    if (Math.max(at(i, j), at(i + 1, j), at(i, j + 1), at(i + 1, j + 1)) < -3) continue;
    const a = vert(i, j), b = vert(i + 1, j), c = vert(i, j + 1), d = vert(i + 1, j + 1);
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setIndex(idx); g.computeBoundingSphere();
  return g;
}

function byteTexture(data, n) {
  const t = new THREE.DataTexture(data, n, n, THREE.RedFormat);
  t.minFilter = t.magFilter = THREE.LinearFilter; t.generateMipmaps = false; t.unpackAlignment = 1; t.needsUpdate = true;
  return t;
}
// La grille G en texture : chaque point au centre de son texel
const areaOf = (G) => new THREE.Vector3(G.x0 - G.step / 2, G.z0 - G.step / 2, G.n * G.step);

// La carte des couleurs, calculée une fois depuis le relief : la végétation (R), plus fournie au creux des vallons,
// sur les versants nord et là où le lieu est humide, rare sur les pentes raides et au-dessus des arbres ;
// les creux et les crêtes (G), pour l'ombre des vallons ; la roche qui affleure par plaques (B) ; la forêt (A),
// par massifs, entre les altitudes du lieu, ni sur les falaises, ni sur les lacs, ni sur la base. A : la grille proche
function macroTexture(G, look, seed, A) {
  const n = G.n, h = G.h, st = G.step, out = new Uint8Array(n * n * 4), r = Math.max(1, Math.round(160 / st));
  const S = new Float64Array((n + 1) * (n + 1));
  for (let j = 0; j < n; j++) for (let i = 0, row = 0; i < n; i++) { row += h[j * n + i]; S[(j + 1) * (n + 1) + i + 1] = S[j * (n + 1) + i + 1] + row; }
  const mean = (i, j) => {
    const i0 = Math.max(0, i - r), j0 = Math.max(0, j - r), i1 = Math.min(n, i + r + 1), j1 = Math.min(n, j + r + 1);
    return (S[j1 * (n + 1) + i1] - S[j0 * (n + 1) + i1] - S[j1 * (n + 1) + i0] + S[j0 * (n + 1) + i0]) / ((i1 - i0) * (j1 - j0));
  };
  // la roche grise des fortes pentes (vue satellite) : entre ces pentes (1 - cosinus), et sa part ; pas d'arbres dessus
  const steep = look.steep || STEEP, t0 = Math.tan(Math.acos(1 - steep[0]));
  const T = look.trees, sm = (a, b, v) => { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
  const cut = 0.62 - T.amount * 0.25, W = A.runway, near = G === A, forest = new Uint8Array(n * n), room = new Float32Array(n * n);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const k = j * n + i, y = h[k], x = G.x0 + i * st, z = G.z0 + j * st;
    const gx = (h[j * n + Math.min(n - 1, i + 1)] - h[j * n + Math.max(0, i - 1)]) / (2 * st), gz = (h[Math.min(n - 1, j + 1) * n + i] - h[Math.max(0, j - 1) * n + i]) / (2 * st);
    const g = Math.hypot(gx, gz), cav = Math.max(-1, Math.min(1, (mean(i, j) - y) / 35)), north = gz / Math.hypot(gx, gz, 1);
    let veg = look.moist + 1.1 * cav + 0.3 * north - 0.75 * sm(0.45, 1.1, g) + (fbm(x / 1100, z / 1100, 4, seed) - 0.5) * 1.5 + (fbm(x / 240, z / 240, 3, seed + 9) - 0.5) * 0.6;
    veg -= sm(T.hi, T.hi + 300, y) * 0.45;
    const bare = sm(0.6, 0.75, fbm(x / 420, z / 420, 3, seed + 21) + g * 0.15 - look.moist * 0.2);
    // la forêt suit le relief : elle remplit les vallons et les versants humides, s'arrête sur les crêtes et les falaises
    let ok = sm(T.lo - 5, T.lo + 5, y) * (1 - sm(T.hi - 60, T.hi, y));
    if (y < 2 || (x > -60 && x < 1660 && z > -60 && z < 1660) || (near && A.lake[k])) ok = 0;
    else if (near) { const q = runwayLocal(W, x, z); if (Math.abs(q.a) < W.len / 2 + PLATFORM.end + 60 && q.b > -PLATFORM.side - 60 && q.b < PLATFORM.apron + 60) ok = 0; }
    room[k] = ok * (1 - sm(t0 - 0.15, t0 + 0.1, g));   // pas d'arbres sur la roche des fortes pentes
    const fo = ok * sm(cut, cut + 0.14, (fbm(x / 900, z / 900, 4, 55) - 0.5) * 0.55 + veg * 0.75 + 0.12) * (1 - sm(0.55, 0.75, g));
    forest[k] = Math.round(fo * 255);
    out[k * 4] = Math.round(Math.max(0, Math.min(1, veg)) * 255); out[k * 4 + 1] = Math.round((cav * 0.5 + 0.5) * 255); out[k * 4 + 2] = Math.round(bare * 255); out[k * 4 + 3] = forest[k];
  }
  const t = new THREE.DataTexture(out, n, n, THREE.RGBAFormat);
  t.minFilter = t.magFilter = THREE.LinearFilter; t.generateMipmaps = false; t.needsUpdate = true;
  t.userData.forest = forest; t.userData.room = room;
  return t;
}

// Profondeur de la mer (0 sur la côte, 1 au large) : l'eau s'éclaircit au-dessus des hauts-fonds
function depthTexture(G) {
  const d = new Uint8Array(G.n * G.n);
  for (let k = 0; k < d.length; k++) d[k] = Math.round(Math.max(0, Math.min(1, -G.h[k] / 60)) * 255);
  return byteTexture(d, G.n);
}

// Les ombres des montagnes : de chaque point, on remonte vers le soleil ; si le relief passe au-dessus du rayon,
// le point est à l'ombre (avec une pénombre selon l'angle). Calculé une fois : le soleil ne bouge pas
function sunShade(G, A, sun, skip) {
  const n = G.n, st = G.step, out = new Uint8Array(n * n).fill(255), hl = Math.hypot(sun.x, sun.z), dx = sun.x / hl, dz = sun.z / hl, tanE = sun.y / hl;
  let top = -1e9; for (const v of A.h) top = Math.max(top, v); for (const v of A.far.h) top = Math.max(top, v);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const y = G.h[j * n + i], x = G.x0 + i * st, z = G.z0 + j * st;
    if (y < -2 || (skip && skip(x, z))) continue;
    let k = -1, d = st * 0.75;
    while (d < 8000) {
      const ry = y + 3 + d * tanE;
      if (ry > top) break;
      k = Math.max(k, (heightAt(A, x + dx * d, z + dz * d) - ry) / d);
      if (k > 0.04) break;
      d += Math.max(st * 0.75, d * 0.06);
    }
    const t = Math.max(0, Math.min(1, (k + 0.012) / 0.042));
    out[j * n + i] = Math.round((1 - t * t * (3 - 2 * t)) * 255);
  }
  return out;
}

// La vue satellite d'une grille (relief/<carte>.webp, ou -loin.webp pour l'horizon), le nord en haut ;
// avec `n`, aussi sa couleur en chaque point de la grille (n × n)
async function satellite(url, anisotropy, n) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} : ${res.status}`);
  const bmp = await createImageBitmap(await res.blob(), { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
  const t = new THREE.Texture(bmp);
  t.colorSpace = THREE.SRGBColorSpace; t.flipY = false; t.anisotropy = anisotropy;
  t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.generateMipmaps = true; t.needsUpdate = true;
  let px = null;
  if (n) {
    const cv = document.createElement('canvas'); cv.width = cv.height = n;
    const g = cv.getContext('2d', { willReadFrequently: true }); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    g.drawImage(bmp, 0, 0, n, n); px = g.getImageData(0, 0, n, n).data;
  }
  return { t, px };
}

// Ce que dit la vue satellite : sa luminosité, calée sur l'éclairage du jeu ; la forêt (un vert sombre), là où le lieu
// laisse pousser des arbres (`room`, voir macroTexture) ; la teinte des arbres, prise sur le sol sous eux
const SAT_LUM = 0.057;
function fromSatellite(A, look, px, room) {
  const n = A.n, T = look.trees, density = new Uint8Array(n * n), shrubs = new Uint8Array(n * n), lin = (v) => Math.pow(v / 255, 2.2);
  const sm = (a, b, v) => { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
  // la verdeur de la terre (vert moins rouge et bleu) : les buissons vont sur les quatre cinquièmes les plus verts de ce qui n'est pas forêt
  const hist = new Uint32Array(256); let land = 0;
  for (let k = 0; k < n * n; k++) if (A.h[k] > 3) { hist[Math.max(0, Math.min(255, 128 + px[k * 4 + 1] - (px[k * 4] + px[k * 4 + 2]) / 2)) | 0]++; land++; }
  const pct = (q) => { let a = 0; for (let v = 0; v < 256; v++) { a += hist[v]; if (a >= q * land) return v - 128; } return 0; };
  const g20 = pct(0.2), g60 = Math.max(pct(0.6), g20 + 4);
  let sum = 0, cnt = 0;
  for (let k = 0; k < n * n; k++) {
    const r = px[k * 4], g = px[k * 4 + 1], b = px[k * 4 + 2], lum = 0.3 * r + 0.59 * g + 0.11 * b;
    if (A.h[k] > 3) { sum += 0.3 * lin(r) + 0.59 * lin(g) + 0.11 * lin(b); cnt++; }
    const f = sm(1, 12, g - (r + b) / 2) * sm(110, 55, lum) * sm(4, 12, g - b) * room[k] * (0.5 + 0.5 * T.amount);
    density[k] = Math.round(f * 255);
    // les buissons : là où le sol verdit un peu (maquis, landes, prés en friche), hors de la forêt
    shrubs[k] = Math.round(sm(g20, g60, g - (r + b) / 2) * sm(165, 95, lum) * (1 - f) * room[k] * (T.shrubs ?? 0.75) * 255);
  }
  // sa luminosité moyenne, un peu moins de bleu (le voile de l'atmosphère vu de l'orbite)
  const gain = cnt ? Math.max(0.7, Math.min(2, Math.sqrt(SAT_LUM / (sum / cnt)))) : 1, color = [gain, gain, gain * 0.9];
  // la couleur du sol sous un arbre, comme le shader la rend (gain compris) : le feuillage s'y accorde
  const tint = (x, z) => {
    const u = Math.max(0, Math.min(n - 1.001, (x - A.x0) / A.step)), v = Math.max(0, Math.min(n - 1.001, (z - A.z0) / A.step));
    const i = Math.floor(u), j = Math.floor(v), fu = u - i, fv = v - j, out = [0, 0, 0];
    for (let c = 0; c < 3; c++) {
      const at = (ii, jj) => lin(px[(jj * n + ii) * 4 + c]);
      const val = at(i, j) * (1 - fu) * (1 - fv) + at(i + 1, j) * fu * (1 - fv) + at(i, j + 1) * (1 - fu) * fv + at(i + 1, j + 1) * fu * fv;
      out[c] = val * color[c];
    }
    return out;
  };
  return { color, density, tint, shrubs };
}

export function buildArchipelago(scene, { sun, deep, noiseTex, anisotropy = 8, kit, renderer, island }) {
  const A = buildArchipel(), F = A.far, L = A.def.look, R = A.runway, loader = new THREE.TextureLoader(), base = new URL('../', import.meta.url);
  const tex = {};
  for (const [k, f] of Object.entries(TEXTURES)) {
    const t = tex[k] = loader.load(new URL(`textures/${f}.webp`, base).href);
    t.colorSpace = f.endsWith('_n') ? THREE.NoColorSpace : THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = anisotropy;
  }
  const lakeData = new Uint8Array(A.n * A.n); for (let k = 0; k < lakeData.length; k++) lakeData[k] = A.lake[k] ? 255 : 0;
  const lake = byteTexture(lakeData, A.n);
  const v3 = (a) => new THREE.Vector3(a[0], a[1], a[2]), blank = byteTexture(new Uint8Array([255]), 1);
  const none = new THREE.DataTexture(new Uint8Array(4), 1, 1, THREE.RGBAFormat); none.needsUpdate = true;
  const shared = { uN: { value: noiseTex }, uSun: { value: sun }, uHaze: { value: HAZE }, uCam: { value: new THREE.Vector3() }, uFogD: { value: FOG_DENSITY }, ...cloudShadow };
  const terrainUniforms = (G, macro, shade) => ({
    ...shared, uGrass: { value: tex.herbe }, uRock: { value: tex.roche }, uCliff: { value: tex.falaise }, uSand: { value: tex.plage }, uSnow: { value: tex.neige },
    uGrassN: { value: tex.herbeN }, uRockN: { value: tex.rocheN }, uCliffN: { value: tex.falaiseN }, uLake: { value: lake }, uMacro: { value: macro }, uShade: { value: shade },
    uLush: { value: v3(L.lush) }, uDryC: { value: v3(L.dry) }, uScrub: { value: v3(L.scrub) }, uRockC: { value: v3(L.rock) }, uSandC: { value: v3(L.sand) }, uMoist: { value: L.moist }, uGroove: { value: 50 },
    uRockL: { value: new THREE.Vector2(...L.rockLine) }, uSnowL: { value: new THREE.Vector2(...L.snowLine) }, uArea: { value: areaOf(A) }, uMacroA: { value: areaOf(G) },
    uRunC: { value: new THREE.Vector4(R.x, R.z, R.ux, R.uz) }, uRunV: { value: new THREE.Vector4(R.vx, R.vz, R.len, R.w) },
    // la vue satellite, dès qu'elle est chargée (uSatK passe à 1) : son gain par couleur, la part du grain des clichés, la part des ombres du jeu
    uSat: { value: blank }, uSatK: { value: 0 }, uSatC: { value: new THREE.Vector3(1, 1, 1) }, uSteep: { value: new THREE.Vector3(...(L.steep || STEEP)) }, uGrainK: { value: 0.8 }, uRelit: { value: 0.5 },
    // les cartes de détail des lieux (osm.js), vides en attendant
    uDet: { value: none }, uDetF: { value: none }, uDetA: { value: new THREE.Vector3(1e9, 1e9, 1) }, uDetFA: { value: new THREE.Vector3(1e9, 1e9, 1) },
  });
  const macro = macroTexture(A, L, 61, A), macroF = macroTexture(F, L, 61, A);
  const inNear = (x, z) => x > A.x0 && z > A.z0 && x < A.x0 + A.size && z < A.z0 + A.size;
  const shade = byteTexture(sunShade(A, A, sun), A.n), shadeF = byteTexture(sunShade(F, A, sun, inNear), F.n);
  const terrainMat = new THREE.ShaderMaterial({ uniforms: terrainUniforms(A, macro, shade), vertexShader: TERRAIN_VERTEX, fragmentShader: TERRAIN_FRAGMENT });
  const farMat = new THREE.ShaderMaterial({ uniforms: terrainUniforms(F, macroF, shadeF), vertexShader: TERRAIN_VERTEX, fragmentShader: TERRAIN_FRAGMENT });
  const depth = depthTexture(A), depthF = depthTexture(F), time = { value: 0 };
  // le fond autour de l'île d'Island Rush, plus fin (4 m) : ses plages ont leurs hauts-fonds et leur écume ; son fond plat,
  // à 9 m, compte comme le large
  const IN_N = 400, depthI = byteTexture(new Uint8Array(IN_N * IN_N).map((_, k) => island ? Math.round(Math.max(0, Math.min(1, -island.heightAt((k % IN_N + 0.5) * ISLAND / IN_N, (Math.floor(k / IN_N) + 0.5) * ISLAND / IN_N) / 9)) * 255) : 255), IN_N);
  const seaMat = new THREE.ShaderMaterial({
    uniforms: {
      ...shared, uDepth: { value: depth }, uDepthF: { value: depthF }, uDeep: { value: deep }, uShallow: { value: v3(L.water) },
      uArea: { value: areaOf(A) }, uAreaF: { value: areaOf(F) }, uTime: time, uDepthI: { value: depthI }, uAreaI: { value: new THREE.Vector3(0, 0, ISLAND) },
    },
    vertexShader: SEA_VERTEX, fragmentShader: SEA_FRAGMENT,
  });
  // la mer, partout : l'île d'Island Rush garde ses lacs et ses rivières, son fond passe sous la mer
  const OUT = 26000, a = -OUT, b = ISLAND + OUT;
  const seaPos = [a, 0, a, a, 0, b, b, 0, a, b, 0, a, a, 0, b, b, 0, b];
  const seaGeo = new THREE.BufferGeometry(); seaGeo.setAttribute('position', new THREE.Float32BufferAttribute(seaPos, 3));
  const sea = new THREE.Mesh(seaGeo, seaMat);
  const nearSkip = (x, z, s) => x >= 0 && z >= 0 && x + s <= ISLAND && z + s <= ISLAND;
  const farSkip = (x, z, s) => x >= A.x0 - 1 && z >= A.z0 - 1 && x + s <= A.x0 + A.size + 1 && z + s <= A.z0 + A.size + 1;
  let terrain = new THREE.Mesh(terrainGeometry(A, 1, nearSkip), terrainMat), stride = 1;
  const horizon = new THREE.Mesh(terrainGeometry(F, 1, farSkip), farMat);
  scene.add(sea, terrain, horizon);
  // les arbres attendent la vue satellite, qui dit où sont les forêts (à défaut, la carte des couleurs), et les lieux,
  // qui gardent les routes et les maisons libres et plantent les jardins
  const forest = plantForest(scene, A, L, null, kit, shade, areaOf(A)), sats = [];
  let alive = true, places = null, sow = null;
  const replant = () => { if (alive && sow) forest.resow(sow.density, sow.tint, places, sow.shrubs); };
  Promise.all([satellite(new URL(`relief/${A.id}.webp`, base).href, anisotropy, A.n), satellite(new URL(`relief/${A.id}-loin.webp`, base).href, anisotropy, 0)])
    .then(([near, far]) => {
      sats.push(near.t, far.t);
      if (!alive) { for (const t of sats) t.dispose(); return; }
      const { color, density, tint, shrubs } = fromSatellite(A, L, near.px, macro.userData.room);
      for (const [mat, t] of [[terrainMat, near.t], [farMat, far.t]]) Object.assign(mat.uniforms.uSat, { value: t }), mat.uniforms.uSatK.value = 1, mat.uniforms.uSatC.value.set(...color);
      const md = macro.image.data, fd = macroF.image.data;
      for (let k = 0; k < density.length; k++) md[k * 4 + 3] = density[k];
      for (let k = 3; k < fd.length; k += 4) fd[k] = 0;
      macro.needsUpdate = macroF.needsUpdate = true;
      sow = { density, tint, shrubs }; replant();
    })
    .catch((e) => { console.warn('Vue satellite indisponible :', e); sow = { density: macro.userData.forest }; replant(); });
  loadPlaces(new URL(`relief/${A.id}-osm.json`, base).href)
    .then((data) => {
      if (!alive) return;
      places = buildPlaces(scene, A, data, { look: L, sun, noiseTex, shade, shadeArea: areaOf(A) });
      for (const { uniforms: U } of [terrainMat, farMat]) { U.uDet.value = places.nearTex; U.uDetF.value = places.farTex; U.uDetA.value = places.nearA; U.uDetFA.value = places.farA; }
      replant();
    })
    .catch((e) => console.warn('Routes et villages indisponibles :', e));
  return {
    forest, materials: [terrainMat, farMat],
    // qualité basse : un point sur deux
    setDetail(fine) {
      const s = fine ? 1 : 2; if (s === stride) return;
      stride = s; terrain.geometry.dispose(); terrain.geometry = terrainGeometry(A, s, nearSkip);
    },
    get places() { return places; },
    update(camPos, t) { shared.uCam.value.copy(camPos); time.value = t; forest.update(camPos, t); if (places && renderer) places.update(renderer, camPos); },
    dispose() {
      alive = false;
      terrain.geometry.dispose(); horizon.geometry.dispose(); terrainMat.dispose(); farMat.dispose(); seaGeo.dispose(); seaMat.dispose(); depth.dispose(); depthF.dispose(); depthI.dispose(); lake.dispose(); macro.dispose(); macroF.dispose(); shade.dispose(); shadeF.dispose(); forest.dispose(); blank.dispose(); none.dispose(); if (places) places.dispose();
      for (const t of [...Object.values(tex), ...sats]) t.dispose();
      scene.remove(sea, terrain, horizon);
    },
  };
}
