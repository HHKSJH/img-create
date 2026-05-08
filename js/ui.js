const ui = (() => {
  const chatEl = document.getElementById("chat");
  const emptyEl = document.getElementById("empty");
  const promptEl = document.getElementById("prompt");
  const apiKeyEl = document.getElementById("apiKey");
  const accessKeyEl = document.getElementById("accessKey");
  const sizeEl = document.getElementById("size");
  const styleEl = document.getElementById("stylePreset");
  const contextModeEl = document.getElementById("contextMode");
  const contextSummaryEl = document.getElementById("contextSummary");
  const memoryDescriptionEl = document.getElementById("memoryDescription");
  const resetContextBtnEl = document.getElementById("resetContextBtn");
  const jumpToBottomBtnEl = document.getElementById("jumpToBottomBtn");
  const dropdownEls = Array.from(document.querySelectorAll("[data-dropdown]"));
  const sendBtnEl = document.getElementById("sendBtn");
  const clearBtnEl = document.getElementById("clearBtn");
  const previewModalEl = document.getElementById("previewModal");
  const previewImageEl = document.getElementById("previewImage");
  const previewOpenLinkEl = document.getElementById("previewOpenLink");
  const previewHintEl = document.getElementById("previewHint");
  const previewCloseEl = document.getElementById("previewClose");
  const previewCloseTriggers = Array.from(document.querySelectorAll("[data-preview-close]"));
  const objectUrls = new Set();
  const progressPhases = [
    { until: 18, label: "正在提交生成请求" },
    { until: 42, label: "正在排队与准备资源" },
    { until: 68, label: "正在生成画面细节" },
    { until: 88, label: "正在整理返回结果" },
    { until: 96, label: "即将完成，请保持页面开启" }
  ];

  let loadingEl = null;
  let retryHandler = null;
  let progressTimer = null;
  let progressValue = 0;

  function toggleJumpButton() {
    const distanceFromBottom = chatEl.scrollHeight - chatEl.scrollTop - chatEl.clientHeight;
    jumpToBottomBtnEl.classList.toggle("is-visible", distanceFromBottom > 120);
  }

  function scrollChatToBottom() {
    chatEl.scrollTop = chatEl.scrollHeight;
    toggleJumpButton();
  }

  function isWeChatWebView() {
    return /MicroMessenger/i.test(window.navigator.userAgent);
  }

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

  function closeAllDropdowns() {
    dropdownEls.forEach((dropdownEl) => {
      dropdownEl.classList.remove("is-open");
      dropdownEl.querySelector(".dropdown-trigger")?.setAttribute("aria-expanded", "false");
    });
  }

  function setFormDisabled(disabled) {
    promptEl.disabled = disabled;
    apiKeyEl.disabled = disabled;
    accessKeyEl.disabled = disabled;
    sizeEl.disabled = disabled;
    styleEl.disabled = disabled;
    contextModeEl.disabled = disabled;
    resetContextBtnEl.disabled = disabled || !resetContextBtnEl.dataset.enabled;

    dropdownEls.forEach((dropdownEl) => {
      const triggerEl = dropdownEl.querySelector(".dropdown-trigger");
      const optionEls = dropdownEl.querySelectorAll(".dropdown-option");
      if (triggerEl) {
        triggerEl.disabled = disabled;
        if (disabled) {
          dropdownEl.classList.remove("is-open");
          triggerEl.setAttribute("aria-expanded", "false");
        }
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
    const normalizedData = base64Data.includes(",") ? base64Data.split(",").pop() : base64Data;
    const byteString = window.atob(normalizedData);
    const bytes = new Uint8Array(byteString.length);

    for (let i = 0; i < byteString.length; i += 1) {
      bytes[i] = byteString.charCodeAt(i);
    }

    const objectUrl = URL.createObjectURL(new Blob([bytes], { type: mimeType }));
    objectUrls.add(objectUrl);
    return objectUrl;
  }

  function imageDataToObjectUrl(imageData) {
    if (imageData?.type === "url") {
      return imageData.value;
    }

    return base64ToObjectUrl(imageData?.value || imageData);
  }

  function openPreview(imageUrl) {
    previewImageEl.src = imageUrl;
    previewOpenLinkEl.href = imageUrl;
    previewHintEl.textContent = isWeChatWebView()
      ? "微信内无法直接打开 blob 原图，请长按上方图片保存。"
      : "";
    previewOpenLinkEl.textContent = isWeChatWebView() ? "长按图片保存" : "打开原图";
    previewModalEl.hidden = false;
    document.body.style.overflow = "hidden";
  }

  function closePreview() {
    if (previewModalEl.hidden) {
      return;
    }

    previewModalEl.hidden = true;
    previewImageEl.removeAttribute("src");
    previewOpenLinkEl.href = "#";
    previewHintEl.textContent = "";
    previewOpenLinkEl.textContent = "打开原图";
    document.body.style.overflow = "";
  }

  function buildImageCard(imageUrl) {
    const cardEl = document.createElement("div");
    cardEl.className = "card";

    const imgEl = document.createElement("img");
    imgEl.src = imageUrl;
    imgEl.alt = "生成结果";
    imgEl.loading = "lazy";
    imgEl.addEventListener("click", () => openPreview(imageUrl));
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
    scrollChatToBottom();
  }

  function appendRetryMessage(text) {
    hideEmpty();
    const itemEl = document.createElement("div");
    itemEl.className = "message assistant";

    const bubbleEl = document.createElement("div");
    bubbleEl.className = "bubble";
    bubbleEl.textContent = text || "";

    const retryButtonEl = document.createElement("button");
    retryButtonEl.type = "button";
    retryButtonEl.className = "retry-button";

    const retryIconEl = document.createElement("img");
    retryIconEl.className = "retry-icon";
    retryIconEl.src = "./assets/chongshi.png";
    retryIconEl.alt = "";
    retryIconEl.setAttribute("aria-hidden", "true");

    const retryTextEl = document.createElement("span");
    retryTextEl.textContent = "重试";

    retryButtonEl.append(retryIconEl, retryTextEl);
    retryButtonEl.addEventListener("click", () => {
      if (typeof retryHandler === "function") {
        retryHandler();
      }
    });

    bubbleEl.appendChild(retryButtonEl);
    itemEl.appendChild(bubbleEl);
    chatEl.appendChild(itemEl);
    scrollChatToBottom();
  }

  function renderContextSummary({ mode, hasContext, summary }) {
    const modeText = mode === "continuation" ? "继承上一轮" : "独立创作";
    const description = mode === "continuation"
      ? "默认继承最近一次成功生成的描述，用于继续优化同一张图。"
      : "每次请求都按当前输入独立生成，不自动引用上一轮描述。";

    memoryDescriptionEl.textContent = description;
    resetContextBtnEl.dataset.enabled = hasContext ? "1" : "";
    resetContextBtnEl.disabled = !hasContext;

    if (!hasContext) {
      contextSummaryEl.className = "context-summary is-empty";
      contextSummaryEl.innerHTML = `
        <span class="context-chip">${modeText}</span>
        <p class="context-text">当前无可继承的成功记录。先生成一张图后，这里会展示上下文摘要。</p>
      `;
      return;
    }

    contextSummaryEl.className = "context-summary";
    contextSummaryEl.innerHTML = `
      <span class="context-chip">${modeText}</span>
      <p class="context-text">${summary}</p>
    `;
  }

  function findProgressLabel(value) {
    const phase = progressPhases.find((item) => value <= item.until);
    return phase ? phase.label : progressPhases[progressPhases.length - 1].label;
  }

  function updateLoadingProgress(value) {
    if (!loadingEl) {
      return;
    }

    const barFillEl = loadingEl.querySelector("[data-progress-fill]");
    const valueEl = loadingEl.querySelector("[data-progress-value]");
    const labelEl = loadingEl.querySelector("[data-progress-label]");
    const progressbarEl = loadingEl.querySelector('[role="progressbar"]');
    const safeValue = Math.max(0, Math.min(99, Math.round(value)));

    if (barFillEl) {
      barFillEl.style.width = `${safeValue}%`;
    }
    if (valueEl) {
      valueEl.textContent = `${safeValue}%`;
    }
    if (labelEl) {
      labelEl.textContent = findProgressLabel(safeValue);
    }
    if (progressbarEl) {
      progressbarEl.setAttribute("aria-valuenow", String(safeValue));
    }
  }

  function startLoadingProgress() {
    window.clearInterval(progressTimer);
    progressValue = 6;
    updateLoadingProgress(progressValue);

    progressTimer = window.setInterval(() => {
      if (progressValue >= 96) {
        return;
      }

      const delta = progressValue < 48 ? 4.2 : progressValue < 78 ? 2.1 : 0.6;
      progressValue = Math.min(96, progressValue + delta);
      updateLoadingProgress(progressValue);
    }, 900);
  }

  function stopLoadingProgress() {
    window.clearInterval(progressTimer);
    progressTimer = null;
    progressValue = 0;
  }

  function showLoading() {
    hideEmpty();
    setFormDisabled(true);
    loadingEl = document.createElement("div");
    loadingEl.className = "message assistant loading";
    loadingEl.innerHTML = `
      <div class="bubble loading-bubble" aria-live="polite">
        <div class="loading-topline">
          <span class="loading-title">图片生成中</span>
          <span class="loading-value" data-progress-value>0%</span>
        </div>
        <div class="loading-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
          <div class="loading-fill" data-progress-fill></div>
          <div class="loading-sheen"></div>
        </div>
        <div class="loading-meta">
          <span data-progress-label>正在提交生成请求</span>
          <span>进度为估算值</span>
        </div>
      </div>
    `;
    chatEl.appendChild(loadingEl);
    scrollChatToBottom();
    startLoadingProgress();
  }

  function hideLoading() {
    if (loadingEl) {
      updateLoadingProgress(100);
      const progressbarEl = loadingEl.querySelector('[role="progressbar"]');
      if (progressbarEl) {
        progressbarEl.setAttribute("aria-valuenow", "100");
      }
    }

    stopLoadingProgress();

    if (loadingEl?.parentNode) {
      loadingEl.parentNode.removeChild(loadingEl);
    }
    loadingEl = null;
    setFormDisabled(false);
  }

  function clearMessages() {
    revokeObjectUrls();
    chatEl.innerHTML = "";
    restoreEmpty();
    toggleJumpButton();
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
        closePreview();
      }
    });
  }

  function bindPreviewEvents() {
    previewCloseEl.addEventListener("click", closePreview);
    previewCloseTriggers.forEach((triggerEl) => {
      triggerEl.addEventListener("click", closePreview);
    });

    previewOpenLinkEl.addEventListener("click", (event) => {
      const imageUrl = previewOpenLinkEl.href;
      if (!imageUrl || imageUrl === "#") {
        event.preventDefault();
        return;
      }

      event.preventDefault();
      if (isWeChatWebView()) {
        previewHintEl.textContent = "微信内请直接长按上方图片保存到相册。";
        return;
      }
      const openedWindow = window.open(imageUrl, "_blank", "noopener");
      if (!openedWindow) {
        window.location.href = imageUrl;
      }
    });
  }

  function bindEvents(handlers) {
    retryHandler = handlers.onRetry || null;

    apiKeyEl.addEventListener("change", () => handlers.onApiKeyChange(apiKeyEl.value));
    apiKeyEl.addEventListener("blur", () => handlers.onApiKeyChange(apiKeyEl.value));
    accessKeyEl.addEventListener("change", () => handlers.onAccessKeyChange(accessKeyEl.value));
    accessKeyEl.addEventListener("blur", () => handlers.onAccessKeyChange(accessKeyEl.value));
    contextModeEl.addEventListener("change", () => handlers.onContextModeChange(contextModeEl.checked));
    resetContextBtnEl.addEventListener("click", handlers.onResetContext);
    jumpToBottomBtnEl.addEventListener("click", scrollChatToBottom);
    sendBtnEl.addEventListener("click", handlers.onSend);
    clearBtnEl.addEventListener("click", handlers.onClear);
    chatEl.addEventListener("scroll", toggleJumpButton);
    promptEl.addEventListener("keydown", (event) => {
      if (sendBtnEl.disabled) {
        event.preventDefault();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
        event.preventDefault();
        handlers.onSend();
      }
    });

    bindDropdowns();
    bindPreviewEvents();
    toggleJumpButton();
  }

  return {
    appendMessage,
    appendRetryMessage,
    base64ToObjectUrl,
    bindEvents,
    clearMessages,
    clearPrompt,
    fillLocalValues,
    focusApiKey,
    focusPrompt,
    getInputValues,
    hideLoading,
    imageDataToObjectUrl,
    renderContextSummary,
    revokeObjectUrls,
    showLoading
  };
})();
