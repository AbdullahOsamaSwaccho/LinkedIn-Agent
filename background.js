/**
 * background.js - Universal AI Provider Bridge (Streaming, Retries & Prompt Caching)
 */

import { ARCHETYPE_PROMPTS } from "./prompts.js";

chrome.runtime.onConnect.addListener((port) => {
  if (port.name === "AI_STREAM_PORT") {
    port.onMessage.addListener(async (msg) => {
      if (msg.action === "START_STREAM") {
        try {
          await handleStreamingLLM(msg.payload, port);
        } catch (err) {
          port.postMessage({ type: "ERROR", error: err.message });
        }
      }
    });
  }
});

async function getAuthStatus() {
  const storage = await chrome.storage.local.get([
    "li_provider",
    "li_apikey",
    "apiKey"
  ]);
  const provider = storage.li_provider || "gemini";
  const apiKey = storage.li_apikey || storage.apiKey;
  const hasKey = !!apiKey;
  const isConfigured = provider === "ollama" || hasKey;

  return {
    provider,
    activeType: isConfigured ? "key" : "none",
    hasKey: hasKey
  };
}

/**
 * Retrieve LinkedIn API Credentials from local storage
 */
async function getLinkedInApiCredentials() {
  const data = await chrome.storage.local.get([
    "li_access_token",
    "google_oauth_token",
    "li_person_urn"
  ]);
  const token = data.li_access_token || data.google_oauth_token;
  const personUrn = data.li_person_urn;
  return { token, personUrn };
}

/**
 * 1. Publish directly via LinkedIn's Posts API (/rest/posts)
 */
async function publishToLinkedIn(content, imageUrn = null) {
  const { token, personUrn } = await getLinkedInApiCredentials();

  if (!token) {
    throw new Error("Missing LinkedIn Access Token. Please configure your LinkedIn API Token in Settings (⚙️).");
  }
  if (!personUrn) {
    throw new Error("Missing LinkedIn Person URN (e.g., urn:li:person:YOUR_ID). Please configure in Settings (⚙️).");
  }

  const payload = {
    author: personUrn,
    commentary: content,
    visibility: "PUBLIC",
    distribution: {
      feedDistribution: "MAIN_FEED",
      targetEntities: [],
      thirdPartyDistributionChannels: []
    },
    lifecycleState: "PUBLISHED"
  };

  if (imageUrn) {
    payload.content = {
      media: { id: imageUrn }
    };
  }

  const response = await fetch("https://api.linkedin.com/rest/posts", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "LinkedIn-Version": "202401",
      "X-Restli-Protocol-Version": "2.0.0",
      "Content-Type": "application/json",
      "x-li-format": "json"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.message || `LinkedIn API HTTP ${response.status}`);
  }

  return { success: true };
}

/**
 * 2. Upload Rich Media (Image/Video) to LinkedIn (3-Step REST Process)
 */
async function uploadLinkedInImage(mediaData) {
  const { token, personUrn } = await getLinkedInApiCredentials();

  if (!token || !personUrn) {
    throw new Error("Missing LinkedIn credentials (access token or person URN).");
  }

  // Ensure owner is a properly qualified URN
  const formattedOwner = personUrn.startsWith("urn:li:") ? personUrn : `urn:li:person:${personUrn}`;

  // Step A: Initialize Image Upload
  const initRes = await fetch("https://api.linkedin.com/rest/images?action=initializeUpload", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "LinkedIn-Version": "202401",
      "X-Restli-Protocol-Version": "2.0.0",
      "Content-Type": "application/json",
      "x-li-format": "json"
    },
    body: JSON.stringify({
      initializeUploadRequest: { owner: formattedOwner }
    })
  });

  if (!initRes.ok) {
    const err = await initRes.json().catch(() => ({}));
    throw new Error(err.message || `Initialize image upload failed: HTTP ${initRes.status}`);
  }

  const initData = await initRes.json();
  const uploadUrl = initData.value?.uploadUrl;
  const imageUrn = initData.value?.image;

  if (!uploadUrl || !imageUrn) {
    throw new Error("LinkedIn image initialization did not return an upload URL or image URN.");
  }

  // Step B: Convert data URI or base64 to binary buffer
  let binaryBody = null;
  let contentType = mediaData.type || "image/jpeg";

  if (typeof mediaData === "string" && mediaData.startsWith("data:")) {
    const split = mediaData.split(",");
    contentType = split[0].split(":")[1].split(";")[0];
    const byteString = atob(split[1]);
    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);
    for (let i = 0; i < byteString.length; i++) {
      ia[i] = byteString.charCodeAt(i);
    }
    binaryBody = ab;
  } else if (mediaData.base64) {
    const byteString = atob(mediaData.base64);
    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);
    for (let i = 0; i < byteString.length; i++) {
      ia[i] = byteString.charCodeAt(i);
    }
    binaryBody = ab;
  } else {
    throw new Error("Invalid media data format.");
  }

  // Upload Binary Bytes via PUT
  // CRITICAL: uploadUrl is a pre-signed storage URL (e.g. S3/Azure Blob).
  // Do NOT pass Authorization or RestLi headers here; doing so causes 400 Bad Request or 403 Forbidden.
  const uploadRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": contentType || "application/octet-stream"
    },
    body: binaryBody
  });

  if (!uploadRes.ok) {
    throw new Error(`Media binary upload failed with HTTP ${uploadRes.status}`);
  }

  return imageUrn;
}

