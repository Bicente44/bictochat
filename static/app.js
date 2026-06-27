/* ─────────────────────────────────────────────────────────────────
   PictoChat — app.js
   Backend base URL: adjust BASE_URL if your Go server runs elsewhere.
   ───────────────────────────────────────────────────────────────── */

const BASE_URL = '';   // e.g. 'http://localhost:8080' or '' for same origin

// ─── State ──────────────────────────────────────────────────────────
let currentRoom  = null;   // room ID string, e.g. "A"
let currentUser  = null;   // username string
let pollInterval = null;   // setInterval handle
let roomRefreshInterval = null; // setInterval handle for room list

// ─── Canvas state ────────────────────────────────────────────────────
let isDrawing    = false;
let lastX        = 0;
let lastY        = 0;
let currentColor = '#1A1A1A';
let currentSize  = 3;

// ─── DOM refs ────────────────────────────────────────────────────────
const canvas     = document.getElementById('drawing-canvas');
const ctx        = canvas.getContext('2d');
const messageLog = document.getElementById('message-log');
const emptyState = document.getElementById('empty-state');

// ─── View Management ─────────────────────────────────────────────────

/**
 * showView(id) — hides all views, shows the one with the given id.
 * @param {'room-list'|'username-prompt'|'chat-room'} id
 */
function showView(id) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

// ─── Room List ───────────────────────────────────────────────────────

/**
 * loadRooms() — fetches GET /rooms and renders the 8 room cards.
 * On network error, renders stale cards with unknown counts.
 */
async function loadRooms() {
  let rooms = [];

  try {
    const res = await fetch(`${BASE_URL}/rooms`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    // Build a map from the response array: { A: 2, B: 0, ... }
    const countMap = {};
    data.forEach(r => { countMap[r.roomID] = r.count; });

    // Always render all 8 rooms A–H
    rooms = 'ABCDEFGH'.split('').map(letter => ({
      roomID: letter,
      count:  countMap[letter] ?? 0,
    }));
  } catch (err) {
    console.warn('loadRooms: fetch failed, rendering placeholders', err);
    rooms = 'ABCDEFGH'.split('').map(letter => ({ roomID: letter, count: 0 }));
  }

  renderRoomCards(rooms);
}

/**
 * renderRoomCards(rooms) — builds the room grid from room data.
 * @param {{ roomID: string, count: number }[]} rooms
 */
function renderRoomCards(rooms) {
  const grid = document.getElementById('room-grid');
  grid.innerHTML = '';

  const MAX_USERS = 4;

  rooms.forEach(({ roomID, count }) => {
    const isFull = count >= MAX_USERS;

    const card = document.createElement('button');
    card.className = `room-card${isFull ? ' room-full' : ''}`;
    card.setAttribute('aria-label', `Room ${roomID}, ${count} of ${MAX_USERS} users${isFull ? ', full' : ''}`);
    card.disabled = isFull;

    // LED colour tier
    let ledClass = 'led-empty';
    if (count >= MAX_USERS)      ledClass = 'led-full';
    else if (count >= MAX_USERS / 2) ledClass = 'led-medium';
    else if (count > 0)          ledClass = 'led-low';

    card.innerHTML = `
      <span class="room-letter">${roomID}</span>
      <div class="room-status">
        <span class="room-led ${ledClass}"></span>
        <span class="room-count-text">${count}/${MAX_USERS}</span>
      </div>
    `;

    if (!isFull) {
      card.addEventListener('click', () => selectRoom(roomID));
    }

    grid.appendChild(card);
  });
}

/**
 * selectRoom(roomID) — saves the chosen room and shows the username prompt.
 */
function selectRoom(roomID) {
  currentRoom = roomID;
  document.getElementById('prompt-room-badge').textContent = `Room ${roomID}`;
  document.getElementById('username-input').value = '';
  clearUsernameError();
  showView('username-prompt');
  // Auto-focus the input after transition
  setTimeout(() => document.getElementById('username-input').focus(), 50);
}

// ─── Username Prompt ─────────────────────────────────────────────────

function showUsernameError(msg) {
  const input = document.getElementById('username-input');
  const err   = document.getElementById('username-error');
  input.classList.add('input-error');
  err.textContent = msg;
}

function clearUsernameError() {
  const input = document.getElementById('username-input');
  const err   = document.getElementById('username-error');
  input.classList.remove('input-error');
  err.textContent = '';
}

/**
 * joinRoom() — validates the username client-side, then POSTs to /join.
 * Shows view transition only on success.
 */
async function joinRoom() {
  const raw      = document.getElementById('username-input').value;
  const username = raw.trim();

  // ── Client-side validation ──
  if (!username) {
    showUsernameError('Username cannot be empty.');
    document.getElementById('username-input').focus();
    return;
  }
  if (username.length < 2) {
    showUsernameError('At least 2 characters, please.');
    document.getElementById('username-input').focus();
    return;
  }
  // Basic: no control characters
  if (/[^\x20-\x7E]/.test(username)) {
    showUsernameError('Only standard characters allowed.');
    document.getElementById('username-input').focus();
    return;
  }

  clearUsernameError();

  const joinBtn = document.getElementById('join-btn');
  joinBtn.disabled = true;
  joinBtn.textContent = 'Joining…';

  try {
    const res = await fetch(`${BASE_URL}/join?roomID=${encodeURIComponent(currentRoom)}&username=${encodeURIComponent(username)}`, {
      method: 'POST',
    });

    if (res.status === 409) {
      showUsernameError('That name is taken in this room. Try another.');
      return;
    }
    if (res.status === 403) {
      showUsernameError('Room is full. Go back and choose another.');
      return;
    }
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      showUsernameError(text || `Server error (${res.status}). Try again.`);
      return;
    }

    // ── Success ──
    currentUser = username;
    document.getElementById('chat-room-id').textContent = currentRoom;
    document.getElementById('chat-username').textContent = username;

    messageLog.innerHTML = '';
    messageLog.appendChild(emptyState);
    emptyState.style.display = 'flex';

    showView('chat-room');
    resizeCanvas();  // must come after view is visible — canvas has no size until then
    clearCanvas();
    startPolling();

    // Stop refreshing room list while in chat
    if (roomRefreshInterval) {
      clearInterval(roomRefreshInterval);
      roomRefreshInterval = null;
    }

  } catch (err) {
    console.error('joinRoom error:', err);
    showUsernameError('Connection failed. Is the server running?');
  } finally {
    joinBtn.disabled = false;
    joinBtn.textContent = 'Join Room';
  }
}

