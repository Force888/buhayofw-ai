(() => {
  "use strict";
  // ===== Anonymous device id (for rate limiting) =====
  function getOrCreateDeviceId() {
    const KEY = "kb_device_id";

    // 1) localStorage
    try {
      const existing = localStorage.getItem(KEY);
      if (existing) return existing;
    } catch (_) {}

    // 2) create new
    const id =
      (window.crypto && crypto.randomUUID && crypto.randomUUID()) ||
      ("dev_" + Math.random().toString(36).slice(2) + Date.now().toString(36));

    // 3) save to localStorage
    try { localStorage.setItem(KEY, id); } catch (_) {}

    // 4) also save as cookie (1 year)
    try {
      document.cookie =
        `kb_device_id=${encodeURIComponent(id)}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`;
    } catch (_) {}

    return id;
  }

  const homeView = document.getElementById("homeView");
  const threadView = document.getElementById("threadView");
  const messagesEl = document.getElementById("messages");

  const composerBar = document.getElementById("composerBar");
  const composerForm = document.getElementById("composerForm");
  const composerInput = document.getElementById("composerInput");
  const sendBtn = document.getElementById("sendBtn");
  const newTopicBtn = document.getElementById("newTopicBtn");

  const menuBtn = document.getElementById("menuBtn");
  const menuDropdown = document.getElementById("menuDropdown");

  if (!homeView || !threadView || !messagesEl || !composerBar || !composerForm || !composerInput || !sendBtn) {
    console.error("Missing required DOM elements. Check index.html IDs.");
    return;
  }

  let threadMemory = [];

  const DEVICE_ID = getOrCreateDeviceId();

  const setMode = (mode) => {
    document.body.classList.remove("home-mode", "thread-mode");
    document.body.classList.add(mode === "home" ? "home-mode" : "thread-mode");
  };

  const showHome = () => {
    homeView.classList.remove("hidden");
    threadView.classList.add("hidden");
    if (newTopicBtn) newTopicBtn.classList.add("hidden");
    setMode("home");
    syncComposerReserve();
  };

  const showThread = () => {
    homeView.classList.add("hidden");
    threadView.classList.remove("hidden");
    if (newTopicBtn) newTopicBtn.classList.remove("hidden");
    setMode("thread");
    syncComposerReserve();
    scrollToBottom(true);
  };

  const scrollToBottom = (force = false) => {
    const el = messagesEl;
    const nearBottom = (el.scrollHeight - el.scrollTop - el.clientHeight) < 140;
    if (force || nearBottom) el.scrollTop = el.scrollHeight;
  };

  const setComposerThinking = (isThinking) => {
    composerBar.classList.toggle("thinking", !!isThinking);
    composerInput.disabled = !!isThinking;
    sendBtn.disabled = !!isThinking;
    if (newTopicBtn) newTopicBtn.disabled = !!isThinking;
  };

  const autoGrow = () => {
    composerInput.style.height = "auto";
    const max = 160;
    const next = Math.min(composerInput.scrollHeight, max);
    composerInput.style.height = `${next}px`;
    syncComposerReserve();
  };

  const syncComposerReserve = () => {
    const h = composerBar.getBoundingClientRect().height || 150;
    document.documentElement.style.setProperty("--composer-reserve", `${Math.ceil(h) + 50}px`);
  };

  /* =========================
     MINI MARKDOWN (safe)
     - escape HTML first
     - then add a tiny subset: **bold**, *italic*, `code`, lists
     ========================= */
  const escapeHtml = (s) =>
    (s ?? "").toString()
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

const renderPlainStreaming = (raw) => {
  const safe = escapeHtml(raw ?? "");
  // Convert newlines to <br> so spacing is stable while streaming
  return safe.replace(/\n/g, "<br>");
};

  const inlineMd = (s) => {
    let t = escapeHtml(s);

    // inline code
    t = t.replace(/`([^`]+)`/g, "<code>$1</code>");

    // bold
    t = t.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");

    // italic (simple)
    t = t.replace(/(^|[^*])\*([^*]+)\*(?!\*)/g, "$1<em>$2</em>");

    return t;
  };

  const renderMarkdown = (raw) => {
    const text = (raw ?? "").toString().replace(/\r\n/g, "\n");

    const lines = text.split("\n");
    let html = "";
    let inOl = false;
    let inUl = false;

    const closeLists = () => {
      if (inOl) { html += "</ol>"; inOl = false; }
      if (inUl) { html += "</ul>"; inUl = false; }
    };

    for (const line of lines) {
      const trimmed = line.trim();

// blank line
if (!trimmed) {
  // If we're inside a list, DON'T close it (keeps numbering 1,2,3...)
  if (inOl || inUl) {
    continue;
  }
  html += "<br>";
  continue;
}

      // numbered list: "1. item"
const mOl = trimmed.match(/^(\d+)\.\s+(.*)$/);
if (mOl) {
  const n = parseInt(mOl[1], 10) || 1;

  if (inUl) { html += "</ul>"; inUl = false; }

  // IMPORTANT: if we are starting a NEW <ol>, set the start number
  if (!inOl) { html += `<ol start="${n}">`; inOl = true; }

  html += `<li>${inlineMd(mOl[2])}</li>`;
  continue;
}


      // bullet list: "- item" or "* item"
      const mUl = trimmed.match(/^[-*]\s+(.*)$/);
      if (mUl) {
        if (inOl) { html += "</ol>"; inOl = false; }
        if (!inUl) { html += "<ul>"; inUl = true; }
        html += `<li>${inlineMd(mUl[1])}</li>`;
        continue;
      }

      // normal paragraph line
      closeLists();
      html += `<div>${inlineMd(trimmed)}</div>`;
    }

    closeLists();
    return html;
  };

const finalizeAssistantMarkdown = (el, rawOverride) => {
  if (!el) return;
  const raw = (rawOverride != null) ? String(rawOverride) : (el.textContent || "");
  el.innerHTML = renderMarkdown(raw);
};


  const addUserBlock = (text) => {
    const div = document.createElement("div");
    div.className = "msg msg-user";
    div.textContent = text;
    messagesEl.appendChild(div);
    scrollToBottom(true);
  };

  const addAssistantBlock = (text = "") => {
    const div = document.createElement("div");
    div.className = "msg msg-ai";
    div.textContent = text; // keep plain while typing/streaming
    messagesEl.appendChild(div);
    scrollToBottom(true);
    return div;
  };

  const addThinkingRow = () => {
    const row = document.createElement("div");
    row.className = "thinking-row";

    const avatar = document.createElement("span");
    avatar.className = "thinking-avatar";

    const img = document.createElement("img");
    img.src = "./assets/ai-head.png";
    img.alt = "AI";
    img.onerror = () => { img.style.display = "none"; };
    avatar.appendChild(img);

    const txt = document.createElement("span");
    txt.className = "thinking-text";
    txt.textContent = "Nag-iisip...";

    row.appendChild(avatar);
    row.appendChild(txt);

    messagesEl.appendChild(row);
    scrollToBottom(true);
    return row;
  };

  const fadeOutAndRemove = (el) => {
    if (!el) return;
    el.classList.add("fade-out");
    setTimeout(() => {
      if (el && el.parentNode) el.parentNode.removeChild(el);
    }, 260);
  };

  // Menu
  if (menuBtn && menuDropdown) {
    menuBtn.addEventListener("click", () => {
      menuDropdown.classList.toggle("hidden");
    });

    document.addEventListener("click", (e) => {
      if (!menuDropdown.classList.contains("hidden")) {
        const inside = menuDropdown.contains(e.target) || menuBtn.contains(e.target);
        if (!inside) menuDropdown.classList.add("hidden");
      }
    });
  }

// Typewriter (HTML-aware, matches final spacing)
const typeInto = async (el, fullText, opts = {}) => {
  const { cps = 55 } = opts;
  const text = (fullText ?? "").toString();

  el.innerHTML = "";
  if (!text) return;

  const baseDelay = Math.max(10, Math.round(1000 / cps));

  let buffer = "";

  for (let i = 0; i < text.length; i++) {
    buffer += text[i];

    // render progressively using the SAME markdown renderer
    el.innerHTML = renderMarkdown(buffer);

    scrollToBottom(true);
    // eslint-disable-next-line no-await-in-loop
    await new Promise(r => setTimeout(r, baseDelay));
  }
};


  // Streaming reader (plain while streaming)
  const streamAnswerInto = async (assistantEl, payload, onFirstToken) => {
    const res = await fetch("/ask-stream", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Device-Id": DEVICE_ID
      },
      body: JSON.stringify(payload)
    });


    if (!res.ok || !res.body) throw new Error(`stream HTTP ${res.status}`);

    const reader = res.body.getReader();
    const decoder = new TextDecoder("utf-8");

    let gotAny = false;
    let full = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      if (!chunk) continue;

      const cleaned = chunk
        .split("\n")
        .map(line => (line.startsWith("data:") ? line.slice(5) : line))
        .join("\n");

      if (!gotAny) {
        gotAny = true;
        if (typeof onFirstToken === "function") onFirstToken();
      }

      full += cleaned;
assistantEl.innerHTML = renderPlainStreaming(full.replace(/^\s+/, ""));
      scrollToBottom(true);
    }

return { streamed: gotAny, finalText: full.trim() };
  };

  const askJsonOnce = async (payload) => {
      const res = await fetch("/ask", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Device-Id": DEVICE_ID
      },
      body: JSON.stringify(payload)
    });



    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json().catch(() => ({}));
    return (data && (data.answer || data.output || data.text || data.response)) || "";
  };

  const sendQuestion = async () => {
    const q = (composerInput.value || "").trim();
    if (!q) return;

    if (!homeView.classList.contains("hidden")) showThread();

    composerInput.value = "";
    autoGrow();

    addUserBlock(q);
    threadMemory.push({ role: "user", content: q });

    const thinkingRow = addThinkingRow();
    setComposerThinking(true);

    const assistantEl = addAssistantBlock("");

    const payload = { question: q, history: threadMemory };

    try {
      let removedThinking = false;
      const removeThinking = () => {
        if (removedThinking) return;
        removedThinking = true;
        fadeOutAndRemove(thinkingRow);
      };

      try {
        const out = await streamAnswerInto(assistantEl, payload, removeThinking);
        if (!out.streamed) throw new Error("stream returned no tokens");

        // NOW finalize markdown after streaming completes
finalizeAssistantMarkdown(assistantEl, out.finalText);
        threadMemory.push({ role: "assistant", content: out.finalText || "(empty)" });
      } catch (streamErr) {
        console.warn("Streaming failed, falling back to /ask:", streamErr);

        const ans = await askJsonOnce(payload);
        removeThinking();

        const text = ans || "Walang sagot na bumalik. (Empty response)";
        await typeInto(assistantEl, text, { cps: 60, chunkMin: 2, chunkMax: 8 });
// NOW finalize markdown after typing completes (USE RAW TEXT so newlines stay)
finalizeAssistantMarkdown(assistantEl, text);

threadMemory.push({ role: "assistant", content: (text || "").trim() });


      }
    } catch (err) {
      console.error(err);
      fadeOutAndRemove(thinkingRow);
      assistantEl.textContent = "May problem sa koneksyon. Pakisubukan ulit.";
    } finally {
      setComposerThinking(false);
      scrollToBottom(true);
    }
  };

  composerForm.addEventListener("submit", (e) => {
    e.preventDefault();
    sendQuestion();
  });

  composerInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendQuestion();
    }
  });

  composerInput.addEventListener("input", autoGrow);

composerInput.addEventListener("focus", () => {
  scrollToBottom(true);
});


  if (newTopicBtn) {
    newTopicBtn.addEventListener("click", () => {
      messagesEl.innerHTML = "";
      composerInput.value = "";
      autoGrow();
      threadMemory = [];
      setComposerThinking(false);
      showHome();
    });
  }

  const updateKbVar = () => {
    try {
      if (!window.visualViewport) return;
      const vv = window.visualViewport;
      const kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      document.documentElement.style.setProperty("--kb", `${Math.round(kb)}px`);
      syncComposerReserve();
    } catch (_) {}
  };

  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", updateKbVar);
    window.visualViewport.addEventListener("scroll", updateKbVar);
  }
  window.addEventListener("resize", () => {
    syncComposerReserve();
    updateKbVar();
  });


  // Start
  showHome();
  autoGrow();
  syncComposerReserve();
  updateKbVar();

// ===== FINAL: pin topbar to visual viewport (mobile keyboard safe) =====
(function(){
  const topbar = document.getElementById("topbar");
  const vv = window.visualViewport;
  if (!topbar || !vv) return;

  const sync = () => {
    const y =
      typeof vv.pageTop === "number"
        ? vv.pageTop
        : (vv.offsetTop || 0);

    topbar.style.transform = `translate3d(0, ${y}px, 0)`;
  };

  vv.addEventListener("resize", sync);
  vv.addEventListener("scroll", sync);
  window.addEventListener("scroll", sync, { passive: true });

  sync();
})();


})();
