// odyssee/js/ui/cinematic.js — Cinématiques 3D temps réel (Three.js + HD-2D) pour chaque Boss & Légendaire
import { SPECIES } from '../data/species.js';
import { esc } from './ui.js';
import { warnDev } from '../core/safe.js';

const PRESET_DEFS = {
  shadow: {
    audio: 'shadow', duration: 14.8,
    skyBg: 0x05010a, fog: 0x090214, fogDensity: 0.022,
    skyType: 'eclipse', skyPrimary: 0x9333ea, skySecondary: 0x6b21a8,
    pillarType: 'obelisk', pillarCol: 0x160a26, pillarGlow: 0xa855f7,
    sealType: 'prism', coreCol: 0x080212, coreEmissive: 0x7e22ce, ringCol: 0xc026d3,
    groundMode: 'waves', groundCol: 0x060b1e, groundEmissive: 0x1a0836, altarCol: 0x120624,
    aura1: '#c084fc', aura2: '#7e22ce', aura3: '#f43f5e',
    boltCol: 0xe879f9, flashHex: '#e9d5ff', particleMotion: 'vortex', lightningFreq: 1.0,
    badge: 'ÉVEIL OBSCUR',
    cssVars: { '--cine-accent': '#c084fc', '--cine-dot': '#f43f5e', '--cine-glow': 'rgba(168,85,247,0.9)', '--cine-aura': 'rgba(120,20,200,0.45)', '--cine-aura-hi': 'rgba(160,30,255,0.68)', '--cine-badge-bg': 'rgba(35,10,65,0.82)', '--cine-badge-txt': '#e9d5ff', '--cine-badge-bd': 'rgba(192,132,252,0.58)', '--cine-grad-mid': '#f3e8ff', '--cine-grad-end': '#7e22ce', '--cine-sky-bg': '#05020e' },
  },
  fire: {
    audio: 'fire', duration: 6.8,
    skyBg: 0x180402, fog: 0x240703, fogDensity: 0.021,
    skyType: 'solar', skyPrimary: 0xf97316, skySecondary: 0xdc2626,
    pillarType: 'spire', pillarCol: 0x230d09, pillarGlow: 0xf97316,
    sealType: 'core', coreCol: 0x3b0d06, coreEmissive: 0xea580c, ringCol: 0xfacc15,
    groundMode: 'magma', groundCol: 0x1c0805, groundEmissive: 0x7c2d12, altarCol: 0x291009,
    aura1: '#fb923c', aura2: '#dc2626', aura3: '#fde047',
    boltCol: 0xfdba74, flashHex: '#fed7aa', particleMotion: 'embers', lightningFreq: 0.45,
    badge: 'FUREUR VOLCANIQUE',
    cssVars: { '--cine-accent': '#fb923c', '--cine-dot': '#ef4444', '--cine-glow': 'rgba(249,115,22,0.92)', '--cine-aura': 'rgba(194,65,12,0.45)', '--cine-aura-hi': 'rgba(234,88,12,0.72)', '--cine-badge-bg': 'rgba(67,20,7,0.84)', '--cine-badge-txt': '#ffedd5', '--cine-badge-bd': 'rgba(251,146,60,0.6)', '--cine-grad-mid': '#fef08a', '--cine-grad-end': '#dc2626', '--cine-sky-bg': '#180402' },
  },
  phoenix: {
    audio: 'phoenix', duration: 7.8,
    skyBg: 0x190814, fog: 0x280d1e, fogDensity: 0.018,
    skyType: 'solar', skyPrimary: 0xfbbf24, skySecondary: 0xf43f5e,
    pillarType: 'torii', pillarCol: 0x451218, pillarGlow: 0xfbbf24,
    sealType: 'star', coreCol: 0x4c1d24, coreEmissive: 0xf59e0b, ringCol: 0xfde047,
    groundMode: 'arena', groundCol: 0x1e0e18, groundEmissive: 0x5b1b2a, altarCol: 0x361420,
    aura1: '#fde047', aura2: '#f43f5e', aura3: '#34d399',
    boltCol: 0xfef08a, flashHex: '#fef3c7', particleMotion: 'vortex', lightningFreq: 0.25,
    badge: 'FLAMME ARC-EN-CIEL',
    cssVars: { '--cine-accent': '#fbbf24', '--cine-dot': '#f43f5e', '--cine-glow': 'rgba(251,191,36,0.92)', '--cine-aura': 'rgba(217,119,6,0.42)', '--cine-aura-hi': 'rgba(244,63,94,0.65)', '--cine-badge-bg': 'rgba(69,18,24,0.84)', '--cine-badge-txt': '#fef3c7', '--cine-badge-bd': 'rgba(251,191,36,0.65)', '--cine-grad-mid': '#fef9c3', '--cine-grad-end': '#e11d48', '--cine-sky-bg': '#190814' },
  },
  // premiers Champions : des scènes plus courtes et plus douces que celles des légendaires (pas d'éclairs, moins de
  // particules), pour ne pas voler la vedette aux boss de la fin
  ruche: {   // Hector, l'apiculteur : la Ruche, lumière ambrée, pollen doré qui flotte
    audio: 'nature', duration: 4.8,
    skyBg: 0x1a1004, fog: 0x2a1a06, fogDensity: 0.022,
    skyType: 'aurora', skyPrimary: 0xfbbf24, skySecondary: 0xd97706,
    pillarType: 'obelisk', pillarCol: 0x3a2508, pillarGlow: 0xfcd34d,
    sealType: 'core', coreCol: 0x4a2f08, coreEmissive: 0xd97706, ringCol: 0xfde68a,
    groundMode: 'arena', groundCol: 0x241605, groundEmissive: 0x5a3a0a, altarCol: 0x3a2508,
    aura1: '#fde68a', aura2: '#f59e0b', aura3: '#fcd34d',
    boltCol: 0xfde68a, flashHex: '#fef3c7', particleMotion: 'spores', lightningFreq: 0, pCount: 200,
    badge: 'LA RUCHE',
    cssVars: { '--cine-accent': '#fbbf24', '--cine-dot': '#fde68a', '--cine-glow': 'rgba(251,191,36,0.85)', '--cine-aura': 'rgba(217,119,6,0.38)', '--cine-aura-hi': 'rgba(252,211,77,0.6)', '--cine-badge-bg': 'rgba(58,37,8,0.84)', '--cine-badge-txt': '#fef3c7', '--cine-badge-bd': 'rgba(251,191,36,0.6)', '--cine-grad-mid': '#fef9c3', '--cine-grad-end': '#b45309', '--cine-sky-bg': '#1a1004' },
  },
  ecume: {   // Marine, la dompteuse de vagues : l'océan au crépuscule, houle calme, écume claire
    audio: 'water', duration: 4.8,
    skyBg: 0x05203a, fog: 0x0a2f52, fogDensity: 0.02,
    skyType: 'aurora', skyPrimary: 0x7dd3fc, skySecondary: 0x38bdf8,
    pillarType: 'obelisk', pillarCol: 0x0c3358, pillarGlow: 0xbae6fd,
    sealType: 'core', coreCol: 0x0c3a5e, coreEmissive: 0x0ea5e9, ringCol: 0xe0f2fe,
    groundMode: 'waves', waveSeg: 24, waveAmp: 0.22, groundCol: 0x0a3358, groundEmissive: 0x0c4a6e, altarCol: 0x0c3358,
    aura1: '#e0f2fe', aura2: '#38bdf8', aura3: '#bae6fd',
    boltCol: 0xe0f2fe, flashHex: '#f0f9ff', particleMotion: 'spores', lightningFreq: 0, pCount: 200,
    badge: 'LE BARRAGE',
    cssVars: { '--cine-accent': '#7dd3fc', '--cine-dot': '#e0f2fe', '--cine-glow': 'rgba(125,211,252,0.85)', '--cine-aura': 'rgba(14,165,233,0.38)', '--cine-aura-hi': 'rgba(186,230,253,0.6)', '--cine-badge-bg': 'rgba(12,51,88,0.82)', '--cine-badge-txt': '#f0f9ff', '--cine-badge-bd': 'rgba(125,211,252,0.58)', '--cine-grad-mid': '#f0f9ff', '--cine-grad-end': '#0369a1', '--cine-sky-bg': '#05203a' },
  },
  water: {
    audio: 'water', duration: 6.4,
    skyBg: 0x031426, fog: 0x06203b, fogDensity: 0.019,
    skyType: 'aurora', skyPrimary: 0x38bdf8, skySecondary: 0x0284c7,
    pillarType: 'obelisk', pillarCol: 0x0a2540, pillarGlow: 0x38bdf8,
    sealType: 'core', coreCol: 0x082f49, coreEmissive: 0x0284c7, ringCol: 0x7dd3fc,
    groundMode: 'waves', groundCol: 0x041e38, groundEmissive: 0x0c4a6e, altarCol: 0x0a2a47,
    aura1: '#7dd3fc', aura2: '#0284c7', aura3: '#a5f3fc',
    boltCol: 0x7dd3fc, flashHex: '#e0f2fe', particleMotion: 'vortex', lightningFreq: 0.25,
    badge: 'MARÉES SACRÉES',
    cssVars: { '--cine-accent': '#38bdf8', '--cine-dot': '#22d3ee', '--cine-glow': 'rgba(56,189,248,0.9)', '--cine-aura': 'rgba(2,132,199,0.45)', '--cine-aura-hi': 'rgba(56,189,248,0.68)', '--cine-badge-bg': 'rgba(8,47,73,0.82)', '--cine-badge-txt': '#e0f2fe', '--cine-badge-bd': 'rgba(56,189,248,0.58)', '--cine-grad-mid': '#e0f2fe', '--cine-grad-end': '#0369a1', '--cine-sky-bg': '#031426' },
  },
  abyssal: {
    audio: 'abyssal', duration: 7.8,
    skyBg: 0x020918, fog: 0x04122b, fogDensity: 0.02,
    skyType: 'aurora', skyPrimary: 0x22d3ee, skySecondary: 0x4f46e5,
    pillarType: 'crystal', pillarCol: 0x091933, pillarGlow: 0x22d3ee,
    sealType: 'star', coreCol: 0x071a38, coreEmissive: 0x2563eb, ringCol: 0x67e8f9,
    groundMode: 'waves', groundCol: 0x031126, groundEmissive: 0x0e3a5c, altarCol: 0x081e3b,
    aura1: '#67e8f9', aura2: '#3b82f6', aura3: '#818cf8',
    boltCol: 0x67e8f9, flashHex: '#cffafe', particleMotion: 'vortex', lightningFreq: 0.65,
    badge: 'ABYSSES CÉLESTES',
    cssVars: { '--cine-accent': '#22d3ee', '--cine-dot': '#818cf8', '--cine-glow': 'rgba(34,211,238,0.92)', '--cine-aura': 'rgba(37,99,235,0.45)', '--cine-aura-hi': 'rgba(34,211,238,0.72)', '--cine-badge-bg': 'rgba(10,25,60,0.84)', '--cine-badge-txt': '#cffafe', '--cine-badge-bd': 'rgba(34,211,238,0.62)', '--cine-grad-mid': '#cffafe', '--cine-grad-end': '#3730a3', '--cine-sky-bg': '#020918' },
  },
  thunder: {
    audio: 'thunder', duration: 6.4,
    skyBg: 0x070a1c, fog: 0x0d122e, fogDensity: 0.022,
    skyType: 'cosmos', skyPrimary: 0xfacc15, skySecondary: 0x38bdf8,
    pillarType: 'spire', pillarCol: 0x161a33, pillarGlow: 0xfacc15,
    sealType: 'core', coreCol: 0x1c1917, coreEmissive: 0xeab308, ringCol: 0x38bdf8,
    groundMode: 'arena', groundCol: 0x0a0f24, groundEmissive: 0x3f3306, altarCol: 0x191d36,
    aura1: '#fef08a', aura2: '#eab308', aura3: '#38bdf8',
    boltCol: 0xfef08a, flashHex: '#fef9c3', particleMotion: 'storm', lightningFreq: 1.45,
    badge: 'HAUTE TENSION',
    cssVars: { '--cine-accent': '#facc15', '--cine-dot': '#38bdf8', '--cine-glow': 'rgba(250,204,21,0.92)', '--cine-aura': 'rgba(202,138,4,0.42)', '--cine-aura-hi': 'rgba(250,204,21,0.7)', '--cine-badge-bg': 'rgba(30,27,12,0.84)', '--cine-badge-txt': '#fef9c3', '--cine-badge-bd': 'rgba(250,204,21,0.65)', '--cine-grad-mid': '#fefce8', '--cine-grad-end': '#ca8a04', '--cine-sky-bg': '#070a1c' },
  },
  ice: {
    audio: 'ice', duration: 6.4,
    skyBg: 0x041322, fog: 0x082138, fogDensity: 0.019,
    skyType: 'aurora', skyPrimary: 0xa5f3fc, skySecondary: 0x60a5fa,
    pillarType: 'crystal', pillarCol: 0x10334f, pillarGlow: 0xa5f3fc,
    sealType: 'prism', coreCol: 0x0c3452, coreEmissive: 0x38bdf8, ringCol: 0xe0f2fe,
    groundMode: 'glacier', groundCol: 0x0c2842, groundEmissive: 0x164e63, altarCol: 0x133857,
    aura1: '#e0f2fe', aura2: '#38bdf8', aura3: '#a5f3fc',
    boltCol: 0xe0f2fe, flashHex: '#f0f9ff', particleMotion: 'spores', lightningFreq: 0.15,
    badge: 'ZÉRO ABSOLU',
    cssVars: { '--cine-accent': '#7dd3fc', '--cine-dot': '#e0f2fe', '--cine-glow': 'rgba(125,211,252,0.92)', '--cine-aura': 'rgba(14,116,144,0.45)', '--cine-aura-hi': 'rgba(103,232,249,0.7)', '--cine-badge-bg': 'rgba(12,50,74,0.82)', '--cine-badge-txt': '#ecfeff', '--cine-badge-bd': 'rgba(165,243,252,0.65)', '--cine-grad-mid': '#f0f9ff', '--cine-grad-end': '#0284c7', '--cine-sky-bg': '#041322' },
  },
  cosmic: {
    audio: 'cosmic', duration: 7.2,
    skyBg: 0x060318, fog: 0x0d0629, fogDensity: 0.019,
    skyType: 'cosmos', skyPrimary: 0xa78bfa, skySecondary: 0xf472b6,
    pillarType: 'crystal', pillarCol: 0x150d36, pillarGlow: 0xa78bfa,
    sealType: 'star', coreCol: 0x1a0e40, coreEmissive: 0x7c3aed, ringCol: 0xf472b6,
    groundMode: 'arena', groundCol: 0x0b0624, groundEmissive: 0x2e1065, altarCol: 0x180f3b,
    aura1: '#ddd6fe', aura2: '#8b5cf6', aura3: '#f472b6',
    boltCol: 0xc4b5fd, flashHex: '#f5f3ff', particleMotion: 'orbital', lightningFreq: 0.55,
    badge: 'DIMENSION ASTRALE',
    cssVars: { '--cine-accent': '#a78bfa', '--cine-dot': '#f472b6', '--cine-glow': 'rgba(167,139,250,0.92)', '--cine-aura': 'rgba(109,40,217,0.45)', '--cine-aura-hi': 'rgba(232,121,249,0.68)', '--cine-badge-bg': 'rgba(30,14,68,0.84)', '--cine-badge-txt': '#ede9fe', '--cine-badge-bd': 'rgba(167,139,250,0.6)', '--cine-grad-mid': '#f5f3ff', '--cine-grad-end': '#6d28d9', '--cine-sky-bg': '#060318' },
  },
  celestial: {
    audio: 'celestial', duration: 8.2,
    skyBg: 0x120d22, fog: 0x1e1638, fogDensity: 0.016,
    skyType: 'solar', skyPrimary: 0xfde047, skySecondary: 0xfef9c3,
    pillarType: 'obelisk', pillarCol: 0x3b354d, pillarGlow: 0xfde047,
    sealType: 'star', coreCol: 0x423822, coreEmissive: 0xeab308, ringCol: 0xfef08a,
    groundMode: 'arena', groundCol: 0x1b162e, groundEmissive: 0x544419, altarCol: 0x332b45,
    aura1: '#fef9c3', aura2: '#eab308', aura3: '#f472b6',
    boltCol: 0xfef08a, flashHex: '#ffffff', particleMotion: 'orbital', lightningFreq: 0.3,
    badge: 'ORIGINEL · ALPHA',
    cssVars: { '--cine-accent': '#fde047', '--cine-dot': '#ffffff', '--cine-glow': 'rgba(253,224,71,0.95)', '--cine-aura': 'rgba(202,138,4,0.42)', '--cine-aura-hi': 'rgba(254,240,138,0.72)', '--cine-badge-bg': 'rgba(54,42,16,0.84)', '--cine-badge-txt': '#fefce8', '--cine-badge-bd': 'rgba(253,224,71,0.7)', '--cine-grad-mid': '#ffffff', '--cine-grad-end': '#ca8a04', '--cine-sky-bg': '#120d22' },
  },
  nature: {
    audio: 'nature', duration: 6.2,
    skyBg: 0x04170e, fog: 0x082618, fogDensity: 0.019,
    skyType: 'aurora', skyPrimary: 0x4ade80, skySecondary: 0xa3e635,
    pillarType: 'obelisk', pillarCol: 0x0e2e1d, pillarGlow: 0x4ade80,
    sealType: 'core', coreCol: 0x123824, coreEmissive: 0x16a34a, ringCol: 0xbef264,
    groundMode: 'arena', groundCol: 0x061f12, groundEmissive: 0x14532d, altarCol: 0x103321,
    aura1: '#bef264', aura2: '#22c55e', aura3: '#4ade80',
    boltCol: 0xbef264, flashHex: '#ecfccb', particleMotion: 'spores', lightningFreq: 0.1,
    badge: 'SANCTUAIRE ÉMERAUDE',
    cssVars: { '--cine-accent': '#4ade80', '--cine-dot': '#bef264', '--cine-glow': 'rgba(74,222,128,0.9)', '--cine-aura': 'rgba(22,163,74,0.42)', '--cine-aura-hi': 'rgba(132,204,22,0.68)', '--cine-badge-bg': 'rgba(12,48,26,0.82)', '--cine-badge-txt': '#dcfce7', '--cine-badge-bd': 'rgba(74,222,128,0.6)', '--cine-grad-mid': '#ecfccb', '--cine-grad-end': '#15803d', '--cine-sky-bg': '#04170e' },
  },
  fairy: {
    audio: 'fairy', duration: 6.2,
    skyBg: 0x190818, fog: 0x290e27, fogDensity: 0.019,
    skyType: 'aurora', skyPrimary: 0xf472b6, skySecondary: 0xfbcfe8,
    pillarType: 'crystal', pillarCol: 0x3b1338, pillarGlow: 0xf472b6,
    sealType: 'star', coreCol: 0x42183f, coreEmissive: 0xdb2777, ringCol: 0xfbcfe8,
    groundMode: 'glacier', groundCol: 0x240b22, groundEmissive: 0x701a57, altarCol: 0x331230,
    aura1: '#fbcfe8', aura2: '#ec4899', aura3: '#fde047',
    boltCol: 0xfbcfe8, flashHex: '#fdf2f8', particleMotion: 'spores', lightningFreq: 0.15,
    badge: 'ÉCLAT CRISTALLIN',
    cssVars: { '--cine-accent': '#f472b6', '--cine-dot': '#fde047', '--cine-glow': 'rgba(244,114,182,0.92)', '--cine-aura': 'rgba(219,39,119,0.42)', '--cine-aura-hi': 'rgba(244,114,182,0.68)', '--cine-badge-bg': 'rgba(68,16,58,0.82)', '--cine-badge-txt': '#fce7f3', '--cine-badge-bd': 'rgba(244,114,182,0.6)', '--cine-grad-mid': '#fdf2f8', '--cine-grad-end': '#be185d', '--cine-sky-bg': '#190818' },
  },
  titan: {
    audio: 'titan', duration: 6.2,
    skyBg: 0x120e0c, fog: 0x1f1713, fogDensity: 0.02,
    skyType: 'solar', skyPrimary: 0xd97706, skySecondary: 0x94a3b8,
    pillarType: 'obelisk', pillarCol: 0x2b231e, pillarGlow: 0xf59e0b,
    sealType: 'core', coreCol: 0x26211e, coreEmissive: 0xb45309, ringCol: 0xcbd5e1,
    groundMode: 'arena', groundCol: 0x1a1411, groundEmissive: 0x451a03, altarCol: 0x29201c,
    aura1: '#fcd34d', aura2: '#b45309', aura3: '#cbd5e1',
    boltCol: 0xfde68a, flashHex: '#fef3c7', particleMotion: 'embers', lightningFreq: 0.35,
    badge: 'COLOSSE ANTIQUE',
    cssVars: { '--cine-accent': '#f59e0b', '--cine-dot': '#cbd5e1', '--cine-glow': 'rgba(245,158,11,0.88)', '--cine-aura': 'rgba(180,83,9,0.44)', '--cine-aura-hi': 'rgba(245,158,11,0.68)', '--cine-badge-bg': 'rgba(46,32,20,0.85)', '--cine-badge-txt': '#fef3c7', '--cine-badge-bd': 'rgba(245,158,11,0.6)', '--cine-grad-mid': '#fef3c7', '--cine-grad-end': '#92400e', '--cine-sky-bg': '#120e0c' },
  },
  dragon: {
    audio: 'dragon', duration: 6.8,
    skyBg: 0x051418, fog: 0x0a2129, fogDensity: 0.019,
    skyType: 'cosmos', skyPrimary: 0x10b981, skySecondary: 0xfbbf24,
    pillarType: 'spire', pillarCol: 0x0f2b30, pillarGlow: 0x10b981,
    sealType: 'star', coreCol: 0x0d262b, coreEmissive: 0x059669, ringCol: 0xfbbf24,
    groundMode: 'arena', groundCol: 0x071a1f, groundEmissive: 0x064e3b, altarCol: 0x112b30,
    aura1: '#6ee7b7', aura2: '#059669', aura3: '#fde047',
    boltCol: 0x6ee7b7, flashHex: '#d1fae5', particleMotion: 'vortex', lightningFreq: 0.65,
    badge: 'SOUVERAIN DRACONIQUE',
    cssVars: { '--cine-accent': '#34d399', '--cine-dot': '#fbbf24', '--cine-glow': 'rgba(52,211,153,0.9)', '--cine-aura': 'rgba(5,150,105,0.44)', '--cine-aura-hi': 'rgba(16,185,129,0.7)', '--cine-badge-bg': 'rgba(8,46,38,0.84)', '--cine-badge-txt': '#d1fae5', '--cine-badge-bd': 'rgba(52,211,153,0.6)', '--cine-grad-mid': '#ecfdf5', '--cine-grad-end': '#047857', '--cine-sky-bg': '#051418' },
  },
  eclipse: {
    audio: 'eclipse', duration: 6.5,
    skyBg: 0x0d0212, fog: 0x180421, fogDensity: 0.022,
    skyType: 'eclipse', skyPrimary: 0xdc2626, skySecondary: 0x9333ea,
    pillarType: 'obelisk', pillarCol: 0x1d0626, pillarGlow: 0xdc2626,
    sealType: 'prism', coreCol: 0x14031a, coreEmissive: 0xb91c1c, ringCol: 0xa855f7,
    groundMode: 'arena', groundCol: 0x120317, groundEmissive: 0x450a0a, altarCol: 0x210626,
    aura1: '#f87171', aura2: '#9333ea', aura3: '#dc2626',
    boltCol: 0xf87171, flashHex: '#fee2e2', particleMotion: 'storm', lightningFreq: 0.9,
    badge: 'CONSPIRATION OBSCURE',
    cssVars: { '--cine-accent': '#f87171', '--cine-dot': '#c084fc', '--cine-glow': 'rgba(239,68,68,0.9)', '--cine-aura': 'rgba(153,27,27,0.46)', '--cine-aura-hi': 'rgba(220,38,38,0.7)', '--cine-badge-bg': 'rgba(42,8,38,0.85)', '--cine-badge-txt': '#fee2e2', '--cine-badge-bd': 'rgba(248,113,113,0.6)', '--cine-grad-mid': '#fecaca', '--cine-grad-end': '#7e22ce', '--cine-sky-bg': '#0d0212' },
  },
  champion: {
    audio: 'champion', duration: 8.0,
    skyBg: 0x0b0b24, fog: 0x12143d, fogDensity: 0.017,
    skyType: 'solar', skyPrimary: 0xfbbf24, skySecondary: 0x60a5fa,
    pillarType: 'obelisk', pillarCol: 0x1b204d, pillarGlow: 0xfbbf24,
    sealType: 'star', coreCol: 0x1e2554, coreEmissive: 0x3b82f6, ringCol: 0xfde047,
    groundMode: 'arena', groundCol: 0x0f1333, groundEmissive: 0x1e3a8a, altarCol: 0x1f2559,
    aura1: '#fde047', aura2: '#3b82f6', aura3: '#ffffff',
    boltCol: 0xfde047, flashHex: '#fef9c3', particleMotion: 'orbital', lightningFreq: 0.35,
    badge: 'MAÎTRE DE LA LIGUE CÉLESTE',
    cssVars: { '--cine-accent': '#fbbf24', '--cine-dot': '#60a5fa', '--cine-glow': 'rgba(251,191,36,0.92)', '--cine-aura': 'rgba(37,99,235,0.44)', '--cine-aura-hi': 'rgba(251,191,36,0.72)', '--cine-badge-bg': 'rgba(20,24,66,0.86)', '--cine-badge-txt': '#fef3c7', '--cine-badge-bd': 'rgba(251,191,36,0.7)', '--cine-grad-mid': '#fef9c3', '--cine-grad-end': '#2563eb', '--cine-sky-bg': '#0b0b24' },
  },
  elite4: {
    audio: 'elite4', duration: 6.2,
    skyBg: 0x0a0720, fog: 0x130d38, fogDensity: 0.019,
    skyType: 'cosmos', skyPrimary: 0x818cf8, skySecondary: 0xc084fc,
    pillarType: 'obelisk', pillarCol: 0x181340, pillarGlow: 0x818cf8,
    sealType: 'star', coreCol: 0x1e164d, coreEmissive: 0x6366f1, ringCol: 0xe879f9,
    groundMode: 'arena', groundCol: 0x0d092b, groundEmissive: 0x312e81, altarCol: 0x1b1547,
    aura1: '#c7d2fe', aura2: '#6366f1', aura3: '#e879f9',
    boltCol: 0xa5b4fc, flashHex: '#e0e7ff', particleMotion: 'orbital', lightningFreq: 0.4,
    badge: 'CONSEIL 4 · LIGUE CÉLESTE',
    cssVars: { '--cine-accent': '#818cf8', '--cine-dot': '#e879f9', '--cine-glow': 'rgba(129,140,248,0.92)', '--cine-aura': 'rgba(79,70,229,0.44)', '--cine-aura-hi': 'rgba(129,140,248,0.7)', '--cine-badge-bg': 'rgba(24,18,64,0.84)', '--cine-badge-txt': '#e0e7ff', '--cine-badge-bd': 'rgba(129,140,248,0.62)', '--cine-grad-mid': '#eef2ff', '--cine-grad-end': '#4f46e5', '--cine-sky-bg': '#0a0720' },
  },
  dojo: {
    audio: 'dojo', duration: 6.0,
    skyBg: 0x160706, fog: 0x260c09, fogDensity: 0.019,
    skyType: 'solar', skyPrimary: 0xf97316, skySecondary: 0xfbbf24,
    pillarType: 'torii', pillarCol: 0x691414, pillarGlow: 0xfbbf24,
    sealType: 'core', coreCol: 0x3d0d0d, coreEmissive: 0xdc2626, ringCol: 0xfacc15,
    groundMode: 'magma', groundCol: 0x1f0a08, groundEmissive: 0x6b1616, altarCol: 0x36110e,
    aura1: '#fb923c', aura2: '#dc2626', aura3: '#fde047',
    boltCol: 0xfbbf24, flashHex: '#ffedd5', particleMotion: 'embers', lightningFreq: 0.35,
    badge: 'DOJO DE MAMADOU · FINALE',
    cssVars: { '--cine-accent': '#fb923c', '--cine-dot': '#facc15', '--cine-glow': 'rgba(249,115,22,0.92)', '--cine-aura': 'rgba(185,28,28,0.46)', '--cine-aura-hi': 'rgba(245,158,11,0.7)', '--cine-badge-bg': 'rgba(64,14,12,0.85)', '--cine-badge-txt': '#ffedd5', '--cine-badge-bd': 'rgba(251,146,60,0.65)', '--cine-grad-mid': '#fef3c7', '--cine-grad-end': '#b91c1c', '--cine-sky-bg': '#160706' },
  },
  raid: {
    audio: 'raid', duration: 5.6,
    skyBg: 0x12031e, fog: 0x1f0636, fogDensity: 0.022,
    skyType: 'cosmos', skyPrimary: 0xef4444, skySecondary: 0x22d3ee,
    pillarType: 'crystal', pillarCol: 0x1e0936, pillarGlow: 0xef4444,
    sealType: 'prism', coreCol: 0x160526, coreEmissive: 0xdc2626, ringCol: 0x22d3ee,
    groundMode: 'arena', groundCol: 0x140424, groundEmissive: 0x4c0519, altarCol: 0x24073d,
    aura1: '#f87171', aura2: '#a855f7', aura3: '#22d3ee',
    boltCol: 0x22d3ee, flashHex: '#ffe4e6', particleMotion: 'vortex', lightningFreq: 1.15,
    badge: 'RAID DIMENSIONNEL CO-OP',
    cssVars: { '--cine-accent': '#f87171', '--cine-dot': '#22d3ee', '--cine-glow': 'rgba(239,68,68,0.92)', '--cine-aura': 'rgba(185,28,28,0.45)', '--cine-aura-hi': 'rgba(34,211,238,0.7)', '--cine-badge-bg': 'rgba(38,8,52,0.85)', '--cine-badge-txt': '#ffe4e6', '--cine-badge-bd': 'rgba(248,113,113,0.65)', '--cine-grad-mid': '#fecdd3', '--cine-grad-end': '#9333ea', '--cine-sky-bg': '#12031e' },
  },
  rival: {
    audio: 'rival', duration: 5.8,
    skyBg: 0x0b0b1f, fog: 0x151438, fogDensity: 0.019,
    skyType: 'cosmos', skyPrimary: 0xf43f5e, skySecondary: 0x38bdf8,
    pillarType: 'obelisk', pillarCol: 0x181b3d, pillarGlow: 0x38bdf8,
    sealType: 'core', coreCol: 0x1b1a3d, coreEmissive: 0xe11d48, ringCol: 0x38bdf8,
    groundMode: 'arena', groundCol: 0x0e1029, groundEmissive: 0x1e293b, altarCol: 0x1f2247,
    aura1: '#fda4af', aura2: '#e11d48', aura3: '#38bdf8',
    boltCol: 0x7dd3fc, flashHex: '#ffe4e6', particleMotion: 'orbital', lightningFreq: 0.45,
    badge: 'DUEL AU SOMMET',
    cssVars: { '--cine-accent': '#fb7185', '--cine-dot': '#38bdf8', '--cine-glow': 'rgba(244,63,94,0.9)', '--cine-aura': 'rgba(225,29,72,0.42)', '--cine-aura-hi': 'rgba(56,189,248,0.68)', '--cine-badge-bg': 'rgba(24,18,48,0.84)', '--cine-badge-txt': '#ffe4e6', '--cine-badge-bd': 'rgba(251,113,133,0.6)', '--cine-grad-mid': '#fff1f2', '--cine-grad-end': '#2563eb', '--cine-sky-bg': '#0b0b1f' },
  },
  gym: {
    audio: 'gym', duration: 5.6,
    skyBg: 0x0a1022, fog: 0x121b38, fogDensity: 0.018,
    skyType: 'aurora', skyPrimary: 0x60a5fa, skySecondary: 0x84cc16,
    pillarType: 'obelisk', pillarCol: 0x1a2442, pillarGlow: 0x60a5fa,
    sealType: 'core', coreCol: 0x172554, coreEmissive: 0x2563eb, ringCol: 0xa3e635,
    groundMode: 'arena', groundCol: 0x0d152b, groundEmissive: 0x1e3a8a, altarCol: 0x1e2b4d,
    aura1: '#93c5fd', aura2: '#2563eb', aura3: '#bef264',
    boltCol: 0x93c5fd, flashHex: '#dbeafe', particleMotion: 'orbital', lightningFreq: 0.3,
    badge: 'ARÈNE OFFICIELLE',
    cssVars: { '--cine-accent': '#60a5fa', '--cine-dot': '#a3e635', '--cine-glow': 'rgba(96,165,250,0.9)', '--cine-aura': 'rgba(37,99,235,0.42)', '--cine-aura-hi': 'rgba(96,165,250,0.68)', '--cine-badge-bg': 'rgba(15,28,60,0.84)', '--cine-badge-txt': '#dbeafe', '--cine-badge-bd': 'rgba(96,165,250,0.6)', '--cine-grad-mid': '#eff6ff', '--cine-grad-end': '#1d4ed8', '--cine-sky-bg': '#0a1022' },
  },
};

