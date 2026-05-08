const STYLE_PROMPTS = {
  auto: "",
  poster: "高级感海报风格，版式克制，构图干净，视觉张力强。",
  photo: "真实摄影风格，光影自然，细节清晰，质感真实。",
  illustration: "精致插画风格，色彩统一，画面完整，细节丰富。",
  cinematic: "电影感风格，戏剧化光影，层次分明，氛围强烈。",
  minimalist: "极简风格，留白克制，元素精简，色调统一。"
};

let lastRequestPayload = null;
let lastSuccessfulPrompt = "";
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

function updateContextSummary() {
  ui.renderContextSummary({
    mode: contextMode,
    hasContext: Boolean(lastSuccessfulPrompt),
    summary: summarizePrompt(lastSuccessfulPrompt)
  });
}

function buildFinalPrompt({ prompt, stylePreset }) {
  const currentPrompt = buildPrompt(prompt, stylePreset);

  if (contextMode !== "continuation" || !lastSuccessfulPrompt) {
    return currentPrompt;
  }

  return [
    "基于上一轮成功生成的画面继续优化。",
    `上一轮核心描述：${lastSuccessfulPrompt}`,
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

  if (appendUserMessage) {
    ui.appendMessage(
      "user",
      contextMode === "continuation" && lastSuccessfulPrompt
        ? `继续创作：${payload.prompt}`
        : payload.prompt
    );
    ui.clearPrompt();
  }

  ui.showLoading();

  try {
    const imageData = await imageApi.generateImage({
      apiKey: payload.apiKey,
      prompt: finalPrompt,
      size: payload.size
    });
    const imageUrl = ui.imageDataToObjectUrl(imageData);

    lastSuccessfulPrompt = buildPrompt(payload.prompt, payload.stylePreset);
    updateContextSummary();
    ui.appendMessage("assistant", "图片已生成。", imageUrl);
  } catch (error) {
    ui.appendRetryMessage(`请求失败：${error.message || "未知错误"}`);
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

function resetContext() {
  if (!lastSuccessfulPrompt) {
    updateContextSummary();
    return;
  }

  lastSuccessfulPrompt = "";
  updateContextSummary();
}

function init() {
  ui.fillLocalValues(storage.getLocalValues());
  updateContextSummary();

  ui.bindEvents({
    onApiKeyChange: storage.persistApiKey,
    onAccessKeyChange: storage.persistAccessKey,
    onSend: sendMessage,
    onRetry: retryLastRequest,
    onClear: () => {
      ui.clearMessages();
      ui.clearPrompt();
      ui.focusPrompt();
    },
    onContextModeChange: (enabled) => {
      contextMode = enabled ? "continuation" : "independent";
      updateContextSummary();
    },
    onResetContext: resetContext
  });

  window.addEventListener("pagehide", ui.revokeObjectUrls);
}

init();
