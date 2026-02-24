/**
 * public/js/crypto.js
 *
 * End-to-End Encryption via the Web Crypto API (AES-GCM 256-bit)
 *
 * HOW E2E ENCRYPTION WORKS HERE:
 * ───────────────────────────────
 * 1. When a user creates a room a random 256-bit AES-GCM key is generated
 *    in the browser using window.crypto.subtle.generateKey().
 *
 * 2. That raw key is exported and attached to the room URL as a hash fragment:
 *      https://vanishchat.com/room#KEY_BASE64_URL
 *    The hash fragment is NEVER sent to the server (it's client-only per HTTP spec).
 *
 * 3. Every user who joins via this URL extracts the key from the fragment,
 *    imports it, and uses it to encrypt/decrypt messages locally.
 *
 * 4. The server only ever sees base64 ciphertext + a random IV per message.
 *    Even a compromised server cannot read messages.
 *
 * 5. AES-GCM provides both confidentiality AND integrity (authentication tag).
 *    Tampering with ciphertext will cause decryption to fail and throw.
 */

"use strict";

const VanishCrypto = (() => {
  /** Import a raw base64url AES-GCM key for encrypt/decrypt operations. */
  async function importKey(b64Key) {
    const raw = base64urlToBuffer(b64Key);
    return window.crypto.subtle.importKey(
      "raw",
      raw,
      { name: "AES-GCM", length: 256 },
      false, // Not extractable after import (extra safety)
      ["encrypt", "decrypt"],
    );
  }

  /** Generate a fresh 256-bit AES-GCM key. Returns { cryptoKey, b64Key }. */
  async function generateKey() {
    const cryptoKey = await window.crypto.subtle.generateKey(
      { name: "AES-GCM", length: 256 },
      true,
      ["encrypt", "decrypt"],
    );
    const raw = await window.crypto.subtle.exportKey("raw", cryptoKey);
    const b64Key = bufferToBase64url(raw);
    return { cryptoKey, b64Key };
  }

  /**
   * Encrypt a plaintext string.
   * Returns { ciphertext: base64, iv: base64 }
   */
  async function encrypt(cryptoKey, plaintext) {
    const iv = window.crypto.getRandomValues(new Uint8Array(12)); // 96-bit IV for GCM
    const encoded = new TextEncoder().encode(plaintext);
    const cipherBuf = await window.crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      cryptoKey,
      encoded,
    );
    return {
      ciphertext: bufferToBase64(cipherBuf),
      iv: bufferToBase64(iv),
    };
  }

  /**
   * Decrypt a message.
   * @param {CryptoKey} cryptoKey
   * @param {string}    b64Cipher  - base64 ciphertext
   * @param {string}    b64Iv      - base64 IV
   * @returns {string} Decrypted plaintext
   */
  async function decrypt(cryptoKey, b64Cipher, b64Iv) {
    const cipherBuf = base64ToBuffer(b64Cipher);
    const iv = base64ToBuffer(b64Iv);
    const plainBuf = await window.crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      cryptoKey,
      cipherBuf,
    );
    return new TextDecoder().decode(plainBuf);
  }

  // ── Helpers ──────────────────────────────────────────────

  function bufferToBase64(buffer) {
    return btoa(String.fromCharCode(...new Uint8Array(buffer)));
  }

  function base64ToBuffer(b64) {
    const bin = atob(b64);
    const buf = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
    return buf.buffer;
  }

  function bufferToBase64url(buffer) {
    return bufferToBase64(buffer)
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=/g, "");
  }

  function base64urlToBuffer(b64url) {
    // Add padding if needed
    let b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
    // Calculate padding: base64url length mod 4, converted to = characters
    const padLength = (4 - (b64.length % 4)) % 4;
    b64 += "=".repeat(padLength);
    return base64ToBuffer(b64);
  }

  return { generateKey, importKey, encrypt, decrypt };
})();
