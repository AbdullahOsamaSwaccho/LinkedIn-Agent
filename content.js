/**
 * content.js - LinkedIn Agent Floating Assistant (Streaming + Secure Markdown + Hotkeys + Inline Feed AI)
 */

(function () {
  console.log("LinkedIn Growth Agent Loaded.");

  // Default system prompts — can be overridden by user in Settings
  const DEFAULT_SYSTEM_PROMPTS = {
    POST_GENERATOR: `You are an elite LinkedIn ghostwriter and strategist.
Given an idea, you must output:
1. THREE HOOK OPTIONS selected from proven formulas.
2. ONE FULL DRAFT formatted for LinkedIn:
   - High burstiness (mix short and long sentences).
   - Clean whitespace, no hashtag walls (max 2 relevant hashtags).
   - Zero AI slop: NEVER use words like 'delve', 'leverage', 'seamless', 'game-changer'.
   - Concrete metrics and numbers.`,

    COMMENT_GENERATOR: `You are an insightful industry practitioner commenting on a LinkedIn post.
CRITICAL CONSTRAINT: NEVER say "Great post", "Love this", or generic praise.
Select one of these archetypes: [Perspective, Value-Add, Case Study, Data/Benchmark, Thought-Provoking Question, Tactical How-To, Framework].
Write a concise comment (2-4 sentences max).`,

    PROFILE_AUDIT: `You are an executive LinkedIn profile optimizer evaluating a profile against a 12-part conversion rubric.
Provide:
1. Score out of 100 with deduction breakdown.
2. Top 3 Fix-First Rewrites (Headline, About Hook, STAR Experience bullet).`
  };

  // Pre-configured growth archetype prompts
  const ARCHETYPE_PROMPTS = {
    THOUGHT_LEADER: {
      name: "Thought Leadership Case Study",
      systemPrompt: `You are an executive LinkedIn ghostwriter. 
Write a post using the 'Challenge-Action-Result' framework:
1. Hook: Start with a counter-intuitive observation or strong metric.
2. Body: Explain the specific problem faced and exact steps taken.
3. Takeaway: End with 1 key actionable strategic takeaway for senior leaders.
Tone: Authoritative, concise, insightful. Avoid jargon and filler adjectives.`
    },
    CONTRARIAN: {
      name: "Contrarian / Debate Starter",
      systemPrompt: `You are a tech industry analyst.
Write a post challenging a popular industry trend or widely accepted advice:
1. Hook: State a common belief, then immediately state why it is wrong.
2. Analysis: Provide 2 specific real-world examples or technical explanations.
3. Discussion: End with an open-ended question asking the reader's opinion.
Tone: Direct, thought-provoking, respectful.`
    },
    PLAYBOOK: {
      name: "Step-by-Step Playbook",
      systemPrompt: `You are a Growth Engineer.
Write a 'How-To' tactical guide:
1. Hook: Highlight a desirable outcome achieved in a short time.
2. Steps: Break down the exact framework into a numbered list (3-5 concrete steps).
3. Formatting: Use short, 1-2 sentence lines and bold emphasis for scannability.
Tone: Tactical, practical, concise.`
    }
  };

  // Runtime-resolved system prompts (loaded from storage or defaults)
  let SYSTEM_PROMPTS = { ...DEFAULT_SYSTEM_PROMPTS };

  // Load custom prompts from storage
  chrome.storage.local.get(["li_prompt_post", "li_prompt_comment", "li_prompt_audit"], (data) => {
    if (data.li_prompt_post) SYSTEM_PROMPTS.POST_GENERATOR = data.li_prompt_post;
    if (data.li_prompt_comment) SYSTEM_PROMPTS.COMMENT_GENERATOR = data.li_prompt_comment;
    if (data.li_prompt_audit) SYSTEM_PROMPTS.PROFILE_AUDIT = data.li_prompt_audit;
  });

  // ─── Trusted Types & CSP Safe DOM Insertion Utility ───
  let trustedPolicy = null;
  if (typeof window !== "undefined" && window.trustedTypes && typeof window.trustedTypes.createPolicy === "function") {
    try {
      trustedPolicy = window.trustedTypes.createPolicy("liAgentPolicy", {
        createHTML: (string) => string
      });
    } catch (_) {
      try {
        trustedPolicy = window.trustedTypes.getPolicy?.("liAgentPolicy") || null;
      } catch (_) {}
    }
  }

  function setElementHTML(el, htmlString) {
    if (!el) return;
    if (trustedPolicy) {
      try {
        el.innerHTML = trustedPolicy.createHTML(htmlString);
        return;
      } catch (_) {}
    }
    try {
      el.innerHTML = htmlString;
    } catch (_) {
      // Fallback if Trusted Types CSP blocks direct innerHTML assignment
      try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlString, "text/html");
        el.replaceChildren(...doc.body.childNodes);
      } catch (err) {
        el.textContent = htmlString;
      }
    }
  }

  const widget = document.createElement("div");
  widget.className = "li-agent-widget";
  setElementHTML(widget, `
    <span class="li-drag-handle">⠿</span>
    <span>✦ LinkedIn Agent</span>
    <span class="li-agent-badge" id="li-agent-status-badge">AI Ready</span>
  `);
  document.body.appendChild(widget);

  const panel = document.createElement("div");
  panel.className = "li-agent-panel";
  panel.style.display = "none";
  setElementHTML(panel, `
    <div class="li-agent-panel-header">
      <div class="li-panel-tabs">
        <span class="li-tab active" id="tab-actions">Agent Actions</span>
        <span class="li-tab" id="tab-schedule">📅 Queue</span>
        <span class="li-tab" id="tab-analytics">📊 Analytics</span>
        <span class="li-tab" id="tab-settings">⚙️ Settings</span>
      </div>
      <span id="li-panel-close" style="cursor:pointer; font-size:16px;">✕</span>
    </div>

    <!-- TAB 1: ACTIONS & CREATOR STUDIO -->
    <div class="li-agent-panel-body" id="view-actions">
      <!-- Archetype Selection Dropdown -->
      <div style="margin-bottom:10px;">
        <label class="li-label">Content Archetype Framework</label>
        <select id="archetypeSelect" class="li-input">
          <option value="DEFAULT">Default Viral Ghostwriter</option>
          <option value="THOUGHT_LEADER">Thought Leadership Case Study (Challenge-Action-Result)</option>
          <option value="CONTRARIAN">Contrarian Debate Starter</option>
          <option value="PLAYBOOK">Step-by-Step Playbook (Tactical How-To)</option>
        </select>
      </div>

      <div class="li-action-group">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
          <label class="li-label" style="margin-bottom:0;">Post Generator</label>
          <button class="li-agent-btn btn-sec" id="btn-calibrate-voice" style="padding:3px 8px; font-size:11px;" title="Scrape your published posts to clone your voice">
            🎙️ Calibrate My Voice
          </button>
        </div>
        <div id="voice-status-box" style="margin-bottom:6px; display:none;">
          <span class="voice-badge" id="voice-status-text">✓ Voice Calibrated</span>
        </div>
        <div style="display:flex; gap:6px;">
          <input type="text" id="input-post-topic" class="li-input" placeholder="Enter topic, angle, or idea...">
          <button class="li-agent-btn" id="btn-generate-post">Generate Draft</button>
        </div>
      </div>

      <div class="li-action-group" style="margin-top:10px;">
        <label class="li-label">Post Quick Actions</label>
        <div style="display:flex; gap:6px; flex-wrap:wrap;">
          <button class="li-agent-btn btn-sec" id="btn-humanize-composer">⚡ Humanize Draft</button>
          <button class="li-agent-btn btn-sec" id="btn-audit-current-profile">🔍 Audit Profile</button>
          <button class="li-agent-btn btn-sec" id="btn-suggest-comment">💬 Contextual Comment</button>
        </div>
      </div>

      <!-- Live Generated Draft Editor -->
      <div id="post-editor-card" style="margin-top:14px; display:none;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
          <label class="li-label" style="margin-bottom:0;">Editable Post Draft</label>
          <div style="display:flex; gap:6px;">
            <button class="li-copy-btn" id="btn-copy-draft">📋 Copy</button>
            <button class="li-agent-btn btn-sec" id="btn-insert-composer" style="font-size:11px; padding:3px 8px;" title="Insert draft directly into active LinkedIn composer">📝 Use in Composer</button>
          </div>
        </div>
        <textarea id="postContentOutput" class="li-editor-textarea" rows="6" placeholder="Generated draft appears here... You can edit it in real-time."></textarea>

        <!-- Feature 1: 'See More' Mobile Preview Studio -->
        <div class="mobile-preview-card" id="mobilePreviewContainer">
          <div class="mobile-preview-header">
            <div class="mobile-preview-avatar" id="mobilePreviewAvatar">ME</div>
            <div>
              <strong style="font-size: 11px; display: block; color: #191919;" id="mobilePreviewName">Your Name</strong>
              <span style="font-size: 9.5px; color: #64748b;">Creator • Mobile Feed Preview</span>
            </div>
          </div>
          <div class="mobile-preview-body" id="mobilePreviewCard">
            <span id="previewVisibleText"></span>
            <span id="previewSeeMore" class="see-more-btn" style="display:none;">...see more</span>
            <span id="previewHiddenText" style="display:none;"></span>
          </div>
        </div>

        <!-- Scheduling & Publishing Controls -->
        <div class="scheduling-container">
          <label class="li-label">Attach Media (Optional Image/Video)</label>
          <input type="file" id="mediaInput" accept="image/*,video/*" class="li-input" style="font-size:11px; padding:4px 6px; margin-bottom:10px;">

          <label class="li-label">Schedule Publish Date & Time</label>
          <input type="datetime-local" id="scheduleTime" class="li-input" style="margin-bottom:10px;">

          <div style="display:flex; gap:8px;">
            <button class="btn-publish-now" id="btnPublishNow">🚀 Publish Now</button>
            <button class="btn-schedule-post" id="btnSchedule">📅 Schedule Post</button>
          </div>
          <div id="publish-status-msg" style="margin-top:8px; font-size:11px;"></div>
        </div>
      </div>

      <div id="li-agent-output" style="margin-top:14px;"></div>
    </div>

    <!-- TAB 2: SCHEDULE QUEUE -->
    <div class="li-agent-panel-body" id="view-schedule" style="display:none;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
        <span style="font-size:12px; font-weight:700; color:#1e293b;">Upcoming Scheduled Posts</span>
        <button class="li-agent-btn btn-sec" id="btn-refresh-queue" style="padding:3px 8px; font-size:11px;">↺ Refresh</button>
      </div>
      <div id="scheduledQueueList" class="queue-list-container">
        <p class="empty-state">No scheduled posts queued.</p>
      </div>
    </div>

    <!-- TAB 3: ANALYTICS -->
    <div class="li-agent-panel-body" id="view-analytics" style="display:none;">
      <div class="analytics-card">
        <div style="font-size:12px; font-weight:700; color:#1e293b; margin-bottom:4px;">Profile & Post Performance</div>
        <p style="font-size:11px; color:#64748b; margin-bottom:10px;">Live engagement telemetry extracted from your LinkedIn dashboard.</p>

        <div class="analytics-metric-grid">
          <div class="analytics-tile">
            <div class="analytics-tile-label">Profile Views</div>
            <div class="analytics-tile-val" id="metricProfileViews">--</div>
          </div>
          <div class="analytics-tile">
            <div class="analytics-tile-label">Impressions</div>
            <div class="analytics-tile-val" id="metricImpressions">--</div>
          </div>
          <div class="analytics-tile">
            <div class="analytics-tile-label">Searches</div>
            <div class="analytics-tile-val" id="metricSearchAppearances">--</div>
          </div>
        </div>

        <button class="li-agent-btn btn-sec" id="btnRefreshAnalytics" style="width:100%; margin-top:8px;">
          📊 Sync Engagement Data
        </button>
        <div id="analytics-status-msg" style="margin-top:6px; font-size:11px; text-align:center;"></div>
      </div>
    </div>

    <!-- TAB 4: SETTINGS -->
    <div class="li-agent-panel-body" id="view-settings" style="display:none;">
      <!-- Active Auth Status Badge -->
      <div class="li-auth-header-card">
        <span style="font-size:11px; font-weight:700; color:#475569; text-transform:uppercase;">Active Authentication</span>
        <div class="li-auth-badge none" id="active-auth-badge">
          <span class="li-auth-badge-dot"></span>
          <span id="active-auth-text">Checking auth...</span>
        </div>
      </div>

      <label class="li-label">AI Provider</label>
      <select id="cfg-provider" class="li-input" style="margin-bottom:12px;">
        <option value="gemini">Google Gemini</option>
        <option value="openai">OpenAI (GPT-4o / GPT-4o-mini)</option>
        <option value="anthropic">Anthropic (Claude 3.5 Sonnet)</option>
        <option value="groq">Groq (Llama 3.3 70B Fast)</option>
        <option value="deepseek">DeepSeek (DeepSeek-V3 / R1)</option>
        <option value="ollama">Ollama (Local on localhost:11434)</option>
        <option value="custom">Custom OpenAI Endpoint</option>
      </select>

      <div id="api-key-group" style="margin-bottom:12px;">
        <label class="li-label" id="label-apikey">AI API Key</label>
        <input type="password" id="cfg-apikey" class="li-input" placeholder="Paste your API key here...">
        <div class="li-helper-text" id="cfg-apikey-helper">Paste your API key. Stored locally in your browser.</div>
      </div>

      <div style="margin-bottom:12px;">
        <label class="li-label">Model Name (Optional)</label>
        <input type="text" id="cfg-model" class="li-input" placeholder="Leave empty for default model">
      </div>

      <div id="custom-endpoint-box" style="display:none; margin-bottom:12px;">
        <label class="li-label">Base URL</label>
        <input type="text" id="cfg-baseurl" class="li-input" placeholder="http://localhost:11434/v1">
      </div>

      <!-- LinkedIn REST API Credentials (Optional) -->
      <div style="margin-top:14px; border-top:1px solid #e2e8f0; padding-top:12px; margin-bottom:12px;">
        <label class="li-label">LinkedIn REST API (Optional for direct API publish)</label>
        <p style="font-size:11px; color:#64748b; margin-bottom:8px;">Required if using direct background publishing (/rest/posts) and post analytics. Leave empty to use in-browser composer insertion.</p>

        <label class="li-label" style="font-size:11px;">LinkedIn Person URN</label>
        <input type="text" id="cfg-person-urn" class="li-input" placeholder="urn:li:person:abcdef123" style="font-size:11px; margin-bottom:6px;">

        <label class="li-label" style="font-size:11px;">LinkedIn Access Token</label>
        <input type="password" id="cfg-li-token" class="li-input" placeholder="Bearer token for https://api.linkedin.com" style="font-size:11px;">
      </div>

      <!-- Ollama CORS Notice -->
      <div id="ollama-cors-notice" class="li-info-box" style="display:none; margin-top:10px;">
        <strong>⚠ Ollama CORS Setup Required</strong><br>
        Ollama blocks browser requests by default. Set the <code>OLLAMA_ORIGINS</code> environment variable before starting Ollama:<br><br>
        <strong>macOS / Linux:</strong><br>
        <code>OLLAMA_ORIGINS="*" ollama serve</code><br><br>
        <strong>Windows (PowerShell):</strong><br>
        <code>$env:OLLAMA_ORIGINS="*"; ollama serve</code><br><br>
        <em>Or add <code>chrome-extension://YOUR_EXTENSION_ID</code> instead of <code>*</code> for tighter security.</em>
      </div>

      <div style="display:flex; gap:8px; margin-top:16px;">
        <button class="li-agent-btn" id="btn-save-settings">Save Settings</button>
        <button class="li-agent-btn btn-sec" id="btn-test-connection">Test Connection</button>
      </div>

      <div id="cfg-status-msg" style="margin-top:10px; font-size:12px;"></div>

      <!-- System Prompt Customization -->
      <div style="margin-top:20px; border-top:1px solid #e2e8f0; padding-top:14px;">
        <label class="li-label">System Prompt Customization</label>
        <p style="font-size:11px; color:#64748b; margin-bottom:8px;">Customize default system prompts. Changes persist locally.</p>

        <select id="cfg-prompt-selector" class="li-input" style="margin-bottom:8px;">
          <option value="POST_GENERATOR">Post Generator</option>
          <option value="COMMENT_GENERATOR">Contextual Comment</option>
          <option value="PROFILE_AUDIT">Profile Audit</option>
        </select>

        <textarea id="cfg-prompt-editor" class="li-input" style="min-height:100px; resize:vertical; font-size:12px; line-height:1.4; font-family:ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;"></textarea>

        <div style="display:flex; gap:8px; margin-top:8px;">
          <button class="li-agent-btn" id="btn-save-prompt">Save Prompt</button>
          <button class="li-agent-btn btn-sec" id="btn-reset-prompt">Reset to Default</button>
        </div>
        <div id="cfg-prompt-status" style="margin-top:6px; font-size:11px;"></div>
      </div>
    </div>
  `);
  document.body.appendChild(panel);

  // Drag Engine
  let isDragging = false, hasMoved = false, startX = 0, startY = 0, initialLeft = 0, initialTop = 0;

  chrome.storage.local.get(["widget_pos_x", "widget_pos_y"], (data) => {
    if (data.widget_pos_x !== undefined && data.widget_pos_y !== undefined) {
      widget.style.left = `${Math.min(data.widget_pos_x, window.innerWidth - 220)}px`;
      widget.style.top = `${Math.min(data.widget_pos_y, window.innerHeight - 70)}px`;
    } else {
      widget.style.left = `${window.innerWidth - 220}px`;
      widget.style.top = `${window.innerHeight - 70}px`;
    }
  });

  widget.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    isDragging = true; hasMoved = false;
    startX = e.clientX; startY = e.clientY;
    const rect = widget.getBoundingClientRect();
    initialLeft = rect.left; initialTop = rect.top;
    widget.setPointerCapture(e.pointerId);
    widget.style.transition = "none";
  });

  widget.addEventListener("pointermove", (e) => {
    if (!isDragging) return;
    const deltaX = e.clientX - startX, deltaY = e.clientY - startY;
    if (Math.hypot(deltaX, deltaY) > 4) hasMoved = true;
    if (hasMoved) {
      let newLeft = Math.max(8, Math.min(initialLeft + deltaX, window.innerWidth - widget.offsetWidth - 8));
      let newTop = Math.max(8, Math.min(initialTop + deltaY, window.innerHeight - widget.offsetHeight - 8));
      widget.style.left = `${newLeft}px`; widget.style.top = `${newTop}px`;
      if (panel.style.display !== "none") repositionPanel(newLeft, newTop);
    }
  });

  widget.addEventListener("pointerup", (e) => {
    if (!isDragging) return;
    isDragging = false;
    widget.releasePointerCapture(e.pointerId);
    widget.style.transition = "";
    if (hasMoved) {
      const rect = widget.getBoundingClientRect();
      chrome.storage.local.set({ widget_pos_x: Math.round(rect.left), widget_pos_y: Math.round(rect.top) });
    } else togglePanel();
  });

  function repositionPanel(wX, wY) {
    let pX = wX + 440 > window.innerWidth ? wX + widget.offsetWidth - 440 : wX;
    let pY = wY - 580 - 12 < 20 ? wY + widget.offsetHeight + 12 : wY - 580 - 12;
    panel.style.left = `${Math.max(10, Math.min(pX, window.innerWidth - 450))}px`;
    panel.style.top = `${pY}px`;
  }

  function togglePanel() {
    const isVis = panel.style.display !== "none";
    panel.style.display = isVis ? "none" : "flex";
    if (!isVis) {
      const rect = widget.getBoundingClientRect();
      repositionPanel(rect.left, rect.top);
    }
  }

  document.getElementById("li-panel-close").addEventListener("click", () => panel.style.display = "none");

  // 4-Tab Navigation
  const tabActions = document.getElementById("tab-actions");
  const tabSchedule = document.getElementById("tab-schedule");
  const tabAnalytics = document.getElementById("tab-analytics");
  const tabSettings = document.getElementById("tab-settings");

  const viewActions = document.getElementById("view-actions");
  const viewSchedule = document.getElementById("view-schedule");
  const viewAnalytics = document.getElementById("view-analytics");
  const viewSettings = document.getElementById("view-settings");

  function switchTab(activeTab, activeView) {
    [tabActions, tabSchedule, tabAnalytics, tabSettings].forEach(t => t?.classList.remove("active"));
    [viewActions, viewSchedule, viewAnalytics, viewSettings].forEach(v => { if (v) v.style.display = "none"; });

    activeTab.classList.add("active");
    activeView.style.display = "block";
  }

  tabActions.addEventListener("click", () => switchTab(tabActions, viewActions));
  tabSchedule.addEventListener("click", () => {
    switchTab(tabSchedule, viewSchedule);
    renderQueueList();
  });
  tabAnalytics.addEventListener("click", () => {
    switchTab(tabAnalytics, viewAnalytics);
    updateAnalyticsUI();
  });
  tabSettings.addEventListener("click", () => {
    switchTab(tabSettings, viewSettings);
    refreshAuthUI();
  });

  // Provider & Auth UI
  const providerSelect = document.getElementById("cfg-provider");
  const ollamaCorsNotice = document.getElementById("ollama-cors-notice");
  const apikeyHelper = document.getElementById("cfg-apikey-helper");

  const PROVIDER_HELP_TEXT = {
    gemini: "Get your free Gemini API key from Google AI Studio (aistudio.google.com).",
    openai: "Get your OpenAI API key from platform.openai.com.",
    anthropic: "Get your Anthropic API key from console.anthropic.com.",
    groq: "Get your fast free/cheap Llama 3.3 key from console.groq.com.",
    deepseek: "Get your DeepSeek API key from platform.deepseek.com.",
    ollama: "Local endpoint on localhost:11434. No API key required.",
    custom: "Base URL and key for your custom OpenAI-compatible endpoint."
  };

  function refreshAuthUI() {
    chrome.runtime.sendMessage({ action: "GET_AUTH_STATUS" }, (res) => {
      const status = res?.data || {};
      const provider = providerSelect.value;
      const badge = document.getElementById("active-auth-badge");
      const badgeText = document.getElementById("active-auth-text");

      if (provider === "ollama") {
        badge.className = "li-auth-badge key";
        badgeText.textContent = "Active Auth: Ollama (Local)";
      } else if (status.hasKey) {
        badge.className = "li-auth-badge key";
        badgeText.textContent = `Active Auth: ${provider.toUpperCase()} Key Set`;
      } else {
        badge.className = "li-auth-badge none";
        badgeText.textContent = "Active Auth: API Key Missing";
      }
    });
  }

  function updateProviderUI() {
    const provider = providerSelect.value;
    const isLocal = ["custom", "ollama"].includes(provider);
    document.getElementById("custom-endpoint-box").style.display = isLocal ? "block" : "none";
    ollamaCorsNotice.style.display = provider === "ollama" ? "block" : "none";

    const apiKeyGroup = document.getElementById("api-key-group");
    if (apiKeyGroup) {
      apiKeyGroup.style.display = provider === "ollama" ? "none" : "block";
    }
    if (apikeyHelper) {
      apikeyHelper.textContent = PROVIDER_HELP_TEXT[provider] || "Stored locally in your browser.";
    }
    refreshAuthUI();
  }

  providerSelect.addEventListener("change", updateProviderUI);

  chrome.storage.local.get([
    "li_provider",
    "li_apikey",
    "li_model",
    "li_baseurl",
    "li_person_urn",
    "li_access_token"
  ], (data) => {
    if (data.li_provider) providerSelect.value = data.li_provider;
    if (data.li_apikey) document.getElementById("cfg-apikey").value = data.li_apikey;
    if (data.li_model) document.getElementById("cfg-model").value = data.li_model;
    if (data.li_baseurl) document.getElementById("cfg-baseurl").value = data.li_baseurl;
    if (data.li_person_urn) document.getElementById("cfg-person-urn").value = data.li_person_urn;
    if (data.li_access_token) document.getElementById("cfg-li-token").value = data.li_access_token;
    updateProviderUI();
  });

  // Save Settings (API config)
  document.getElementById("btn-save-settings").addEventListener("click", () => {
    chrome.storage.local.set({
      li_provider: providerSelect.value,
      li_apikey: document.getElementById("cfg-apikey").value.trim(),
      li_model: document.getElementById("cfg-model").value.trim(),
      li_baseurl: document.getElementById("cfg-baseurl").value.trim(),
      li_person_urn: document.getElementById("cfg-person-urn").value.trim(),
      li_access_token: document.getElementById("cfg-li-token").value.trim()
    }, () => {
      const msg = document.getElementById("cfg-status-msg");
      if (msg) {
        msg.className = "li-status-success";
        msg.textContent = "✓ Settings saved!";
        refreshAuthUI();
        setTimeout(() => { if (msg) { msg.textContent = ""; msg.className = ""; } }, 3000);
      }
    });
  });

  // Test Connection (with CORS hint for local providers)
  document.getElementById("btn-test-connection").addEventListener("click", () => {
    const msg = document.getElementById("cfg-status-msg");
    if (msg) {
      msg.className = "li-status-info";
      msg.textContent = "Testing connection...";
    }
    chrome.runtime.sendMessage({
      action: "TEST_API_CONNECTION",
      payload: {
        provider: providerSelect.value,
        apiKey: document.getElementById("cfg-apikey").value.trim(),
        model: document.getElementById("cfg-model").value.trim(),
        baseUrl: document.getElementById("cfg-baseurl").value.trim()
      }
    }, (res) => {
      if (!msg) return;
      if (res?.success) {
        msg.className = "li-status-success";
        msg.textContent = "✓ Connected!";
      } else {
        const errStr = res?.error || "Unknown error";
        const isLocalProvider = ["ollama", "custom"].includes(providerSelect.value);
        const isCorsLikely = isLocalProvider && (errStr.includes("Failed to fetch") || errStr.includes("NetworkError") || errStr.includes("CORS"));
        msg.className = "li-status-error";
        if (isCorsLikely) {
          msg.textContent = "✕ Connection failed (likely CORS). See the OLLAMA_ORIGINS notice above.";
        } else {
          msg.textContent = `✕ Connection failed: ${errStr}`;
        }
      }
    });
  });

  // System Prompt Customization
  const promptSelector = document.getElementById("cfg-prompt-selector");
  const promptEditor = document.getElementById("cfg-prompt-editor");
  const promptStatus = document.getElementById("cfg-prompt-status");
  const PROMPT_STORAGE_MAP = {
    POST_GENERATOR: "li_prompt_post",
    COMMENT_GENERATOR: "li_prompt_comment",
    PROFILE_AUDIT: "li_prompt_audit"
  };

  function loadPromptEditor() {
    const key = promptSelector.value;
    promptEditor.value = SYSTEM_PROMPTS[key] || DEFAULT_SYSTEM_PROMPTS[key];
    promptStatus.innerText = "";
  }

  promptSelector.addEventListener("change", loadPromptEditor);
  loadPromptEditor();

  document.getElementById("btn-save-prompt").addEventListener("click", () => {
    const key = promptSelector.value;
    const storageKey = PROMPT_STORAGE_MAP[key];
    const value = promptEditor.value.trim();
    if (!value) return;

    SYSTEM_PROMPTS[key] = value;
    chrome.storage.local.set({ [storageKey]: value }, () => {
      if (promptStatus) {
        promptStatus.className = "li-status-success";
        promptStatus.textContent = `✓ ${key.replace(/_/g, " ")} prompt saved!`;
        setTimeout(() => { if (promptStatus) { promptStatus.textContent = ""; promptStatus.className = ""; } }, 3000);
      }
    });
  });

  document.getElementById("btn-reset-prompt").addEventListener("click", () => {
    const key = promptSelector.value;
    const storageKey = PROMPT_STORAGE_MAP[key];

    SYSTEM_PROMPTS[key] = DEFAULT_SYSTEM_PROMPTS[key];
    promptEditor.value = DEFAULT_SYSTEM_PROMPTS[key];
    chrome.storage.local.remove(storageKey, () => {
      if (promptStatus) {
        promptStatus.className = "li-status-info";
        promptStatus.textContent = `↺ ${key.replace(/_/g, " ")} prompt reset to default.`;
        setTimeout(() => { if (promptStatus) { promptStatus.textContent = ""; promptStatus.className = ""; } }, 3000);
      }
    });
  });

  // ─── Secure HTML Escape ───
  function escapeHtml(str) {
    if (!str) return "";
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  // Client Humanizer
  function clientHumanize(text) {
    let cleaned = text.replace(/[\u200B-\u200D\uFEFF\u00AD\u00A0\u202F]/g, " ");
    const slopMap = { "delve": "dig", "leverage": "use", "robust": "strong", "seamless": "smooth", "game-changer": "major shift" };
    for (const [k, v] of Object.entries(slopMap)) {
      cleaned = cleaned.replace(new RegExp("\\b" + k + "\\b", "gi"), v);
    }
    return cleaned.replace(/[ \t]{2,}/g, " ").trim();
  }

  // ─── Secure Markdown Renderer (DOM-based, no raw innerHTML injection) ───
  function renderMarkdownElement(text) {
    const container = document.createElement("div");
    container.className = "li-markdown-body";
    if (!text) return container;

    // Pre-process: extract fenced code blocks to protect them from other transforms
    const codeBlocks = [];
    let processed = text.replace(/```([\s\S]*?)```/g, (_, code) => {
      const idx = codeBlocks.length;
      codeBlocks.push(code);
      return `\x00CODEBLOCK_${idx}\x00`;
    });

    // Split into lines and process
    const lines = processed.split("\n");
    let currentList = null;

    for (let i = 0; i < lines.length; i++) {
      let line = lines[i];

      // Check for code block placeholder
      const codeMatch = line.match(/^\x00CODEBLOCK_(\d+)\x00$/);
      if (codeMatch) {
        if (currentList) { container.appendChild(currentList); currentList = null; }
        const pre = document.createElement("pre");
        pre.className = "li-code-block";
        const code = document.createElement("code");
        code.textContent = codeBlocks[parseInt(codeMatch[1])];
        pre.appendChild(code);
        container.appendChild(pre);
        continue;
      }

      // Headings
      const h3Match = line.match(/^### (.+)$/);
      if (h3Match) {
        if (currentList) { container.appendChild(currentList); currentList = null; }
        const h3 = document.createElement("div");
        h3.className = "li-h3";
        appendInlineFormatted(h3, h3Match[1]);
        container.appendChild(h3);
        continue;
      }

      const h2Match = line.match(/^## (.+)$/);
      if (h2Match) {
        if (currentList) { container.appendChild(currentList); currentList = null; }
        const h2 = document.createElement("div");
        h2.className = "li-h2";
        appendInlineFormatted(h2, h2Match[1]);
        container.appendChild(h2);
        continue;
      }

      const h1Match = line.match(/^# (.+)$/);
      if (h1Match) {
        if (currentList) { container.appendChild(currentList); currentList = null; }
        const h1 = document.createElement("div");
        h1.className = "li-h1";
        appendInlineFormatted(h1, h1Match[1]);
        container.appendChild(h1);
        continue;
      }

      // List items
      const listMatch = line.match(/^\s*[-*]\s+(.+)$/);
      if (listMatch) {
        if (!currentList) {
          currentList = document.createElement("ul");
          currentList.className = "li-markdown-list";
        }
        const li = document.createElement("li");
        appendInlineFormatted(li, listMatch[1]);
        currentList.appendChild(li);
        continue;
      }

      // Close any open list
      if (currentList) { container.appendChild(currentList); currentList = null; }

      // Empty line -> spacer
      if (line.trim() === "") {
        const br = document.createElement("br");
        container.appendChild(br);
        continue;
      }

      // Regular paragraph line
      const p = document.createElement("span");
      p.className = "li-p";
      appendInlineFormatted(p, line);
      container.appendChild(p);
      container.appendChild(document.createElement("br"));
    }

    if (currentList) container.appendChild(currentList);
    return container;
  }

  function renderMarkdown(text) {
    return renderMarkdownElement(text).innerHTML;
  }

  // Process inline formatting (bold, italic, inline code) safely
  function appendInlineFormatted(parent, text) {
    // Tokenize on inline code, bold, and italic — all content is set via textContent
    const tokens = tokenizeInline(text);
    for (const token of tokens) {
      if (token.type === "code") {
        const code = document.createElement("code");
        code.className = "li-code-inline";
        code.textContent = token.content;
        parent.appendChild(code);
      } else if (token.type === "bold") {
        const strong = document.createElement("strong");
        strong.textContent = token.content;
        parent.appendChild(strong);
      } else if (token.type === "italic") {
        const em = document.createElement("em");
        em.textContent = token.content;
        parent.appendChild(em);
      } else {
        parent.appendChild(document.createTextNode(token.content));
      }
    }
  }

  function tokenizeInline(text) {
    const tokens = [];
    // Regex to match inline code, bold, or italic — order matters
    const pattern = /`([^`]+)`|\*\*(.+?)\*\*|\*(.+?)\*/g;
    let lastIndex = 0;
    let match;
    while ((match = pattern.exec(text)) !== null) {
      if (match.index > lastIndex) {
        tokens.push({ type: "text", content: text.slice(lastIndex, match.index) });
      }
      if (match[1] !== undefined) {
        tokens.push({ type: "code", content: match[1] });
      } else if (match[2] !== undefined) {
        tokens.push({ type: "bold", content: match[2] });
      } else if (match[3] !== undefined) {
        tokens.push({ type: "italic", content: match[3] });
      }
      lastIndex = pattern.lastIndex;
    }
    if (lastIndex < text.length) {
      tokens.push({ type: "text", content: text.slice(lastIndex) });
    }
    return tokens;
  }

  function attachCopyButton(containerElement) {
    if (containerElement.querySelector(".li-output-actions")) return;
    const actionBar = document.createElement("div");
    actionBar.className = "li-output-actions";
    actionBar.style.cssText = "display: flex; justify-content: flex-end; margin-bottom: 8px;";

    const copyBtn = document.createElement("button");
    copyBtn.innerText = "📋 Copy";
    copyBtn.className = "li-copy-btn";
    copyBtn.addEventListener("click", async () => {
      const contentBox = containerElement.querySelector(".li-markdown-body");
      await navigator.clipboard.writeText(contentBox ? contentBox.innerText : containerElement.innerText);
      copyBtn.innerText = "✓ Copied!";
      setTimeout(() => (copyBtn.innerText = "📋 Copy"), 2000);
    });

    actionBar.appendChild(copyBtn);
    containerElement.insertBefore(actionBar, containerElement.firstChild);
  }

  // Streaming Bridge Consumer
  async function streamUserAgent(systemPrompt, userPrompt, onChunk) {
    const config = await new Promise((res) => chrome.storage.local.get(["li_provider", "li_apikey", "li_model", "li_baseurl"], res));
    const provider = config.li_provider || "gemini";
    if (!config.li_apikey && provider !== "ollama") {
      throw new Error(`Please configure your API key for ${provider} in Settings (⚙️) first.`);
    }

    return new Promise((resolve, reject) => {
      const port = chrome.runtime.connect({ name: "AI_STREAM_PORT" });
      let fullText = "";

      port.postMessage({
        action: "START_STREAM",
        payload: {
          provider: config.li_provider || "gemini",
          apiKey: config.li_apikey,
          model: config.li_model,
          baseUrl: config.li_baseurl,
          systemPrompt: systemPrompt,
          userPrompt: userPrompt
        }
      });

      port.onMessage.addListener((msg) => {
        if (msg.type === "CHUNK") {
          fullText += msg.chunk;
          if (onChunk) onChunk(msg.chunk, fullText);
        } else if (msg.type === "DONE") {
          port.disconnect();
          resolve(fullText);
        } else if (msg.type === "ERROR") {
          port.disconnect();
          reject(new Error(msg.error));
        }
      });
    });
  }

  // ─── Creator Studio & Post Editor Logic ───
  const out = document.getElementById("li-agent-output");
  const postEditorCard = document.getElementById("post-editor-card");
  const postInput = document.getElementById("postContentOutput");
  const visibleText = document.getElementById("previewVisibleText");
  const hiddenText = document.getElementById("previewHiddenText");
  const seeMoreBtn = document.getElementById("previewSeeMore");
  const voiceStatusBox = document.getElementById("voice-status-box");
  const voiceStatusText = document.getElementById("voice-status-text");

  // Mobile Preview Studio Truncation Logic
  function updateMobilePreview(text) {
    if (!text || !text.trim()) {
      visibleText.innerText = "Draft preview will appear here...";
      hiddenText.innerText = "";
      seeMoreBtn.style.display = "none";
      hiddenText.style.display = "none";
      return;
    }

    const MOBILE_CUTOFF = 145; // LinkedIn mobile feed cutoff threshold
    if (text.length > MOBILE_CUTOFF) {
      visibleText.innerText = text.substring(0, MOBILE_CUTOFF);
      hiddenText.innerText = text.substring(MOBILE_CUTOFF);
      seeMoreBtn.style.display = "inline";
      hiddenText.style.display = "none";
    } else {
      visibleText.innerText = text;
      hiddenText.innerText = "";
      seeMoreBtn.style.display = "none";
      hiddenText.style.display = "none";
    }
  }

  postInput?.addEventListener("input", () => {
    updateMobilePreview(postInput.value);
  });

  seeMoreBtn?.addEventListener("click", () => {
    hiddenText.style.display = "inline";
    seeMoreBtn.style.display = "none";
  });

  // Detect and update author name/initials in mobile preview
  function updatePreviewAuthor() {
    const nameEl = document.querySelector(
      ".identity-headline, " +
      ".feed-identity-module__actor-meta, " +
      ".profile-rail-card__actor-link, " +
      ".global-nav__me-photo, " +
      ".top-card-layout__title, " +
      ".artdeco-entity-lockup__title"
    );
    const previewName = document.getElementById("mobilePreviewName");
    const previewAvatar = document.getElementById("mobilePreviewAvatar");
    if (previewName && nameEl) {
      const raw = nameEl.innerText ? nameEl.innerText.split("\n")[0].trim() : "";
      if (raw) {
        previewName.innerText = raw;
        if (previewAvatar) {
          const initials = raw.split(" ").filter(Boolean).map(n => n[0]).join("").slice(0, 2).toUpperCase();
          if (initials) previewAvatar.innerText = initials;
        }
      }
    }
  }

  // Load existing voice calibration status
  chrome.storage.local.get(["userWritingVoice"], (data) => {
    if (data.userWritingVoice && data.userWritingVoice.length > 0) {
      if (voiceStatusBox && voiceStatusText) {
        voiceStatusBox.style.display = "block";
        voiceStatusText.textContent = `✓ Voice Calibrated (${data.userWritingVoice.length} post samples)`;
      }
    }
  });

  // Voice Calibration Scraper
  async function calibrateUserWritingVoice() {
    const posts = document.querySelectorAll(
      ".feed-shared-update-v2__description, " +
      ".feed-shared-text, " +
      ".update-components-text, " +
      ".break-words"
    );

    const extractedSamples = Array.from(posts)
      .map(el => el.innerText.trim())
      .filter(text => text.length > 60 && !text.startsWith("http"))
      .slice(0, 5);

    if (extractedSamples.length > 0) {
      await chrome.storage.local.set({ userWritingVoice: extractedSamples });
      return { success: true, count: extractedSamples.length };
    }
    return { success: false, error: "No posts detected on the active page. Please scroll your LinkedIn Feed or visit your Activity / Profile page first." };
  }

  document.getElementById("btn-calibrate-voice")?.addEventListener("click", async () => {
    const btn = document.getElementById("btn-calibrate-voice");
    const originalText = btn.innerText;
    btn.innerText = "Analyzing...";
    btn.disabled = true;

    try {
      const result = await calibrateUserWritingVoice();
      if (result.success) {
        voiceStatusBox.style.display = "block";
        voiceStatusText.textContent = `✓ Voice Calibrated (${result.count} post samples)`;
        btn.innerText = "✓ Calibrated!";
        setTimeout(() => { btn.innerText = originalText; btn.disabled = false; }, 2500);
      } else {
        alert(result.error);
        btn.innerText = originalText;
        btn.disabled = false;
      }
    } catch (err) {
      alert("Voice calibration error: " + err.message);
      btn.innerText = originalText;
      btn.disabled = false;
    }
  });

  // Generate Post with Archetypes and Stream to Editor
  document.getElementById("btn-generate-post").addEventListener("click", async () => {
    const topic = document.getElementById("input-post-topic").value.trim();
    if (!topic) {
      alert("Please enter a topic or concept for your post.");
      return;
    }

    const archetypeKey = document.getElementById("archetypeSelect")?.value || "DEFAULT";
    let baseSystemPrompt = SYSTEM_PROMPTS.POST_GENERATOR;

    if (archetypeKey !== "DEFAULT" && ARCHETYPE_PROMPTS[archetypeKey]) {
      baseSystemPrompt = ARCHETYPE_PROMPTS[archetypeKey].systemPrompt;
    }

    // Show editor card and preview
    postEditorCard.style.display = "block";
    updatePreviewAuthor();
    postInput.value = "Drafting with AI...";
    updateMobilePreview(postInput.value);

    out.replaceChildren();
    const card = document.createElement("div");
    card.id = "output-card";
    card.style.cssText = "background:#ffffff; border:1px solid #e2e8f0; border-radius:8px; padding:12px;";
    const label = document.createElement("div");
    label.style.cssText = "font-size:11px; font-weight:700; color:#0a66c2; margin-bottom:6px;";
    label.textContent = "✦ GENERATED PREVIEW";
    const box = document.createElement("div");
    box.className = "li-markdown-body";
    box.id = "stream-box";
    card.appendChild(label);
    card.appendChild(box);
    out.appendChild(card);

    try {
      await streamUserAgent(baseSystemPrompt, `Topic / Concept:\n${topic}`, (_, full) => {
        const cleaned = clientHumanize(full);
        box.replaceChildren(renderMarkdownElement(cleaned));
        postInput.value = cleaned;
        updateMobilePreview(cleaned);
      });
      attachCopyButton(card);
    } catch (err) {
      out.replaceChildren();
      const errSpan = document.createElement("span");
      errSpan.className = "li-status-error";
      errSpan.textContent = `Error: ${err.message}`;
      out.appendChild(errSpan);
      postInput.value = "";
      updateMobilePreview("");
    }
  });

  // Copy Draft Button
  document.getElementById("btn-copy-draft")?.addEventListener("click", async () => {
    const text = postInput.value.trim();
    if (!text) return;
    await navigator.clipboard.writeText(text);
    const copyBtn = document.getElementById("btn-copy-draft");
    copyBtn.innerText = "✓ Copied!";
    setTimeout(() => (copyBtn.innerText = "📋 Copy"), 2000);
  });

  // Inject into LinkedIn Composer Helper
  function injectIntoLinkedInComposer(text) {
    let editor = document.querySelector(".ql-editor, div[role='textbox']");
    if (!editor) {
      const startPostBtn = document.querySelector(
        "button.share-box-feed-entry__trigger, " +
        "button[aria-label*='Start a post'], " +
        ".share-box-feed-entry__top-bar button, " +
        "button.artdeco-button--primary[data-view-name*='post']"
      );
      if (startPostBtn) {
        startPostBtn.click();
        setTimeout(() => {
          editor = document.querySelector(".ql-editor, div[role='textbox']");
          if (editor) {
            editor.focus();
            editor.innerText = text;
            editor.dispatchEvent(new Event("input", { bubbles: true }));
          } else {
            navigator.clipboard.writeText(text);
            alert("Draft copied to clipboard! Open LinkedIn's 'Start a post' and paste.");
          }
        }, 600);
        return;
      }
    }

    if (editor) {
      editor.focus();
      editor.innerText = text;
      editor.dispatchEvent(new Event("input", { bubbles: true }));
    } else {
      navigator.clipboard.writeText(text);
      alert("Draft copied to clipboard! Paste directly into LinkedIn's composer.");
    }
  }

  document.getElementById("btn-insert-composer")?.addEventListener("click", () => {
    const text = postInput.value.trim();
    if (!text) return alert("Please generate or write a post draft first.");
    injectIntoLinkedInComposer(text);
  });

  // Helper to read media file input as data URL
  function readSelectedMedia() {
    return new Promise((resolve) => {
      const fileInput = document.getElementById("mediaInput");
      if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
        return resolve(null);
      }
      const file = fileInput.files[0];
      const reader = new FileReader();
      reader.onload = () => {
        resolve({
          name: file.name,
          type: file.type,
          dataUrl: reader.result
        });
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    });
  }

  // Publish Now Button Handler
  document.getElementById("btnPublishNow")?.addEventListener("click", async () => {
    const content = postInput.value.trim();
    const statusMsg = document.getElementById("publish-status-msg");
    if (!content) {
      alert("Please generate or enter post content first.");
      return;
    }

    statusMsg.className = "li-status-info";
    statusMsg.textContent = "🚀 Publishing post...";
    const media = await readSelectedMedia();

    chrome.runtime.sendMessage({
      action: "PUBLISH_NOW",
      payload: { content, media }
    }, (res) => {
      if (res?.success) {
        statusMsg.className = "li-status-success";
        statusMsg.textContent = "✓ Published to LinkedIn feed! Golden Hour alert scheduled for 15 mins.";
        setTimeout(() => { if (statusMsg) { statusMsg.textContent = ""; statusMsg.className = ""; } }, 5000);
      } else {
        const errMsg = res?.error || "Publishing failed";
        statusMsg.replaceChildren();
        const errDiv = document.createElement("div");
        errDiv.className = "li-status-error";
        errDiv.style.marginBottom = "4px";
        errDiv.textContent = `Error: ${errMsg}`;
        const fallbackBtn = document.createElement("button");
        fallbackBtn.id = "btn-fallback-post";
        fallbackBtn.className = "li-agent-btn";
        fallbackBtn.style.cssText = "font-size:11px; padding:3px 8px;";
        fallbackBtn.textContent = "📝 Paste directly into LinkedIn Post Box";
        fallbackBtn.addEventListener("click", () => {
          injectIntoLinkedInComposer(content);
          statusMsg.className = "li-status-success";
          statusMsg.textContent = "✓ Pasted into LinkedIn post composer!";
        });
        statusMsg.appendChild(errDiv);
        statusMsg.appendChild(fallbackBtn);
      }
    });
  });

  // Schedule Post Button Handler
  document.getElementById("btnSchedule")?.addEventListener("click", async () => {
    const content = postInput.value.trim();
    const timeValue = document.getElementById("scheduleTime").value;
    const statusMsg = document.getElementById("publish-status-msg");

    if (!content) {
      alert("Please generate or enter post content first.");
      return;
    }
    if (!timeValue) {
      alert("Please pick a future publish date & time.");
      return;
    }

    const scheduledTimestamp = new Date(timeValue).getTime();
    if (isNaN(scheduledTimestamp) || scheduledTimestamp <= Date.now()) {
      alert("Please select a date and time in the future.");
      return;
    }

    statusMsg.className = "li-status-info";
    statusMsg.textContent = "📅 Registering scheduled alarm...";
    const media = await readSelectedMedia();

    chrome.runtime.sendMessage({
      action: "SCHEDULE_POST",
      payload: { content, scheduledTimestamp, media }
    }, (res) => {
      if (res?.success) {
        statusMsg.className = "li-status-success";
        statusMsg.textContent = `✓ Post scheduled for ${new Date(scheduledTimestamp).toLocaleString()}!`;
        setTimeout(() => { if (statusMsg) { statusMsg.textContent = ""; statusMsg.className = ""; } }, 5000);
      } else {
        statusMsg.className = "li-status-error";
        statusMsg.textContent = `Scheduling failed: ${res?.error || "Unknown error"}`;
      }
    });
  });

  // Render Scheduled Posts Queue
  async function renderQueueList() {
    const queueList = document.getElementById("scheduledQueueList");
    if (!queueList) return;

    chrome.runtime.sendMessage({ action: "GET_SCHEDULED_QUEUE" }, (queue = []) => {
      queueList.replaceChildren();
      if (!queue || !queue.length) {
        const p = document.createElement("p");
        p.className = "empty-state";
        p.style.cssText = "font-size:12px; color:#64748b; text-align:center; padding:16px 0;";
        p.textContent = "No scheduled posts queued.";
        queueList.appendChild(p);
        return;
      }

      queue.forEach(item => {
        const card = document.createElement("div");
        card.className = "queue-card";

        const timeDiv = document.createElement("div");
        timeDiv.className = "queue-card-time";
        timeDiv.textContent = `📅 Scheduled for: ${new Date(item.scheduledTime).toLocaleString()}`;

        const contentDiv = document.createElement("div");
        contentDiv.className = "queue-card-content";
        contentDiv.textContent = `"${item.content}"`;

        card.appendChild(timeDiv);
        card.appendChild(contentDiv);

        if (item.media) {
          const mediaDiv = document.createElement("div");
          mediaDiv.style.cssText = "font-size:10px; color:#0a66c2; margin-top:3px;";
          mediaDiv.textContent = `📎 Attachment: ${item.media.name || "Media"}`;
          card.appendChild(mediaDiv);
        }

        const cancelBtn = document.createElement("button");
        cancelBtn.className = "btn-cancel-post";
        cancelBtn.textContent = "✕ Cancel Post";
        cancelBtn.addEventListener("click", () => {
          chrome.runtime.sendMessage({ action: "CANCEL_SCHEDULED_POST", payload: { postId: item.id } }, () => {
            renderQueueList();
          });
        });
        card.appendChild(cancelBtn);

        queueList.appendChild(card);
      });
    });
  }

  document.getElementById("btn-refresh-queue")?.addEventListener("click", renderQueueList);

  // ─── Analytics & Profile Telemetry Extraction ───
  function extractProfileEngagementMetrics() {
    const impressionElement = document.querySelector(
      ".analytics-entry-point_value-display, " +
      ".member-analytics-addon__count-wrapper .t-24, " +
      "a[href*='/analytics/creator/'] .t-24"
    );
    const profileViewsElement = document.querySelector(
      "a[href*='/analytics/profile-views/'] .t-24, " +
      "a[href*='/analytics/profile-views/'] strong, " +
      ".analytics-entry-point__views-count"
    );
    const searchAppearancesElement = document.querySelector(
      "a[href*='/analytics/search-appearances/'] .t-24, " +
      "a[href*='/analytics/search-appearances/'] strong"
    );

    const engagementData = {
      timestamp: Date.now(),
      impressions: impressionElement ? impressionElement.innerText.trim() : "N/A",
      profileViews: profileViewsElement ? profileViewsElement.innerText.trim() : "N/A",
      searchAppearances: searchAppearancesElement ? searchAppearancesElement.innerText.trim() : "N/A"
    };

    chrome.storage.local.set({ lastProfileMetrics: engagementData });
    return engagementData;
  }

  async function updateAnalyticsUI() {
    const { lastProfileMetrics } = await new Promise(res => chrome.storage.local.get("lastProfileMetrics", res));
    const viewsEl = document.getElementById("metricProfileViews");
    const impEl = document.getElementById("metricImpressions");
    const searchEl = document.getElementById("metricSearchAppearances");
    if (viewsEl && lastProfileMetrics?.profileViews) viewsEl.innerText = lastProfileMetrics.profileViews;
    if (impEl && lastProfileMetrics?.impressions) impEl.innerText = lastProfileMetrics.impressions;
    if (searchEl && lastProfileMetrics?.searchAppearances) searchEl.innerText = lastProfileMetrics.searchAppearances;
  }

  document.getElementById("btnRefreshAnalytics")?.addEventListener("click", () => {
    const statusMsg = document.getElementById("analytics-status-msg");
    const metrics = extractProfileEngagementMetrics();
    updateAnalyticsUI();
    if (statusMsg) {
      if (metrics && typeof metrics === "object" && (metrics.impressions !== "N/A" || metrics.profileViews !== "N/A")) {
        statusMsg.className = "li-status-success";
        statusMsg.textContent = "✓ Synced live page metrics!";
      } else {
        statusMsg.className = "li-status-info";
        statusMsg.textContent = "Telemetry scraped (Tip: Open Profile or Analytics tab for live stats).";
      }
      setTimeout(() => { if (statusMsg) { statusMsg.textContent = ""; statusMsg.className = ""; } }, 3500);
    }
  });

  // Auto-sync metrics if user navigates to analytics or profile
  if (window.location.href.includes("/analytics/") || window.location.href.includes("/in/")) {
    setTimeout(extractProfileEngagementMetrics, 2500);
  }

  // Helper to create isolated output card for streaming or responses
  function createOutputCard(title = "") {
    out.replaceChildren();
    const card = document.createElement("div");
    card.id = "output-card";
    card.style.cssText = "background:#ffffff; border:1px solid #e2e8f0; border-radius:8px; padding:12px;";
    if (title) {
      const label = document.createElement("div");
      label.style.cssText = "font-size:11px; font-weight:700; color:#0a66c2; margin-bottom:6px;";
      label.textContent = title;
      card.appendChild(label);
    }
    const box = document.createElement("div");
    box.className = "li-markdown-body";
    box.id = "stream-box";
    card.appendChild(box);
    out.appendChild(card);
    return { card, box };
  }

  // Quick Action: Suggest Comment
  document.getElementById("btn-suggest-comment").addEventListener("click", async () => {
    const firstPost = document.querySelector(".feed-shared-update-v2__description, .feed-shared-text, .update-components-text");
    const postText = firstPost ? firstPost.innerText : "A discussion on async teamwork.";

    const { card, box } = createOutputCard();

    try {
      await streamUserAgent(SYSTEM_PROMPTS.COMMENT_GENERATOR, `Post Content:\n"${postText.slice(0, 800)}"`, (_, full) => {
        box.replaceChildren(renderMarkdownElement(clientHumanize(full)));
      });
      attachCopyButton(card);
    } catch (err) {
      out.replaceChildren();
      const errSpan = document.createElement("span");
      errSpan.className = "li-status-error";
      errSpan.textContent = `Error: ${err.message}`;
      out.appendChild(errSpan);
    }
  });

  // Quick Action: Audit Profile
  document.getElementById("btn-audit-current-profile").addEventListener("click", async () => {
    const isProfile = window.location.href.includes("/in/");
    if (!isProfile) {
      out.replaceChildren();
      const errSpan = document.createElement("span");
      errSpan.className = "li-status-error";
      errSpan.textContent = "Navigate to a LinkedIn profile page first.";
      out.appendChild(errSpan);
      return;
    }

    const headline = document.querySelector(".text-body-medium.break-words")?.innerText || "Senior Developer";
    const about = document.querySelector("#about ~ .display-flex .inline-show-more-text")?.innerText || "Passionate professional.";

    const { card, box } = createOutputCard();

    try {
      await streamUserAgent(SYSTEM_PROMPTS.PROFILE_AUDIT, `Profile Headline: "${headline}"\n\nAbout Section:\n"${about}"`, (_, full) => {
        box.replaceChildren(renderMarkdownElement(full));
      });
      attachCopyButton(card);
    } catch (err) {
      out.replaceChildren();
      const errSpan = document.createElement("span");
      errSpan.className = "li-status-error";
      errSpan.textContent = `Error: ${err.message}`;
      out.appendChild(errSpan);
    }
  });

  // Quick Action: Humanize Draft
  document.getElementById("btn-humanize-composer").addEventListener("click", () => {
    const editor = document.querySelector(".ql-editor, div[role='textbox']");
    if (!editor || !editor.innerText.trim()) {
      if (postInput && postInput.value.trim()) {
        postInput.value = clientHumanize(postInput.value);
        updateMobilePreview(postInput.value);
        out.replaceChildren();
        const banner = document.createElement("div");
        banner.className = "li-banner-success";
        banner.textContent = "✓ Editor draft humanized!";
        out.appendChild(banner);
        return;
      }
      return;
    }
    editor.innerText = clientHumanize(editor.innerText);
    editor.dispatchEvent(new Event("input", { bubbles: true }));
    out.replaceChildren();
    const banner = document.createElement("div");
    banner.className = "li-banner-success";
    banner.textContent = "✓ LinkedIn composer draft humanized!";
    out.appendChild(banner);
  });

  chrome.runtime.onMessage.addListener((request) => {
    if (request.action === "EXECUTE_COMMAND") {
      if (request.command === "toggle-agent-panel") togglePanel();
      if (request.command === "humanize-draft") document.getElementById("btn-humanize-composer")?.click();
    }
  });

  // ─── LinkedIn Feed MutationObserver: Inline "✦ AI Reply" Buttons ───

  const FEED_POST_SELECTORS = [
    ".feed-shared-update-v2",
    "div[data-urn*='activity']",
    "div[data-urn*='ugcPost']"
  ].join(", ");

  const AI_REPLY_MARKER = "data-li-ai-reply-injected";

  function extractPostText(postEl) {
    const descEl = postEl.querySelector(
      ".feed-shared-update-v2__description, " +
      ".feed-shared-text, " +
      ".feed-shared-inline-show-more-text, " +
      ".update-components-text, " +
      ".break-words"
    );
    return descEl ? descEl.innerText.trim().slice(0, 1200) : "";
  }

  function extractPostAuthor(postEl) {
    const authorEl = postEl.querySelector(
      ".update-components-actor__name .visually-hidden, " +
      ".feed-shared-actor__name, " +
      ".update-components-actor__title .visually-hidden"
    );
    return authorEl ? authorEl.innerText.trim() : "Unknown Author";
  }

  function injectInlineAIButton(postEl) {
    if (postEl.getAttribute(AI_REPLY_MARKER)) return;
    postEl.setAttribute(AI_REPLY_MARKER, "true");

    // Find the social action bar (comment / like / share row)
    const actionBar = postEl.querySelector(
      ".feed-shared-social-action-bar, " +
      ".social-actions-button, " +
      ".feed-shared-social-actions, " +
      ".social-details-social-counts ~ ul, " +
      ".feed-shared-social-action-bar__action-button"
    );

    // Fallback: use the post element itself if no action bar found
    const targetBar = actionBar || postEl;

    const aiBtn = document.createElement("button");
    aiBtn.className = "li-inline-ai-btn";
    setElementHTML(aiBtn, `<span class="li-inline-ai-spark">✦</span> AI Reply`);
    aiBtn.title = "Generate an AI-powered contextual reply";

    aiBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      e.preventDefault();
      handleInlineReply(postEl);
    });

    targetBar.appendChild(aiBtn);
  }

  async function handleInlineReply(postEl) {
    const postText = extractPostText(postEl);
    const authorName = extractPostAuthor(postEl);

    if (!postText) {
      console.warn("[AI Agent] Could not extract post text for inline reply.");
      return;
    }

    // Check for existing reply box and remove it (toggle behavior)
    const existingBox = postEl.querySelector(".li-inline-reply-box");
    if (existingBox) {
      existingBox.remove();
      return;
    }

    // Create inline reply container
    const replyBox = document.createElement("div");
    replyBox.className = "li-inline-reply-box";
    setElementHTML(replyBox, `
      <div class="li-inline-reply-header">
        <span>✦ AI Reply to ${escapeHtml(authorName)}</span>
        <span class="li-inline-reply-close" style="cursor:pointer; font-size:14px; color:#64748b;">✕</span>
      </div>
      <div class="li-inline-reply-output">
        <span class="li-status-muted" style="font-style:italic;">Generating reply...</span>
      </div>
      <div class="li-inline-actions">
        <button class="li-copy-btn li-inline-copy-btn">📋 Copy</button>
        <button class="li-agent-btn li-inline-use-btn" style="font-size:11px; padding:4px 10px;">📝 Use in Comment</button>
      </div>
    `);

    // Insert after the social action bar or at end of post
    const actionBar = postEl.querySelector(".feed-shared-social-action-bar, .social-actions-button, .feed-shared-social-actions");
    if (actionBar) {
      actionBar.parentElement.insertBefore(replyBox, actionBar.nextSibling);
    } else {
      postEl.appendChild(replyBox);
    }

    const outputEl = replyBox.querySelector(".li-inline-reply-output");
    const closeBtn = replyBox.querySelector(".li-inline-reply-close");
    const copyBtn = replyBox.querySelector(".li-inline-copy-btn");
    const useBtn = replyBox.querySelector(".li-inline-use-btn");

    closeBtn.addEventListener("click", () => replyBox.remove());

    let generatedText = "";

    try {
      generatedText = await streamUserAgent(
        SYSTEM_PROMPTS.COMMENT_GENERATOR,
        `Author: ${authorName}\n\nPost Content:\n"${postText.slice(0, 800)}"`,
        (_, full) => {
          outputEl.replaceChildren(renderMarkdownElement(clientHumanize(full)));
        }
      );
      generatedText = clientHumanize(generatedText);
    } catch (err) {
      outputEl.replaceChildren();
      const errSpan = document.createElement("span");
      errSpan.className = "li-status-error";
      errSpan.textContent = `Error: ${err.message}`;
      outputEl.appendChild(errSpan);
      return;
    }

    // Wire up copy and use buttons
    copyBtn.addEventListener("click", async () => {
      await navigator.clipboard.writeText(generatedText);
      copyBtn.innerText = "✓ Copied!";
      setTimeout(() => (copyBtn.innerText = "📋 Copy"), 2000);
    });

    useBtn.addEventListener("click", () => {
      // Try to find and open the comment box for this specific post
      const commentBtn = postEl.querySelector(
        "button[aria-label*='Comment'], " +
        "button[aria-label*='comment'], " +
        ".comment-button, " +
        ".social-actions-button button:nth-child(2)"
      );
      if (commentBtn) commentBtn.click();

      // Wait briefly for the comment editor to appear, then inject text
      setTimeout(() => {
        const commentEditor = postEl.querySelector(".ql-editor, div[role='textbox'], .comments-comment-texteditor .ql-editor");
        if (commentEditor) {
          commentEditor.focus();
          commentEditor.innerText = generatedText;
          commentEditor.dispatchEvent(new Event("input", { bubbles: true }));
        } else {
          // Fallback: copy to clipboard
          navigator.clipboard.writeText(generatedText);
          copyBtn.innerText = "✓ Copied to clipboard (comment box not found)";
          setTimeout(() => (copyBtn.innerText = "📋 Copy"), 3000);
        }
      }, 600);
    });
  }

  // Debounced MutationObserver for dynamic LinkedIn feed
  let feedObserverDebounce = null;

  function scanAndInjectFeedButtons() {
    const posts = document.querySelectorAll(FEED_POST_SELECTORS);
    posts.forEach((post) => {
      try { injectInlineAIButton(post); } catch (e) {
        console.debug("[AI Agent Feed] Failed to inject button:", e);
      }
    });
  }

  // Initial scan
  scanAndInjectFeedButtons();

  // Observe DOM mutations for dynamically loaded posts
  const feedObserver = new MutationObserver(() => {
    if (feedObserverDebounce) clearTimeout(feedObserverDebounce);
    feedObserverDebounce = setTimeout(scanAndInjectFeedButtons, 400);
  });

  feedObserver.observe(document.body, { childList: true, subtree: true });

})();