// ─── Polling ─────────────────────────────────────────────────────────

/**
 * startPolling() — calls /poll every 2 seconds and re-renders messages.
 */
function startPolling() {
  stopPolling();
  poll();  // immediate first fetch
  pollInterval = setInterval(poll, 2000);
}

function stopPolling() {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
}

async function poll() {
  if (!currentRoom || !currentUser) return;

  try {
    const res = await fetch(`${BASE_URL}/poll?roomID=${encodeURIComponent(currentRoom)}&username=${encodeURIComponent(currentUser)}`);
    if (!res.ok) return;
    const messages = await res.json();
    renderMessages(messages);
  } catch (err) {
    // Silently ignore poll failures — next tick will retry
    console.warn('poll error:', err);
  }
}

// ─── Messages ────────────────────────────────────────────────────────

/**
 * renderMessages(messages) — clears the log and re-renders the full
 * message history. Keeps scroll pinned to bottom if user is near it.
 *
 * @param {{ Sender: string, Drawing: string, TimeSent: string }[]} messages
 */
function renderMessages(messages) {
  if (!Array.isArray(messages)) return;

  // Detect if user is scrolled near bottom (within 60px)
  const nearBottom = messageLog.scrollHeight - messageLog.scrollTop - messageLog.clientHeight < 60;

  // Clear existing bubbles (keep emptyState node intact)
  messageLog.innerHTML = '';

  if (!messages.length) {
    messageLog.appendChild(emptyState);
    emptyState.style.display = 'flex';
    return;
  }

  emptyState.style.display = 'none';

  messages.forEach(msg => {
    const isMine  = msg.Sender === currentUser;
    const timeStr = formatTime(msg.TimeSent);

    const bubble = document.createElement('div');
    bubble.className = `message-bubble ${isMine ? 'mine' : 'theirs'}`;

    bubble.innerHTML = `
      <span class="bubble-sender">${escapeHTML(msg.Sender)}</span>
      <div class="bubble-body">
        <img class="bubble-image" src="${msg.Drawing}" alt="Drawing by ${escapeHTML(msg.Sender)}" loading="lazy" />
      </div>
      <span class="bubble-time">${timeStr}</span>
    `;

    messageLog.appendChild(bubble);
  });

  // Auto-scroll if we were near the bottom
  if (nearBottom) {
    messageLog.scrollTop = messageLog.scrollHeight;
  }
}

