// chatModal.js - Roue d'émotes pixel-art et saisie de message rapide multijoueur
import { el, esc } from './ui.js';

const EMOTES = [
  { id: 'wave', label: 'Salut !', icon: '👋' },
  { id: 'heart', label: 'Cœur', icon: '❤️' },
  { id: 'sword', label: 'Duel ?', icon: '⚔️' },
  { id: 'trade', label: 'Échange', icon: '🔄' },
  { id: 'star', label: 'Bravo !', icon: '⭐' },
  { id: 'excl', label: 'Hé !', icon: '❗' },
  { id: 'fish', label: 'Pêche', icon: '🎣' },
  { id: 'sleep', label: 'Dodo', icon: '😴' },
];

export function openChatModal(game) {
  if (game.busy || !game.input.free || game.bv?.alive) return;
  game.busy = true;

  const overlay = el('div', 'chat-modal-overlay');
  const box = el('div', 'chat-modal');
  box.innerHTML = `
    <div class="chat-modal-head">
      <div class="cm-title"><img src="img/hud/chat.png" alt="" class="cm-ico"><span>COMMUNICATION EN DIRECT</span></div>
      <button type="button" class="cm-close-btn" title="Fermer (Échap)">✕</button>
    </div>
    <div class="chat-emotes-title">Émotes rapides :</div>
    <div class="chat-emotes-grid">
      ${EMOTES.map((e) => `
        <button type="button" class="chat-emote-btn" data-emote="${e.icon}" data-label="${e.label}" title="${e.label}">
          <span class="ce-ico">${e.icon}</span>
          <span class="ce-lbl">${e.label}</span>
        </button>
      `).join('')}
    </div>
    <div class="chat-input-row">
      <input type="text" class="chat-input-field" maxlength="40" placeholder="Tape un message pour les dresseurs..." autofocus>
      <button type="button" class="chat-send-btn">ENVOYER</button>
    </div>
  `;
  overlay.appendChild(box);
  game.ui.root.appendChild(overlay);

  const inputEl = box.querySelector('.chat-input-field');
  const sendBtn = box.querySelector('.chat-send-btn');
  const closeBtn = box.querySelector('.cm-close-btn');

  let closed = false;
  let popKey = null;
  const close = () => {
    if (closed) return;
    closed = true;
    popKey?.();
    overlay.remove();
    game.busy = false;
    try { (game.sound || game.ui?.sound)?.sfx?.('cancel'); } catch (e) {}
  };

  const send = (text, emote) => {
    if (closed) return;
    closed = true;
    popKey?.();
    overlay.remove();
    game.busy = false;
    game.broadcastChat(text, emote);
  };

  closeBtn.addEventListener('click', close);
  popKey = game.input?.push?.((k) => { if (k === 'b') close(); });
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });

  box.querySelectorAll('.chat-emote-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      send('', btn.dataset.emote);
    });
  });

  sendBtn.addEventListener('click', () => {
    const val = inputEl.value.trim();
    if (val) send(val, '');
    else close();
  });

  inputEl.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') {
      const val = inputEl.value.trim();
      if (val) send(val, '');
      else close();
    } else if (e.key === 'Escape') {
      close();
    }
  });

  setTimeout(() => inputEl.focus(), 50);
}
