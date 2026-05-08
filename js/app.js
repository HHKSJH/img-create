const STYLE_PROMPTS = {
  auto: "",
  poster: "高级感海报风格，版式克制，构图干净，视觉张力强。",
  photo: "真实摄影风格，光影自然，细节清晰，质感真实。",
  illustration: "精致插画风格，色彩统一，画面完整，细节丰富。",
  cinematic: "电影感风格，戏剧化光影，层次分明，氛围强烈。",
  minimalist: "极简风格，留白克制，元素精简，色调统一。"
};

let currentSession = storage.createSession();
let currentSessionId = currentSession.id;
let sessionsIndex = [];
let lastRequestPayload = null;
let contextMode = "continuation";

function buildPrompt(userPrompt, stylePreset) {
  const prompt = userPrompt.trim();
  const stylePrompt = STYLE_PROMPTS[stylePreset] || "";
  return stylePrompt ? `${prompt}\n\n风格要求：${stylePrompt}` : prompt;
}

function summarizePrompt(prompt) {
  const normalized = prompt.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "当前无上下文";
  }
  return normalized.length > 88 ? `${normalized.slice(0, 88)}...` : normalized;
}

function getCurrentContextPrompt() {
  return currentSession.contextPrompt || "";
}

function updateContextSummary() {
  const contextPrompt = getCurrentContextPrompt();
  ui.renderContextSummary({
    mode: contextMode,
    hasContext: Boolean(contextPrompt),
    summary: summarizePrompt(contextPrompt)
  });
}

function updateWorkspaceMeta() {
  const imageCount = currentSession.messages.filter((message) => message.imageRef).length;
  ui.setWorkspaceMeta({
    title: currentSession.title,
    subtitle: imageCount ? `当前会话已生成 ${imageCount} 张图片。` : "输入需求后，生成结果会显示在这里。",
    tag: currentSession.messages.length ? `${currentSession.messages.length} 条记录` : "新会话"
  });
}

function buildFinalPrompt({ prompt, stylePreset }) {
  const currentPrompt = buildPrompt(prompt, stylePreset);
  const contextPrompt = getCurrentContextPrompt();

  if (contextMode !== "continuation" || !contextPrompt) {
    return currentPrompt;
  }

  return [
    "基于当前会话最近一次成功生成的画面继续优化。",
    `上一轮核心描述：${contextPrompt}`,
    `本轮新增要求：${currentPrompt}`,
    "请保留延续性，仅按新增要求调整画面。"
  ].join("\n\n");
}

function validatePayload({ prompt, apiKey }) {
  if (!apiKey) {
    ui.appendMessage("assistant", "请先输入 API Key。");
    ui.focusApiKey();
    return false;
  }

  if (!prompt) {
    ui.appendMessage("assistant", "请先描述你想生成的画面。");
    ui.focusPrompt();
    return false;
  }

  return true;
}

function buildSessionTitle(prompt) {
  const normalized = prompt.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "未命名会话";
  }
  return normalized.length > 22 ? `${normalized.slice(0, 22)}...` : normalized;
}

async function refreshSessionIndex() {
  sessionsIndex = await storage.listSessions();
  ui.renderSessionList(sessionsIndex, currentSessionId);
  ui.renderSessionMeta(`${sessionsIndex.length} 个本地会话`);
}

async function refreshStorageUsage() {
  const estimate = await storage.estimateStorage();
  ui.renderStorageUsage(estimate);
}

async function persistCurrentSession() {
  currentSession = await storage.saveSession(currentSession);
  currentSessionId = currentSession.id;
  await refreshSessionIndex();
  await refreshStorageUsage();
  updateWorkspaceMeta();
  updateContextSummary();
}

function buildUserMessageText(prompt) {
  return contextMode === "continuation" && getCurrentContextPrompt()
    ? `继续创作：${prompt}`
    : prompt;
}

