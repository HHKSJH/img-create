const storage = (() => {
  const API_KEY_STORAGE_KEY = "img_plus_api_key";
  const ACCESS_KEY_STORAGE_KEY = "img_plus_access_key";

  function getLocalValues() {
    return {
      apiKey: readValue(API_KEY_STORAGE_KEY),
      accessKey: readValue(ACCESS_KEY_STORAGE_KEY)
    };
  }

  function readValue(key) {
    try {
      return window.localStorage.getItem(key) || "";
    } catch {
      return "";
    }
  }

  function persistValue(key, value) {
    const trimmedValue = value.trim();
    try {
      if (trimmedValue) {
        window.localStorage.setItem(key, trimmedValue);
      } else {
        window.localStorage.removeItem(key);
      }
    } catch {
      // 本地存储不可用时不影响生成流程。
    }
  }

  function persistApiKey(value) {
    persistValue(API_KEY_STORAGE_KEY, value);
  }

  function persistAccessKey(value) {
    persistValue(ACCESS_KEY_STORAGE_KEY, value);
  }

  return {
    getLocalValues,
    persistApiKey,
    persistAccessKey
  };
})();
