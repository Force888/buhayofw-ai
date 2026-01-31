(() => {
  // --- Memory (last 4 turns = 8 messages) ---
  let threadMemory = [];
  const MAX_MEMORY_MESSAGES = 8;

  // --- Elements (IDs must match index.html) ---
  const menuBtn = document.getElementById('menuBtn');
  const menuDropdown = document.getElementById('menuDropdown');

  const homeView = document.getElementById('homeView');
  const threadView = document.getElementById('threadView');
  const messagesEl = document.getElementById('messages');

  const composerForm = document.getElementById('composerForm');
  const composerInput = document.getElementById('composerInput');
  const newTopicBtn = document.getElementById('newTopicBtn');

  // Ensure body starts in home-mode
  document.body.classList.add('home-mode');
  document.body.classList.remove('thread-mode');

  // --- Menu ---
  function closeMenu() {
    menuDropdown.classList.add('hidden');
  }
  menuBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    menuDropdown.classList.toggle('hidden');
  });
  document.addEventListener('click', closeMenu);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeMenu();
  });

  // --- Jump to bottom button (ChatGPT-style) ---
  let jumpBtn = document.getElementById('jumpBtn');
  if (!jumpBtn) {
    jumpBtn = document.createElement('button');
    jumpBtn.id = 'jumpBtn';
    jumpBtn.className = 'jump-btn hidden';
    jumpBtn.type = 'button';
    jumpBtn.innerHTML = '↓';
    document.body.appendChild(jumpBtn);
  }

  function showJumpBtn(show) {
    jumpBtn.classList.toggle('hidden', !show);
  }

  function isNearBottom(el, thresholdPx = 120) {
    // distance from bottom
    const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
    return dist <= thresholdPx;
  }

  function scrollToBottom({ smooth = true } = {}) {
    messagesEl.scrollTo({
      top: messagesEl.scrollHeight,
      behavior: smooth ? 'smooth' : 'auto'
    });
  }

  jumpBtn.addEventListener('click', () => {
    scrollToBottom({ smooth: true });
    showJumpBtn(false);
  });

  // Show jump button when user scrolls up
  messagesEl?.addEventListener('scroll', () => {
    if (!messagesEl) return;
    showJumpBtn(!isNearBottom(messagesEl));
  }, { passive: true });

  // --- Helpers: view switching ---
  function showThread() {
    homeView.classList.add('hidden');
    threadView.classList.remove('hidden');

    document.body.classList.remove('home-mode');
    document.body.classList.add('thread-mode');

    newTopicBtn.classList.remove('hidden');

    // Make sure we land at bottom once entering thread
    setTimeout(() => scrollToBottom({ smooth: false }), 0);
  }

  function showHome() {
    homeView.classList.remove('hidden');
    threadView.classList.add('hidden');

    document.body.classList.add('home-mode');
    document.body.classList.remove('thread-mode');

    newTopicBtn.classList.add('hidden');
    showJumpBtn(false);
  }

  // --- Message rendering ---
  function addUserBubble(text) {
    const wrap = document.createElement('div');
    wrap.className = 'msg msg-user';
    wrap.textContent = text;
    messagesEl.appendChild(wrap);
    return wrap;
  }

  function addAssistantBlock(text) {
    const wrap = document.createElement('div');
    wrap.className = 'msg msg-ai';
    wrap.textContent = text;
    messagesEl.appendChild(wrap);
    return wrap;
  }

  // --- Enter-to-send behavior ---
  composerInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      composerForm.requestSubmit();
    }
  });

  function escapeHTML(str) {
    return str
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  // Very small "markdown-lite": **bold**, *italic*, `code`, newlines
  function renderMarkdownLite(md) {
    const escaped = escapeHTML(md);

    let html = escaped.replace(/`([^`]+)`/g, '<code>$1</code>');
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    html = html.replace(/\n/g, '<br>');

    return html;
  }

  function setComposerThinking(isThinking) {
    const composerBar = document.getElementById('composerBar');
    const input = document.getElementById('composerInput');
    const sendBtn = document.getElementById('sendBtn');

    if (isThinking) {
      composerBar.classList.add('thinking');
      input.disabled = true;
      sendBtn.disabled = true;
      input.placeholder = 'Nag-iisip…';
    } else {
      composerBar.classList.remove('thinking');
      input.disabled = false;
      sendBtn.disabled = false;
      const isFollowUp = threadMemory.length > 0;
      input.placeholder = isFollowUp ? 'Kasunod na tanong…' : 'Itanong mo dito…';
      input.focus();
    }
  }

  async function typeTextStreaming(el, text, msPerChar = 10) {
    // Stick-to-bottom behavior: only auto-scroll if user was near bottom at start
    let stick = isNearBottom(messagesEl);

    el.textContent = '';
    for (let i = 0; i < text.length; i++) {
      el.textContent += text[i];

      // update scroll only if we should stick
      if (stick) {
        scrollToBottom({ smooth: false });
      } else {
        showJumpBtn(true);
      }

      // if user comes back to bottom while typing, re-enable stick
      if (!stick && isNearBottom(messagesEl)) {
        stick = true;
        showJumpBtn(false);
      }

      await new Promise(r => setTimeout(r, msPerChar));
    }
  }

  function pushMemory(role, content) {
    threadMemory.push({ role, content });
    threadMemory = threadMemory.slice(-MAX_MEMORY_MESSAGES);
  }

  // --- Submit handler ---
  composerForm?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const q = composerInput.value.trim();
    if (!q) return;

    showThread();

    // Add user bubble + ensure it is visible
    addUserBubble(q);

    // Store user message
    pushMemory('user', q);

    // Clear input and lock
    composerInput.value = '';
    setComposerThinking(true);

    // If user is at/near bottom, keep view at bottom
    if (isNearBottom(messagesEl)) scrollToBottom({ smooth: false });

    // Thinking indicator
    const thinkingEl = addAssistantBlock('Nag-iisip…');
    if (isNearBottom(messagesEl)) scrollToBottom({ smooth: false });

    try {
      const res = await fetch('/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: q,
          history: threadMemory
        })
      });

      if (!res.ok) {
        thinkingEl.textContent = `May error (${res.status}). Pakisubukan ulit.`;
        return;
      }

      const data = await res.json();
      const answer = (data && data.answer) ? data.answer : 'Pasensya, walang sagot na bumalik.';

      // Store assistant message ONCE (fixes your duplicate push bug)
      pushMemory('assistant', answer);

      // Stream typing
      await typeTextStreaming(thinkingEl, answer, 8);

      // Render markdown-lite after typing
      thinkingEl.innerHTML = renderMarkdownLite(answer);

      // If user stayed near bottom, land at bottom; otherwise show jump button
      if (isNearBottom(messagesEl)) {
        scrollToBottom({ smooth: true });
        showJumpBtn(false);
      } else {
        showJumpBtn(true);
      }

    } catch (err) {
      thinkingEl.textContent = 'May problem sa koneksyon. Pakisubukan ulit.';
    } finally {
      setComposerThinking(false);
    }
  });

  // --- New topic resets ---
  newTopicBtn?.addEventListener('click', () => {
    messagesEl.innerHTML = '';
    composerInput.value = '';
    threadMemory = [];
    showHome();
    setComposerThinking(false);
  });

  // Start in home
  showHome();
})();
