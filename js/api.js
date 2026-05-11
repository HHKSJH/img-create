const imageApi = (() => {
  const API_BASE_URL = "https://api.zectai.com/v1";  
  // const API_BASE_URL = "https://api.kr777.top/v1";
  const IMAGE_ENDPOINT = `${API_BASE_URL}/images/generations`;
  const IMAGE_MODEL = "gpt-image-2";
  const ALLOWED_SIZES = new Set(["1024x1024", "1536x1024", "1024x1536"]);

  async function parseResponse(response) {
    const rawText = await response.text();
    if (!rawText) {
      return {};
    }

    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      try {
        return JSON.parse(rawText);
      } catch {
        throw new Error("接口返回了无法解析的 JSON。");
      }
    }

    return { message: rawText };
  }

  function buildRequestError(result, response) {
    return result?.error?.message || result?.message || `请求失败（HTTP ${response.status}）。`;
  }

  function readImageData(result) {
    const firstItem = result?.data?.[0];
    const base64Data = firstItem?.b64_json || firstItem?.b64;
    const remoteUrl = firstItem?.url;

    if (base64Data) {
      return { type: "base64", value: base64Data };
    }

    if (remoteUrl) {
      return { type: "url", value: remoteUrl };
    }

    throw new Error("接口未返回图片数据。");
  }

  async function generateImage({ apiKey, prompt, size = "1024x1024" }) {
    const requestSize = ALLOWED_SIZES.has(size) ? size : "1024x1024";

    const response = await fetch(IMAGE_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: IMAGE_MODEL,
        prompt,
        size: requestSize
      })
    });

    const result = await parseResponse(response);
    if (!response.ok) {
      throw new Error(buildRequestError(result, response));
    }

    return readImageData(result);
  }

  return {
    generateImage
  };
})();
