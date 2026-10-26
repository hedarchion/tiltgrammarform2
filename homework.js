/* Custom homework links: compact, compressed, self-contained question sets.
 * No server or database is involved. The payload lives in the URL fragment.
 */
(function (global) {
  "use strict";

  const VERSION = 1;
  const MAX_QUESTIONS = 60;
  const MAX_TITLE = 90;
  const MAX_SENTENCE = 500;
  const MAX_OPTION = 120;
  const MAX_TIP = 400;
  const MAX_TOKEN = 24000;
  const MAX_PLAIN_BYTES = 160000;

  function text(value, limit) {
    return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, limit);
  }

  function normalizeQuestion(raw) {
    const options = Array.isArray(raw?.options) ? raw.options.map(value => text(value, MAX_OPTION)) : [];
    const sentence = String(raw?.s ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_SENTENCE);
    if (!sentence.includes("{x}") || !sentence.replace(/\{x\}/g, "").trim()
      || options.length !== 2 || !options[0] || !options[1] || options[0] === options[1]) {
      return null;
    }
    const answer = raw?.answer === 1 ? 1 : 0;
    return {
      s: sentence,
      w: text(raw?.w || options[1 - answer], 80),
      options,
      answer,
      tip: text(raw?.tip, MAX_TIP)
    };
  }

  function normalizeSet(raw) {
    if (!raw || typeof raw !== "object") return null;
    const questions = (Array.isArray(raw.questions) ? raw.questions : [])
      .map(normalizeQuestion).filter(Boolean).slice(0, MAX_QUESTIONS);
    if (!questions.length) return null;
    return {
      version: VERSION,
      title: text(raw.title || raw.topic, MAX_TITLE) || "Custom homework",
      topic: text(raw.topic || raw.title, MAX_TITLE) || "Custom grammar",
      form: raw.form === 1 ? 1 : 2,
      questions
    };
  }

  function utf8Bytes(value) {
    return new TextEncoder().encode(value);
  }

  function utf8Text(bytes) {
    return new TextDecoder().decode(bytes);
  }

  function bytesToBase64Url(bytes) {
    let binary = "";
    for (let index = 0; index < bytes.length; index += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
    }
    return global.btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  }

  function base64UrlToBytes(value) {
    const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4);
    const binary = global.atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
  }

  async function compress(bytes) {
    if (typeof global.CompressionStream !== "function") return null;
    const stream = new Blob([bytes]).stream().pipeThrough(new global.CompressionStream("deflate-raw"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  async function decompress(bytes) {
    if (typeof global.DecompressionStream !== "function") {
      throw new Error("This browser cannot open compressed homework links.");
    }
    const stream = new Blob([bytes]).stream().pipeThrough(new global.DecompressionStream("deflate-raw"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  async function encode(raw) {
    const set = normalizeSet(raw);
    if (!set) throw new Error("Add at least one complete question before sharing.");
    const payload = {
      v: VERSION,
      n: set.title,
      t: set.topic,
      f: set.form,
      q: set.questions.map(question => [question.s, question.options[0], question.options[1], question.answer, question.tip, question.w])
    };
    const plain = utf8Bytes(JSON.stringify(payload));
    let packed = null;
    try { packed = await compress(plain); } catch { packed = null; }
    const token = packed ? `1.${bytesToBase64Url(packed)}` : `0.${bytesToBase64Url(plain)}`;
    if (token.length > MAX_TOKEN) {
      throw new Error("This set is too large for one homework link. Shorten it or use fewer questions.");
    }
    return token;
  }

  async function decode(token) {
    const clean = String(token || "").trim();
    if (!clean || clean.length > MAX_TOKEN) throw new Error("This homework link is empty or too long.");
    const dot = clean.indexOf(".");
    if (dot !== 1) throw new Error("This homework link is not in a supported format.");
    const mode = clean.slice(0, dot), body = clean.slice(dot + 1);
    let bytes;
    try { bytes = base64UrlToBytes(body); } catch { throw new Error("This homework link is damaged."); }
    if (bytes.length > MAX_PLAIN_BYTES) throw new Error("This homework link is too large.");
    let plain;
    try { plain = mode === "1" ? await decompress(bytes) : mode === "0" ? bytes : null; } catch { plain = null; }
    if (!plain || plain.length > MAX_PLAIN_BYTES) throw new Error("This homework link could not be opened.");
    let payload;
    try { payload = JSON.parse(utf8Text(plain)); } catch { throw new Error("This homework link is damaged."); }
    if (!payload || payload.v !== VERSION || !Array.isArray(payload.q)) throw new Error("This homework link uses an unsupported version.");
    return normalizeSet({
      title: payload.n,
      topic: payload.t,
      form: payload.f,
      questions: payload.q.map(row => Array.isArray(row)
        ? { s: row[0], options: [row[1], row[2]], answer: row[3], tip: row[4], w: row[5] }
        : row)
    }) || (() => { throw new Error("This homework link has no valid questions."); })();
  }

  function tokenFromLocation(href) {
    const source = String(href || "");
    const hashIndex = source.indexOf("#");
    const hash = hashIndex >= 0 ? source.slice(hashIndex + 1) : "";
    const queryIndex = source.indexOf("?");
    const query = queryIndex >= 0 ? source.slice(queryIndex + 1, hashIndex >= 0 ? hashIndex : undefined) : "";
    for (const part of [hash, query]) {
      if (!part) continue;
      const params = new URLSearchParams(part);
      const value = params.get("homework") || params.get("hw");
      if (value) return value;
      if (part.startsWith("homework=")) return part.slice("homework=".length);
    }
    return "";
  }

  function shareUrl(href, token) {
    return `${String(href || "").split("#")[0]}#homework=${token}`;
  }

  global.HomeworkCodec = {
    VERSION,
    MAX_QUESTIONS,
    normalizeSet,
    encode,
    decode,
    tokenFromLocation,
    shareUrl
  };
  if (typeof module !== "undefined" && module.exports) module.exports = global.HomeworkCodec;
})(typeof window !== "undefined" ? window : globalThis);
