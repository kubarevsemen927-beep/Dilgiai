'use strict';

// ===== Долги AI — вся логика =====
// Бесплатный ИИ без ключей, до 100 попыток достучаться.

const API_URL = 'https://text.pollinations.ai/openai';
const MAX_ATTEMPTS = 100;      // попыток достучаться до ИИ
const RETRY_DELAY = 1500;      // мс между попытками

const $ = (id) => document.getElementById(id);

const els = {
  burger: $('burger'),
  sidebar: $('sidebar'),
  overlay: $('overlay'),
  chatList: $('chat-list'),
  newChat: $('new-chat'),
  saveBtn: $('save-chats'),
  loadBtn: $('load-chats'),
  loadFile: $('load-file'),
  warning: $('storage-warning'),
  messages: $('messages'),
  placeholder: $('placeholder'),
  form: $('input-area'),
  input: $('user-input'),
  send: $('send-btn'),
};

// ---------- Хранилище ----------
const STORE_KEY = 'dolgi_ai_chats_v1';

function loadStore() {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY)) || { chats: [], active: null };
  } catch (e) {
    return { chats: [], active: null };
  }
}

function saveStore() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(store));
    localStorage.setItem('dolgi_ai_probe', '1');
  } catch (e) { /* браузер не разрешает — покажем плашку */ }
}

let store = loadStore();

// Проверка: сохраняет ли браузер данные (для файлов с компьютера часто нет)
function checkStorage() {
  try {
    localStorage.setItem('dolgi_ai_probe', '1');
    const ok = localStorage.getItem('dolgi_ai_probe') === '1';
    localStorage.removeItem('dolgi_ai_probe');
    if (!ok) els.warning.classList.remove('hidden');
  } catch (e) {
    els.warning.classList.remove('hidden');
  }
}

function currentChat() {
  return store.chats.find((c) => c.id === store.active) || null;
}

function newChatObj() {
  return { id: 'c' + Date.now(), title: 'Новый чат', messages: [] };
}

// ---------- Панель истории ----------
function toggleSidebar(force) {
  const open = typeof force === 'boolean' ? force : els.sidebar.classList.contains('hidden');
  els.sidebar.classList.toggle('hidden', !open);
  els.overlay.classList.toggle('hidden', !open);
  document.body.classList.toggle('side-open', open);
  els.burger.textContent = open ? '✕' : '☰';
}

els.burger.addEventListener('click', () => toggleSidebar());
els.overlay.addEventListener('click', () => toggleSidebar(false));
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') toggleSidebar(false);
});

// ---------- Рендер списка чатов ----------
function renderChatList() {
  els.chatList.innerHTML = '';
  for (const chat of store.chats) {
    const div = document.createElement('div');
    div.className = 'chat-item' + (chat.id === store.active ? ' active' : '');
    const title = document.createElement('span');
    title.className = 'title';
    title.textContent = chat.title;
    const del = document.createElement('span');
    del.className = 'del';
    del.textContent = '✕';
    del.title = 'Удалить чат';
    del.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteChat(chat.id);
    });
    div.append(title, del);
    div.addEventListener('click', () => {
      store.active = chat.id;
      saveStore();
      renderChatList();
      renderMessages();
      if (window.innerWidth <= 640) toggleSidebar(false);
    });
    els.chatList.appendChild(div);
  }
}

function deleteChat(id) {
  store.chats = store.chats.filter((c) => c.id !== id);
  if (store.active === id) {
    store.active = store.chats.length ? store.chats[0].id : null;
  }
  if (!store.chats.length) store.chats = [];
  saveStore();
  renderChatList();
  renderMessages();
}

els.newChat.addEventListener('click', () => {
  const chat = newChatObj();
  store.chats.unshift(chat);
  store.active = chat.id;
  saveStore();
  renderChatList();
  renderMessages();
  toggleSidebar(false);
  els.input.focus();
});

// ---------- Рендер сообщений ----------
function renderMessages() {
  els.messages.innerHTML = '';
  const chat = currentChat();
  const empty = !chat || chat.messages.length === 0;
  els.placeholder.classList.toggle('hidden', !empty);
  if (!chat) return;
  for (const m of chat.messages) {
    addBubble(m.role, m.content);
  }
  scrollDown();
}

function addBubble(role, text) {
  const div = document.createElement('div');
  div.className = 'msg ' + (role === 'user' ? 'user' : 'bot');
  div.textContent = text;
  els.messages.appendChild(div);
}

function addError(text) {
  const div = document.createElement('div');
  div.className = 'msg error';
  div.textContent = text;
  els.messages.appendChild(div);
}

function scrollDown() {
  els.messages.scrollTop = els.messages.scrollHeight;
}

function showDots() {
  const d = document.createElement('div');
  d.className = 'dots';
  d.innerHTML = '<i></i><i></i><i></i>';
  els.messages.appendChild(d);
  scrollDown();
  return d;
}

// ---------- Запрос к ИИ: до 100 попыток ----------
async function askAI(history) {
  const body = {
    model: 'openai',
    messages: [
      { role: 'system', content: 'Ты — Долги AI, дружелюбный премиальный ассистент. Отвечай по-русски, ясно и по делу.' },
      ...history.map((m) => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.content })),
    ],
  };

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      const text = data && data.choices && data.choices[0] && data.choices[0].message
        ? data.choices[0].message.content : null;
      if (text) return text.trim();
      throw new Error('пустой ответ');
    } catch (e) {
      if (attempt < MAX_ATTEMPTS) {
        await new Promise((r) => setTimeout(r, RETRY_DELAY));
      }
    }
  }
  return null;
}

// ---------- Отправка ----------
els.form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = els.input.value.trim();
  if (!text) return;

  if (!store.chats.length) {
    const chat = newChatObj();
    store.chats.push(chat);
    store.active = chat.id;
  }
  const chat = currentChat();
  if (!chat.messages.length) chat.title = text.slice(0, 32) || 'Новый чат';

  chat.messages.push({ role: 'user', content: text });
  addBubble('user', text);
  els.input.value = '';
  els.input.style.height = 'auto';
  saveStore();
  renderChatList();
  scrollDown();

  els.send.disabled = true;
  const dots = showDots();

  const answer = await askAI(chat.messages);
  dots.remove();

  if (answer) {
    chat.messages.push({ role: 'assistant', content: answer });
    saveStore();
    addBubble('assistant', answer);
  } else {
    addError('Не смогла достучаться до ИИ за ' + MAX_ATTEMPTS + ' попыток. Проверьте интернет и попробуйте ещё раз — история чата сохранена.');
  }
  els.send.disabled = false;
  scrollDown();
  els.input.focus();
});

els.input.addEventListener('input', () => {
  els.input.style.height = 'auto';
  els.input.style.height = Math.min(els.input.scrollHeight, 140) + 'px';
});

// ---------- Резервные копии ----------
els.saveBtn.addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(store, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'dolgi_ai_chats.json';
  a.click();
  URL.revokeObjectURL(a.href);
});

els.loadBtn.addEventListener('click', () => els.loadFile.click());

els.loadFile.addEventListener('change', () => {
  const file = els.loadFile.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (data && Array.isArray(data.chats)) {
        store = data;
        saveStore();
        renderChatList();
        renderMessages();
      }
    } catch (e) {
      alert('Не удалось прочитать файл резервной копии.');
    }
  };
  reader.readAsText(file);
  els.loadFile.value = '';
});

// ---------- Старт ----------
if (!store.chats.length) {
  const chat = newChatObj();
  store.chats.push(chat);
  store.active = chat.id;
  saveStore();
}
checkStorage();
renderChatList();
renderMessages();
