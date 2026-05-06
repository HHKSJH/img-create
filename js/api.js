const imageApi = (() => {
  const API_BASE_URL = "https://api.zectai.com/v1";
  const IMAGE_ENDPOINT = `${API_BASE_URL}/images/generations`;
  const IMAGE_MODEL = "gpt-image-2";
  const REQUEST_TIMEOUT = 90000;

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
    return result?.error?.message || result?.message || `请求失败（HTTP ${response.status}）`;
  }

  async function generateImage({ apiKey, prompt, size = "1024x1024" }) {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

    try {
      const response = await fetch(IMAGE_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: IMAGE_MODEL,
          prompt,
          size
        })
      });

      const result = await parseResponse(response);
      if (!response.ok) {
        throw new Error(buildRequestError(result, response));
      }

      const base64Data = result?.data?.[0]?.b64_json;
      if (!base64Data) {
        throw new Error("接口未返回图片数据。");
      }

      return base64Data;
    } catch (error) {
      if (error?.name === "AbortError") {
        throw new Error("请求超时，请检查网络或稍后重试。");
      }
      throw error;
    } finally {
      window.clearTimeout(timeoutId);
    }
  }

  return {
    generateImage
  };
})();
