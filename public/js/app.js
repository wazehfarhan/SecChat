/**
 * public/js/app.js
 *
 * VanishChat — Client-side application logic.
 * Handles: routing between views, room creation, joining,
 *          Socket.IO real-time events, E2E encryption/decryption.
 */

"use strict";

// ────────────────────────────────────────────────────────────
// State
// ────────────────────────────────────────────────────────────
let socket = null; // Socket.IO instance
let cryptoKey = null; // CryptoKey object for E2E encryption
let myNickname = null; // This session's nickname

// ────────────────────────────────────────────────────────────
// DOM References (populated after DOMContentLoaded)
// ────────────────────────────────────────────────────────────
let views, homeView, chatView, expiredView;
let createForm, joinForm;
let createTypeSelect,
  createExpirySelect,
  customExpiryWrapper,
  customExpiryInput;
let joinCodeInput;
let nicknameModal, nicknameInput, nicknameConfirmBtn;
let messagesContainer, messageInput, sendBtn;
let roomCodeDisplay, roomTimerDisplay, roomTypeDisplay;
let copyCodeBtn;

// ────────────────────────────────────────────────────────────
// Utilities
// ────────────────────────────────────────────────────────────

/** Sanitise a string for safe insertion as textContent (no HTML injection). */
function sanitize(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

/** Show one named view, hide all others. */
function showView(name) {
  document.querySelectorAll(".view").forEach((v) => v.classList.add("hidden"));
  document.getElementById(`view-${name}`).classList.remove("hidden");
}

/** Append a message bubble to the chat window. */
function appendMessage({
  nickname,
  text,
  ts,
  isSystem = false,
  isMine = false,
}) {
  const wrapper = document.createElement("div");

  if (isSystem) {
    wrapper.className = "msg-system";
    wrapper.textContent = text;
  } else {
    wrapper.className = `msg-bubble ${isMine ? "msg-mine" : "msg-theirs"}`;

    const nick = document.createElement("span");
    nick.className = "msg-nick";
    nick.textContent = nickname;

    const body = document.createElement("p");
    body.className = "msg-text";
    body.textContent = text; // textContent prevents XSS — NEVER use innerHTML here

    const time = document.createElement("span");
    time.className = "msg-time";
    const d = ts ? new Date(ts) : new Date();
    time.textContent = d.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });

    wrapper.append(nick, body, time);
  }

  messagesContainer.appendChild(wrapper);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// ────────────────────────────────────────────────────────────
// Countdown Timer (shown inside chat header)
// ────────────────────────────────────────────────────────────
let timerInterval = null;

function startTimer(expiresAt) {
  if (timerInterval) clearInterval(timerInterval);

  function tick() {
    const remaining = Math.max(0, new Date(expiresAt) - Date.now());
    const h = Math.floor(remaining / 3_600_000);
    const m = Math.floor((remaining % 3_600_000) / 60_000);
    const s = Math.floor((remaining % 60_000) / 1_000);
    const hh = String(h).padStart(2, "0");
    const mm = String(m).padStart(2, "0");
    const ss = String(s).padStart(2, "0");
    roomTimerDisplay.textContent = `Expires in ${hh}:${mm}:${ss}`;

    if (remaining <= 60_000) {
      roomTimerDisplay.classList.add("timer-warning");
    }
    if (remaining <= 0) {
      clearInterval(timerInterval);
      roomTimerDisplay.textContent = "Session expired";
    }
  }

  tick();
  timerInterval = setInterval(tick, 1000);
}

function stopTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

// ────────────────────────────────────────────────────────────
// Nickname Modal
// ────────────────────────────────────────────────────────────

function promptNickname() {
  return new Promise((resolve) => {
    nicknameModal.classList.remove("hidden");
    nicknameInput.value = "";
    nicknameInput.focus();

    function confirm() {
      const nick = nicknameInput.value.trim().slice(0, 32);
      if (!nick) {
        nicknameInput.classList.add("input-error");
        return;
      }
      nicknameInput.classList.remove("input-error");
      nicknameModal.classList.add("hidden");
      nicknameConfirmBtn.removeEventListener("click", confirm);
      nicknameInput.removeEventListener("keydown", keyHandler);
      resolve(nick);
    }

    function keyHandler(e) {
      if (e.key === "Enter") confirm();
    }

    nicknameConfirmBtn.addEventListener("click", confirm);
    nicknameInput.addEventListener("keydown", keyHandler);
  });
}

// ────────────────────────────────────────────────────────────
// Socket.IO Connection
// ────────────────────────────────────────────────────────────