/**
 * 3. Queue & Schedule Post using chrome.alarms
 */
async function schedulePost(content, scheduledTimestamp, mediaData = null) {
  const postId = `scheduled_post_${Date.now()}`;
  const postItem = {
    id: postId,
    content,
    scheduledTime: scheduledTimestamp,
    mediaData: mediaData || null,
    createdAt: Date.now()
  };

  const { scheduledQueue = [] } = await chrome.storage.local.get("scheduledQueue");
  scheduledQueue.push(postItem);
  await chrome.storage.local.set({ scheduledQueue });

  chrome.alarms.create(postId, { when: scheduledTimestamp });
  return { success: true, id: postId };
}

/**
 * 4. Cancel scheduled post from queue & clear alarm
 */
async function cancelScheduledPost(postId) {
  const { scheduledQueue = [] } = await chrome.storage.local.get("scheduledQueue");
  const updatedQueue = scheduledQueue.filter((item) => item.id !== postId);

  await chrome.storage.local.set({ scheduledQueue: updatedQueue });
  await chrome.alarms.clear(postId);

  return { success: true, queue: updatedQueue };
}

/**
 * 5. Fetch Post Performance Analytics (/rest/memberCreatorPostAnalytics)
 */
async function getPostAnalytics(postUrn, metricType = "IMPRESSION") {
  const { token } = await getLinkedInApiCredentials();
  if (!token) throw new Error("Missing LinkedIn access token.");

  const encodedUrn = encodeURIComponent(postUrn);
  const url = `https://api.linkedin.com/rest/memberCreatorPostAnalytics?q=entity&entity=${encodedUrn}&queryType=${metricType}&aggregation=TOTAL`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${token}`,
      "X-Restli-Protocol-Version": "2.0.0",
      "LinkedIn-Version": "202401",
      "x-li-format": "json"
    }
  });

  if (!response.ok) {
    throw new Error(`Analytics API error: ${response.statusText}`);
  }

  return await response.json();
}

/**
 * 6. Listener for Chrome Alarms (Scheduled Post Execution + Golden Hour Reminder)
 */
chrome.alarms.onAlarm.addListener(async (alarm) => {
  // 1. Scheduled Post Trigger
  if (alarm.name.startsWith("scheduled_post_")) {
    const { scheduledQueue = [] } = await chrome.storage.local.get("scheduledQueue");
    const targetIndex = scheduledQueue.findIndex((item) => item.id === alarm.name);

    if (targetIndex !== -1) {
      const targetPost = scheduledQueue[targetIndex];
      try {
        let imageUrn = null;
        if (targetPost.mediaData) {
          try {
            imageUrn = await uploadLinkedInImage(targetPost.mediaData);
          } catch (mErr) {
            console.warn("[AI Agent] Media upload failed, publishing text only:", mErr);
          }
        }

        const result = await publishToLinkedIn(targetPost.content, imageUrn);

        if (result.success) {
          scheduledQueue.splice(targetIndex, 1);
          await chrome.storage.local.set({ scheduledQueue });

          chrome.notifications.create({
            type: "basic",
            iconUrl: "icons/icon48.png",
            title: "LinkedIn Post Published!",
            message: "Your scheduled LinkedIn post has gone live."
          });

          // Set Golden Hour reminder alarm for 15 minutes post-publication
          const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;
          chrome.alarms.create(`golden_hour_${Date.now()}`, { when: Date.now() + FIFTEEN_MINUTES_MS });
        }
      } catch (err) {
        console.error("[AI Agent] Scheduled publishing failed:", err);
        chrome.notifications.create({
          type: "basic",
          iconUrl: "icons/icon48.png",
          title: "Scheduled Publishing Failed",
          message: err.message || "Could not publish post to LinkedIn."
        });
      }
    }
  }

  // 2. Golden Hour Alarm Trigger (15 mins post-publication)
  if (alarm.name.startsWith("golden_hour_")) {
    chrome.notifications.create({
      type: "basic",
      iconUrl: "icons/icon48.png",
      title: "⚡ LinkedIn Golden Hour Alert!",
      message: "Your post went live 15 mins ago! Jump on LinkedIn to reply to early comments and boost algorithm distribution.",
      priority: 2
    });
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "GET_AUTH_STATUS") {
    getAuthStatus()
      .then((status) => sendResponse({ success: true, data: status }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (request.action === "TEST_API_CONNECTION") {
    fetchWithRetry(async () => handleNonStreamingLLM(request.payload))
      .then((res) => sendResponse({ success: true, data: res }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  // Immediate Publish to LinkedIn
  if (request.action === "PUBLISH_NOW") {
    (async () => {
      let imageUrn = null;
      if (request.payload?.mediaData) {
        imageUrn = await uploadLinkedInImage(request.payload.mediaData);
      }
      return await publishToLinkedIn(request.payload?.content, imageUrn);
    })()
      .then((res) => sendResponse({ success: true, data: res }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  // Schedule Post via chrome.alarms
  if (request.action === "SCHEDULE_POST") {
    const { content, scheduledTimestamp, mediaData } = request.payload || {};
    schedulePost(content, scheduledTimestamp, mediaData)
      .then((res) => sendResponse(res))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  // Get Scheduled Queue
  if (request.action === "GET_SCHEDULED_QUEUE") {
    chrome.storage.local.get("scheduledQueue").then((data) => sendResponse(data.scheduledQueue || []));
    return true;
  }

  // Cancel Scheduled Post
  if (request.action === "CANCEL_SCHEDULED_POST") {
    cancelScheduledPost(request.payload?.postId)
      .then((res) => sendResponse(res))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  // Post Analytics
  if (request.action === "GET_POST_ANALYTICS") {
    getPostAnalytics(request.payload?.postUrn, request.payload?.metricType)
      .then((data) => sendResponse({ success: true, data }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  // Backward compatibility for non-streaming calls
  if (request.action === "GENERATE_AI_RESPONSE") {
    let fullText = "";
    const collectorPort = {
      postMessage: (msg) => {
        if (msg.type === "CHUNK") fullText += msg.chunk;
      }
    };
    handleStreamingLLM(request.payload, collectorPort)
      .then(() => sendResponse({ success: true, data: fullText || "No response generated." }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }
});

chrome.commands.onCommand.addListener((command) => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]?.id) {
      chrome.tabs.sendMessage(tabs[0].id, { action: "EXECUTE_COMMAND", command }).catch(() => {
        // Tab might not have content script ready
      });
    }
  });
});

async function fetchWithRetry(fn, retries = 3, delay = 1000) {
  try {
    return await fn();
  } catch (err) {
    const isRateLimited = err.message.includes("429") || err.message.toLowerCase().includes("rate limit");
    const isServerError = err.message.includes("500") || err.message.includes("503");

    if ((isRateLimited || isServerError) && retries > 0) {
      console.warn(`[AI Agent] Retrying request... Retries left: ${retries}. Waiting ${delay}ms`);
      await new Promise((resolve) => setTimeout(resolve, delay));
      return fetchWithRetry(fn, retries - 1, delay * 2);
    }
    throw err;
  }
}

async function handleStreamingLLM(payload, port) {
  const { provider, apiKey, model, baseUrl, systemPrompt, userPrompt, voiceCalibration = true } = payload;
  const effectiveProvider = provider || "gemini";

  if (!apiKey && effectiveProvider !== "ollama") {
    throw new Error(`API key missing for provider: ${effectiveProvider}. Please configure your API key in Settings (⚙️).`);
  }

  let finalSystemPrompt = systemPrompt;
  if (voiceCalibration !== false) {
    const { userWritingVoice = [], userWritingStyle = [] } = await chrome.storage.local.get(["userWritingVoice", "userWritingStyle"]);
    const samples = userWritingVoice.length > 0 ? userWritingVoice : userWritingStyle;
    if (samples.length > 0) {
      finalSystemPrompt += `\n\nVOICE MATCHING INSTRUCTION:
Mimic the author's exact personal tone, formatting style, sentence length, line-break patterns, and vocabulary from these verified published post samples:
---
${samples.join("\n---\n")}
---`;
    }
  }

  await fetchWithRetry(async () => {
    if (effectiveProvider === "anthropic") {
      await streamAnthropic(apiKey, model || "claude-3-5-sonnet-20241022", finalSystemPrompt, userPrompt, port);
    } else if (effectiveProvider === "gemini") {
      await streamGemini(apiKey, model || "gemini-2.0-flash", finalSystemPrompt, userPrompt, port);
    } else {
      let endpoint = "https://api.openai.com/v1";
      let defaultModel = "gpt-4o-mini";

      if (effectiveProvider === "groq") { endpoint = "https://api.groq.com/openai/v1"; defaultModel = "llama-3.3-70b-versatile"; }
      if (effectiveProvider === "deepseek") { endpoint = "https://api.deepseek.com/v1"; defaultModel = "deepseek-chat"; }
      if (effectiveProvider === "ollama") { endpoint = baseUrl || "http://localhost:11434/v1"; defaultModel = "llama3.1"; }
      if (effectiveProvider === "custom") { endpoint = baseUrl; }

      await streamOpenAICompatible(endpoint, apiKey || "ollama", model || defaultModel, finalSystemPrompt, userPrompt, port);
    }
  });
}

function estimateTokens(text) {
  if (!text) return 0;
  return Math.ceil(text.length / 3.8);
}

async function streamOpenAICompatible(baseUrl, apiKey, model, systemPrompt, userPrompt, port) {
  const cleanBase = baseUrl.replace(/\/+$/, "");
  const response = await fetch(`${cleanBase}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: model,
      temperature: 0.7,
      stream: true,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ]
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`HTTP ${response.status}: ${errorText}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop();

    for (const line of lines) {
      const cleanLine = line.trim();
      if (cleanLine.startsWith("data: ")) {
        const dataStr = cleanLine.replace(/^data:\s*/, "");
        if (dataStr === "[DONE]") {
          port.postMessage({ type: "DONE" });
          return;
        }
        try {
          const parsed = JSON.parse(dataStr);
          if (parsed.error) {
            port.postMessage({ type: "ERROR", error: parsed.error.message || JSON.stringify(parsed.error) });
            return;
          }
          const chunk = parsed.choices?.[0]?.delta?.content;
          if (chunk) port.postMessage({ type: "CHUNK", chunk });
        } catch (e) {
          console.debug("[AI Agent Stream Parser Debug] Failed to parse SSE line:", e, dataStr);
        }
      }
    }
  }
  port.postMessage({ type: "DONE" });
}

async function streamAnthropic(apiKey, model, systemPrompt, userPrompt, port) {
  const modelName = model || "claude-3-5-sonnet-20241022";
  // Anthropic prompt caching requires >= 1024 tokens (2048 for Haiku)
  const minCacheTokens = modelName.toLowerCase().includes("haiku") ? 2048 : 1024;
  const estimatedTokens = estimateTokens(systemPrompt);
  const shouldCache = estimatedTokens >= minCacheTokens;

  const headers = {
    "Content-Type": "application/json",
    "x-api-key": apiKey,
    "anthropic-version": "2023-06-01"
  };
  if (shouldCache) {
    headers["anthropic-beta"] = "prompt-caching-2024-07-31";
  }

  const systemBlock = shouldCache
    ? [
        {
          type: "text",
          text: systemPrompt,
          cache_control: { type: "ephemeral" }
        }
      ]
    : [
        {
          type: "text",
          text: systemPrompt
        }
      ];

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: headers,
    body: JSON.stringify({
      model: modelName,
      max_tokens: 1500,
      stream: true,
      system: systemBlock,
      messages: [{ role: "user", content: userPrompt }]
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`HTTP ${response.status}: ${errText}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop();

    for (const line of lines) {
      const cleanLine = line.trim();
      if (cleanLine.startsWith("data: ")) {
        const rawJson = cleanLine.replace(/^data:\s*/, "");
        try {
          const parsed = JSON.parse(rawJson);
          if (parsed.type === "error") {
            port.postMessage({ type: "ERROR", error: parsed.error?.message || "Anthropic stream error" });
            return;
          }
          if (parsed.type === "content_block_delta") {
            const chunk = parsed.delta?.text;
            if (chunk) port.postMessage({ type: "CHUNK", chunk });
          }
        } catch (e) {
          console.debug("[AI Agent Stream Parser Debug] Failed to parse Anthropic SSE line:", e, cleanLine);
        }
      }
    }
  }
  port.postMessage({ type: "DONE" });
}

