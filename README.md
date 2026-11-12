<p align="center">
  <img src="Icon.png" width="110" alt="Qat Logo">
</p>

<p align="center">
  Qat is a lightweight browser based on Chromium with an glass toolbar, AD Blocker and AI Assistant that can perform tasks for you.
</p>

<br>

Qat is built using Electron, however, it is using the castLabs build so that Netflix and other DRM video can be played. I created Qat as I wanted a lightweight browser with an assistant that would interact with the website rather than just talk.

Qat is mostly developed and tested on windows.

<br>

## Features

- Tabs with 3 minute timeout to save RAM. RAM usage shown in the toolbar.
- Glass toolbar that will adapt to the colour theme of the web page.
- Autocomplete in the address bar from history, bookmarks and google suggestions.
- Bookmarks. (Ctrl+D or star button). Bookmarks bar and Bookmark folders. Can import bookmarks from chrome.
- View your history (qat://history). (Ctrl+H). Can search through history. Remove single items or clear all.
- Chrome extensions. Can import from chrome, or load unpacked. Buttons are pinned to the toolbar.
- Zoom, full screen, devtools and other standard shortcuts.

### Ad Blocking

- Ad and tracking blockers using the Ghostery engine and EasyList. Can be toggled for each website. (Shield).
- Advanced scanning. Larger filter lists and DNS host lists are used to block tricky ads and tracking.

### Site Info / Scam Detection

- Click the icon next to the address bar to view connection info, certificate (Opens in windows certificiate viewer), and some nerdy stats.
- Scam detection can be enabled. When visiting websites that Qat does not know, it will ask your ai model if the page looks like a phishing attempt, fake shop, fake download etc.
- Large well-known sites such as Google, Gmail, YouTube, Reddit, GitHub etc will be trusted automatically. No AI call will happen. However, only videos will be checked on YouTube and will be checked individually.
- If the icon turns red with a '!', then the site looks a little suspicious. If the icon turns red then it is likely a scam.

### AI Assistant

- Chat with the sidebar using NVIDIA NIM, OpenRouter, OpenAI or any other OpenAI compatible service. (Ollama, LM Studio, your own server).
- Use browser mode. Can view pages, read pages, click, type, scroll and switch tabs. Cursor appears on screen to show you what the AI is doing. Stop button.
- Can search google in the background and read pages.
- Upload Images, PDFs, Text and Code Files.
- Slash commands. (/new, /retry, /model, /translate). Just type '/' to see all the commands.
- Quick Ask. (Ctrl+Space). Small popup asking a question. Each tab will have its own Quick ask.

<br>

## Getting Started

NodeJS 20 or higher and git.

```bash
git clone https://github.com/Ayan-Nalawade/Qat.git
cd Qat
npm install
npm start
```

npm install will install the castlabs electron build from github. This may take a while.

<br>

## Setting up AI

Go to the menu and select Settings (Or qat://settings). Select a provider.

| Provider | Key needed |
| --- | --- |
| NVIDIA NIM | Free API Key from build.nvidia.com |
| OpenRouter | API Key from openrouter.ai |
| OpenAI | API Key from platform.openai.com |
| Custom / Ollama | Base URL of an OpenAI compatible server. (e.g. http://localhost:11434/v1) |

Your keys will be encrypted using your OS keychain (Electron SafeStorage). They will not leave your machine except to go to the provider. The scam detection will use the same model as the chat.

<br>

## Shortcuts

| Shortcut | Command |
| --- | --- |
| Ctrl+Space | Quick Ask (Current Tab) |
| Ctrl+T / Ctrl+W | New Tab / Close Tab |
| Ctrl+Tab / Ctrl+Shift+Tab | Next Tab / Previous Tab |
| Ctrl+L | Go to address bar. |
| Ctrl+D | Add Bookmark |
| Ctrl+Shift+B | Toggle Bookmark Bar |
| Ctrl+H | View History |
| Ctrl+R / F5 | Refresh |
| Alt+Left / Alt+Right | Go back / Go forward |
| Ctrl+Plus / Minus / 0 | Zoom in / Zoom out / Reset Zoom |
| F11 | Fullscreen |
| Ctrl+Shift+I | Devtools |

<br>

## Internal Pages

- qat://settings - Configure AI, Ad Blocking, Scam Detection and Reset.
- qat://history
- qat://bookmarks
- qat://extensions

<br>

## Storage

All data is stored locally inside the Electron User Data folder (%APPDATA%\qat). Settings, History, Bookmarks, Extensions and Scam Detection are all stored here. Nothing is synced. All data can be deleted under Settings > Reset.

<br>

## Project Structure

```
src/
  main.js - Creates window, Tabs, Shortcuts, Menus and connects everything.
  ai.js - Providers, Keys and Chat Streaming.
  agent.js - Tools for AI Assistant. (View, Click, Type, Search etc).
  site.js - Site Info Popup and Scam Detection.
  block.js - Ad Blocking.
  history.js, bookmarks.js, extensions.js
  ui/ - Toolbar, Sidebar Chat, Quick Ask and Glass Shader.
  pages/ - qat://settings, History, Bookmarks, Extensions.
```

<br>

## Issues

- Mainly developed for Windows. Should work on macOS and Linux but some parts (Certificate Viewer) are only available on windows.
- Some websites may still act differently to Chrome.
- AI can make mistakes, including scam detection. Do not assume it will always say it looks okay.
