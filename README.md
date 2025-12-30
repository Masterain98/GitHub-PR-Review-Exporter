# GitHub PR Review Exporter

[![Chrome Web Store](https://img.shields.io/badge/Chrome-Extension-green?logo=googlechrome)](https://chromewebstore.google.com/detail/github-pr-review-exporter/lgfmnclmbgcggmgbikakbgelndlblolg)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

A Chrome extension that helps you export GitHub PR review comments with file paths, line numbers, and code suggestions. Perfect for AI-assisted code review workflows.

## ✨ Features

### 🚀 Export Individual Reviews
- **Export Review** - Export a single review comment with file path, line numbers, and content
- **Export Instruction & Review** - Export with your custom instruction prepended (great for AI prompts)

### 📦 Batch Export
- **Export Reviews with Instruction** - Export ALL unresolved review comments at once from the sidebar
- Automatically skips resolved conversations
- Perfect for feeding multiple reviews to AI assistants

### 🤖 AI Bot Detection
Automatically detects and labels reviews from AI code review bots:
- **GitHub Copilot** → "Export GitHub Copilot Review"
- **OpenAI Codex** → "Export Codex Review"
- Removes bot-specific boilerplate (reaction prompts, badges)

### 📝 Custom Instructions
Configure a custom instruction that gets prepended to your exports:
- Click the extension icon to open settings
- Use the built-in default instruction or write your own
- Instructions sync across your devices

### 📋 Smart Content Extraction
- Extracts raw markdown including `suggestion` code blocks
- Captures file paths and line numbers accurately
- Removes UI elements and boilerplate text

## 📥 Installation

### From Chrome Web Store (Recommended)
1. Visit the [Chrome Web Store page](https://chromewebstore.google.com/detail/github-pr-review-exporter/lgfmnclmbgcggmgbikakbgelndlblolg)
2. Click "Add to Chrome"
3. Done!

### Manual Installation (Developer Mode)
1. Download or clone this repository
2. Open Chrome and go to `chrome://extensions/`
3. Enable "Developer mode" (toggle in top right)
4. Click "Load unpacked"
5. Select the extension folder
6. The extension icon will appear in your toolbar

## 🎯 Usage

### Exporting a Single Review
1. Navigate to any GitHub Pull Request
2. Find a review comment thread
3. Click **"Export Review"** to copy just the review content
4. Or click **"Export Instruction & Review"** to include your custom instruction

### Exporting All Unresolved Reviews
1. Look at the right sidebar on the PR page
2. Click the green **"Export Reviews with Instruction"** button
3. All unresolved reviews will be exported with your instruction

### Setting Up Custom Instructions
1. Click the extension icon in your browser toolbar
2. Enter your custom instruction or click **"Use Default"** for a template
3. Click **"Save"**

#### Default Instruction Template
```
Please review the following code review comments. For each comment:
1. Assess if the concern is valid and applicable
2. If valid, analyze the suggested fix or solution
3. Decide whether to adopt, modify, or reject the suggestion
4. Provide your reasoning and any code changes if applicable
```

## 📤 Export Format

Each exported review includes:

```
path/to/file.py
Comment on lines +123 to +125

Review comment content here...

If there's a suggested change:
```suggestion
suggested code here
```

## 🔒 Privacy

This extension:
- ✅ Only runs on GitHub PR pages (`github.com/*/*/pull/*`)
- ✅ Only stores your custom instruction (synced via Chrome)
- ✅ Does not send any data to external servers
- ✅ Does not track usage or analytics
- ✅ Open source - review the code yourself!

## 📄 License

MIT License - see [LICENSE](LICENSE) for details.

