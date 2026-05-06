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
  const stylePrompt = STYLE_PROMPTS[stylePreset] || "";
  return stylePrompt ? `${userPrompt}\n\n风格要求：${stylePrompt}` : userPrompt;
}

async function runGeneration(requestPayload, { appendUserMessage = true } = {}) {
  const { prompt, apiKey, accessKey, size, stylePreset } = requestPayload;

  if (!apiKey) {
    ui.appendMessage("assistant", "请先输入 API Key。");
    ui.focusApiKey();
    return;
  }

  if (!prompt) {
    return;
  }

  storage.persistApiKey(apiKey);
  storage.persistAccessKey(accessKey);

  lastRequestPayload = { ...requestPayload };
  const finalPrompt = buildPrompt(prompt, stylePreset);

  if (appendUserMessage) {
    ui.appendMessage("user", prompt);
    ui.clearPrompt();
  }

  ui.showLoading();

  try {
    const base64Data = await imageApi.generateImage({
      apiKey,
      prompt: finalPrompt,
      size
    });
    const imageUrl = ui.base64ToObjectUrl(base64Data);
    ui.appendMessage("assistant", "图片已生成。", imageUrl);
  } catch (error) {
    ui.appendRetryMessage(`请求失败：${error.message}`);
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
