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
  const sessionListEl = document.getElementById("sessionList");
  const sessionMetaEl = document.getElementById("sessionMeta");
  const storageUsageTextEl = document.getElementById("storageUsageText");
  const storageUsageBarEl = document.getElementById("storageUsageBar");
  const newSessionBtnEl = document.getElementById("newSessionBtn");
  const clearAllSessionsBtnEl = document.getElementById("clearAllSessionsBtn");
  const workspaceTitleEl = document.getElementById("workspaceTitle");
  const workspaceSubtitleEl = document.getElementById("workspaceSubtitle");
  const sessionTagEl = document.getElementById("sessionTag");
  const dropdownEls = Array.from(document.querySelectorAll("[data-dropdown]"));
  const sendBtnEl = document.getElementById("sendBtn");
  const clearBtnEl = document.getElementById("clearBtn");
  const jumpToBottomBtnEl = document.getElementById("jumpToBottomBtn");
  const previewModalEl = document.getElementById("previewModal");
  const previewImageEl = document.getElementById("previewImage");
  const previewOpenLinkEl = document.getElementById("previewOpenLink");
  const previewHintEl = document.getElementById("previewHint");
  const previewCloseEl = document.getElementById("previewClose");
  const previewCloseTriggers = Array.from(document.querySelectorAll("[data-preview-close]"));
  const clearAllConfirmModalEl = document.getElementById("clearAllConfirmModal");
  const clearAllCancelBtnEl = document.getElementById("clearAllCancelBtn");
  const clearAllConfirmBtnEl = document.getElementById("clearAllConfirmBtn");
  const clearAllCloseTriggers = Array.from(document.querySelectorAll("[data-clear-all-close]"));
  const objectUrls = new Set();

  let loadingEl = null;
  let retryHandler = null;
  let progressTimer = null;
  let progressValue = 0;

  const progressPhases = [
    { until: 18, label: "正在提交生成请求" },
    { until: 42, label: "正在排队与准备资源" },
    { until: 68, label: "正在生成画面细节" },
    { until: 88, label: "正在整理返回结果" },
    { until: 96, label: "即将完成，请保持页面开启" }
  ];

  function formatRelativeTime(timestamp) {
    const diff = Date.now() - timestamp;
    if (diff < 60_000) return "刚刚";
    if (diff < 3_600_000) return `${Math.max(1, Math.floor(diff / 60_000))} 分钟前`;
    if (diff < 86_400_000) return `${Math.max(1, Math.floor(diff / 3_600_000))} 小时前`;
    return `${Math.max(1, Math.floor(diff / 86_400_000))} 天前`;
  }

  function formatBytes(bytes) {
    if (!bytes) return "0 MB";
    const units = ["B", "KB", "MB", "GB"];
    let value = bytes;
    let index = 0;
    while (value >= 1024 && index < units.length - 1) {
      value /= 1024;
      index += 1;
    }
    return `${value.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
  }

  function formatStorageSummary(estimate) {
    if (!estimate.quota) {
      return `已用 ${formatBytes(estimate.usage)}`;
    }

    const quotaInGb = estimate.quota / (1024 ** 3);
    if (quotaInGb >= 20) {
      return `已用 ${formatBytes(estimate.usage)} · 空间充足`;
    }

    return `已用 ${formatBytes(estimate.usage)} / ${formatBytes(estimate.quota)}`;
  }

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
    newSessionBtnEl.disabled = disabled;
    clearAllSessionsBtnEl.disabled = disabled;

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
  }

  function revokeObjectUrls() {
    objectUrls.forEach((url) => URL.revokeObjectURL(url));
    objectUrls.clear();
  }

  function base64ToBlob(base64Data, mimeType = "image/png") {
    const normalizedData = base64Data.includes(",") ? base64Data.split(",").pop() : base64Data;
    const byteString = window.atob(normalizedData);
    const bytes = new Uint8Array(byteString.length);

    for (let i = 0; i < byteString.length; i += 1) {
      bytes[i] = byteString.charCodeAt(i);
    }

    return new Blob([bytes], { type: mimeType });
  }

  function base64ToObjectUrl(base64Data, mimeType = "image/png") {
    const objectUrl = URL.createObjectURL(base64ToBlob(base64Data, mimeType));
    objectUrls.add(objectUrl);
    return objectUrl;
  }

  function imageDataToRenderData(imageData) {
    if (imageData?.type === "url") {
      return {
        imageUrl: imageData.value,
        imageRef: {
          kind: "remote",
          value: imageData.value
        }
      };
    }

    const blob = base64ToBlob(imageData?.value || imageData);
    const imageUrl = URL.createObjectURL(blob);
    objectUrls.add(imageUrl);
    return {
      imageUrl,
      imageRef: {
        kind: "asset",
        assetId: storage.createId("asset"),
        blob
      }
    };
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

  function openClearAllConfirm() {
    clearAllConfirmModalEl.hidden = false;
    document.body.style.overflow = "hidden";
  }

  function closeClearAllConfirm() {
    if (clearAllConfirmModalEl.hidden) {
      return;
    }

    clearAllConfirmModalEl.hidden = true;
    document.body.style.overflow = previewModalEl.hidden ? "" : "hidden";
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
    const itemEl = document.createElement("article");
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

  function renderMessages(messages) {
    revokeObjectUrls();
    chatEl.innerHTML = "";

    if (!messages.length) {
      restoreEmpty();
      toggleJumpButton();
      return;
    }

    hideEmpty();
    messages.forEach((message) => appendMessage(message.role, message.text, message.imageUrl));
  }

  function appendRetryMessage(text) {
    hideEmpty();
    const itemEl = document.createElement("article");
    itemEl.className = "message assistant";

    const bubbleEl = document.createElement("div");
    bubbleEl.className = "bubble";
    bubbleEl.textContent = text || "";

    const retryButtonEl = document.createElement("button");
    retryButtonEl.type = "button";
    retryButtonEl.className = "retry-button";
    retryButtonEl.textContent = "重试";
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
      ? "默认继承当前会话最近一次成功生成的描述，用于继续优化同一张图。"
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

  function renderSessionList(sessions, activeSessionId) {
    if (!sessions.length) {
      sessionListEl.innerHTML = `
        <div class="session-empty">
          <strong>暂无历史会话</strong>
          <p>生成成功后，这里会自动积累你的本地会话记录。</p>
        </div>
      `;
      return;
    }

    sessionListEl.innerHTML = sessions.map((session) => `
      <article class="session-item ${session.id === activeSessionId ? "is-active" : ""}" data-session-id="${session.id}">
        <button class="session-main" type="button" data-action="open-session" data-session-id="${session.id}">
          <strong>${session.title}</strong>
          <small>${session.imageCount} 张图 · ${formatRelativeTime(session.updatedAt)}</small>
        </button>
        <button class="session-delete" type="button" data-action="delete-session" data-session-id="${session.id}" aria-label="删除会话">×</button>
      </article>
    `).join("");
  }

  function renderStorageUsage(estimate) {
    storageUsageTextEl.textContent = formatStorageSummary(estimate);
    storageUsageBarEl.style.width = `${Math.min(100, Math.round((estimate.usageRatio || 0) * 100))}%`;
    storageUsageBarEl.classList.toggle("is-warning", Boolean(estimate.isNearLimit));
  }

  function renderSessionMeta(text) {
    sessionMetaEl.textContent = text;
  }

  function setWorkspaceMeta({ title, subtitle, tag }) {
    workspaceTitleEl.textContent = title;
    workspaceSubtitleEl.textContent = subtitle;
    sessionTagEl.textContent = tag;
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
    loadingEl = document.createElement("article");
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
    }

    stopLoadingProgress();

    if (loadingEl?.parentNode) {
      loadingEl.parentNode.removeChild(loadingEl);
    }
    loadingEl = null;
    setFormDisabled(false);
    toggleJumpButton();
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
        optionEls.forEach((item) => item.classList.toggle("is-selected", item === optionEl));
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
        closeClearAllConfirm();
      }
    });
  }

  function bindPreviewEvents() {
    previewCloseEl.addEventListener("click", closePreview);
    previewCloseTriggers.forEach((triggerEl) => triggerEl.addEventListener("click", closePreview));

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

  function bindClearAllConfirmEvents(handlers) {
    clearAllSessionsBtnEl.addEventListener("click", openClearAllConfirm);
    clearAllCancelBtnEl.addEventListener("click", closeClearAllConfirm);
    clearAllCloseTriggers.forEach((triggerEl) => triggerEl.addEventListener("click", closeClearAllConfirm));
    clearAllConfirmBtnEl.addEventListener("click", async () => {
      closeClearAllConfirm();
      await handlers.onClearAllSessions();
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
    newSessionBtnEl.addEventListener("click", handlers.onNewSession);
    jumpToBottomBtnEl.addEventListener("click", scrollChatToBottom);
    sendBtnEl.addEventListener("click", handlers.onSend);
    clearBtnEl.addEventListener("click", handlers.onClearCurrentView);
    chatEl.addEventListener("scroll", toggleJumpButton);

    sessionListEl.addEventListener("click", (event) => {
      const actionEl = event.target.closest("[data-action]");
      if (!actionEl) {
        return;
      }

      const sessionId = actionEl.dataset.sessionId;
      const action = actionEl.dataset.action;
      if (action === "open-session") {
        handlers.onOpenSession(sessionId);
      } else if (action === "delete-session") {
        handlers.onDeleteSession(sessionId);
      }
    });

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
    bindClearAllConfirmEvents(handlers);
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
    imageDataToRenderData,
    renderContextSummary,
    renderMessages,
    renderSessionList,
    renderSessionMeta,
    renderStorageUsage,
    revokeObjectUrls,
    setWorkspaceMeta,
    showLoading
  };
})();
