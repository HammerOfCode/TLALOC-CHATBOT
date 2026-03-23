const state = {
  theme: "classic-chat",
  typingTimer: null,
  endpoint: "http://127.0.0.1:11434",
  model: "gemma3:1b",
  messages: [],
  isWaiting: false
};

const chatHistory = document.getElementById("chatHistory");
const chatForm = document.getElementById("chatForm");
const messageInput = document.getElementById("messageInput");
const themeSelect = document.getElementById("themeSelect");
const modelSelect = document.getElementById("modelSelect");
const connectionStatus = document.getElementById("connectionStatus");
const messageTemplate = document.getElementById("messageTemplate");
const typingTemplate = document.getElementById("typingTemplate");

const starterMessages = [
  {
    role: "assistant",
    author: "Assistant",
    text: "Hello. This UI is now ready to talk to your local **Ollama** server.\n\nI will use the selected local model and send the full conversation history with each message.",
    timestamp: new Date(Date.now() - 1000 * 60 * 4)
  },
  {
    role: "user",
    author: "You",
    text: "What model are you using?",
    timestamp: new Date(Date.now() - 1000 * 60 * 3)
  },
  {
    role: "assistant",
    author: "Assistant",
    text: "By default I will try to use `gemma3:1b`, and I will refresh the model list from Ollama when the page loads.",
    timestamp: new Date(Date.now() - 1000 * 60 * 3 + 20000)
  }
];

async function initializeApp() {
  starterMessages.forEach(renderMessage);
  state.messages = starterMessages.map((message) => ({
    role: message.role,
    content: message.text
  }));
  themeSelect.value = state.theme;
  document.body.dataset.theme = state.theme;
  bindEvents();
  autoResizeTextarea();
  scrollToLatest();
  await loadAvailableModels();
}

function bindEvents() {
  chatForm.addEventListener("submit", handleSubmit);
  themeSelect.addEventListener("change", handleThemeChange);
  modelSelect.addEventListener("change", handleModelChange);
  messageInput.addEventListener("input", autoResizeTextarea);
  messageInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      chatForm.requestSubmit();
    }
  });

  chatHistory.addEventListener("click", async (event) => {
    const copyButton = event.target.closest(".copy-button, .code-copy-button");
    if (!copyButton) return;

    const source = copyButton.dataset.copy || "";
    try {
      await navigator.clipboard.writeText(source);
      const originalLabel = copyButton.dataset.label || copyButton.textContent;
      copyButton.textContent = "Copied";
      window.setTimeout(() => {
        copyButton.textContent = originalLabel;
      }, 1200);
    } catch (error) {
      copyButton.textContent = "Unavailable";
    }
  });
}

function handleThemeChange(event) {
  state.theme = event.target.value;
  document.body.dataset.theme = state.theme;
}

function handleModelChange(event) {
  state.model = event.target.value;
  updateConnectionStatus(`Using ${state.model}`, "ready");
}

async function handleSubmit(event) {
  event.preventDefault();
  const text = messageInput.value.trim();
  if (!text || state.isWaiting) return;

  const userMessage = {
    role: "user",
    author: "You",
    text,
    timestamp: new Date()
  };

  renderMessage(userMessage);
  state.messages.push({
    role: "user",
    content: text
  });
  messageInput.value = "";
  autoResizeTextarea();
  showTypingIndicator();
  setWaitingState(true);

  try {
    const responseText = await requestOllamaResponse();
    removeTypingIndicator();
    renderMessage({
      role: "assistant",
      author: "Assistant",
      text: responseText,
      timestamp: new Date()
    });
    state.messages.push({
      role: "assistant",
      content: responseText
    });
    updateConnectionStatus(`Connected to ${state.model}`, "ready");
  } catch (error) {
    removeTypingIndicator();
    const helpText = [
      "I couldn't reach your local Ollama server.",
      "",
      `Error: ${error.message}`,
      "",
      "Checklist:",
      "- Make sure Ollama is running.",
      `- Confirm ${state.model} is installed.`,
      `- Open this app through a local web server if your browser blocks requests from a \`file://\` page.`,
      `- Ollama endpoint expected: ${state.endpoint}`
    ].join("\n");

    renderMessage({
      role: "assistant",
      author: "Assistant",
      text: helpText,
      timestamp: new Date()
    });
    updateConnectionStatus("Ollama unavailable", "error");
  } finally {
    setWaitingState(false);
  }
}