async function streamGemini(apiKey, model, systemPrompt, userPrompt, port) {
  const modelName = model || "gemini-2.0-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:streamGenerateContent?alt=sse&key=${encodeURIComponent(apiKey)}`;

  const bodyData = JSON.stringify({
    contents: [{ role: "user", parts: [{ text: `${systemPrompt}\n\nTask:\n${userPrompt}` }] }]
  });

  let response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey
    },
    body: bodyData
  });

  if (!response.ok) {
    const errText = await response.text();
    let errorMsg = `HTTP ${response.status}`;
    try {
      const parsed = JSON.parse(errText);
      if (parsed.error?.message) errorMsg += `: ${parsed.error.message}`;
    } catch (_) {
      if (errText) errorMsg += `: ${errText.slice(0, 120)}`;
    }
    throw new Error(errorMsg);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop();

    for (const line of lines) {
      const cleanLine = line.trim();
      if (cleanLine.startsWith("data: ")) {
        const rawJson = cleanLine.replace(/^data:\s*/, "");
        try {
          const parsed = JSON.parse(rawJson);
          if (parsed.error) {
            port.postMessage({ type: "ERROR", error: parsed.error.message || "Gemini stream error" });
            return;
          }
          const chunk = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
          if (chunk) port.postMessage({ type: "CHUNK", chunk });
        } catch (e) {
          console.debug("[AI Agent Stream Parser Debug] Failed to parse Gemini SSE line:", e, cleanLine);
        }
      }
    }
  }
  port.postMessage({ type: "DONE" });
}

