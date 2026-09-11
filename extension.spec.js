const { test, expect, chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const extensionPath = path.resolve(__dirname, '..');

test.describe('LinkedIn Growth Agent Extension Structure & Manifest', () => {
  test('manifest.json is valid Manifest V3 and contains required assets', async () => {
    const manifestPath = path.join(extensionPath, 'manifest.json');
    expect(fs.existsSync(manifestPath)).toBeTruthy();

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.name).toBe('LinkedIn Growth & Profile Agent');
    expect(manifest.background.service_worker).toBe('background.js');
    expect(manifest.permissions).toContain('storage');

    // Verify icons exist
    for (const size of ['16', '48', '128']) {
      const iconFile = path.join(extensionPath, manifest.icons[size]);
      expect(fs.existsSync(iconFile), `Icon for size ${size} should exist`).toBeTruthy();
    }
  });

  test('extension core files exist and are not empty', async () => {
    const coreFiles = [
      'manifest.json',
      'background.js',
      'content.js',
      'popup.html',
      'popup.js',
      'prompts.js',
      'styles.css'
    ];

    for (const file of coreFiles) {
      const filePath = path.join(extensionPath, file);
      expect(fs.existsSync(filePath), `${file} should exist`).toBeTruthy();
      const stats = fs.statSync(filePath);
      expect(stats.size).toBeGreaterThan(50);
    }
  });
});

test.describe('Network Interception & Safe Mocking (Zero API Cost)', () => {
  test('mock API calls using page.route to prevent real credential leakage', async ({ page }) => {
    // Intercept Gemini API endpoints with mocked data
    await page.route('**/generativelanguage.googleapis.com/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          candidates: [
            {
              content: {
                parts: [{ text: 'Mocked AI post draft for LinkedIn test.' }]
              }
            }
          ]
        })
      });
    });

    // Intercept OpenAI API endpoints
    await page.route('**/api.openai.com/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          choices: [
            {
              message: {
                role: 'assistant',
                content: 'Mocked OpenAI response.'
              }
            }
          ]
        })
      });
    });

    // Intercept LinkedIn Posts API
    await page.route('**/api.linkedin.com/rest/posts**', async (route) => {
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ id: 'urn:li:share:123456789' })
      });
    });

    // Verify mocked network interception is active
    let intercepted = false;
    page.on('request', (req) => {
      if (req.url().includes('generativelanguage.googleapis.com')) {
        intercepted = true;
      }
    });

    // Trigger test fetch
    const response = await page.evaluate(async () => {
      const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini:generateContent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: 'test' }] }] })
      });
      return res.json();
    });

    expect(intercepted).toBeTruthy();
    expect(response.candidates[0].content.parts[0].text).toBe('Mocked AI post draft for LinkedIn test.');
  });
});