function renderMessage(message) {
  const fragment = messageTemplate.content.cloneNode(true);
  const article = fragment.querySelector(".message");
  const avatar = fragment.querySelector(".message__avatar");
  const author = fragment.querySelector(".message__author");
  const time = fragment.querySelector(".message__time");
  const bubble = fragment.querySelector(".message__bubble");
  const copyButton = fragment.querySelector(".copy-button");

  article.classList.add(`message--${message.role}`);
  author.textContent = message.author;
  time.textContent = formatTimestamp(message.timestamp);
  bubble.innerHTML = renderMarkdown(message.text);
  copyButton.dataset.copy = message.text;
  copyButton.dataset.label = "Copy";

  if (message.role === "assistant") {
    avatar.textContent = "AI";
  }

  if (message.role === "user") {
    avatar.remove();
  }

  chatHistory.appendChild(fragment);
  scrollToLatest();
}

function setWaitingState(isWaiting) {
  state.isWaiting = isWaiting;
  messageInput.disabled = isWaiting;
  modelSelect.disabled = isWaiting;
  chatForm.querySelector('button[type="submit"]').disabled = isWaiting;
}

function showTypingIndicator() {
  removeTypingIndicator();
  const fragment = typingTemplate.content.cloneNode(true);
  chatHistory.appendChild(fragment);
  scrollToLatest();
}

function removeTypingIndicator() {
  const typingNode = chatHistory.querySelector(".message--typing");
  if (typingNode) typingNode.remove();
}

function scrollToLatest() {
  window.requestAnimationFrame(() => {
    chatHistory.scrollTop = chatHistory.scrollHeight;
  });
}

function autoResizeTextarea() {
  messageInput.style.height = "auto";
  messageInput.style.height = `${Math.min(messageInput.scrollHeight, 180)}px`;
}

function formatTimestamp(date) {
  return new Intl.DateTimeFormat([], {
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

async function loadAvailableModels() {
  try {
    const response = await fetch(`${state.endpoint}/api/tags`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    const modelNames = Array.isArray(data.models)
      ? data.models.map((model) => model.name).filter(Boolean)
      : [];

    if (modelNames.length > 0) {
      modelSelect.innerHTML = modelNames
        .map((name) => `<option value="${escapeAttribute(name)}">${escapeHtml(name)}</option>`)
        .join("");

      state.model = modelNames.includes(state.model) ? state.model : modelNames[0];
      modelSelect.value = state.model;
      updateConnectionStatus(`Connected to Ollama on 127.0.0.1`, "ready");
      return;
    }

    updateConnectionStatus("No Ollama models found", "error");
  } catch (error) {
    updateConnectionStatus("Could not load Ollama models", "error");
  }
}

async function requestOllamaResponse() {
  const response = await fetch(`${state.endpoint}/api/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: state.model,
      messages: state.messages,
      stream: false
    })
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const data = await response.json();
  const content = data?.message?.content?.trim();

  if (!content) {
    throw new Error("Empty response from model");
  }

  return content;
}

function updateConnectionStatus(message, tone) {
  connectionStatus.textContent = message;
  connectionStatus.dataset.state = tone;
}

function renderMarkdown(source) {
  const escaped = escapeHtml(source);
  const codeBlocks = [];

  const withCodeBlocks = escaped.replace(/```([\w-]*)\n([\s\S]*?)```/g, (_, language, code) => {
    const index = codeBlocks.push({
      language,
      code: code.replace(/\n$/, "")
    }) - 1;
    return `%%CODEBLOCK_${index}%%`;
  });

  const html = withCodeBlocks
    .split(/\n{2,}/)
    .map((block) => {
      const trimmed = block.trim();
      if (/^%%CODEBLOCK_\d+%%$/.test(trimmed)) {
        return trimmed;
      }
      return `<p>${formatInlineMarkdown(block).replace(/\n/g, "<br>")}</p>`;
    })
    .join("");

  return html.replace(/%%CODEBLOCK_(\d+)%%/g, (_, index) => {
    const block = codeBlocks[Number(index)];
    const languageClass = block.language ? ` class="language-${block.language}"` : "";
    const languageLabel = block.language ? `<span class="code-block__language">${escapeHtml(block.language)}</span>` : "<span></span>";
    return [
      `<div class="code-block">`,
      `<div class="code-block__header">`,
      languageLabel,
      `<button class="code-copy-button" type="button" data-copy="${escapeAttribute(block.code)}" data-label="Copy code">Copy code</button>`,
      `</div>`,
      `<pre><code${languageClass}>${block.code}</code></pre>`,
      `</div>`
    ].join("");
  });
}

function formatInlineMarkdown(text) {
  return text
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/`([^`]+)`/g, "<code>$1</code>");
}

function escapeHtml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttribute(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

initializeApp();