const LEGEND_PRESET_MAP = {
  144: ['ice', 'Oiseau des Glaces · Île Givrée'],
  145: ['thunder', 'Oiseau de Foudre · Île Orageuse'],
  146: ['fire', 'Oiseau de Feu · Mont Braise'],
  150: ['cosmic', 'Pokémon Génétique · Sanctuaire Scellé'],
  151: ['fairy', 'Pokémon Originel · Autel Sacré'],
  243: ['thunder', 'Bête du Tonnerre · Légende de Johto'],
  244: ['fire', 'Bête du Volcan · Légende de Johto'],
  245: ['water', 'Bête des Eaux Pures · Aurore Boréale'],
  249: ['abyssal', 'Gardien des Marées'],
  250: ['phoenix', 'Gardien de la Tour Dorée'],
  251: ['nature', 'Esprit du Temps et de la Forêt'],
  377: ['titan', 'Golem de Roche · Colosse des Âges'],
  378: ['ice', 'Golem de Glace · Glacier Éternel'],
  379: ['titan', 'Golem d\'Acier · Forge Antique'],
  380: ['cosmic', 'Dragon Éon · Voile Écarlate'],
  381: ['abyssal', 'Dragon Éon · Flèche d\'Azur'],
  382: ['abyssal', 'Souverain des Océans · Orbe Bleu'],
  383: ['fire', 'Souverain des Continents · Orbe Rouge'],
  384: ['dragon', 'Seigneur des Cieux · Stratosphère'],
  385: ['cosmic', 'Étoile des Souhaits Millénaires'],
  386: ['cosmic', 'Mutant Spatial · ADN Stellaire'],
  480: ['cosmic', 'Être du Savoir · Gardien des Lacs'],
  481: ['fairy', 'Être de l\'Émotion · Gardien des Lacs'],
  482: ['water', 'Être de la Volonté · Gardien des Lacs'],
  483: ['cosmic', 'Maître du Temps · Colonnes Célestes'],
  484: ['cosmic', 'Maître de l\'Espace · Faille Astrale'],
  485: ['fire', 'Gardien du Magma · Caldeira Ardente'],
  486: ['titan', 'Roi des Titans · Éveil Millénaire'],
  487: ['eclipse', 'Seigneur du Monde Distorsion'],
  488: ['cosmic', 'Ailes du Croissant · Rêves Clairs'],
  489: ['water', 'Prince des Courants Marins'],
  490: ['water', 'Prince des Mers · Cœur de l\'Océan'],
  491: ['eclipse', 'Seigneur des Cauchemars'],
  492: ['nature', 'Héraut de la Gratitude'],
  493: ['celestial', 'Dieu Créateur · Flûte Azur'],
  494: ['phoenix', 'Astre de la Victoire'],
  638: ['titan', 'Lame de la Justice · Cœur de Fer'],
  639: ['titan', 'Roc de la Justice · Force Pure'],
  640: ['nature', 'Lame d\'Émeraude · Justice Sylvestre'],
  641: ['dragon', 'Génie des Tempêtes · Vent du Nord'],
  642: ['thunder', 'Génie de la Foudre · Orage Électrik'],
  643: ['phoenix', 'Dragon de la Réalité · Flamme Blanche'],
  644: ['thunder', 'Dragon de l\'Idéal · Éclair Noir'],
  645: ['titan', 'Génie de la Terre · Moisson d\'Or'],
  646: ['ice', 'Dragon de la Frontière · Froid Absolu'],
  647: ['water', 'Chevalier des Eaux · Lame Sacrée'],
  648: ['fairy', 'Muse de la Mélodie · Chant Antique'],
  649: ['raid', 'Arme Paléozoïque · Canon Techno'],
  716: ['nature', 'Arbre de Vie · Éclat de l\'Existence'],
  717: ['eclipse', 'Ailes de l\'Annihilation · Ombre Pourpre'],
  718: ['dragon', 'Gardien de l\'Équilibre Cellulaire'],
  719: ['fairy', 'Princesse des Diamants · Lumière Rose'],
  720: ['cosmic', 'Djinn des Anneaux · Faille Dimensionnelle'],
  721: ['fire', 'Colosse de Vapeur · Pression Extrême'],
  1052: ['abyssal', 'Gardien des Étoiles et des Marées'],
};