function connectSocket() {
  if (socket && socket.connected) return;
  socket = io({ transports: ["websocket", "polling"] });

  // ── Connection error handling ─────────────────────────────
  socket.on("connect_error", (err) => {
    console.error("[Socket] Connection error:", err.message);
    alert(
      "⚠️ Failed to connect to the server. Please check your internet connection and try again.",
    );
  });

  socket.on("disconnect", (reason) => {
    console.log("[Socket] Disconnected:", reason);
    // Only show alert if not intentional (user left or room expired)
    if (
      reason !== "io client disconnect" &&
      reason !== "namespace disconnect"
    ) {
      alert("⚠️ Connection lost. Trying to reconnect...");
    }
  });

  socket.on("reconnect", (attemptNumber) => {
    console.log("[Socket] Reconnected after", attemptNumber, "attempts");
    appendMessage({ isSystem: true, text: "Connection restored." });
  });

  socket.on("reconnect_failed", () => {
    console.error("[Socket] Reconnection failed");
    alert("⚠️ Could not reconnect to the server. Please refresh the page.");
  });

  // ── Room joined confirmation ───────────────────────────
  socket.on("chat:joined", ({ roomCode, type, expiresAt, nickname }) => {
    roomCodeDisplay.textContent = roomCode;
    roomTypeDisplay.textContent =
      type === "single" ? "🔒 Private (1-on-1)" : "👥 Group";
    startTimer(expiresAt);
    showView("chat");
    appendMessage({
      isSystem: true,
      text: `You joined as "${nickname}". Messages are end-to-end encrypted.`,
    });
  });

  // ── Incoming message ──────────────────────────────────
  socket.on("chat:message", async ({ nickname, content, iv, ts }) => {
    let text;
    try {
      text = await VanishCrypto.decrypt(cryptoKey, content, iv);
    } catch {
      text = "[Encrypted message — key mismatch]";
    }
    appendMessage({
      nickname,
      text,
      ts,
      isMine: nickname === myNickname,
    });
  });

  // ── Chat history (sent on join) ────────────────────────
  socket.on("chat:history", async ({ messages }) => {
    for (const msg of messages) {
      let text;
      try {
        text = await VanishCrypto.decrypt(cryptoKey, msg.content, msg.iv);
      } catch {
        text = "[Encrypted message — cannot decrypt]";
      }
      appendMessage({
        nickname: msg.nickname,
        text,
        ts: msg.sent_at,
        isMine: msg.nickname === myNickname,
      });
    }
  });

  // ── System events (join/leave) ─────────────────────────
  socket.on("chat:system", ({ text, ts }) => {
    appendMessage({ isSystem: true, text, ts });
  });

  // ── Room expired ───────────────────────────────────────
  socket.on("room:expired", () => {
    stopTimer();
    socket.disconnect();
    showView("expired");
  });

  // ── Errors ─────────────────────────────────────────────
  socket.on("error:room", ({ message }) => {
    alert("⚠️ " + message);
    showView("home");
  });
}

// ────────────────────────────────────────────────────────────
// Room Creation
// ────────────────────────────────────────────────────────────

async function handleCreateRoom(e) {
  e.preventDefault();

  const type = createTypeSelect.value;
  const expiryType = createExpirySelect.value;
  const customExpiry =
    expiryType === "custom" ? customExpiryInput.value : undefined;

  if (expiryType === "custom" && !customExpiry) {
    alert("Please pick a custom expiry date/time.");
    return;
  }

  try {
    const res = await fetch("/api/rooms/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, expiryType, customExpiry }),
    });
    const data = await res.json();

    if (!res.ok) {
      alert("Error: " + (data.error || "Could not create room."));
      return;
    }

    // Generate E2E key and put it in the URL hash
    const { cryptoKey: key, b64Key } = await VanishCrypto.generateKey();
    cryptoKey = key;

    // The hash is never sent to the server — share the full URL with others
    const shareUrl = `${location.origin}/?join=${data.roomCode}#${b64Key}`;

    // Show share dialog
    const proceed = window.confirm(
      `Room created! 🎉\n\nRoom Code: ${data.roomCode}\n\nShare this full URL with participants (the key after # is required for decryption):\n\n${shareUrl}\n\nClick OK to enter the room as creator.`,
    );

    if (!proceed) return;

    // Navigate to join flow
    window.history.pushState({}, "", `/?join=${data.roomCode}#${b64Key}`);
    await enterRoom(data.roomCode);
  } catch (err) {
    console.error("createRoom error:", err);
    alert("Network error. Please try again.");
  }
}

// ────────────────────────────────────────────────────────────
// Room Joining
// ────────────────────────────────────────────────────────────

