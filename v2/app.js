(() => {
  const form = document.getElementById('chatForm');
  const input = document.getElementById('userInput');
  const chat = document.getElementById('chat');
  const statusEl = document.getElementById('status');
  const sendBtn = document.getElementById('sendBtn');

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatAnswer(md) {
  let s = escapeHtml(md);

  // bold **text**
  s = s.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");

  // italics *text* (optional)
  s = s.replace(/\*(.+?)\*/g, "<em>$1</em>");

  // newlines
  s = s.replace(/\n/g, "<br>");

  return s;
}


  if (!form || !input || !chat || !statusEl || !sendBtn) {
    console.error("Missing required elements. Need: chatForm, userInput, chat, status, sendBtn");
    return;
  }

  const escapeHtml = (s) =>
    String(s).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  const addBubble = (role, text) => {
    const div = document.createElement('div');
    div.className = `msg ${role}`;
    div.innerHTML = `<div class="bubble">${escapeHtml(text)}</div>`;
    chat.appendChild(div);
    chat.scrollTop = chat.scrollHeight;
    return div;
  };

  const setStatus = (t) => { statusEl.textContent = t || ''; };

  async function ask(question) {
    const res = await fetch('/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question })
    });

    // If server returns non-200, surface it
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status} ${res.statusText}${txt ? " - " + txt : ""}`);
    }

    return res.json();
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const q = (input.value || '').trim();
    if (!q) return;

    addBubble('user', q);
    input.value = '';
    input.focus();

    sendBtn.disabled = true;
    setStatus('Nag-iisip…');

    const botBubble = addBubble('bot', '...');

    try {
      const data = await ask(q);
      const answer = data.answer ?? data.response ?? data.message ?? JSON.stringify(data);
      botBubble.querySelector('.bubble').innerHTML = formatAnswer(answer);
      setStatus('');
    } catch (err) {
      console.error(err);
      botBubble.querySelector('.bubble').textContent = `May error: ${err.message || err}`;
      setStatus('');
    } finally {
      sendBtn.disabled = false;
    }
  });

  // Enter submits, Shift+Enter = newline
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      form.requestSubmit();
    }
  });
})();