/** Vrai si l'espèce est un Pokémon légendaire ou fabuleux répertorié */
export const isLegendarySpecies = (sp) => Object.prototype.hasOwnProperty.call(LEGEND_PRESET_MAP, sp);

const GYM_PRESET_MAP = {
  bug: ['ruche', 'Badge Élytre · Arène de Sylvebourg'],
  water: ['ecume', 'Badge Écume · Arène de Port-Azur'],
  electric: ['thunder', 'Badge Volt · Arène de Voltacité'],
  grass: ['nature', 'Badge Pétale · Arène de Floralia'],
  psychic: ['cosmic', 'Badge Mirage · Arène de Mirage'],
  rock: ['titan', 'Badge Granit · Arène de Port-Granit'],
  fire: ['fire', 'Badge Braise · Arène de Cendrelune'],
  dragon: ['dragon', 'Badge Écaille · Arène de Fort-Écaille'],
  normal: ['gym', 'Badge Pavé · Arène de Métropole'],
  flying: ['celestial', 'Badge Rafale · Arène de Port-Lisière'],
  poison: ['nature', 'Badge Venin · Arène de Marais-Noir'],
  ground: ['titan', 'Badge Dune · Arène des Dunes d\'Ocre'],
  steel: ['titan', 'Badge Rouage · Arène de Forge-Acier'],
  fairy: ['fairy', 'Badge Féérie · Arène de Rosebrume'],
  dark: ['eclipse', 'Badge Ombre · Arène d\'Ombreval'],
};

