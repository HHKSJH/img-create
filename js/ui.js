const ui = (() => {
  const chatEl = document.getElementById("chat");
  const emptyEl = document.getElementById("empty");
  const promptEl = document.getElementById("prompt");
  const apiKeyEl = document.getElementById("apiKey");
  const accessKeyEl = document.getElementById("accessKey");
  const sizeEl = document.getElementById("size");
  const styleEl = document.getElementById("stylePreset");
  const dropdownEls = Array.from(document.querySelectorAll("[data-dropdown]"));
  const sendBtnEl = document.getElementById("sendBtn");
  const clearBtnEl = document.getElementById("clearBtn");
  const objectUrls = new Set();
  let loadingEl = null;

  function hideEmpty() {
    if (emptyEl) {
      emptyEl.style.display = "none";
    }
  }

  function restoreEmpty() {
    if (emptyEl) {
      emptyEl.style.display = "grid";
      if (!emptyEl.parentNode) {
        chatEl.appendChild(emptyEl);
      }
    }
  }

  function setFormDisabled(disabled) {
    promptEl.disabled = disabled;
    apiKeyEl.disabled = disabled;
    accessKeyEl.disabled = disabled;
    sizeEl.disabled = disabled;
    styleEl.disabled = disabled;
    dropdownEls.forEach((dropdownEl) => {
      const triggerEl = dropdownEl.querySelector(".dropdown-trigger");
      const optionEls = dropdownEl.querySelectorAll(".dropdown-option");
      triggerEl.disabled = disabled;
      if (disabled) {
        dropdownEl.classList.remove("is-open");
        triggerEl.setAttribute("aria-expanded", "false");
      }
      optionEls.forEach((optionEl) => {
        optionEl.disabled = disabled;
      });
    });
    sendBtnEl.disabled = disabled;
    clearBtnEl.disabled = disabled;
    sendBtnEl.textContent = disabled ? "生成中..." : "开始生成";
    if (!disabled) {
      promptEl.focus();
    }
  }

  function revokeObjectUrls() {
    objectUrls.forEach((url) => URL.revokeObjectURL(url));
    objectUrls.clear();
  }

  function base64ToObjectUrl(base64Data, mimeType = "image/png") {
    const byteString = window.atob(base64Data);
    const bytes = new Uint8Array(byteString.length);
    for (let i = 0; i < byteString.length; i += 1) {
      bytes[i] = byteString.charCodeAt(i);
    }

    const objectUrl = URL.createObjectURL(new Blob([bytes], { type: mimeType }));
    objectUrls.add(objectUrl);
    return objectUrl;
  }

  function buildImageCard(imageUrl) {
    const cardEl = document.createElement("div");
    cardEl.className = "card";

    const imgEl = document.createElement("img");
    imgEl.src = imageUrl;
    imgEl.alt = "generated image";
    imgEl.loading = "lazy";
    cardEl.appendChild(imgEl);
    return cardEl;
  }

  function appendMessage(role, text, imageUrl) {
    hideEmpty();
    const itemEl = document.createElement("div");
    itemEl.className = `message ${role}`;

    const bubbleEl = document.createElement("div");
    bubbleEl.className = "bubble";
    bubbleEl.textContent = text || "";
    itemEl.appendChild(bubbleEl);

    if (imageUrl) {
      bubbleEl.appendChild(buildImageCard(imageUrl));
    }

    chatEl.appendChild(itemEl);
    chatEl.scrollTop = chatEl.scrollHeight;
  }

  function showLoading() {
    hideEmpty();
    setFormDisabled(true);
    loadingEl = document.createElement("div");
    loadingEl.className = "message assistant loading";
    loadingEl.innerHTML = `
      <div class="bubble">
        <div class="dots"><span></span><span></span><span></span></div>
        <span>生成中，请稍候...</span>
      </div>
    `;
    chatEl.appendChild(loadingEl);
    chatEl.scrollTop = chatEl.scrollHeight;
  }

  function hideLoading() {
    if (loadingEl && loadingEl.parentNode) {
      loadingEl.parentNode.removeChild(loadingEl);
    }
    loadingEl = null;
    setFormDisabled(false);
  }

  function clearMessages() {
    revokeObjectUrls();
    chatEl.innerHTML = "";
    restoreEmpty();
  }

  function fillLocalValues({ apiKey, accessKey }) {
    apiKeyEl.value = apiKey;
    accessKeyEl.value = accessKey;
  }

  function getInputValues() {
    return {
      prompt: promptEl.value.trim(),
      apiKey: apiKeyEl.value.trim(),
      accessKey: accessKeyEl.value.trim(),
      size: sizeEl.value,
      stylePreset: styleEl.value
    };
  }

  function clearPrompt() {
    promptEl.value = "";
  }

  function focusPrompt() {
    promptEl.focus();
  }

  function focusApiKey() {
    apiKeyEl.focus();
  }

  function bindDropdowns() {
    function closeAllDropdowns() {
      dropdownEls.forEach((dropdownEl) => {
        dropdownEl.classList.remove("is-open");
        dropdownEl.querySelector(".dropdown-trigger").setAttribute("aria-expanded", "false");
      });
    }

    dropdownEls.forEach((dropdownEl) => {
      const inputEl = dropdownEl.querySelector('input[type="hidden"]');
      const triggerEl = dropdownEl.querySelector(".dropdown-trigger");
      const valueEl = triggerEl.querySelector(".dropdown-value");
      const metaEl = triggerEl.querySelector(".dropdown-meta");
      const optionEls = Array.from(dropdownEl.querySelectorAll(".dropdown-option"));

      function selectOption(optionEl) {
        inputEl.value = optionEl.dataset.value || "";
        valueEl.textContent = optionEl.dataset.label || "";
        metaEl.textContent = optionEl.dataset.meta || "";
        optionEls.forEach((item) => {
          item.classList.toggle("is-selected", item === optionEl);
        });
        closeAllDropdowns();
      }

      triggerEl.addEventListener("click", () => {
        const isOpen = dropdownEl.classList.contains("is-open");
        closeAllDropdowns();
        if (!isOpen) {
          dropdownEl.classList.add("is-open");
          triggerEl.setAttribute("aria-expanded", "true");
        }
      });

      optionEls.forEach((optionEl) => {
        optionEl.addEventListener("click", () => selectOption(optionEl));
      });
    });

    document.addEventListener("click", (event) => {
      if (!event.target.closest("[data-dropdown]")) {
        closeAllDropdowns();
      }
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        closeAllDropdowns();
      }
    });
  }

  function bindEvents(handlers) {
    apiKeyEl.addEventListener("change", () => handlers.onApiKeyChange(apiKeyEl.value));
    apiKeyEl.addEventListener("blur", () => handlers.onApiKeyChange(apiKeyEl.value));
    accessKeyEl.addEventListener("change", () => handlers.onAccessKeyChange(accessKeyEl.value));
    accessKeyEl.addEventListener("blur", () => handlers.onAccessKeyChange(accessKeyEl.value));
    sendBtnEl.addEventListener("click", handlers.onSend);
    clearBtnEl.addEventListener("click", handlers.onClear);
    promptEl.addEventListener("keydown", (event) => {
      if (sendBtnEl.disabled) {
        event.preventDefault();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
        handlers.onSend();
      }
    });

    bindDropdowns();
  }

  return {
    appendMessage,
    base64ToObjectUrl,
    bindEvents,
    clearMessages,
    clearPrompt,
    fillLocalValues,
    focusApiKey,
    focusPrompt,
    getInputValues,
    hideLoading,
    revokeObjectUrls,
    showLoading
  };
})();