async function handleNonStreamingLLM(payload) {
  const { provider, apiKey, model, baseUrl, userPrompt } = payload;
  const effectiveProvider = provider || "gemini";

  if (!apiKey && effectiveProvider !== "ollama") {
    throw new Error(`API key missing for provider: ${effectiveProvider}. Please configure your API key in Settings (⚙️).`);
  }

  if (effectiveProvider === "gemini") {
    const modelName = model || "gemini-2.0-flash";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${encodeURIComponent(apiKey)}`;

    const bodyData = JSON.stringify({
      contents: [{ role: "user", parts: [{ text: userPrompt || "Respond with: 'CONNECTION_SUCCESSFUL'." }] }]
    });

    let res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey
      },
      body: bodyData
    });

    const data = await res.json();
    if (data.error) throw new Error(data.error.message || `API Error: ${JSON.stringify(data.error)}`);
    return data.candidates?.[0]?.content?.parts?.[0]?.text || "Connected!";
  }

  if (effectiveProvider === "anthropic") {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: model || "claude-3-5-sonnet-20241022",
        max_tokens: 50,
        messages: [{ role: "user", content: userPrompt || "Respond with: 'CONNECTION_SUCCESSFUL'." }]
      })
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error.message);
    return data.content?.[0]?.text || "Connected!";
  }

  let endpoint = baseUrl || "https://api.openai.com/v1";
  if (effectiveProvider === "groq") endpoint = "https://api.groq.com/openai/v1";
  if (effectiveProvider === "deepseek") endpoint = "https://api.deepseek.com/v1";
  if (effectiveProvider === "ollama") endpoint = baseUrl || "http://localhost:11434/v1";

  const response = await fetch(`${endpoint.replace(/\/+$/, "")}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey || "ollama"}` },
    body: JSON.stringify({ model: model || (effectiveProvider === "ollama" ? "llama3.1" : "gpt-4o-mini"), messages: [{ role: "user", content: userPrompt || "Respond with: 'CONNECTION_SUCCESSFUL'." }] })
  });
  const data = await response.json();
  if (data.error) throw new Error(data.error.message || "Connection failed");
  return data.choices?.[0]?.message?.content || "Connected!";
}