const ELITE_PRESET_MAP = {
  Frimas: ['ice', 'Conseil 4 · Salle des Glaces'],
  Brutus: ['titan', 'Conseil 4 · Salle du Poing'],
  Spectrel: ['cosmic', 'Conseil 4 · Salle des Ombres'],
  Ombrelle: ['eclipse', 'Conseil 4 · Salle de la Nuit'],
};

/**
 * Résout la configuration complète (visuel 3D, titres, durée, musique) pour n'importe quel boss ou légendaire.
 */
export function resolveBossCinematicConfig(opts = {}) {
  const sp = opts.sp || (opts.shadow ? 249 : null);
  const tr = opts.trainer || {};
  const cls = opts.cls || tr.cls || '';
  const name = opts.title || opts.name || tr.name || (sp && SPECIES[sp]?.n) || 'Boss';
  const isShadowLugia = (sp === 249 && opts.shadow) || opts.preset === 'shadow';

  let presetKey = opts.preset;
  let sub = opts.sub;
  let badge = opts.badge;
  let kind = opts.raid ? 'raid' : sp ? 'mon' : 'trainer';

  if (!presetKey) {
    if (isShadowLugia) {
      presetKey = 'shadow';
      sub = sub || 'Gardien des Abysses · Cœur Fermé';
      badge = badge || 'ÉVEIL OBSCUR';
    } else if (opts.raid) {
      presetKey = 'raid';
      badge = badge || 'RAID CO-OP · ANTRE DIMENSIONNEL';
    } else if (opts.dojo) {
      presetKey = 'dojo';
      badge = badge || 'FINALE DU DOJO DE MAMADOU';
    } else if (opts.champion || cls === 'Maître') {
      presetKey = 'champion';
      sub = sub || 'Maître de la Ligue Céleste';
      badge = badge || 'COMBAT FINAL · LIGUE CÉLESTE';
    } else if (cls === 'Conseil 4' || opts.elite) {
      const eInfo = ELITE_PRESET_MAP[name];
      presetKey = eInfo ? eInfo[0] : 'elite4';
      sub = sub || (eInfo ? eInfo[1] : 'Membre du Conseil 4');
      badge = badge || 'CONSEIL 4 · LIGUE CÉLESTE';
    } else if (opts.leader != null || cls === 'Champion' || cls === 'Championne') {
      const gType = opts.gymType || opts.leaderType || 'normal';
      const gInfo = GYM_PRESET_MAP[gType] || ['gym', `${cls || 'Champion'} · Arène Officielle`];
      presetKey = gInfo[0];
      sub = sub || gInfo[1];
      badge = badge || `${cls ? cls.toUpperCase() : 'CHAMPION'} D'ARÈNE`;
    } else if (cls.includes('Éclipse') || cls.includes('Brume') || opts.eclipse) {
      presetKey = name === 'Nox' ? 'fire' : 'eclipse';
      sub = sub || (cls || 'Conspiration Obscure');
      badge = badge || (cls.includes('Brume') ? (cls.includes('Chef') ? 'LA BRUME · CHEF' : 'LA BRUME · ADMIN') : 'TEAM ÉCLIPSE');
    } else if (cls === 'Rival' || opts.rival) {
      presetKey = 'rival';
      sub = sub || 'Rivalité Éternelle';
      badge = badge || 'AFFRONTEMENT RIVAL';
    } else if (sp && LEGEND_PRESET_MAP[sp]) {
      const lInfo = LEGEND_PRESET_MAP[sp];
      presetKey = lInfo[0];
      sub = sub || lInfo[1];
      badge = badge || 'LÉGENDAIRE ANCIEN';
    } else if (sp) {
      const ts = SPECIES[sp]?.t || [];
      presetKey = ts.includes('fire') ? 'fire' : ts.includes('water') ? 'water' : ts.includes('electric') ? 'thunder' : ts.includes('ice') ? 'ice' : ts.includes('grass') ? 'nature' : ts.includes('fairy') ? 'fairy' : ts.includes('dragon') ? 'dragon' : ts.includes('psychic') ? 'cosmic' : ts.includes('dark') || ts.includes('ghost') ? 'eclipse' : 'titan';
      sub = sub || (SPECIES[sp]?.genus || 'Pokémon Légendaire');
      badge = badge || 'LÉGENDAIRE RENCONTRÉ';
    } else {
      presetKey = 'rival';
      sub = sub || 'Adversaire Redoutable';
      badge = badge || 'DÉFI BOSS';
    }
  }

  const base = PRESET_DEFS[presetKey] || PRESET_DEFS.shadow;
  const dur = Number(opts.duration) || base.duration || 6.4;
  return {
    ...base,
    presetKey,
    kind,
    sp,
    shadow: !!opts.shadow,
    shiny: !!opts.shiny,
    bs: opts.bs || tr.bs || tr.ow || null,
    title: String(name || 'BOSS').toUpperCase(),
    sub: sub || base.badge,
    badge: badge || base.badge,
    duration: dur,
    isShadowFull: isShadowLugia && dur >= 12,
  };
}

