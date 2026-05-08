const STYLE_PROMPTS = {
  auto: "",
  poster: "高级感海报风格，版式克制，构图干净，视觉张力强。",
  photo: "真实摄影风格，光影自然，细节清晰，质感真实。",
  illustration: "精致插画风格，色彩统一，画面完整，细节丰富。",
  cinematic: "电影感风格，戏剧化光影，层次分明，氛围强烈。",
  minimalist: "极简风格，留白克制，元素精简，色调统一。"
};

let lastRequestPayload = null;

function buildPrompt(userPrompt, stylePreset) {
  const prompt = userPrompt.trim();
  const stylePrompt = STYLE_PROMPTS[stylePreset] || "";
  return stylePrompt ? `${prompt}\n\n风格要求：${stylePrompt}` : prompt;
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
  const finalPrompt = buildPrompt(payload.prompt, payload.stylePreset);

  if (appendUserMessage) {
    ui.appendMessage("user", payload.prompt);
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

function init() {
  ui.fillLocalValues(storage.getLocalValues());

  ui.bindEvents({
    onApiKeyChange: storage.persistApiKey,
    onAccessKeyChange: storage.persistAccessKey,
    onSend: sendMessage,
    onRetry: retryLastRequest,
    onClear: () => {
      ui.clearMessages();
      ui.clearPrompt();
      ui.focusPrompt();
    }
  });

  window.addEventListener("pagehide", ui.revokeObjectUrls);
}

init();