function formatTime(isoString) {
  try {
    const d = new Date(isoString);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

function escapeHTML(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ─── Send Message ────────────────────────────────────────────────────

/**
 * sendMessage() — exports the canvas as a PNG data URL and POSTs to /send.
 * Validates that the canvas isn't blank before sending.
 */
async function sendMessage() {
  if (!currentRoom || !currentUser) return;

  // Guard: check canvas is not blank (all pixels white)
  if (isCanvasBlank()) {
    // Visual feedback: shake the send button
    const btn = document.getElementById('send-btn');
    btn.classList.add('shake');
    setTimeout(() => btn.classList.remove('shake'), 400);
    return;
  }

  const imageData = canvas.toDataURL('image/png');

  const sendBtn = document.getElementById('send-btn');
  sendBtn.disabled = true;
  sendBtn.textContent = 'Sending…';

  try {
    const res = await fetch(`${BASE_URL}/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
      roomID:   currentRoom,
      username: currentUser,
      drawing:  imageData,
      }),
    });

    if (res.ok) {
      clearCanvas();
      await poll();  // immediate refresh
    } else {
      console.error('send failed:', res.status);
    }
  } catch (err) {
    console.error('sendMessage error:', err);
  } finally {
    sendBtn.disabled = false;
    sendBtn.textContent = 'Send ↑';
  }
}

function isCanvasBlank() {
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  for (let i = 0; i < data.length; i += 4) {
    // If any pixel is not fully white, canvas has content
    if (data[i] < 255 || data[i+1] < 255 || data[i+2] < 255) return false;
  }
  return true;
}

// ─── Leave Room ──────────────────────────────────────────────────────

/**
 * leaveUrl() — builds the /leave URL with query params.
 * Backend expects: POST /leave?roomID=A&username=bob
 */
function leaveUrl(room, user) {
  return `${BASE_URL}/leave?roomID=${encodeURIComponent(room)}&username=${encodeURIComponent(user)}`;
}

/**
 * notifyLeave(room, user) — fires a best-effort POST to /leave.
 * Uses sendBeacon when available so it survives page unload.
 */
function notifyLeave(room, user) {
  if (!room || !user) return;
  const url = leaveUrl(room, user);
  // sendBeacon keeps the request alive through tab close / navigation
  if (navigator.sendBeacon) {
    navigator.sendBeacon(url);
  } else {
    fetch(url, { method: 'POST' }).catch(() => {});
  }
}

async function leaveRoom() {
  stopPolling();
  notifyLeave(currentRoom, currentUser);
  currentRoom = null;
  currentUser = null;
  showView('room-list');
  loadRooms();
  startRoomRefresh();
}

// ─── Canvas ───────────────────────────────────────────────────────────

/**
 * resizeCanvas() — fits the canvas pixel buffer to its rendered CSS size.
 * Must be called after the chat view is visible in the DOM.
 * getBoundingClientRect gives the true rendered size in fractional CSS pixels.
 * ctx.scale(dpr, dpr) means all draw calls use CSS pixel coords — no manual
 * division needed in pointer handlers.
 */
function resizeCanvas() {
  const dpr  = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();

  canvas.width  = Math.round(rect.width  * dpr);
  canvas.height = Math.round(rect.height * dpr);

  ctx.scale(dpr, dpr);

  // White background — without this the canvas is transparent / invisible
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, rect.width, rect.height);

  ctx.lineCap     = 'round';
  ctx.lineJoin    = 'round';
  ctx.strokeStyle = currentColor;
  ctx.lineWidth   = currentSize;
}

function clearCanvas() {
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = currentColor;
  ctx.lineWidth   = currentSize;
}

// ── Pointer helpers ─────────────────────────────────────────────────

function getCanvasPos(e) {
  // getBoundingClientRect gives the canvas position relative to the viewport.
  // Subtracting it converts viewport-relative client coords into canvas-local coords.
  const rect    = canvas.getBoundingClientRect();
  const clientX = e.touches ? e.touches[0].clientX : e.clientX;
  const clientY = e.touches ? e.touches[0].clientY : e.clientY;
  return {
    x: clientX - rect.left,
    y: clientY - rect.top,
  };
}

function startDraw(e) {
  e.preventDefault();
  isDrawing = true;
  const { x, y } = getCanvasPos(e);
  lastX = x;
  lastY = y;
  // Dot for single tap/click
  ctx.beginPath();
  ctx.arc(x, y, currentSize / 2, 0, Math.PI * 2);
  ctx.fillStyle = currentColor;
  ctx.fill();
}

function draw(e) {
  if (!isDrawing) return;
  e.preventDefault();
  const { x, y } = getCanvasPos(e);
  ctx.beginPath();
  ctx.moveTo(lastX, lastY);
  ctx.lineTo(x, y);
  ctx.strokeStyle = currentColor;
  ctx.lineWidth   = currentSize;
  ctx.stroke();
  lastX = x;
  lastY = y;
}

function endDraw(e) {
  if (!isDrawing) return;
  e.preventDefault();
  isDrawing = false;
}

// ─── Toolbar interactions ─────────────────────────────────────────────

function initToolbar() {
  // Color swatches
  document.querySelectorAll('.swatch').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.swatch').forEach(s => s.classList.remove('active'));
      btn.classList.add('active');
      currentColor = btn.dataset.color;
      ctx.strokeStyle = currentColor;
    });
  });

  // Thickness buttons
  document.querySelectorAll('.thickness-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.thickness-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentSize = parseInt(btn.dataset.size, 10);
      ctx.lineWidth = currentSize;
    });
  });
}

// ─── Room auto-refresh ────────────────────────────────────────────────

function startRoomRefresh() {
  if (roomRefreshInterval) clearInterval(roomRefreshInterval);
  roomRefreshInterval = setInterval(loadRooms, 5000);
}

// ─── Event Listeners ─────────────────────────────────────────────────

function initEventListeners() {
  // Back button on username prompt
  document.getElementById('back-btn').addEventListener('click', () => {
    currentRoom = null;
    showView('room-list');
  });

  // Join button
  document.getElementById('join-btn').addEventListener('click', joinRoom);

  // Username input — clear error on typing, submit on Enter
  document.getElementById('username-input').addEventListener('input', clearUsernameError);
  document.getElementById('username-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') joinRoom();
  });

  // Leave button
  document.getElementById('leave-btn').addEventListener('click', leaveRoom);

  // Send / clear buttons
  document.getElementById('send-btn').addEventListener('click', sendMessage);
  document.getElementById('clear-btn').addEventListener('click', clearCanvas);

  // Canvas — mouse
  canvas.addEventListener('mousedown',  startDraw);
  canvas.addEventListener('mousemove',  draw);
  canvas.addEventListener('mouseup',    endDraw);
  canvas.addEventListener('mouseleave', endDraw);

  // Canvas — touch
  canvas.addEventListener('touchstart', startDraw, { passive: false });
  canvas.addEventListener('touchmove',  draw,      { passive: false });
  canvas.addEventListener('touchend',   endDraw,   { passive: false });

  // Resize: re-fit canvas when window resizes (e.g. orientation change)
  window.addEventListener('resize', () => {
    if (currentRoom) resizeCanvas();
  });

  // Tab/browser close — sendBeacon survives where fetch wouldn't.
  window.addEventListener('beforeunload', () => {
    stopPolling();
    notifyLeave(currentRoom, currentUser);
  });
}

// ─── Init ─────────────────────────────────────────────────────────────

function init() {
  initEventListeners();
  initToolbar();
  loadRooms();
  startRoomRefresh();
}

document.addEventListener('DOMContentLoaded', init);
