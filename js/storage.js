const storage = (() => {
  const API_KEY_STORAGE_KEY = "img_plus_api_key";
  const ACCESS_KEY_STORAGE_KEY = "img_plus_access_key";

  function getLocalValues() {
    return {
      apiKey: window.localStorage.getItem(API_KEY_STORAGE_KEY) || "",
      accessKey: window.localStorage.getItem(ACCESS_KEY_STORAGE_KEY) || ""
    };
  }

  function persistValue(key, value) {
    const trimmedValue = value.trim();
    if (trimmedValue) {
      window.localStorage.setItem(key, trimmedValue);
    } else {
      window.localStorage.removeItem(key);
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