async function runGeneration(requestPayload, { appendUserMessage = true } = {}) {
  const payload = {
    ...requestPayload,
    prompt: requestPayload.prompt.trim(),
    apiKey: requestPayload.apiKey.trim(),
    accessKey: requestPayload.accessKey.trim(),
    stylePreset: STYLE_PROMPTS[requestPayload.stylePreset] === undefined ? "auto" : requestPayload.stylePreset
  };

  if (!validatePayload(payload)) {
    return;
  }

  storage.persistApiKey(payload.apiKey);
  storage.persistAccessKey(payload.accessKey);

  lastRequestPayload = { ...payload };
  const finalPrompt = buildFinalPrompt(payload);
  const messageTime = Date.now();

  if (appendUserMessage) {
    const userMessage = {
      id: storage.createId("msg"),
      role: "user",
      text: buildUserMessageText(payload.prompt),
      createdAt: messageTime
    };
    currentSession.messages.push(userMessage);
    currentSession.title = currentSession.messages.length <= 1 ? buildSessionTitle(payload.prompt) : currentSession.title;
    currentSession.lastPrompt = payload.prompt;
    ui.appendMessage("user", userMessage.text);
    ui.clearPrompt();
    await persistCurrentSession();
  }

  ui.showLoading();

  try {
    const imageData = await imageApi.generateImage({
      apiKey: payload.apiKey,
      prompt: finalPrompt,
      size: payload.size
    });

    const renderData = ui.imageDataToRenderData(imageData);
    const promptForContext = buildPrompt(payload.prompt, payload.stylePreset);
    const assistantMessage = {
      id: storage.createId("msg"),
      role: "assistant",
      text: "图片已生成。",
      createdAt: Date.now(),
      imageRef: renderData.imageRef,
      imageUrl: renderData.imageUrl
    };

    currentSession.contextPrompt = promptForContext;
    currentSession.lastPrompt = payload.prompt;
    currentSession.messages.push(assistantMessage);
    ui.appendMessage("assistant", assistantMessage.text, assistantMessage.imageUrl);
    await persistCurrentSession();
  } catch (error) {
    const errorText = `请求失败：${error.message || "未知错误"}`;
    currentSession.messages.push({
      id: storage.createId("msg"),
      role: "assistant",
      text: errorText,
      createdAt: Date.now()
    });
    ui.appendRetryMessage(errorText);
    await persistCurrentSession();
  } finally {
    ui.hideLoading();
  }
}

async function sendMessage() {
  const requestPayload = ui.getInputValues();
  await runGeneration(requestPayload, { appendUserMessage: true });
}

async function retryLastRequest() {
  if (!lastRequestPayload) {
    ui.appendMessage("assistant", "没有可重试的请求。");
    return;
  }

  await runGeneration(lastRequestPayload, { appendUserMessage: false });
}

async function loadSession(sessionId) {
  const session = await storage.getSession(sessionId);
  if (!session) {
    return;
  }

  ui.revokeObjectUrls();
  currentSession = session;
  currentSessionId = session.id;
  ui.renderMessages(session.messages);
  updateWorkspaceMeta();
  updateContextSummary();
  await refreshSessionIndex();
}

async function createAndOpenSession() {
  currentSession = storage.createSession();
  currentSessionId = currentSession.id;
  ui.clearMessages();
  updateWorkspaceMeta();
  updateContextSummary();
  await refreshSessionIndex();
}

async function deleteSession(sessionId) {
  await storage.deleteSession(sessionId);

  if (sessionId === currentSessionId) {
    await createAndOpenSession();
  }

  await refreshSessionIndex();
  await refreshStorageUsage();

  if (sessionId !== currentSessionId) {
    updateWorkspaceMeta();
    updateContextSummary();
  }
}

async function clearAllSessions() {
  await storage.clearAllSessions();
  await createAndOpenSession();
  await refreshStorageUsage();
}

function resetContext() {
  currentSession.contextPrompt = "";
  updateContextSummary();
}

async function init() {
  ui.fillLocalValues(storage.getLocalValues());
  updateWorkspaceMeta();
  updateContextSummary();
  await refreshSessionIndex();
  await refreshStorageUsage();

  if (sessionsIndex.length) {
    await loadSession(sessionsIndex[0].id);
  }

  ui.bindEvents({
    onApiKeyChange: storage.persistApiKey,
    onAccessKeyChange: storage.persistAccessKey,
    onSend: sendMessage,
    onRetry: retryLastRequest,
    onClearCurrentView: () => {
      ui.renderMessages(currentSession.messages);
    },
    onContextModeChange: (enabled) => {
      contextMode = enabled ? "continuation" : "independent";
      updateContextSummary();
    },
    onResetContext: resetContext,
    onNewSession: createAndOpenSession,
    onOpenSession: loadSession,
    onDeleteSession: deleteSession,
    onClearAllSessions: clearAllSessions
  });

  window.addEventListener("pagehide", ui.revokeObjectUrls);
}

init().catch((error) => {
  ui.appendMessage("assistant", `初始化失败：${error.message || "未知错误"}`);
});