function makeSpriteTexCanvas(THREE, img) {
  if (!img) return null;
  const w = img.naturalWidth || img.width || 96;
  const h = img.naturalHeight || img.height || 96;
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d');
  if (ctx) { ctx.imageSmoothingEnabled = false; ctx.drawImage(img, 0, 0, w, h); }
  const tex = new THREE.CanvasTexture(cv);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeRadialGlowTex(THREE, c1, c2, c3) {
  const cv = document.createElement('canvas');
  cv.width = 256; cv.height = 256;
  const ctx = cv.getContext('2d');
  if (ctx) {
    const g = ctx.createRadialGradient(128, 128, 4, 128, 128, 124);
    g.addColorStop(0.0, 'rgba(255, 255, 255, 0.96)');
    g.addColorStop(0.24, c1);
    g.addColorStop(0.56, c2);
    g.addColorStop(0.84, c3);
    g.addColorStop(1.0, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeAuraPlumeTex(THREE, cInner, cMid, cOuter) {
  const cv = document.createElement('canvas');
  cv.width = 256; cv.height = 256;
  const ctx = cv.getContext('2d');
  if (ctx) {
    const g = ctx.createRadialGradient(128, 134, 12, 128, 128, 122);
    g.addColorStop(0.0, 'rgba(255, 255, 255, 0.92)');
    g.addColorStop(0.24, cInner);
    g.addColorStop(0.52, cMid);
    g.addColorStop(0.80, cOuter);
    g.addColorStop(1.0, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Construit l'arène / sanctuaire 3D (sol animé, autel central, colonnade / torii / cristaux hors caméra).
 */
export function buildSanctuary(THREE, cfg = PRESET_DEFS.shadow) {
  const group = new THREE.Group();

  let geo;
  let basePos = null;
  if (cfg.groundMode === 'waves') {
    const seg = cfg.waveSeg || 64;   // moins de sommets pour les scènes légères (Champions) : moins de calcul à chaque image
    geo = new THREE.PlaneGeometry(110, 110, seg, seg);
    geo.rotateX(-Math.PI / 2);
    basePos = new Float32Array(geo.attributes.position.array);
  } else {
    geo = new THREE.CircleGeometry(56, 48);
    geo.rotateX(-Math.PI / 2);
  }
  const groundMat = new THREE.MeshStandardMaterial({
    color: cfg.groundCol,
    emissive: cfg.groundEmissive,
    emissiveIntensity: cfg.groundMode === 'magma' ? 0.55 : 0.35,
    roughness: cfg.groundMode === 'glacier' ? 0.14 : 0.25,
    metalness: cfg.groundMode === 'glacier' ? 0.85 : 0.72,
    flatShading: cfg.groundMode === 'waves' || cfg.groundMode === 'glacier',
  });
  const groundMesh = new THREE.Mesh(geo, groundMat);
  groundMesh.position.y = -2.2;
  group.add(groundMesh);

  // Autel / estrade centrale
  const altarGroup = new THREE.Group();
  const baseRing = new THREE.Mesh(
    new THREE.CylinderGeometry(4.4, 5.2, 1.4, 8),
    new THREE.MeshStandardMaterial({ color: cfg.altarCol, roughness: 0.55, metalness: 0.45 })
  );
  baseRing.position.y = -1.6;
  const crestMat = new THREE.MeshBasicMaterial({ color: cfg.pillarGlow, transparent: true, opacity: 0.85 });
  const runeRing = new THREE.Mesh(new THREE.RingGeometry(3.2, 3.6, 32), crestMat);
  runeRing.rotation.x = -Math.PI / 2;
  runeRing.position.y = -0.88;
  altarGroup.add(baseRing, runeRing);
  group.add(altarGroup);

  // Piliers / Cristaux / Torii placés à rad = 14.2 (toujours derrière le chemin de caméra <= 12.2)
  const pMat = new THREE.MeshStandardMaterial({ color: cfg.pillarCol, roughness: 0.5, metalness: 0.4 });
  const glowMat = new THREE.MeshBasicMaterial({ color: cfg.pillarGlow, transparent: true, opacity: 0.82 });
  const pillars = [];
  const count = cfg.pillarType === 'torii' ? 6 : 8;
  for (let i = 0; i < count; i++) {
    const ang = (i / count) * Math.PI * 2 + (cfg.pillarType === 'torii' ? 0 : Math.PI / 8);
    const rad = 14.2;
    const pWrap = new THREE.Group();
    if (cfg.pillarType === 'torii') {
      const colL = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.55, 8.8, 8), pMat);
      colL.position.set(-2.0, 2.2, 0);
      const colR = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.55, 8.8, 8), pMat);
      colR.position.set(2.0, 2.2, 0);
      const lintel = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.65, 0.7), pMat);
      lintel.position.set(0, 6.4, 0);
      const trim = new THREE.Mesh(new THREE.BoxGeometry(6.2, 0.35, 0.85), glowMat);
      trim.position.set(0, 6.9, 0);
      pWrap.add(colL, colR, lintel, trim);
      pWrap.rotation.y = -ang + Math.PI / 2;
    } else if (cfg.pillarType === 'crystal') {
      const spire = new THREE.Mesh(new THREE.ConeGeometry(1.15, 9.5 + (i % 2) * 2.5, 6), glowMat.clone());
      spire.position.y = 2.6;
      spire.material.opacity = 0.68;
      pWrap.add(spire);
    } else {
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 1.0, cfg.pillarType === 'spire' ? 10.5 : 8.2, 6), pMat);
      col.position.y = 1.9;
      const cap = new THREE.Mesh(cfg.pillarType === 'spire' ? new THREE.ConeGeometry(0.95, 2.2, 6) : new THREE.OctahedronGeometry(0.82, 0), glowMat);
      cap.position.y = cfg.pillarType === 'spire' ? 7.8 : 6.6;
      pWrap.add(col, cap);
    }
    pWrap.position.set(Math.cos(ang) * rad, 0, Math.sin(ang) * rad);
    pillars.push(pWrap);
    group.add(pWrap);
  }

  return { group, groundMesh, basePos, runeRing, pillars };
}

/**
 * Construit le Sceau / Prisme 3D central qui pulse, charge et éclate en 24 éclats à l'impact.
 */
export function buildBlackPrism(THREE, cfg = PRESET_DEFS.shadow) {
  const group = new THREE.Group();
  let prismMesh;
  if (cfg.sealType === 'star') {
    prismMesh = new THREE.Group();
    const matA = new THREE.MeshStandardMaterial({ color: cfg.coreCol, emissive: cfg.coreEmissive, emissiveIntensity: 1.5, roughness: 0.12, metalness: 0.88, flatShading: true });
    const t1 = new THREE.Mesh(new THREE.TetrahedronGeometry(2.15, 0), matA);
    const t2 = new THREE.Mesh(new THREE.TetrahedronGeometry(2.15, 0), matA);
    t2.rotation.set(Math.PI, Math.PI / 2, 0);
    prismMesh.add(t1, t2);
  } else {
    const pGeo = cfg.sealType === 'prism' ? new THREE.OctahedronGeometry(1.85, 0) : new THREE.IcosahedronGeometry(1.65, 0);
    if (cfg.sealType === 'prism') pGeo.scale(0.85, 1.45, 0.85);
    prismMesh = new THREE.Mesh(pGeo, new THREE.MeshStandardMaterial({
      color: cfg.coreCol,
      emissive: cfg.coreEmissive,
      emissiveIntensity: 1.45,
      roughness: 0.14,
      metalness: 0.88,
      flatShading: true,
    }));
  }

  const ringMat = new THREE.MeshBasicMaterial({ color: cfg.ringCol, side: THREE.DoubleSide, transparent: true, opacity: 0.86 });
  const ring1 = new THREE.Mesh(new THREE.TorusGeometry(2.65, 0.08, 8, 48), ringMat);
  const ring2 = new THREE.Mesh(new THREE.TorusGeometry(3.15, 0.06, 8, 48), ringMat.clone());
  ring2.rotation.x = Math.PI / 3;
  group.add(prismMesh, ring1, ring2);

  const shards = [];
  const shardGeo = new THREE.OctahedronGeometry(0.42, 0);
  for (let i = 0; i < 24; i++) {
    const sMat = new THREE.MeshStandardMaterial({
      color: i % 2 === 0 ? cfg.ringCol : cfg.coreCol,
      emissive: cfg.coreEmissive,
      emissiveIntensity: 1.8,
      roughness: 0.2,
      metalness: 0.85,
    });
    const m = new THREE.Mesh(shardGeo, sMat);
    m.visible = false;
    const phi = Math.acos(1 - 2 * ((i + 0.5) / 24));
    const theta = Math.PI * (1 + Math.sqrt(5)) * i;
    const dir = new THREE.Vector3(Math.sin(phi) * Math.cos(theta), Math.cos(phi) * 0.72 + 0.22, Math.sin(phi) * Math.sin(theta)).normalize();
    shards.push({
      mesh: m,
      dir,
      speed: 7 + (i % 5) * 3.1,
      rotSpeed: new THREE.Vector3((i % 3) * 3 - 2, (i % 4) * 2.5 - 3, (i % 2) * 5 - 2),
    });
    group.add(m);
  }

  return { group, prismMesh, ring1, ring2, shards };
}

/**
 * Construit le sujet HD-2D central (Légendaire ou Dresseur Boss) avec aura additive multicouche 3D.
 */
