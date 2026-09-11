# LinkedIn Growth Agent Chrome Extension

A production-ready Chrome Extension (Manifest V3) with AI drafting, post scheduling, inline LinkedIn feed integration, and streaming LLM support.

---

## Features

- **Multi-Provider AI Support**: Connect your own API key for Google Gemini, OpenAI, Anthropic Claude, Groq (Llama 3.3), DeepSeek, or run completely offline with Ollama.
- **Growth Archetype Prompts**: Built-in frameworks for Thought Leadership Case Studies, Contrarian viewpoints, and Tactical Playbooks.
- **Inline Feed Integration**: AI buttons directly embedded next to LinkedIn post creation and comment boxes.
- **Real-Time Streaming**: Low-latency token streaming through Chrome runtime ports.
- **Keyboard Shortcuts**:
  - `Ctrl+Shift+X` (or `Cmd+Shift+X` on macOS): Toggle floating AI assistant panel.
  - `Ctrl+Shift+H` (or `Cmd+Shift+H` on macOS): Humanize current post draft.
- **Privacy & Security First**: Zero hardcoded API keys. All credentials stay on your device in encrypted local browser storage (`chrome.storage.local`).

---

## Installation

1. Clone or download this repository:
   ```bash
   git clone https://github.com/<your-username>/linkedin-growth-agent.git
   cd linkedin-growth-agent
   ```
2. Open Google Chrome and navigate to:
   ```text
   chrome://extensions/
   ```
3. Enable **Developer mode** in the top right corner.
4. Click **Load unpacked**.
5. Select this project root directory.
6. Open [LinkedIn](https://www.linkedin.com/feed/) to start using the assistant.

---

## Project Structure

```plaintext
my-chrome-extension/
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
├── tests/
│   └── extension.spec.js
├── manifest.json
├── background.js
├── content.js
├── popup.html
├── popup.js
├── prompts.js
├── styles.css
├── package.json
├── README.md
└── .gitignore
```

---

## Configuration & Security

1. Click the extension toolbar icon or click the Settings gear icon (⚙️) on the floating LinkedIn panel.
2. Select your preferred AI provider (e.g. Gemini, OpenAI, Claude, Groq, DeepSeek, or Ollama).
3. Paste your personal API key. Keys are saved strictly to your browser's private extension storage and are **never** transmitted to any third-party server other than the official provider API endpoint.

---

## Running Automated Tests

The test suite uses [Playwright](https://playwright.dev/) with network mocking (`page.route()`) so tests run with **zero API costs**, **no live API keys**, and **deterministic speed**.

```bash
# Install test dependencies
npm install

# Run Playwright test suite
npx playwright test
```

---

## License

MIT License
