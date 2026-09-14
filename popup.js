// popup.js - Extension Toolbar Action Controller

document.addEventListener("DOMContentLoaded", async () => {
  // 1. Detect OS for shortcut display (Mac vs Windows/Linux)
  const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
  if (isMac) {
    document.querySelectorAll("kbd").forEach((el) => {
      el.textContent = el.textContent.replace("Ctrl+", "Cmd+");
    });
  }

  // 2. Read saved provider and API key settings & auth status
  const providerMap = {
    gemini: "Google Gemini",
    openai: "OpenAI",
    anthropic: "Anthropic Claude",
    groq: "Groq Llama 3.3",
    deepseek: "DeepSeek",
    ollama: "Ollama (Local)",
    custom: "Custom Endpoint"
  };

  const providerEl = document.getElementById("provider-name");
  const indicatorEl = document.getElementById("key-indicator");

  chrome.runtime.sendMessage({ action: "GET_AUTH_STATUS" }, (res) => {
    const status = res?.data || {};
    chrome.storage.local.get(["li_provider", "li_apikey", "li_model"], (data) => {
      const provider = data.li_provider || "gemini";
      const providerName = providerMap[provider] || "Google Gemini";
      const modelName = data.li_model ? ` (${data.li_model})` : "";
      providerEl.textContent = `${providerName}${modelName}`;

      const isConfigured = provider === "ollama" || data.li_apikey || status.hasKey;
      if (isConfigured) {
        indicatorEl.textContent = "● Key Configured";
        indicatorEl.style.color = "#137333";
      } else {
        indicatorEl.textContent = "○ Key Missing";
        indicatorEl.style.color = "#c5221f";
      }
    });
  });

  // 3. Helper: Query Active Tab
  async function getActiveTab() {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    return tabs[0];
  }

  function isLinkedInUrl(rawUrl) {
    try {
      const { hostname } = new URL(rawUrl);
      const host = hostname.toLowerCase();
      return host === "linkedin.com" || host.endsWith(".linkedin.com");
    } catch {
      return false;
    }
  }

  // 4. Action: Toggle Panel
  document.getElementById("btn-toggle-panel").addEventListener("click", async () => {
    const tab = await getActiveTab();
    if (tab && tab.url && isLinkedInUrl(tab.url)) {
      chrome.tabs.sendMessage(tab.id, {
        action: "EXECUTE_COMMAND",
        command: "toggle-agent-panel"
      }).catch(() => {});
      window.close();
    } else {
      chrome.tabs.create({ url: "https://www.linkedin.com/feed/" });
      window.close();
    }
  });

  // 5. Action: Humanize Draft
  document.getElementById("btn-humanize-draft").addEventListener("click", async () => {
    const tab = await getActiveTab();
    if (tab && tab.url && isLinkedInUrl(tab.url)) {
      chrome.tabs.sendMessage(tab.id, {
        action: "EXECUTE_COMMAND",
        command: "humanize-draft"
      }).catch(() => {});
      window.close();
    } else {
      chrome.tabs.create({ url: "https://www.linkedin.com/feed/" });
      window.close();
    }
  });

  // 6. Action: Open LinkedIn Feed
  document.getElementById("btn-open-linkedin").addEventListener("click", async () => {
    const tabs = await chrome.tabs.query({ url: "*://*.linkedin.com/*" });
    if (tabs.length > 0) {
      await chrome.tabs.update(tabs[0].id, { active: true });
      if (tabs[0].windowId) {
        await chrome.windows.update(tabs[0].windowId, { focused: true });
      }
    } else {
      await chrome.tabs.create({ url: "https://www.linkedin.com/feed/" });
    }
    window.close();
  });
});