export function buildShadowLugia3D(THREE, spriteImg, cfg = PRESET_DEFS.shadow) {
  const root = new THREE.Group();
  const spriteTex = makeSpriteTexCanvas(THREE, spriteImg);
  const auraTex = makeAuraPlumeTex(THREE, cfg.aura1, cfg.aura2, cfg.aura3);
  const glowTex = makeRadialGlowTex(THREE, cfg.aura1, cfg.aura2, cfg.aura3);

  const spriteMat = new THREE.SpriteMaterial({
    map: spriteTex || auraTex,
    transparent: true,
    opacity: 1,
    alphaTest: spriteTex ? 0.08 : 0.01,
    depthWrite: true,
  });
  const sprite = new THREE.Sprite(spriteMat);
  const ratio = spriteImg && spriteImg.height > 0 ? (spriteImg.width / spriteImg.height) : 1;
  const hWorld = cfg.kind === 'trainer' ? 4.4 : 4.8;
  sprite.scale.set(hWorld * Math.max(0.75, Math.min(1.45, ratio)), hWorld, 1);

  const glowBack = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTex,
    transparent: true,
    opacity: 0.56,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  }));
  glowBack.scale.set(7.4, 7.4, 1);
  glowBack.position.set(0, 0, -0.35);

  const auraOuter = new THREE.Sprite(new THREE.SpriteMaterial({
    map: auraTex,
    transparent: true,
    opacity: 0.48,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  }));
  auraOuter.scale.set(6.4, 6.4, 1);
  auraOuter.position.set(0, 0.1, -0.2);

  // Halo orbital horizontal 3D autour du boss/légendaire
  const baseHalo = new THREE.Mesh(
    new THREE.RingGeometry(2.1, 2.55, 48),
    new THREE.MeshBasicMaterial({ color: cfg.ringCol, side: THREE.DoubleSide, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  baseHalo.rotation.x = -Math.PI / 2;
  baseHalo.position.y = -2.1;

  root.add(glowBack, auraOuter, baseHalo, sprite);
  return { root, sprite, glowBack, auraOuter, baseHalo };
}

/**
 * Moteur de scène 3D Three.js unifié pour tout boss et légendaire d'Odyssée.
 */
export function createBoss3DScene(THREE, container, spriteImg, cfgInput = PRESET_DEFS.shadow, fx = null) {
  const cfg = { ...PRESET_DEFS.shadow, ...cfgInput };
  const dur = cfg.duration || 6.4;
  const isShadowFull = !!cfg.isShadowFull;
  const shatterAt = isShadowFull ? 2.85 : dur * 0.34;
  const awakenAt = isShadowFull ? 2.9 : dur * 0.35;
  const surgeAt = isShadowFull ? 5.6 : dur * 0.56;
  const climaxAt = isShadowFull ? 10.6 : dur * 0.78;

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  const initW = Math.max(320, container.clientWidth || 800);
  const initH = Math.max(180, container.clientHeight || 450);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(initW, initH);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.25;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(cfg.skyBg);
  scene.fog = new THREE.FogExp2(cfg.fog, cfg.fogDensity || 0.02);

  const camera = new THREE.PerspectiveCamera(52, initW / initH, 0.1, 160);
  camera.position.set(0, 3.2, 11.5);

  const hemiLight = new THREE.HemisphereLight(cfg.skyPrimary, cfg.groundCol || 0x160a24, 0.85);
  const rimLight = new THREE.DirectionalLight(cfg.ringCol, 2.2);
  rimLight.position.set(-7, 12, -14);
  const fillLight = new THREE.DirectionalLight(0xffffff, 1.05);
  fillLight.position.set(6, 8, 12);
  const coreLight = new THREE.PointLight(cfg.pillarGlow, 3.8, 34);
  coreLight.position.set(0, 1.5, 0);
  scene.add(hemiLight, rimLight, fillLight, coreLight);
  const hemiBase = hemiLight.intensity;

  // lueur (bloom) : les auras, éclairs, rubans et le sceau rayonnent ; sans les modules de post-traitement, rendu direct
  let composer = null, bloom = null;
  if (fx?.EffectComposer) {
    try {
      composer = new fx.EffectComposer(renderer);
      composer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
      composer.setSize(initW, initH);
      composer.addPass(new fx.RenderPass(scene, camera));
      bloom = new fx.UnrealBloomPass(new THREE.Vector2(initW / 2, initH / 2), 0.3, 0.42, 0.86);
      composer.addPass(bloom);
      composer.addPass(new fx.OutputPass());
    } catch (e) { composer = null; bloom = null; }
  }
  let bloomKick = 0, eclairLum = 0;

  // Corps céleste (Éclipse / Soleil / Aurore / Galaxie)
  const skyGroup = new THREE.Group();
  skyGroup.position.set(0, 13.2, -32);
  const discCol = cfg.skyType === 'eclipse' ? 0x05010a : cfg.skyPrimary;
  const skyDisc = new THREE.Mesh(
    new THREE.CircleGeometry(cfg.skyType === 'eclipse' ? 4.0 : 3.4, 40),
    new THREE.MeshBasicMaterial({ color: discCol, transparent: cfg.skyType === 'aurora', opacity: 0.92 })
  );
  const skyCorona = new THREE.Mesh(
    new THREE.RingGeometry(cfg.skyType === 'eclipse' ? 3.88 : 3.25, 6.2, 48),
    new THREE.MeshBasicMaterial({ color: cfg.skySecondary, side: THREE.DoubleSide, transparent: true, opacity: 0.72, blending: THREE.AdditiveBlending })
  );
  skyCorona.position.z = -0.05;
  skyGroup.add(skyDisc, skyCorona);
  if (cfg.skyType === 'cosmos') {
    const outerGalaxy = new THREE.Mesh(
      new THREE.TorusGeometry(6.8, 0.12, 8, 64),
      new THREE.MeshBasicMaterial({ color: cfg.skyPrimary, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending })
    );
    outerGalaxy.rotation.x = Math.PI / 2.4;
    skyGroup.add(outerGalaxy);
  }
  scene.add(skyGroup);

  const sanctuary = buildSanctuary(THREE, cfg);
  scene.add(sanctuary.group);

  const prism = buildBlackPrism(THREE, cfg);
  prism.group.position.set(0, 0.5, 0);
  scene.add(prism.group);

  const subject = buildShadowLugia3D(THREE, spriteImg, cfg);
  subject.root.visible = false;
  subject.root.position.set(0, -1.6, 0);
  scene.add(subject.root);

  // Ondes de choc expansives
  const shockRings = [];
  for (let i = 0; i < 3; i++) {
    const m = new THREE.Mesh(
      new THREE.RingGeometry(0.6, 1.05, 48),
      new THREE.MeshBasicMaterial({ color: i % 2 === 0 ? cfg.ringCol : cfg.skyPrimary, side: THREE.DoubleSide, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    m.rotation.x = -Math.PI / 2;
    m.position.y = -0.85;
    shockRings.push({ mesh: m, age: -1 });
    scene.add(m);
  }

  // Rubans vortex 3D
  const ribbons = [];
  for (let i = 0; i < 4; i++) {
    const pts = [];
    for (let k = 0; k <= 44; k++) {
      const f = k / 44;
      const a = f * Math.PI * 4.5 + i * (Math.PI / 2);
      const r = 1.6 + f * 5.8;
      pts.push(new THREE.Vector3(Math.cos(a) * r, -1.4 + f * 12.2, Math.sin(a) * r));
    }
    const mesh = new THREE.Mesh(
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 44, 0.12, 6, false),
      new THREE.MeshBasicMaterial({ color: i % 2 === 0 ? cfg.pillarGlow : cfg.ringCol, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    ribbons.push(mesh);
    scene.add(mesh);
  }

  // Particules 3D (tempête / braises / spores / orbite)
  const pCount = cfg.pCount || 460;
  const pPos = new Float32Array(pCount * 3);
  const pData = [];
  for (let i = 0; i < pCount; i++) {
    const ang = Math.random() * Math.PI * 2;
    const rad = 1.4 + Math.random() * 14;
    const y = -2.0 + Math.random() * 15;
    pPos[i * 3] = Math.cos(ang) * rad;
    pPos[i * 3 + 1] = y;
    pPos[i * 3 + 2] = Math.sin(ang) * rad;
    pData.push({ ang, rad, y, spd: 0.7 + Math.random() * 2.2, rise: 1.1 + Math.random() * 2.8 });
  }
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  const particles = new THREE.Points(pGeo, new THREE.PointsMaterial({
    color: cfg.ringCol,
    size: cfg.particleMotion === 'spores' ? 0.24 : 0.21,
    transparent: true,
    opacity: 0.86,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  }));
  scene.add(particles);

  // Éclairs 3D procéduraux
  const bolts = [];
  for (let i = 0; i < 4; i++) {
    const bGeo = new THREE.BufferGeometry();
    bGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(21), 3));
    const line = new THREE.Line(bGeo, new THREE.LineBasicMaterial({ color: cfg.boltCol, transparent: true, opacity: 0 }));
    bolts.push({ line, life: 0 });
    scene.add(line);
  }
  const triggerBolt = () => {
    const b = bolts.find((x) => x.life <= 0);
    if (!b) return;
    const pos = b.line.geometry.attributes.position.array;
    const a = Math.random() * Math.PI * 2;
    const sx = Math.cos(a) * (4 + Math.random() * 5), sz = Math.sin(a) * (4 + Math.random() * 5);
    const tx = Math.cos(a) * 1.4, tz = Math.sin(a) * 1.4;
    for (let k = 0; k < 7; k++) {
      const f = k / 6;
      pos[k * 3] = sx + (tx - sx) * f + (k > 0 && k < 6 ? (Math.random() - 0.5) * 1.4 : 0);
      pos[k * 3 + 1] = 11 - f * 11.5;
      pos[k * 3 + 2] = sz + (tz - sz) * f + (k > 0 && k < 6 ? (Math.random() - 0.5) * 1.4 : 0);
    }
    b.line.geometry.attributes.position.needsUpdate = true;
    b.life = 0.2;
    eclairLum = Math.max(eclairLum, 0.7 + Math.random() * 0.5);   // l'éclair illumine toute la scène un instant
  };

  let prismBroken = false;
  let climaxDone = false, vague2 = false;
  let burstAt = -1;
  let waveIdx = 0;
  let shockwave = 0;
  // avec la lueur, le Pokémon (ou le dresseur) est dessiné après elle : net et éclatant au milieu de son aura
  if (composer) subject.sprite.layers.set(1);
  const baseScaleX = subject.sprite.scale.x;
  const baseScaleY = subject.sprite.scale.y;
  // apparition en silhouette (légendaires et boss Pokémon) : il monte en ombre, puis se révèle en couleur dans un éclair
  const silhouette = cfg.kind !== 'trainer';
  const ascentSpanR = isShadowFull ? 1.5 : Math.max(0.75, dur * 0.2);
  const revealAt = silhouette ? awakenAt + ascentSpanR * 0.9 : -1;
  let revealed = !silhouette;
  if (silhouette) subject.sprite.material.color.setRGB(0.04, 0.03, 0.08);

  // caméra : positions clés reliées par une courbe (Catmull-Rom), sans à-coup d'une phase à l'autre
  // [instant, angle, rayon, hauteur, hauteur visée]
  const camKeys = [
    [0, -0.42, 11.4, 2.6, 0.6],
    [shatterAt, 0.23, 9.2, 2.2, 0.8],
    [(shatterAt + climaxAt) / 2, 0.62, 10.3, 2.6, 1.05],
    [climaxAt, 0.96, 9.0, 3.2, 1.15],
    [dur, 0.48, 6.9, 2.5, 1.25],
  ];
  const camAt = (t) => {
    const K = camKeys, n = K.length;
    let i = 0; while (i < n - 2 && t > K[i + 1][0]) i++;
    const u = Math.max(0, Math.min(1, (t - K[i][0]) / Math.max(0.001, K[i + 1][0] - K[i][0])));
    const p0 = K[Math.max(0, i - 1)], p1 = K[i], p2 = K[i + 1], p3 = K[Math.min(n - 1, i + 2)];
    const out = [];
    for (let c = 1; c < 5; c++) {
      const a = p0[c], b = p1[c], d = p2[c], e = p3[c];
      out.push(0.5 * ((2 * b) + (-a + d) * u + (2 * a - 5 * b + 4 * d - e) * u * u + (-a + 3 * b - 3 * d + e) * u * u * u));
    }
    return out;
  };

  const resize = () => {
    const w = Math.max(320, container.clientWidth || 800);
    const h = Math.max(180, container.clientHeight || 450);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    if (composer) { composer.setSize(w, h); bloom?.resolution?.set(w / 2, h / 2); }
  };

  const update = (t, dt) => {
    const clampedDt = Math.min(0.05, Math.max(0.001, dt));

    // Animation du sol selon son mode
    if (sanctuary.basePos) {
      const pos = sanctuary.groundMesh.geometry.attributes.position.array;
      const base = sanctuary.basePos;
      const stormAmp = cfg.waveAmp != null ? cfg.waveAmp : t < shatterAt ? 0.35 : Math.min(1.1, 0.4 + (t - shatterAt) * 0.2);
      for (let i = 0; i < pos.length; i += 3) {
        const vx = base[i], vz = base[i + 2];
        pos[i + 1] = Math.sin(vx * 0.25 + t * 2.2) * Math.cos(vz * 0.22 - t * 1.6) * stormAmp;
      }
      sanctuary.groundMesh.geometry.attributes.position.needsUpdate = true;
      sanctuary.groundMesh.geometry.computeVertexNormals();
    } else if (cfg.groundMode === 'magma') {
      sanctuary.groundMesh.material.emissiveIntensity = 0.45 + Math.sin(t * 4.5) * 0.16;
    }

    sanctuary.runeRing.rotation.z = t * 0.3;
    skyCorona.rotation.z += clampedDt * 0.12;

    // Éclatement du sceau / prisme
    if (t >= shatterAt && !prismBroken) {
      prismBroken = true;
      burstAt = t;
      prism.prismMesh.visible = false;
      prism.ring1.visible = false;
      prism.ring2.visible = false;
      prism.shards.forEach((s) => {
        s.mesh.visible = true;
        s.mesh.position.set(0, 0, 0);
      });
      shockRings[waveIdx++ % 3].age = 0;
      shockwave = 0.85;
      bloomKick = 0.75;
      coreLight.intensity = 10;
    }

    if (!prismBroken) {
      const charge = t / shatterAt;
      prism.prismMesh.rotation.y += clampedDt * (0.9 + charge * 4.5);
      prism.prismMesh.position.y = Math.sin(t * 3.0) * 0.22;
      prism.ring1.rotation.z += clampedDt * 2.4;
      prism.ring2.rotation.y -= clampedDt * 3.0;
      if (charge > 0.72) {
        prism.group.position.x = (Math.random() - 0.5) * 0.12;
        coreLight.intensity = 4 + (charge - 0.72) * 18;
      }
    } else {
      const since = t - burstAt;
      prism.shards.forEach((s) => {
        if (!s.mesh.visible) return;
        s.mesh.position.addScaledVector(s.dir, s.speed * clampedDt);
        s.dir.y -= clampedDt * 4.5;
        s.mesh.rotation.x += s.rotSpeed.x * clampedDt;
        s.mesh.rotation.y += s.rotSpeed.y * clampedDt;
        s.mesh.scale.setScalar(Math.max(0.01, 1 - since * 0.45));
        if (since > 2.4) s.mesh.visible = false;
      });
    }

    // Éveil et ascension du Boss / Légendaire HD-2D
    if (t >= awakenAt) {
      subject.root.visible = true;
      const since = t - awakenAt;
      const ascentSpan = isShadowFull ? 1.5 : Math.max(0.75, dur * 0.2);
      const ascend = Math.min(1, since / ascentSpan);
      const easeOut = 1 - Math.pow(1 - ascend, 3);
      let bobY = -1.6 + easeOut * 2.85 + Math.sin(t * 2.7) * 0.2;
      let sc = 0.5 + easeOut * 0.52;

      if (t >= climaxAt) {
        const divePhase = Math.min(1, (t - climaxAt) / Math.max(0.9, dur * 0.22));
        const p2 = Math.sin(divePhase * Math.PI);
        subject.root.position.set(0, bobY + p2 * 0.45, divePhase * 2.8);
        sc = 1.02 + p2 * 0.24;
      } else {
        subject.root.position.set(0, bobY, 0);
      }
      subject.sprite.scale.set(baseScaleX * sc, baseScaleY * sc, 1);
      // révélation : l'ombre prend ses couleurs dans un éclair blanc (la lueur et le halo s'emballent un instant)
      if (!revealed && t >= revealAt) { revealed = true; bloomKick = Math.max(bloomKick, 0.6); shockRings[waveIdx++ % 3].age = 0; shockwave = Math.max(shockwave, 0.4); }
      if (silhouette) {
        const k = revealed ? Math.min(1, (t - revealAt) / 0.35) : 0;
        const kk = k * k * (3 - 2 * k);
        subject.sprite.material.color.setRGB(0.04 + 0.96 * kk, 0.03 + 0.97 * kk, 0.08 + 0.92 * kk);
      }
      const glowPulse = 1 + Math.sin(t * 7.2) * 0.08 + (t >= surgeAt ? 0.14 : 0);
      subject.glowBack.scale.set(7.4 * sc * glowPulse, 7.4 * sc * glowPulse, 1);
      subject.auraOuter.scale.set(6.4 * sc * glowPulse, 6.4 * sc * glowPulse, 1);
      subject.baseHalo.rotation.z = t * 1.4;
      coreLight.intensity = 3.6 + Math.sin(t * 6.5) * 1.1 + (t >= surgeAt ? 2.2 : 0);
    }

    // Rubans vortex
    const vortexAlpha = t >= surgeAt ? Math.min(0.66, (t - surgeAt) * 0.7) : t >= awakenAt ? 0.2 : 0;
    ribbons.forEach((r, idx) => {
      r.material.opacity = vortexAlpha * (idx % 2 === 0 ? 1 : 0.72);
      r.rotation.y += clampedDt * (1.8 + idx * 0.35);
    });

    // Ondes de choc
    if (isShadowFull && t >= 6.4 && !vague2) { vague2 = true; shockRings[waveIdx++ % 3].age = 0; }
    if (t >= climaxAt && !climaxDone) { climaxDone = true; shockRings[waveIdx++ % 3].age = 0; shockwave = 0.55; bloomKick = Math.max(bloomKick, 0.5); }
    shockRings.forEach((sr) => {
      if (sr.age < 0) return;
      sr.age += clampedDt;
      const p = sr.age / 1.15;
      sr.mesh.scale.setScalar(1 + p * 18);
      sr.mesh.material.opacity = Math.max(0, 0.85 * (1 - p));
      if (p >= 1) { sr.age = -1; sr.mesh.material.opacity = 0; }
    });

    // Particules selon le biome
    const pa = particles.geometry.attributes.position.array;
    const speedMul = t >= surgeAt ? 1.85 : t >= shatterAt ? 1.35 : 0.85;
    for (let i = 0; i < pCount; i++) {
      const d = pData[i];
      if (cfg.particleMotion === 'spores') {
        d.ang += d.spd * 0.35 * clampedDt * speedMul;
        d.y += (cfg.audio === 'ice' ? -d.rise : d.rise) * 0.55 * clampedDt * speedMul;
        if (d.y > 13) d.y = -2;
        if (d.y < -2) d.y = 13;
      } else if (cfg.particleMotion === 'embers') {
        d.ang += d.spd * 0.45 * clampedDt * speedMul;
        d.y += d.rise * 1.45 * clampedDt * speedMul;
        if (d.y > 13) d.y = -2;
      } else {
        d.ang += d.spd * clampedDt * speedMul * (cfg.particleMotion === 'storm' ? 1.4 : 1.0);
        d.y += d.rise * clampedDt * (t >= surgeAt ? 1.35 : 0.75);
        if (d.y > 13) d.y = -2;
      }
      const rDyn = d.rad * (cfg.particleMotion === 'vortex' && t >= surgeAt ? 0.55 + (d.y + 2) * 0.065 : 1);
      pa[i * 3] = Math.cos(d.ang) * rDyn;
      pa[i * 3 + 1] = d.y;
      pa[i * 3 + 2] = Math.sin(d.ang) * rDyn;
    }
    particles.geometry.attributes.position.needsUpdate = true;

    // Éclairs
    if (cfg.lightningFreq > 0 && Math.random() < clampedDt * cfg.lightningFreq * (t >= surgeAt ? 3.2 : 1.4)) triggerBolt();
    bolts.forEach((b) => {
      if (b.life > 0) { b.life -= clampedDt; b.line.material.opacity = Math.max(0, b.life * 4.5); }
      else b.line.material.opacity = 0;
    });

    // Caméra : trajet continu entre les positions clés, tremblement doux (somme de sinus plutôt que du bruit image par image)
    const [angle, radius, camY, targetY] = camAt(t);
    if (shockwave > 0) shockwave = Math.max(0, shockwave - clampedDt * 1.6);
    const sx = (Math.sin(t * 47.0) + Math.sin(t * 29.3 + 1.7)) * 0.5, sy = (Math.sin(t * 41.0 + 0.6) + Math.sin(t * 23.9 + 2.9)) * 0.5;
    camera.position.set(
      Math.sin(angle) * radius + sx * shockwave * 0.32,
      camY + sy * shockwave * 0.32,
      Math.cos(angle) * radius
    );
    // dernière demi-seconde : le cadre se resserre sur le Pokémon (passage au combat)
    const punch = Math.max(0, Math.min(1, (t - (dur - 0.55)) / 0.55));
    const fov = 52 - punch * punch * 9;
    if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); }
    camera.lookAt(0, targetY, 0);
    // éclairs qui illuminent la scène, lueur qui respire et s'emballe aux grands moments
    eclairLum = Math.max(0, eclairLum - clampedDt * 6);
    hemiLight.intensity = hemiBase * (1 + eclairLum * 2.2);
    bloomKick = Math.max(0, bloomKick - clampedDt * 1.9);
    if (bloom) {
      bloom.strength = 0.28 + (t >= surgeAt ? 0.08 : 0) + Math.sin(t * 3.1) * 0.03 + bloomKick + eclairLum * 0.2;
      composer.render(clampedDt);
      renderer.autoClear = false;
      renderer.clearDepth();
      const fond = scene.background; scene.background = null;   // sinon le fond repeint toute l'image
      camera.layers.set(1);
      renderer.render(scene, camera);
      camera.layers.set(0);
      scene.background = fond;
      renderer.autoClear = true;
    } else renderer.render(scene, camera);
  };

  const dispose = () => {
    try {
      scene.traverse((obj) => {
        if (obj.geometry) try { obj.geometry.dispose(); } catch (e) { warnDev('webgl', e); }
        if (obj.material) {
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
          for (const mat of mats) {
            if (!mat) continue;
            for (const mapKey of ['map', 'alphaMap', 'emissiveMap', 'normalMap', 'roughnessMap', 'metalnessMap', 'envMap']) {
              try { mat[mapKey]?.dispose?.(); } catch (e) { warnDev('webgl', e); }
            }
            try { mat.dispose?.(); } catch (e) { warnDev('webgl', e); }
          }
        }
      });
      try { scene.background?.dispose?.(); } catch (e) { warnDev('webgl', e); }
    } catch (e) { warnDev('webgl', e); }
    try { bloom?.dispose?.(); composer?.dispose?.(); } catch (e) { warnDev('webgl', e); }
    try { renderer.dispose(); renderer.forceContextLoss?.(); } catch (e) { warnDev('webgl', e); }
    try { if (renderer.domElement?.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement); } catch (e) { warnDev('webgl', e); }
  };

  return { update, resize, dispose, revealAt };
}

/** Alias rétrocompatible pour Shadow Lugia */
export function createLugia3DScene(THREE, container, lugiaImg) {
  return createBoss3DScene(THREE, container, lugiaImg, resolveBossCinematicConfig({ sp: 249, shadow: true }));
}

function run2DFallback(cv, cfg, spriteImg, getT, isDone) {
  const ctx = cv.getContext('2d');
  if (!ctx) return;
  const dur = cfg.duration || 6.4;
  const parts = Array.from({ length: 72 }, (_, i) => ({ ang: (i / 72) * Math.PI * 2, r: 30 + (i % 9) * 28, sp: 1 + (i % 4) * 0.4 }));
  const step = () => {
    if (isDone()) return;
    const t = getT();
    const w = (cv.width = cv.clientWidth || 800);
    const h = (cv.height = cv.clientHeight || 450);
    const g = ctx.createRadialGradient(w / 2, h * 0.46, 10, w / 2, h * 0.46, Math.max(w, h) * 0.65);
    g.addColorStop(0, cfg.aura2);
    g.addColorStop(1, '#05020e');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    parts.forEach((p, idx) => {
      const a = p.ang + t * p.sp;
      const x = w / 2 + Math.cos(a) * p.r * (w / 480);
      const y = h * 0.52 + Math.sin(a * 1.4) * p.r * 0.45;
      ctx.fillStyle = idx % 2 ? cfg.aura1 : cfg.aura3;
      ctx.fillRect(x, y, 3, 3);
    });
    if (spriteImg && t >= dur * 0.32) {
      const sc = Math.min(1, (t - dur * 0.32) / 0.5);
      const sz = Math.min(w, h) * 0.42 * sc;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(spriteImg, w / 2 - sz / 2, h * 0.48 - sz / 2, sz, sz);
    }
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/**
 * Exécute la cinématique 3D complète (WebGL + HUD + Musique WebAudio + Skip instantané)
 * pour n'importe quel légendaire ou boss majeur du jeu.
 */
export async function playBossCinematic(game, opts = {}) {
  const ui = game?.ui, st = game?.state, sound = game?.sound;
  if (!ui?.root) return;
  const cfg = resolveBossCinematicConfig(opts);

  const prevBusy = game.busy;
  game.busy = true;
  sound?.stopMusic?.(0.25);
  if (sound) sound.current = null;

  const wrap = document.createElement('div');
  wrap.className = 'screen lugia-cine-scr';
  for (const [k, v] of Object.entries(cfg.cssVars || {})) wrap.style?.setProperty?.(k, v);
  wrap.innerHTML = `
    <div class="lugia-cine-viewport">
      <div class="lugia-cine-3d"></div>
      <canvas class="lugia-cine-canvas"></canvas>
      <div class="lugia-cine-aura"></div>
      <div class="lugia-cine-vignette"></div>
      <div class="lugia-cine-bars">
        <div class="lugia-cine-bar top"></div>
        <div class="lugia-cine-bar bot"></div>
      </div>
      <div class="lugia-cine-flash"></div>
      <div class="lugia-cine-loc"><b>SANCTUAIRE DES MARÉES</b><span>Nuit de l'Éclipse · 23 h 58</span></div>
      <div class="lugia-cine-hud">
        <div class="lugia-cine-title-wrap">
          <div class="lugia-cine-badge"><span class="lugia-badge-dot"></span> ${esc(cfg.badge)}</div>
          <h1 class="lugia-cine-title">${esc(cfg.title)}</h1>
          <div class="lugia-cine-sub">${esc(cfg.sub)}</div>
        </div>
      </div>
      <button type="button" class="lugia-cine-skip">Passer (Échap) ▶</button>
    </div>
  `;

  let done = false;
  let audioCtrl = { stop: () => {} };
  let sceneCtrl = null;
  let spriteImg = null;
  let cryUrl = null;
  let pop = null;
  const flashTimers = [];
  const scheduleFlashReset = (ms) => {
    const id = setTimeout(() => { if (!done && flashEl) flashEl.style.opacity = '0'; }, ms);
    flashTimers.push(id);
  };
  let flashEl = null;

  const cleanupAll = () => {
    if (done) return;
    done = true;
    for (const id of flashTimers) clearTimeout(id);
    flashTimers.length = 0;
    try { pop?.(); } catch (e) { warnDev('cinematic', e); }
    try { audioCtrl?.stop?.(); } catch (e) { warnDev('cinematic', e); }
    try { sceneCtrl?.dispose?.(); } catch (e) { warnDev('cinematic', e); }
  };

  try {
    ui.root.appendChild(wrap);
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => wrap.classList.add('in'));

    const host3D = wrap.querySelector('.lugia-cine-3d');
    const cv2D = wrap.querySelector('.lugia-cine-canvas');
    flashEl = wrap.querySelector('.lugia-cine-flash');
    const titleWrap = wrap.querySelector('.lugia-cine-title-wrap');
    const skipBtn = wrap.querySelector('.lugia-cine-skip');

    try {
      const { ASSETS, loadImg } = await import('../assets.js');
      const candidateUrls = [];
      if (cfg.kind === 'trainer' && cfg.bs) {
        candidateUrls.push(ASSETS.trainer(cfg.bs));
        if (ASSETS.portrait) candidateUrls.push(ASSETS.portrait(cfg.bs));
      } else if (cfg.sp) {
        if (cfg.shadow && cfg.sp === 249 && ASSETS.shadowFront) candidateUrls.push(ASSETS.shadowFront(249));
        candidateUrls.push(ASSETS.front(cfg.sp, cfg.shiny, cfg.shadow));
        if (ASSETS.front) candidateUrls.push(ASSETS.front(cfg.sp, false, false));
        cryUrl = ASSETS.cry?.(cfg.sp) || null;
      }
      for (const url of candidateUrls) {
        if (!url) continue;
        spriteImg = await loadImg(url).catch(() => null);
        if (spriteImg) break;
      }
    } catch (e) { warnDev('cinematic', e); }

    let hasWebGL = false;
    // l'éveil de Lugia Obscur a sa propre mise en scène (cine-lugia.js : sept plans, bande-son écrite pour eux)
    let epic = null;
    if (host3D) {
      try {
        const THREE = await import('three');
        let fx = null;
        try {
          const base = '../../../shared/vendor/three/jsm/postprocessing/';
          const [ec, rp, ub, op, sp] = await Promise.all([import(base + 'EffectComposer.js'), import(base + 'RenderPass.js'), import(base + 'UnrealBloomPass.js'), import(base + 'OutputPass.js'), import(base + 'ShaderPass.js')]);
          fx = { EffectComposer: ec.EffectComposer, RenderPass: rp.RenderPass, UnrealBloomPass: ub.UnrealBloomPass, OutputPass: op.OutputPass, ShaderPass: sp.ShaderPass };
        } catch (e) { fx = null; }
        if (cfg.isShadowFull) {
          try {
            const { createShadowLugiaEpic } = await import('./cine-lugia.js');
            await import('../audio-lugia.js').catch(() => null);   // la partition démarre en même temps que l'image
            sceneCtrl = epic = createShadowLugiaEpic(THREE, host3D, spriteImg, fx);
            cfg.duration = epic.duration;
            wrap.classList.add('epic');
          } catch (e) { console.error('[cinématique Lugia]', e); epic = null; }
        }
        if (!epic) sceneCtrl = createBoss3DScene(THREE, host3D, spriteImg, cfg, fx);
        hasWebGL = true;
      } catch (e) { hasWebGL = false; }
    }

    // la première image se prépare (nuanceurs, textures) avant que le temps de la scène et la partition ne commencent
    if (sceneCtrl) { try { sceneCtrl.update(0, 0); } catch (e) { warnDev('cinematic', e); } }
    if (typeof requestAnimationFrame === 'function') await new Promise((r) => { requestAnimationFrame(() => requestAnimationFrame(r)); setTimeout(r, 400); });

    try {
      if (epic && sound?.playShadowLugiaEpic) {
        audioCtrl = sound.playShadowLugiaEpic({ cryUrl });
      } else if (sound?.playBossCinematicAudio) {
        audioCtrl = sound.playBossCinematicAudio(cfg.audio || cfg.presetKey, cfg.duration, { cryUrl });
      } else if (sound?.playLugiaCinematicAudio && cfg.presetKey === 'shadow') {
        audioCtrl = sound.playLugiaCinematicAudio();
      }
    } catch (e) { warnDev('cinematic', e); }

    await new Promise((resolve) => {
      const dur = cfg.duration || 6.4;
      const tStart = performance.now();
      let prevT = tStart;
      let flashed = false;
      let titleIn = false;
      let titleOut = false;
      let revealFlashed = false;

      const finish = () => {
        if (done) return;
        done = true;
        if (pop) { try { pop(); } catch (e) { warnDev('cinematic', e); } pop = null; }
        resolve();
      };

      // les appuis qui servaient à fermer les dialogues (A martelée ou gardée enfoncée) ne passent pas la scène : A n'y
      // peut rien ; Échap la passe, ou le bouton « Passer »
      pop = ui.input?.push?.((k, repeat) => {
        if (!repeat && (k === 'b' || k === 'start') && performance.now() - tStart > 500) {
          sound?.sfx?.('select');
          finish();
        }
      });
      skipBtn?.addEventListener?.('click', () => { sound?.sfx?.('select'); finish(); });

      if (!hasWebGL && cv2D) {
        cv2D.style.zIndex = '4';
        run2DFallback(cv2D, cfg, spriteImg, () => (performance.now() - tStart) / 1000, () => done);
      }
      if (typeof window !== 'undefined' && sceneCtrl?.resize) {
        window.addEventListener?.('resize', sceneCtrl.resize);
      }

      const shatterTime = epic ? Infinity : cfg.isShadowFull ? 2.85 : dur * 0.34;
      const titleInTime = epic ? Infinity : cfg.isShadowFull ? 4.2 : dur * 0.42;
      const titleOutTime = epic ? Infinity : cfg.isShadowFull ? 13.4 : dur * 0.88;
      const locEl = wrap.querySelector('.lugia-cine-loc');
      const cuesFaits = new Set();
      const jouerCues = (t) => {
        for (const c of epic?.cues || []) {
          if (cuesFaits.has(c) || t < c.t) continue;
          cuesFaits.add(c);
          if (c.loc) locEl?.classList?.toggle('in', c.loc === 'in');
          if (c.title === 'in') titleWrap?.classList?.add('in');
          if (c.title === 'out') { titleWrap?.classList?.remove('in'); titleWrap?.classList?.add('out'); }
          if (c.flash && flashEl) {
            flashEl.style.transition = 'opacity 0.08s ease-out';
            flashEl.style.background = c.flash; flashEl.style.opacity = String(c.o);
            scheduleFlashReset(c.ms);
          }
          if (c.blanc === true && flashEl) {
            flashEl.style.transition = 'opacity 0.35s ease-in';
            flashEl.style.background = 'radial-gradient(circle at 50% 45%, #ffffff 0%, #f3e8ff 45%, #c084fc 100%)';
            flashEl.style.opacity = '1';
          }
          if (c.blanc === false && flashEl) { flashEl.style.transition = 'opacity 0.9s ease-out'; flashEl.style.opacity = '0'; }
        }
      };

      const tick = (now) => {
        if (done) return;
        const t = (now - tStart) / 1000;
        const dt = (now - prevT) / 1000;
        prevT = now;

        if (sceneCtrl) {
          try { sceneCtrl.update(t, dt); } catch (e) { if (!tick.err) { tick.err = true; console.error('[cinématique]', e); } }
        }
        if (epic) jouerCues(t);
        if (!flashed && t >= shatterTime) {
          flashed = true;
          if (flashEl) {
            flashEl.style.background = cfg.flashHex || '#fff';
            flashEl.style.opacity = '0.92';
            scheduleFlashReset(120);
          }
        }
        if (!revealFlashed && sceneCtrl?.revealAt > 0 && t >= sceneCtrl.revealAt && flashEl) {
          revealFlashed = true;
          flashEl.style.background = '#ffffff';
          flashEl.style.opacity = '0.75';
          scheduleFlashReset(90);
        }
        if (!titleIn && t >= titleInTime) {
          titleIn = true;
          titleWrap?.classList?.add('in');
        }
        if (!titleOut && t >= titleOutTime) {
          titleOut = true;
          titleWrap?.classList?.remove('in');
          titleWrap?.classList?.add('out');
        }
        if (t >= dur) {
          finish();
          return;
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });

    // fondu au noir pour cacher la fin de la cinématique ; l'écran se rouvre une fois la scène retirée (finally)
    try { await ui.fade?.(true, 240); } catch (e) { warnDev('cinematic', e); }
    if (cfg.presetKey === 'shadow' && st?.flags) st.flags.seenLugiaCinematic = true;
  } finally {
    cleanupAll();
    if (typeof window !== 'undefined' && sceneCtrl?.resize) {
      window.removeEventListener?.('resize', sceneCtrl.resize);
    }
    try { wrap.remove(); } catch (e) { warnDev('cinematic', e); }
    try { await ui.fade?.(false, 160); } catch (e) { warnDev('cinematic', e); }
    if (sound) sound.current = null;
    game.busy = prevBusy;
  }
}

/**
 * Cinématique d'Éveil 3D complète de Lugia Obscur (compatible appels historiques).
 */
export async function playLugiaCinematic(game) {
  return playBossCinematic(game, {
    sp: 249,
    shadow: true,
    preset: 'shadow',
    title: 'LUGIA OBSCUR',
    sub: 'Gardien des Abysses · Cœur Fermé',
    badge: 'ÉVEIL OBSCUR',
    duration: 14.8,
  });
}