async function handleJoinRoom(e) {
  e.preventDefault();

  const code = joinCodeInput.value.trim().toUpperCase().slice(0, 6);
  const hash = location.hash.slice(1); // Remove leading #

  if (!hash) {
    alert(
      "⚠️ No encryption key found in URL. Ask the room creator to share the full URL (including the part after #).",
    );
    return;
  }

  try {
    cryptoKey = await VanishCrypto.importKey(hash);
  } catch {
    alert("⚠️ Invalid encryption key in URL.");
    return;
  }

  await enterRoom(code);
}

async function enterRoom(roomCode) {
  // 1. Verify room via HTTP
  const res = await fetch("/api/rooms/join", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ roomCode }),
  });
  const data = await res.json();

  if (!res.ok) {
    if (res.status === 410) {
      showView("expired");
    } else {
      alert("Error: " + (data.error || "Could not join room."));
    }
    return;
  }

  // 2. Get nickname
  myNickname = await promptNickname();

  // 3. Connect Socket.IO and emit join
  connectSocket();
  messagesContainer.innerHTML = ""; // Clear previous chat history
  socket.emit("chat:join", { roomCode: data.roomCode, nickname: myNickname });
}

// ────────────────────────────────────────────────────────────
// Send Message
// ────────────────────────────────────────────────────────────

async function sendMessage() {
  const text = messageInput.value.trim();
  if (!text || !socket || !cryptoKey) return;

  try {
    const { ciphertext, iv } = await VanishCrypto.encrypt(cryptoKey, text);
    socket.emit("chat:message", { content: ciphertext, iv });
    messageInput.value = "";
    messageInput.focus();
  } catch (err) {
    console.error("Encrypt/send error:", err);
    alert("Failed to send message. Encryption error.");
  }
}

// ────────────────────────────────────────────────────────────
// Init
// ────────────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", () => {
  // Bind DOM references
  homeView = document.getElementById("view-home");
  chatView = document.getElementById("view-chat");
  expiredView = document.getElementById("view-expired");
  createForm = document.getElementById("create-form");
  joinForm = document.getElementById("join-form");
  createTypeSelect = document.getElementById("create-type");
  createExpirySelect = document.getElementById("create-expiry");
  customExpiryWrapper = document.getElementById("custom-expiry-wrapper");
  customExpiryInput = document.getElementById("custom-expiry");
  joinCodeInput = document.getElementById("join-code");
  nicknameModal = document.getElementById("nickname-modal");
  nicknameInput = document.getElementById("nickname-input");
  nicknameConfirmBtn = document.getElementById("nickname-confirm");
  messagesContainer = document.getElementById("messages");
  messageInput = document.getElementById("message-input");
  sendBtn = document.getElementById("send-btn");
  roomCodeDisplay = document.getElementById("room-code-display");
  roomTimerDisplay = document.getElementById("room-timer");
  roomTypeDisplay = document.getElementById("room-type-display");
  copyCodeBtn = document.getElementById("copy-code-btn");

  // Show/hide custom expiry input
  createExpirySelect.addEventListener("change", () => {
    customExpiryWrapper.classList.toggle(
      "hidden",
      createExpirySelect.value !== "custom",
    );
  });

  // Set minimum datetime for custom expiry picker to now
  customExpiryInput.min = new Date(Date.now() + 60_000)
    .toISOString()
    .slice(0, 16);

  // Form handlers
  createForm.addEventListener("submit", handleCreateRoom);
  joinForm.addEventListener("submit", handleJoinRoom);

  // Send button + Enter key in message box
  sendBtn.addEventListener("click", sendMessage);
  messageInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  // Copy room code to clipboard
  copyCodeBtn.addEventListener("click", () => {
    navigator.clipboard.writeText(roomCodeDisplay.textContent).then(() => {
      copyCodeBtn.textContent = "✅ Copied!";
      setTimeout(() => {
        copyCodeBtn.textContent = "📋 Copy Code";
      }, 2000);
    });
  });

  // Home button in expired view
  document.getElementById("go-home-btn").addEventListener("click", () => {
    stopTimer();
    showView("home");
  });

  // Check if URL has ?join= param (direct link from room creator)
  const params = new URLSearchParams(location.search);
  const joinCode = params.get("join");
  if (joinCode) {
    joinCodeInput.value = joinCode.toUpperCase();
    // Auto-trigger join flow if key also present in hash
    if (location.hash.length > 1) {
      // Small delay so DOM is fully ready
      setTimeout(() => joinForm.dispatchEvent(new Event("submit")), 100);
    }
  }

  showView("home");
});
