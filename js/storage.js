const storage = (() => {
  const API_KEY_STORAGE_KEY = "img_plus_api_key";
  const ACCESS_KEY_STORAGE_KEY = "img_plus_access_key";
  const DB_NAME = "img_plus_history_db";
  const DB_VERSION = 1;
  const SESSION_STORE = "sessions";
  const ASSET_STORE = "assets";
  const MAX_SESSIONS = 36;
  const MAX_IMAGES_PER_SESSION = 18;
  const STORAGE_WARNING_RATIO = 0.72;

  let dbPromise = null;

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
      // 本地存储不可用时不影响主流程。
    }
  }

  function persistApiKey(value) {
    persistValue(API_KEY_STORAGE_KEY, value);
  }

  function persistAccessKey(value) {
    persistValue(ACCESS_KEY_STORAGE_KEY, value);
  }

  function openDb() {
    if (dbPromise) {
      return dbPromise;
    }

    dbPromise = new Promise((resolve, reject) => {
      const request = window.indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;

        if (!db.objectStoreNames.contains(SESSION_STORE)) {
          const sessionStore = db.createObjectStore(SESSION_STORE, { keyPath: "id" });
          sessionStore.createIndex("updatedAt", "updatedAt");
        }

        if (!db.objectStoreNames.contains(ASSET_STORE)) {
          db.createObjectStore(ASSET_STORE, { keyPath: "id" });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("无法打开 IndexedDB。"));
    });

    return dbPromise;
  }

  async function withStores(storeNames, mode, handler) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeNames, mode);
      const stores = storeNames.reduce((acc, name) => {
        acc[name] = tx.objectStore(name);
        return acc;
      }, {});

      let result;
      try {
        result = handler(stores, tx);
      } catch (error) {
        reject(error);
        return;
      }

      tx.oncomplete = async () => {
        try {
          resolve(await result);
        } catch (error) {
          reject(error);
        }
      };
      tx.onerror = () => reject(tx.error || new Error("数据库事务失败。"));
      tx.onabort = () => reject(tx.error || new Error("数据库事务中断。"));
    });
  }

  function requestToPromise(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("数据库请求失败。"));
    });
  }

  function createId(prefix) {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  function createSession() {
    const now = Date.now();
    return {
      id: createId("session"),
      title: "新会话",
      createdAt: now,
      updatedAt: now,
      lastPrompt: "",
      contextPrompt: "",
      messages: []
    };
  }

  function buildSessionSummary(session) {
    return {
      id: session.id,
      title: session.title,
      updatedAt: session.updatedAt,
      createdAt: session.createdAt,
      lastPrompt: session.lastPrompt,
      messageCount: session.messages.length,
      imageCount: session.messages.filter((message) => message.imageRef).length
    };
  }

  async function listSessions() {
    return withStores([SESSION_STORE], "readonly", async ({ [SESSION_STORE]: sessionStore }) => {
      const sessions = await requestToPromise(sessionStore.getAll());
      return sessions
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .map(buildSessionSummary);
    });
  }

  async function getSession(sessionId) {
    return withStores([SESSION_STORE, ASSET_STORE], "readonly", async ({ [SESSION_STORE]: sessionStore, [ASSET_STORE]: assetStore }) => {
      const session = await requestToPromise(sessionStore.get(sessionId));
      if (!session) {
        return null;
      }

      const hydratedMessages = [];
      for (const message of session.messages) {
        if (!message.imageRef) {
          hydratedMessages.push({ ...message });
          continue;
        }

        if (message.imageRef.kind === "remote") {
          hydratedMessages.push({
            ...message,
            imageUrl: message.imageRef.value
          });
          continue;
        }

        const asset = await requestToPromise(assetStore.get(message.imageRef.assetId));
        let imageUrl = "";
        if (asset?.blob) {
          imageUrl = URL.createObjectURL(asset.blob);
        }

        hydratedMessages.push({
          ...message,
          imageUrl
        });
      }

      return {
        ...session,
        messages: hydratedMessages
      };
    });
  }

  async function getStoredSession(sessionId) {
    return withStores([SESSION_STORE], "readonly", ({ [SESSION_STORE]: sessionStore }) => requestToPromise(sessionStore.get(sessionId)));
  }

  async function saveSession(session) {
    const sanitizedMessages = [];
    const assetWrites = [];

    for (const message of session.messages) {
      if (!message.imageRef) {
        sanitizedMessages.push({
          id: message.id,
          role: message.role,
          text: message.text,
          createdAt: message.createdAt
        });
        continue;
      }

      if (message.imageRef.kind === "remote") {
        sanitizedMessages.push({
          id: message.id,
          role: message.role,
          text: message.text,
          createdAt: message.createdAt,
          imageRef: message.imageRef
        });
        continue;
      }

      if (message.imageRef.kind === "asset" && message.imageRef.blob) {
        assetWrites.push({
          id: message.imageRef.assetId,
          blob: message.imageRef.blob,
          createdAt: message.createdAt,
          sessionId: session.id
        });
      }

      sanitizedMessages.push({
        id: message.id,
        role: message.role,
        text: message.text,
        createdAt: message.createdAt,
        imageRef: {
          kind: "asset",
          assetId: message.imageRef.assetId
        }
      });
    }

    const sessionToStore = {
      ...session,
      messages: sanitizedMessages,
      updatedAt: Date.now()
    };

    await withStores([SESSION_STORE, ASSET_STORE], "readwrite", ({ [SESSION_STORE]: sessionStore, [ASSET_STORE]: assetStore }) => {
      assetWrites.forEach((asset) => assetStore.put(asset));
      sessionStore.put(sessionToStore);
    });

    await pruneStorage();
    return sessionToStore;
  }

  async function pruneStorage() {
    const summaries = await listSessions();

    if (summaries.length > MAX_SESSIONS) {
      const overflow = summaries.slice(MAX_SESSIONS);
      for (const session of overflow) {
        await deleteSession(session.id);
      }
    }

    for (const summary of summaries.slice(0, MAX_SESSIONS)) {
      const session = await getStoredSession(summary.id);
      if (!session) {
        continue;
      }

      const imageMessages = session.messages.filter((message) => message.imageRef);
      if (imageMessages.length <= MAX_IMAGES_PER_SESSION) {
        continue;
      }

      const removable = imageMessages.slice(0, imageMessages.length - MAX_IMAGES_PER_SESSION);
      const removableIds = new Set(removable.map((message) => message.id));

      const trimmedMessages = session.messages.filter((message) => !removableIds.has(message.id));
      const assetIds = removable
        .filter((message) => message.imageRef?.kind === "asset")
        .map((message) => message.imageRef.assetId);

      await withStores([SESSION_STORE, ASSET_STORE], "readwrite", ({ [SESSION_STORE]: sessionStore, [ASSET_STORE]: assetStore }) => {
        assetIds.forEach((assetId) => assetStore.delete(assetId));
        sessionStore.put({
          ...session,
          messages: trimmedMessages.map(stripRuntimeFields),
          updatedAt: Date.now()
        });
      });
    }
  }

  function stripRuntimeFields(message) {
    const next = {
      id: message.id,
      role: message.role,
      text: message.text,
      createdAt: message.createdAt
    };

    if (message.imageRef) {
      next.imageRef = message.imageRef.kind === "remote"
        ? message.imageRef
        : { kind: "asset", assetId: message.imageRef.assetId };
    }

    return next;
  }

  async function deleteSession(sessionId) {
    const existing = await withStores([SESSION_STORE], "readonly", ({ [SESSION_STORE]: sessionStore }) => requestToPromise(sessionStore.get(sessionId)));
    if (!existing) {
      return;
    }

    const assetIds = existing.messages
      .filter((message) => message.imageRef?.kind === "asset")
      .map((message) => message.imageRef.assetId);

    await withStores([SESSION_STORE, ASSET_STORE], "readwrite", ({ [SESSION_STORE]: sessionStore, [ASSET_STORE]: assetStore }) => {
      sessionStore.delete(sessionId);
      assetIds.forEach((assetId) => assetStore.delete(assetId));
    });
  }

  async function clearAllSessions() {
    await withStores([SESSION_STORE, ASSET_STORE], "readwrite", ({ [SESSION_STORE]: sessionStore, [ASSET_STORE]: assetStore }) => {
      sessionStore.clear();
      assetStore.clear();
    });
  }

  async function estimateStorage() {
    if (!navigator.storage?.estimate) {
      return {
        usage: 0,
        quota: 0,
        usageRatio: 0,
        isNearLimit: false
      };
    }

    const estimate = await navigator.storage.estimate();
    const usage = estimate.usage || 0;
    const quota = estimate.quota || 0;
    const usageRatio = quota ? usage / quota : 0;

    return {
      usage,
      quota,
      usageRatio,
      isNearLimit: usageRatio >= STORAGE_WARNING_RATIO
    };
  }

  return {
    clearAllSessions,
    createId,
    createSession,
    deleteSession,
    estimateStorage,
    getLocalValues,
    getSession,
    listSessions,
    persistAccessKey,
    persistApiKey,
    saveSession
  };
})();
