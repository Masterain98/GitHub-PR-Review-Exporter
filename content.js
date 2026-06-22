/**
 * GitHub PR Review Copy Button
 * Requirements:
 * 1) Button should be placed in each comment bubble's header
 * 2) Copied text should end with "\n\n---\n"
 * 3) Copy raw comment body (the text in edit textarea)
 * 4) Only copy content from the specific comment bubble clicked
 *
 * Module layout (for reference — all in one file for Chrome MV3 compatibility):
 *   §1  Constants (EXT_MARK, AI_BOTS, DEFAULT_INSTRUCTION, isPullRequestPage)
 *   §2  Bot Detection (detectAIBot)
 *   §3  Content Cleaners (cleanCodexContent, cleanSentryContent, cleanCodeRabbitContent,
 *                          cleanSourceryContent, cleanQodoContent)
 *   §4  DOM Extraction (findThreadContainer, findFileContainer, findFilePath,
 *                        findLineInfoText, extractSuggestionContent, getRawCommentBody,
 *                        detectPriority, getCleanedCommentBody, buildCopyText, getInstruction)
 *   §5  UI Styles (isDarkMode, getThemeColors, getButtonStyles, ensureThreadExportStyles)
 *   §6  Thread UI (createButtonContainer, createThreadExportControl, isThreadResolved,
 *                   getAllUnresolvedReviews, mount*, injectButtonsIntoThread, cleanupButtons)
 *   §7  Sidebar UI (createMarkAllResolvedButton, createSidebarExportButton,
 *                    showInstructionModal, createEditInstructionButton, injectSidebarButton)
 *   §8  Entry Point (expandHiddenConversations, processAllThreads, debounce, observe)
 */

(function () {

  // ═══════════════════════════════════════════════════════════════════════════
  // §1  Constants
  // ═══════════════════════════════════════════════════════════════════════════

  const EXT_MARK = "data-pr-review-copy-installed";

  const AI_BOTS = {
    "chatgpt-codex-connector": {
      name: "Codex",
      buttonLabel: "Export Codex Review",
    },
    "copilot": {
      name: "Copilot",
      buttonLabel: "Export GitHub Copilot Review",
    },
    "sentry": {
      name: "Sentry",
      buttonLabel: "Export Sentry Review",
    },
    "coderabbitai": {
      name: "CodeRabbit",
      buttonLabel: "Export CodeRabbit Review",
    },
    "sourcery-ai": {
      name: "Sourcery",
      buttonLabel: "Export Sourcery Review",
    },
    "qodo-code-review": {
      name: "Qodo",
      buttonLabel: "Export Qodo Review",
      expandDetails: true,
    },
  };

  const DEFAULT_INSTRUCTION = `Please review the following code review comments. For each comment:
1. Assess if the concern is valid and applicable
2. If valid, analyze the suggested fix or solution
3. Decide whether to adopt, modify, or reject the suggestion
4. Provide your reasoning and any code changes if applicable
5. If you are unsure about the business logic or design intent, ask me clarifying questions before proceeding`;

  function isPullRequestPage() {
    return location.pathname.includes("/pull/");
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // §2  Bot Detection
  // ═══════════════════════════════════════════════════════════════════════════

  function detectAIBot(commentEl) {
    const authorLink = commentEl.querySelector(
      ".author, a[data-hovercard-type='user'], .timeline-comment-header a"
    );
    if (authorLink) {
      const authorName = (authorLink.textContent || "").trim().toLowerCase();
      const authorHref = (authorLink.getAttribute("href") || "").toLowerCase();

      for (const [botUsername, botConfig] of Object.entries(AI_BOTS)) {
        if (authorName.includes(botUsername) || authorHref.includes(botUsername)) {
          console.log("[PR Copy] Detected AI bot:", botConfig.name);
          return botConfig;
        }
      }
    }

    const authorNameEl = commentEl.querySelector('[class*="AuthorName"]');
    if (authorNameEl) {
      const name = (authorNameEl.textContent || "").trim().toLowerCase();
      for (const [botUsername, botConfig] of Object.entries(AI_BOTS)) {
        if (name.includes(botUsername)) {
          console.log("[PR Copy] Detected AI bot (new layout):", botConfig.name);
          return botConfig;
        }
      }
    }

    const appLinks = commentEl.querySelectorAll('a[href*="/apps/"]');
    for (const link of appLinks) {
      const href = (link.getAttribute("href") || "").toLowerCase();
      if (href.includes("copilot")) {
        console.log("[PR Copy] Detected Copilot via app link");
        return AI_BOTS["copilot"];
      }
      for (const [botUsername, botConfig] of Object.entries(AI_BOTS)) {
        if (href.includes(botUsername)) {
          console.log("[PR Copy] Detected AI bot via app link:", botConfig.name);
          return botConfig;
        }
      }
    }

    return null;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // §3  Content Cleaners
  // ═══════════════════════════════════════════════════════════════════════════

  function cleanCodexContent(text) {
    let cleaned = text;
    cleaned = cleaned.replace(/\n*Useful\?\s*React with\s*👍\s*\/\s*👎\.?\s*$/i, "");
    cleaned = cleaned.replace(/^\*\*<sub><sub>.*?<\/sub><\/sub>\s*/i, "");
    cleaned = cleaned.replace(/^\s*P\d+\s*\n/i, "");
    cleaned = cleaned.replace(/\*\*\s*$/m, "");
    return cleaned.trim();
  }

  function cleanSentryContent(text) {
    let result = [];
    const bugTitleMatch = text.match(/\*\*Bug:\*\*\s*(.+?)(?=\n|<sub>|$)/s);
    if (bugTitleMatch) {
      result.push("Bug: " + bugTitleMatch[1].trim());
    }
    const locationMatch = text.match(/Location:\s*(.+?)(?=\n|Potential issue:|$)/s);
    if (locationMatch) {
      result.push("");
      result.push("Location: " + locationMatch[1].trim());
    }
    const potentialIssueMatch = text.match(/Potential issue:\s*(.+?)(?=```|<\/details>|Did we get this right|$)/s);
    if (potentialIssueMatch) {
      result.push("");
      result.push("Potential issue: " + potentialIssueMatch[1].trim());
    }
    if (result.length > 0) {
      return result.join("\n");
    }
    return text.trim();
  }

  function cleanCodeRabbitContent(text) {
    let cleaned = text;

    cleaned = cleaned.replace(/^[^\n]*(?:Potential issue|Verification successful|Nitpick|Praise)[^\n]*\n?/m, "");

    cleaned = cleaned.replace(/^\s*🧩\s*Analysis chain\s*\n?/m, "");
    cleaned = cleaned.replace(/🏁\s*Script executed:[\s\S]*?Length of output:\s*\d+\s*\n?/g, "");
    cleaned = cleaned.replace(/^Repository:\s*\S+\s*\n?/gm, "");

    cleaned = cleaned.replace(/^\s*🛠️?\s*建议修改\s*\n?/m, "");
    cleaned = cleaned.replace(/^\s*建议修改\s*\n?/m, "");

    cleaned = cleaned.replace(/\n?\s*📝\s*Committable suggestion[\s\S]*/g, "");
    cleaned = cleaned.replace(/\n?\s*🤖\s*Prompt for AI Agents[\s\S]*/g, "");

    cleaned = cleaned.replace(/\n*Thanks for using CodeRabbit[\s\S]*/i, "");
    cleaned = cleaned.replace(/\n*❤️\s*Share[\s\S]*/i, "");
    cleaned = cleaned.replace(/\n*Comment\s+@coderabbitai\s+help[\s\S]*/i, "");

    cleaned = cleaned.replace(/^\s*Actionable comments posted:\s*\d+\s*\n?/m, "");
    cleaned = cleaned.replace(/^\s*🧹\s*Nitpick(?:\s+comments)?\s*(?:\(\d+\))?\s*\n?/m, "");
    cleaned = cleaned.replace(/^\s*🤖\s*Prompt for all review comments with AI agents\s*\n?/m, "");
    cleaned = cleaned.replace(/^\s*ℹ️\s*Review info\s*\n?/m, "");

    cleaned = cleaned.replace(/\n?\s*🪄\s*Autofix[\s\S]*/g, "");
    cleaned = cleaned.replace(/\n?\s*⚙️\s*Run configuration[\s\S]*/g, "");
    cleaned = cleaned.replace(/\n?\s*📥\s*Commits[\s\S]*/g, "");
    cleaned = cleaned.replace(/\n?\s*⛔\s*Files ignored[\s\S]*/g, "");
    cleaned = cleaned.replace(/\n?\s*📒\s*Files selected[\s\S]*/g, "");
    cleaned = cleaned.replace(/\n?\s*💤\s*Files with no reviewable[\s\S]*/g, "");

    cleaned = cleaned.split('\n').map(line => (/^\s+$/.test(line) ? '' : line)).join('\n');
    cleaned = cleaned.replace(/\n{3,}/g, "\n\n");

    return cleaned.trim();
  }

  function cleanSourceryContent(text) {
    let cleaned = text;

    cleaned = cleaned.split('\n').map(line => (/^\s+$/.test(line) ? '' : line)).join('\n');

    cleaned = cleaned.replace(/\nSequence diagram[\s\S]*/g, "");
    cleaned = cleaned.replace(/\nFile-Level Changes[\s\S]*/g, "");
    cleaned = cleaned.replace(/\nInteracting with Sourcery[\s\S]*/g, "");
    cleaned = cleaned.replace(/\nPrompt for AI Agents[\s\S]*/g, "");
    cleaned = cleaned.replace(/\nSourcery is free for open source[\s\S]*/g, "");
    cleaned = cleaned.replace(/\nHelp me be more useful![\s\S]*/g, "");

    cleaned = cleaned.replace(/\n{3,}/g, "\n\n");

    return cleaned.trim();
  }

  function cleanQodoContent(text) {
    let cleaned = text;

    cleaned = cleaned.split('\n').map(line => (/^\s+$/.test(line) ? '' : line)).join('\n');

    cleaned = cleaned.replace(/\nAgent prompt\n[\s\S]*?(?=\n\s*\d+\.\s+\S|\n*$)/g, "");
    cleaned = cleaned.replace(/^\s*ⓘ\s*Copy this prompt and use it to remediate.*$/gm, "");
    cleaned = cleaned.replace(/^\s*ⓘ\s*Recommendations generated based on similar findings.*$/gm, "");

    cleaned = cleaned.replace(/\nDiagram\n[\s\S]*?(?=\n[A-Z][a-z]+(?:\s|$))/g, "\n");
    cleaned = cleaned.replace(/\nHigh-Level Assessment\n[\s\S]*/g, "");
    cleaned = cleaned.replace(/\nFiles changed\b[\s\S]*/g, "");
    cleaned = cleaned.replace(/\nhttps:\/\/www\.qodo\.ai[\s\S]*/g, "");

    cleaned = cleaned.replace(/\n{3,}/g, "\n\n");

    return cleaned.trim();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // §4  DOM Extraction
  // ═══════════════════════════════════════════════════════════════════════════

  function findThreadContainer(el) {
    const inlineContainer = el.closest(".js-inline-comments-container");
    const outerContainer =
      el.closest("details.js-comment-container") ||
      el.closest(".js-comment-container") ||
      el.closest(".review-thread-component") ||
      el.closest("details.review-thread") ||
      (inlineContainer ? inlineContainer.closest("details, .js-comment-container") : null);
    console.log("[PR Copy] Outer container:", outerContainer);
    return outerContainer || inlineContainer;
  }

  function findFileContainer(el) {
    return (
      el.closest(".file") ||
      el.closest(".js-file") ||
      el.closest("[data-tagsearch-path]") ||
      el.closest(".js-diff-progressive-container")
    );
  }

  function findFilePath(el) {
    const threadContainer = findThreadContainer(el);
    console.log("[PR Copy] Looking for file path in:", threadContainer);

    if (threadContainer) {
      const summary = threadContainer.querySelector("summary");
      if (summary) {
        const pathLink = summary.querySelector("a.Link--primary, a[href*='/files/']");
        if (pathLink) {
          const path = (pathLink.textContent || "").trim();
          if (path && path.includes("/")) {
            console.log("[PR Copy] Found file path in summary:", path);
            return path;
          }
        }
      }

      const anyPathLink = threadContainer.querySelector(
        "a[href*='/blob/'], a[href*='/files/'], a.text-mono"
      );
      if (anyPathLink) {
        const path = (anyPathLink.textContent || "").trim();
        if (path && path.includes("/") && !path.includes(" ")) {
          console.log("[PR Copy] Found file path in link:", path);
          return path;
        }
      }
    }

    const fileContainer = findFileContainer(el);
    if (fileContainer) {
      const pathSelectors = [
        ".file-header a.Link--primary",
        ".file-info a.Link--primary",
        "a[title][href*='/blob/']",
        "[data-path]",
      ];
      for (const selector of pathSelectors) {
        const pathEl = fileContainer.querySelector(selector);
        if (pathEl) {
          const path = (
            pathEl.getAttribute("title") ||
            pathEl.getAttribute("data-path") ||
            pathEl.textContent ||
            ""
          ).trim();
          if (path && !path.includes("...")) {
            console.log("[PR Copy] Found file path in file container:", path);
            return path;
          }
        }
      }
    }

    console.log("[PR Copy] No file path found");
    return "";
  }

  function findLineInfoText(el) {
    const threadContainer = findThreadContainer(el);
    console.log("[PR Copy] Looking for line info in:", threadContainer);

    if (!threadContainer) {
      console.log("[PR Copy] No thread container found");
      return "";
    }

    const fullText = (threadContainer.textContent || "").replace(/\s+/g, " ");

    const patterns = [
      /Comment on lines?\s+\+?\d+\s+to\s+\+?\d+/i,
      /Comment on lines?\s+\+?\d+/i,
      /Comment on line\s+\+?\d+/i,
    ];

    for (const pattern of patterns) {
      const match = fullText.match(pattern);
      if (match) {
        console.log("[PR Copy] Found line info:", match[0]);
        return match[0].trim();
      }
    }

    const headerDivs = threadContainer.querySelectorAll(".f6, .color-fg-muted");
    for (const div of headerDivs) {
      const text = (div.textContent || "").replace(/\s+/g, " ");
      for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match) {
          console.log("[PR Copy] Found line info in header div:", match[0]);
          return match[0].trim();
        }
      }
    }

    console.log("[PR Copy] No line info found");
    return "";
  }

  function extractSuggestionContent(commentEl) {
    const suggestionForm = commentEl.querySelector("form.js-single-suggested-change-form");
    if (suggestionForm) {
      const valueInputs = suggestionForm.querySelectorAll('input[name="value[]"]');
      if (valueInputs.length > 0) {
        const lines = Array.from(valueInputs).map((input) => input.value);
        return lines.join("\n");
      }
    }
    return "";
  }

  function getRawCommentBody(commentEl, botConfig) {
    const editForm = commentEl.querySelector("form.js-comment-edit-form");
    if (editForm) {
      const textarea =
        editForm.querySelector("textarea.js-comment-field") ||
        editForm.querySelector("textarea[name='comment[body]']") ||
        editForm.querySelector("textarea");
      if (textarea && textarea.value && textarea.value.trim()) {
        console.log("[PR Copy] Found raw markdown in edit form");
        return textarea.value.trim();
      }
    }

    const taskLists = commentEl.querySelector("task-lists");
    if (taskLists) {
      const textarea = taskLists.querySelector("textarea");
      if (textarea && textarea.value && textarea.value.trim()) {
        console.log("[PR Copy] Found raw markdown in task-lists");
        return textarea.value.trim();
      }
    }

    const bodyEl =
      commentEl.querySelector(".comment-body.markdown-body") ||
      commentEl.querySelector(".comment-body") ||
      commentEl.querySelector(".js-comment-body") ||
      commentEl.querySelector('[class*="automatedComment__body"] .markdown-body') ||
      commentEl.querySelector('[class*="automatedComment__content"] .markdown-body') ||
      commentEl.querySelector('.markdown-body');

    if (bodyEl) {
      const clone = bodyEl.cloneNode(true);

      if (botConfig && botConfig.expandDetails) {
        clone.querySelectorAll("details").forEach((d) => d.setAttribute("open", ""));
      }

      const suggestionBlocks = clone.querySelectorAll(
        ".js-suggested-changes-blob, " +
        ".suggested-change-form-container, " +
        ".js-apply-changes, " +
        "button, " +
        ".flash, " +
        ".zeroclipboard-container"
      );
      suggestionBlocks.forEach((el) => el.remove());

      let mainText = clone.innerText.trim();
      mainText = mainText.replace(/^\s*Suggested change\s*/i, "").trim();

      const suggestionContent = extractSuggestionContent(commentEl);
      if (suggestionContent) {
        console.log("[PR Copy] Found suggestion content");
        return mainText + "\n```suggestion\n" + suggestionContent + "\n```";
      }

      console.log("[PR Copy] Using rendered body text only");
      return mainText;
    }

    return "";
  }

  function detectPriority(commentEl, botConfig) {
    const badgesGroup = commentEl.querySelector('[class*="BadgesGroupContainer"]');
    if (badgesGroup) {
      const labels = badgesGroup.querySelectorAll('[class*="Label"]');
      for (const label of labels) {
        const text = (label.textContent || "").trim();
        if (/^(Critical|High|Medium|Low)$/i.test(text)) {
          console.log("[PR Copy] Detected Copilot priority:", text);
          return text;
        }
      }
    }

    const badgeImgs = commentEl.querySelectorAll('img[alt*="Badge"]');
    for (const img of badgeImgs) {
      const alt = img.alt || "";
      const match = alt.match(/P(\d+)\s*Badge/i);
      if (match) {
        console.log("[PR Copy] Detected Codex priority: P" + match[1]);
        return "P" + match[1];
      }
    }

    const editForm = commentEl.querySelector("form.js-comment-edit-form");
    if (editForm) {
      const textarea = editForm.querySelector("textarea");
      if (textarea && textarea.value) {
        const urlMatch = textarea.value.match(/badge\/P(\d+)/i);
        if (urlMatch) {
          console.log("[PR Copy] Detected Codex priority from markdown: P" + urlMatch[1]);
          return "P" + urlMatch[1];
        }
      }
    }

    if (botConfig && botConfig.name === "Sentry") {
      const bodyEl = commentEl.querySelector(".comment-body, .js-comment-body");
      if (bodyEl) {
        const match = (bodyEl.textContent || "").match(/Severity:\s*(CRITICAL|HIGH|MEDIUM|LOW|WARNING)\b/i);
        if (match) {
          console.log("[PR Copy] Detected Sentry severity:", match[1]);
          return match[1].toUpperCase();
        }
      }
    }

    if (botConfig && botConfig.name === "CodeRabbit") {
      const bodyEl = commentEl.querySelector(".comment-body, .js-comment-body");
      if (bodyEl) {
        const bodyText = (bodyEl.textContent || "").trim();
        const severityMatch = bodyText.match(/(?:🔴|🟠|🟡|🟢|⚪)\s*(Critical|Major|Minor|Low)\b/i);
        if (severityMatch) {
          const severity = severityMatch[1].charAt(0).toUpperCase() + severityMatch[1].slice(1).toLowerCase();
          console.log("[PR Copy] Detected CodeRabbit severity:", severity);
          return severity;
        }
      }
    }

    return "";
  }

  function getCleanedCommentBody(commentEl, botConfig) {
    let body = getRawCommentBody(commentEl, botConfig);

    if (botConfig && botConfig.name === "Codex") {
      body = cleanCodexContent(body);
    } else if (botConfig && botConfig.name === "Sentry") {
      body = cleanSentryContent(body);
    } else if (botConfig && botConfig.name === "CodeRabbit") {
      body = cleanCodeRabbitContent(body);
    } else if (botConfig && botConfig.name === "Sourcery") {
      body = cleanSourceryContent(body);
    } else if (botConfig && botConfig.name === "Qodo") {
      body = cleanQodoContent(body);
    }

    return body;
  }

  function buildCopyText(commentEl, botConfig) {
    const filePath = findFilePath(commentEl);
    const lineInfo = findLineInfoText(commentEl);
    const priority = detectPriority(commentEl, botConfig);
    const rawBody = getCleanedCommentBody(commentEl, botConfig);

    const parts = [];

    if (filePath) parts.push(filePath);
    if (lineInfo) parts.push(lineInfo);
    if (priority) parts.push("Priority: " + priority);
    if (filePath || lineInfo || priority) parts.push("");

    if (rawBody) parts.push(rawBody);

    parts.push("");
    parts.push("---");

    return parts.join("\n");
  }

  async function getInstruction() {
    try {
      if (typeof chrome === "undefined" || !chrome.storage || !chrome.storage.sync) {
        return "";
      }
      const result = await chrome.storage.sync.get(["customInstruction"]);
      return result.customInstruction || "";
    } catch (err) {
      console.error("[PR Export] Failed to get instruction:", err);
      return "";
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // §5  UI Styles
  // ═══════════════════════════════════════════════════════════════════════════

  function isDarkMode() {
    const html = document.documentElement;
    const colorMode = html.getAttribute("data-color-mode");

    if (colorMode === "dark") return true;
    if (colorMode === "light") return false;

    if (colorMode === "auto") {
      if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) {
        return true;
      }
    }

    const bgColor = getComputedStyle(document.body).backgroundColor;
    if (bgColor) {
      const rgb = bgColor.match(/\d+/g);
      if (rgb && rgb.length >= 3) {
        const brightness = (parseInt(rgb[0]) + parseInt(rgb[1]) + parseInt(rgb[2])) / 3;
        return brightness < 128;
      }
    }

    return true;
  }

  function getThemeColors() {
    const dark = isDarkMode();
    return {
      overlay: dark ? "rgba(0, 0, 0, 0.6)" : "rgba(0, 0, 0, 0.4)",
      modalBg: dark ? "#0d1117" : "#ffffff",
      modalBorder: dark ? "#30363d" : "#d0d7de",
      headerBg: dark ? "#0d1117" : "#f6f8fa",
      textPrimary: dark ? "#f0f6fc" : "#1f2328",
      textSecondary: dark ? "#8b949e" : "#656d76",
      textMuted: dark ? "#6e7681" : "#8b949e",
      inputBg: dark ? "#161b22" : "#ffffff",
      inputBorder: dark ? "#30363d" : "#d0d7de",
      inputText: dark ? "#c9d1d9" : "#1f2328",
      inputFocus: dark ? "#58a6ff" : "#0969da",
      btnSecondaryBg: dark ? "#21262d" : "#f6f8fa",
      btnSecondaryBorder: dark ? "#30363d" : "#d0d7de",
      btnSecondaryText: dark ? "#c9d1d9" : "#24292f",
      btnSecondaryHoverBg: dark ? "#30363d" : "#f3f4f6",
      btnPrimaryBg: "#238636",
      btnPrimaryBorder: "#238636",
      btnPrimaryText: "#ffffff",
      btnPrimaryHoverBg: "#2ea043",
      successBg: dark ? "rgba(35, 134, 54, 0.2)" : "rgba(35, 134, 54, 0.15)",
      successBorder: "#238636",
      successText: dark ? "#3fb950" : "#1a7f37",
      errorBg: dark ? "rgba(248, 81, 73, 0.2)" : "rgba(248, 81, 73, 0.15)",
      errorBorder: "#f85149",
      errorText: dark ? "#f85149" : "#cf222e",
    };
  }

  function getButtonStyles() {
    const dark = isDarkMode();
    return {
      base: `
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 3px 8px;
        font-size: 12px;
        font-weight: 500;
        line-height: 20px;
        white-space: nowrap;
        vertical-align: middle;
        cursor: pointer;
        user-select: none;
        border: 1px solid;
        border-radius: 6px;
        transition: 80ms cubic-bezier(0.33, 1, 0.68, 1);
        transition-property: color, background-color, border-color;
      `,
      secondary: dark ? `
        color: #c9d1d9;
        background-color: #21262d;
        border-color: rgba(240, 246, 252, 0.1);
      ` : `
        color: #24292f;
        background-color: #f6f8fa;
        border-color: rgba(31, 35, 40, 0.15);
      `,
      secondaryHover: dark ? `
        background-color: #30363d;
        border-color: #8b949e;
      ` : `
        background-color: #f3f4f6;
        border-color: rgba(31, 35, 40, 0.15);
      `
    };
  }

  function ensureThreadExportStyles() {
    if (document.getElementById("pr-review-export-styles")) return;

    const style = document.createElement("style");
    style.id = "pr-review-export-styles";
    style.textContent = `
      .pr-review-export-container {
        position: relative;
        display: inline-block;
      }

      .pr-review-export-trigger::-webkit-details-marker {
        display: none;
      }

      .pr-review-export-trigger::marker {
        content: "";
      }

      .pr-review-export-trigger {
        list-style: none;
      }

      .pr-review-export-trigger.pr-review-export-trigger--header {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 4px 6px;
        border: 0;
        border-radius: 6px;
        background: transparent;
        color: var(--color-fg-muted, #656d76);
        font: inherit;
        font-size: 12px;
        font-weight: 500;
        line-height: 1;
        white-space: nowrap;
        cursor: pointer;
      }

      .pr-review-export-trigger.pr-review-export-trigger--header:hover {
        background: var(--color-neutral-muted, rgba(175, 184, 193, 0.2));
        color: var(--color-fg-default, #24292f);
      }

      .pr-review-export-container[open] .pr-review-export-trigger {
        background-color: var(--color-neutral-muted, rgba(175, 184, 193, 0.2)) !important;
        border-color: var(--color-border-default, rgba(31, 35, 40, 0.15)) !important;
      }

      .pr-review-export-container[open] .pr-review-export-trigger.pr-review-export-trigger--header {
        border-color: transparent !important;
      }
    `;
    document.head.appendChild(style);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // §6  Thread UI
  // ═══════════════════════════════════════════════════════════════════════════

  function createButtonContainer() {
    const container = document.createElement("div");
    container.className = "pr-review-export-row";
    container.style.cssText = `
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 8px;
      width: 100%;
      box-sizing: border-box;
    `;
    return container;
  }

  function createThreadExportControl(commentEl, botConfig, variant = "header") {
    ensureThreadExportStyles();

    const styles = getButtonStyles();
    const details = document.createElement("details");
    details.className = "pr-review-export-container";

    const summary = document.createElement("summary");
    summary.className = `pr-review-export-trigger pr-review-export-trigger--${variant}`;
    summary.textContent = "Export";

    const summaryBaseStyle = variant === "header"
      ? `display: inline-flex; align-items: center; gap: 4px;`
      : styles.base + styles.secondary + `display: inline-flex; align-items: center; gap: 6px; padding-right: 10px; white-space: nowrap;`;

    const summaryHoverStyle = variant === "header"
      ? `display: inline-flex; align-items: center; gap: 4px;`
      : styles.base + styles.secondaryHover + `display: inline-flex; align-items: center; gap: 6px; padding-right: 10px; white-space: nowrap;`;

    summary.style.cssText = summaryBaseStyle;
    summary.insertAdjacentHTML(
      "beforeend",
      '<svg aria-hidden="true" viewBox="0 0 16 16" width="12" height="12" style="fill: currentColor;"><path d="M4.427 6.427a.75.75 0 0 1 1.06 0L8 8.94l2.513-2.513a.75.75 0 1 1 1.06 1.06L8.53 10.53a.75.75 0 0 1-1.06 0L4.427 7.487a.75.75 0 0 1 0-1.06Z"></path></svg>'
    );

    summary.addEventListener("mouseenter", () => { summary.style.cssText = summaryHoverStyle; });
    summary.addEventListener("mouseleave", () => { summary.style.cssText = summaryBaseStyle; });

    const menu = document.createElement("div");
    menu.className = "pr-review-export-menu";
    menu.style.cssText = `
      position: absolute;
      top: calc(100% + 6px);
      right: 0;
      min-width: 220px;
      padding: 6px;
      background: var(--color-canvas-overlay, #ffffff);
      border: 1px solid var(--color-border-default, rgba(31, 35, 40, 0.15));
      border-radius: 8px;
      box-shadow: 0 8px 24px rgba(140, 149, 159, 0.2);
      z-index: 1000;
    `;

    const createMenuItem = (label, includeInstruction) => {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "pr-review-export-menu-item";
      item.textContent = label;
      item.style.cssText = `
        display: block; width: 100%; padding: 7px 10px; margin: 0; border: 0;
        border-radius: 6px; background: transparent; color: inherit; font: inherit;
        font-size: 12px; line-height: 1.4; text-align: left; cursor: pointer;
      `;

      item.addEventListener("mouseenter", () => { item.style.background = "var(--color-neutral-muted, rgba(175, 184, 193, 0.2))"; });
      item.addEventListener("mouseleave", () => { item.style.background = "transparent"; });

      item.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();

        const defaultLabel = "Export";
        summary.textContent = "Copying...";
        summary.style.pointerEvents = "none";

        try {
          let text = buildCopyText(commentEl, botConfig);
          if (includeInstruction) {
            const instruction = await getInstruction();
            if (instruction) text = instruction + "\n\n" + text;
          }
          await navigator.clipboard.writeText(text);
          summary.textContent = "Copied";
        } catch (err) {
          console.error("Clipboard write failed:", err);
          summary.textContent = "Failed";
        }

        details.removeAttribute("open");
        setTimeout(() => {
          summary.textContent = defaultLabel;
          summary.insertAdjacentHTML(
            "beforeend",
            '<svg aria-hidden="true" viewBox="0 0 16 16" width="12" height="12" style="fill: currentColor;"><path d="M4.427 6.427a.75.75 0 0 1 1.06 0L8 8.94l2.513-2.513a.75.75 0 1 1 1.06 1.06L8.53 10.53a.75.75 0 0 1-1.06 0L4.427 7.487a.75.75 0 0 1 0-1.06Z"></path></svg>'
          );
          summary.style.cssText = summaryBaseStyle;
          summary.style.pointerEvents = "";
        }, 1200);
      });

      return item;
    };

    menu.appendChild(createMenuItem(botConfig ? botConfig.buttonLabel : "Export Review", false));
    menu.appendChild(createMenuItem("Export Instruction & Review", true));

    details.appendChild(summary);
    details.appendChild(menu);

    return details;
  }

  function isThreadResolved(threadContainer) {
    if (threadContainer.hasAttribute("data-resolved") &&
      threadContainer.getAttribute("data-resolved") === "true") {
      return true;
    }
    if (threadContainer.classList.contains("resolved")) {
      return true;
    }
    const resolvedBadge = threadContainer.querySelector(".timeline-comment-label");
    if (resolvedBadge && resolvedBadge.textContent.toLowerCase().includes("resolved")) {
      return true;
    }
    return false;
  }

  function getAllUnresolvedReviews() {
    const reviews = [];
    const threadContainers = document.querySelectorAll(
      "details.js-comment-container, " +
      ".review-thread-component, " +
      ".js-resolvable-timeline-thread-container, " +
      ".js-timeline-item[id*='pullrequestreview'], " +
      ".TimelineItem:has(.comment-body)"
    );

    threadContainers.forEach((container) => {
      if (isThreadResolved(container)) return;

      if (
        container.classList.contains("TimelineItem") &&
        container.querySelector("details.js-comment-container, .review-thread-component")
      ) {
        return;
      }

      if (
        container.classList.contains("TimelineItem") &&
        !container.closest('[id*="pullrequestreview"]') &&
        !container.querySelector(".js-resolvable-timeline-thread-form") &&
        !container.querySelector('.timeline-comment-header a[href*="/apps/"]')
      ) {
        return;
      }

      const firstComment = container.querySelector(
        '[data-testid="automated-review-comment"], [class*="AutomatedReviewThreadComment-module__automatedComment__"]'
      ) || container.querySelector(
        ".timeline-comment.js-comment, " +
        ".review-comment.js-comment, " +
        ".js-comment[data-gid], " +
        ".timeline-comment-group, " +
        ".js-timeline-comment, " +
        ".js-comments-holder, " +
        ".comment-body"
      );

      if (firstComment) {
        const botConfig = detectAIBot(firstComment);
        const text = buildCopyText(firstComment, botConfig);
        if (text.trim()) {
          if (text.includes("Review skipped")) return;
          reviews.push(text);
        }
      }
    });

    return reviews;
  }

  function mountExportControlInHeader(threadContainer, firstComment, exportControl) {
    const automatedRoot =
      firstComment?.matches?.(
        '[data-testid="automated-review-comment"], [class*="AutomatedReviewThreadComment-module__automatedComment__"]'
      )
        ? firstComment
        : threadContainer.querySelector(
          '[data-testid="automated-review-comment"], [class*="AutomatedReviewThreadComment-module__automatedComment__"]'
        );

    const automatedActions = automatedRoot?.querySelector('[class*="ActionsContainer"]');
    if (automatedActions) {
      exportControl.style.margin = "0 12px 0 0";
      exportControl.style.flex = "0 0 auto";
      automatedActions.insertBefore(exportControl, automatedActions.firstChild);
      return true;
    }

    const oldActionGroup = firstComment.querySelector(".timeline-comment-actions");
    if (oldActionGroup && oldActionGroup.parentElement) {
      exportControl.style.marginRight = "10px";
      oldActionGroup.insertAdjacentElement("afterend", exportControl);
      return true;
    }

    const newActionGroup = threadContainer.querySelector(
      '[data-testid="comment-header"] [class*="ActionsButtonsContainer"]'
    );
    if (newActionGroup) {
      exportControl.style.marginRight = "10px";
      newActionGroup.insertBefore(exportControl, newActionGroup.firstChild);
      return true;
    }

    return false;
  }

  function mountExportControlInResolveRow(resolveForm, exportControl) {
    if (!resolveForm || !resolveForm.parentElement) return false;

    const originalParent = resolveForm.parentElement;

    const row = document.createElement("div");
    row.className = "pr-review-export-row";
    row.style.cssText = `
      display: flex; align-items: center; justify-content: space-between;
      gap: 12px; margin-top: 8px; width: 100%;
    `;

    const left = document.createElement("div");
    left.style.cssText = `display: flex; align-items: center; min-width: 0; flex: 1 1 auto;`;
    left.appendChild(exportControl);

    const right = document.createElement("div");
    right.style.cssText = `display: flex; align-items: center; justify-content: flex-end; flex: 0 0 auto;`;
    right.appendChild(resolveForm);

    row.appendChild(left);
    row.appendChild(right);
    originalParent.appendChild(row);
    return true;
  }

  function mountExportControlInSummary(threadContainer, exportControl) {
    const summaryEl = threadContainer.querySelector(
      ":scope > summary.js-toggle-outdated-comments, :scope > summary"
    );
    if (!summaryEl) return false;

    const flexRow = summaryEl.querySelector(".d-flex.flex-items-center");
    if (!flexRow) return true;

    exportControl.addEventListener("click", (e) => e.stopPropagation());

    const showHideBtn = flexRow.querySelector(".Details-content--closed, .Details-content--open");
    if (showHideBtn) {
      exportControl.style.marginRight = "8px";
      flexRow.insertBefore(exportControl, showHideBtn);
    } else {
      flexRow.appendChild(exportControl);
    }

    return true;
  }

  function injectButtonsIntoThread(threadContainer) {
    if (!threadContainer) return;
    if (threadContainer.querySelector(".pr-review-export-container")) return;

    if (
      threadContainer.classList.contains("TimelineItem") &&
      threadContainer.querySelector("details.js-comment-container, .review-thread-component")
    ) {
      return;
    }

    if (
      threadContainer.classList.contains("TimelineItem") &&
      !threadContainer.closest('[id*="pullrequestreview"]') &&
      !threadContainer.querySelector(".js-resolvable-timeline-thread-form") &&
      !threadContainer.querySelector('.timeline-comment-header a[href*="/apps/"]')
    ) {
      return;
    }

    let firstComment = threadContainer.querySelector(
      '[data-testid="automated-review-comment"], [class*="AutomatedReviewThreadComment-module__automatedComment__"]'
    );

    if (!firstComment) {
      firstComment = threadContainer.querySelector(
        ".timeline-comment.js-comment, " +
        ".review-comment.js-comment, " +
        ".js-comment[data-gid], " +
        ".timeline-comment-group, " +
        ".js-timeline-comment, " +
        ".js-comments-holder, " +
        ".comment-body"
      );
    }

    if (!firstComment) {
      console.log("[PR Copy] No specific comment element found, using thread container");
      firstComment = threadContainer;
    }

    const botConfig = detectAIBot(firstComment);

    const exportControlForSummary = createThreadExportControl(firstComment, botConfig, "header");
    if (mountExportControlInSummary(threadContainer, exportControlForSummary)) {
      return;
    }

    const resolveForm = threadContainer.querySelector(
      ".js-resolvable-timeline-thread-form, form[action*='/resolve']"
    );

    if (resolveForm) {
      const exportControl = createThreadExportControl(firstComment, botConfig, "header");

      if (mountExportControlInHeader(threadContainer, firstComment, exportControl)) return;
      if (mountExportControlInResolveRow(resolveForm, exportControl)) return;

      const headerEl = resolveForm.closest(".timeline-comment-header");
      if (headerEl) {
        const btnRow = document.createElement("div");
        btnRow.className = "pr-review-export-row";
        btnRow.style.cssText = `display: flex; align-items: center; justify-content: flex-end; padding: 6px 8px 0 8px;`;
        btnRow.appendChild(exportControl);
        headerEl.insertAdjacentElement("afterend", btnRow);
      } else {
        const btnContainer = createButtonContainer();
        btnContainer.style.marginTop = "8px";
        btnContainer.appendChild(createThreadExportControl(firstComment, botConfig, "panel"));
        resolveForm.insertAdjacentElement("afterend", btnContainer);
      }
      return;
    }

    const threadFooter = threadContainer.querySelector(
      ".review-thread-reply, .inline-comment-form-container"
    );

    if (threadFooter) {
      const btnContainer = createButtonContainer();
      btnContainer.style.padding = "8px 0 0 0";

      const exportControl = createThreadExportControl(firstComment, botConfig, "header");
      if (mountExportControlInHeader(threadContainer, firstComment, exportControl)) return;

      btnContainer.appendChild(createThreadExportControl(firstComment, botConfig, "panel"));
      threadFooter.insertAdjacentElement("beforebegin", btnContainer);
      return;
    }

    console.log("[PR Copy] Using final fallback for button injection");

    const exportControl = createThreadExportControl(firstComment, botConfig, "header");
    if (mountExportControlInHeader(threadContainer, firstComment, exportControl)) return;

    const commentHeader = firstComment.querySelector(".timeline-comment-header");
    if (commentHeader) {
      const btnRow = document.createElement("div");
      btnRow.className = "pr-review-export-row";
      btnRow.style.cssText = `display: flex; align-items: center; justify-content: flex-end; padding: 6px 12px 0 12px;`;
      btnRow.appendChild(createThreadExportControl(firstComment, botConfig, "panel"));
      commentHeader.insertAdjacentElement("afterend", btnRow);
      return;
    }

    const btnContainer = createButtonContainer();
    btnContainer.style.padding = "8px 0 0 0";
    btnContainer.appendChild(createThreadExportControl(firstComment, botConfig, "panel"));

    const commentBody = firstComment.querySelector(".comment-body, .js-comment-body");
    if (commentBody) {
      commentBody.insertAdjacentElement("afterend", btnContainer);
    } else {
      firstComment.appendChild(btnContainer);
    }
  }

  function cleanupButtons() {
    const sidebarContainer = document.getElementById("pr-exporter-sidebar-container");
    if (sidebarContainer) sidebarContainer.remove();

    const buttonContainers = document.querySelectorAll(".pr-review-export-container, .pr-review-export-row");
    buttonContainers.forEach((container) => container.remove());

    const exportBtns = document.querySelectorAll(".pr-review-export-trigger, .pr-review-export-menu-item");
    exportBtns.forEach((btn) => btn.remove());

    const modal = document.getElementById("pr-instruction-modal");
    if (modal) modal.remove();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // §7  Sidebar UI
  // ═══════════════════════════════════════════════════════════════════════════

  function createMarkAllResolvedButton() {
    const btn = document.createElement("button");
    btn.id = "pr-mark-all-resolved-btn";
    btn.className = "btn btn-sm btn-block";
    btn.type = "button";
    btn.textContent = "Mark all Reviews as Resolved";
    btn.style.cssText = `
      width: 100%; margin-top: 8px; background: #1f6feb; border: 1px solid #1f6feb;
      color: #fff; padding: 8px 12px; border-radius: 6px; font-size: 12px;
      font-weight: 500; cursor: pointer;
    `;

    btn.addEventListener("mouseenter", () => { btn.style.background = "#388bfd"; });
    btn.addEventListener("mouseleave", () => { btn.style.background = "#1f6feb"; });

    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();

      const allForms = document.querySelectorAll(".js-resolvable-timeline-thread-form");
      let pendingCount = 0;
      allForms.forEach((form) => {
        const submitBtn = form.querySelector('button[type="submit"]');
        if (submitBtn) {
          const t = (submitBtn.textContent || "").trim().toLowerCase();
          if (!t.includes("unresolve")) pendingCount++;
        }
      });
      const confirmMsg = pendingCount > 0
        ? `Resolve all ${pendingCount} conversation${pendingCount > 1 ? "s" : ""}?`
        : "No unresolved conversations found. Proceed anyway?";
      if (!window.confirm(confirmMsg)) return;

      const resolveForms = document.querySelectorAll(".js-resolvable-timeline-thread-form");
      let clicked = 0;
      resolveForms.forEach((form) => {
        const submitBtn = form.querySelector('button[type="submit"]');
        if (submitBtn) {
          const btnText = (submitBtn.textContent || "").trim().toLowerCase();
          if (btnText.includes("unresolve")) return;
          submitBtn.click();
          clicked++;
        }
      });

      btn.textContent = clicked > 0 ? `✓ Resolved ${clicked} threads` : "Nothing to resolve";
      btn.disabled = true;
      setTimeout(() => {
        btn.textContent = "Mark all Reviews as Resolved";
        btn.disabled = false;
      }, 3000);
    });

    return btn;
  }

  function createSidebarExportButton() {
    const btn = document.createElement("button");
    btn.id = "pr-export-all-reviews-btn";
    btn.className = "btn btn-sm btn-block mt-3";
    btn.type = "button";
    btn.textContent = "Export Reviews with Instruction";
    btn.style.cssText = `
      width: 100%; margin-top: 12px; background: #238636; border: 1px solid #238636;
      color: #fff; padding: 8px 12px; border-radius: 6px; font-size: 12px;
      font-weight: 500; cursor: pointer;
    `;

    btn.addEventListener("mouseenter", () => { btn.style.background = "#2ea043"; });
    btn.addEventListener("mouseleave", () => { btn.style.background = "#238636"; });

    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();

      btn.textContent = "Exporting...";
      btn.disabled = true;

      try {
        const instruction = await getInstruction();
        const reviews = getAllUnresolvedReviews();

        if (reviews.length === 0) {
          btn.textContent = "No unresolved reviews";
          setTimeout(() => { btn.textContent = "Export Reviews with Instruction"; btn.disabled = false; }, 2000);
          return;
        }

        let text = "";
        if (instruction) text = instruction + "\n\n";
        text += reviews.join("\n");

        await navigator.clipboard.writeText(text);
        btn.textContent = `✓ Exported ${reviews.length} reviews!`;
        setTimeout(() => { btn.textContent = "Export Reviews with Instruction"; btn.disabled = false; }, 2000);
      } catch (err) {
        console.error("Export failed:", err);
        btn.textContent = "Failed";
        setTimeout(() => { btn.textContent = "Export Reviews with Instruction"; btn.disabled = false; }, 2000);
      }
    });

    return btn;
  }

  function showInstructionModal() {
    const existingModal = document.getElementById("pr-instruction-modal");
    if (existingModal) existingModal.remove();

    const colors = getThemeColors();

    const overlay = document.createElement("div");
    overlay.id = "pr-instruction-modal";
    overlay.style.cssText = `
      position: fixed; top: 0; left: 0; right: 0; bottom: 0;
      background: ${colors.overlay}; display: flex; align-items: center;
      justify-content: center; z-index: 99999;
    `;

    const modal = document.createElement("div");
    modal.style.cssText = `
      background: ${colors.modalBg}; border: 1px solid ${colors.modalBorder};
      border-radius: 12px; width: 500px; max-width: 90vw; max-height: 80vh;
      overflow: hidden; box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
    `;

    modal.innerHTML = `
      <div style="padding: 16px 20px; border-bottom: 1px solid ${colors.modalBorder}; display: flex; align-items: center; justify-content: space-between; background: ${colors.headerBg};">
        <h2 style="margin: 0; font-size: 16px; font-weight: 600; color: ${colors.textPrimary};">✏️ Edit Instruction</h2>
        <button id="pr-modal-close" style="background: none; border: none; color: ${colors.textSecondary}; font-size: 20px; cursor: pointer; padding: 4px 8px;">&times;</button>
      </div>
      <div style="padding: 20px; background: ${colors.modalBg};">
        <p style="margin: 0 0 12px 0; font-size: 13px; color: ${colors.textSecondary};">
          This instruction will be prepended to exported review content. You can use this to add context or prompts for AI tools.
        </p>
        <textarea id="pr-modal-instruction" style="
          width: 100%; min-height: 150px; padding: 12px; background: ${colors.inputBg};
          border: 1px solid ${colors.inputBorder}; border-radius: 6px; color: ${colors.inputText};
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
          font-size: 13px; line-height: 1.5; resize: vertical; box-sizing: border-box;
        " placeholder="Enter your custom instruction here..."></textarea>
        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 12px;">
          <span id="pr-modal-char-count" style="font-size: 11px; color: ${colors.textMuted};">0 characters</span>
          <div style="display: flex; gap: 8px;">
            <button id="pr-modal-default" style="padding: 8px 12px; font-size: 12px; font-weight: 500; border-radius: 6px; cursor: pointer; background: ${colors.btnSecondaryBg}; border: 1px solid ${colors.btnSecondaryBorder}; color: ${colors.btnSecondaryText};">Use Default</button>
            <button id="pr-modal-clear" style="padding: 8px 12px; font-size: 12px; font-weight: 500; border-radius: 6px; cursor: pointer; background: ${colors.btnSecondaryBg}; border: 1px solid ${colors.btnSecondaryBorder}; color: ${colors.btnSecondaryText};">Clear</button>
            <button id="pr-modal-save" style="padding: 8px 16px; font-size: 12px; font-weight: 500; border-radius: 6px; cursor: pointer; background: ${colors.btnPrimaryBg}; border: 1px solid ${colors.btnPrimaryBorder}; color: ${colors.btnPrimaryText};">Save</button>
          </div>
        </div>
        <div id="pr-modal-status" style="margin-top: 12px; padding: 8px 12px; border-radius: 6px; font-size: 12px; display: none;"></div>
      </div>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    const textarea = document.getElementById("pr-modal-instruction");
    const charCount = document.getElementById("pr-modal-char-count");
    const closeBtn = document.getElementById("pr-modal-close");
    const defaultBtn = document.getElementById("pr-modal-default");
    const clearBtn = document.getElementById("pr-modal-clear");
    const saveBtn = document.getElementById("pr-modal-save");
    const statusDiv = document.getElementById("pr-modal-status");

    getInstruction().then((instruction) => {
      textarea.value = instruction;
      charCount.textContent = `${instruction.length} characters`;
    });

    textarea.addEventListener("input", () => {
      charCount.textContent = `${textarea.value.length} characters`;
    });

    const closeModal = () => overlay.remove();
    closeBtn.addEventListener("click", closeModal);
    overlay.addEventListener("click", (e) => { if (e.target === overlay) closeModal(); });

    const showStatus = (message, isSuccess) => {
      statusDiv.textContent = message;
      statusDiv.style.display = "block";
      statusDiv.style.background = isSuccess ? colors.successBg : colors.errorBg;
      statusDiv.style.border = isSuccess ? `1px solid ${colors.successBorder}` : `1px solid ${colors.errorBorder}`;
      statusDiv.style.color = isSuccess ? colors.successText : colors.errorText;
      setTimeout(() => { statusDiv.style.display = "none"; }, 3000);
    };

    defaultBtn.addEventListener("click", () => {
      textarea.value = DEFAULT_INSTRUCTION;
      charCount.textContent = `${textarea.value.length} characters`;
      showStatus("Default instruction loaded. Click Save to apply.", true);
    });

    clearBtn.addEventListener("click", async () => {
      textarea.value = "";
      charCount.textContent = "0 characters";
      try {
        await chrome.storage.sync.remove(["customInstruction"]);
        showStatus("Instruction cleared.", true);
      } catch (err) {
        showStatus("Failed to clear.", false);
      }
    });

    saveBtn.addEventListener("click", async () => {
      try {
        await chrome.storage.sync.set({ customInstruction: textarea.value });
        showStatus("Instruction saved successfully!", true);
      } catch (err) {
        showStatus("Failed to save.", false);
      }
    });

    textarea.focus();
  }

  function createEditInstructionButton() {
    const colors = getThemeColors();

    const btn = document.createElement("button");
    btn.id = "pr-edit-instruction-btn";
    btn.className = "btn btn-sm btn-block";
    btn.type = "button";
    btn.textContent = "✏️ Edit Instruction";
    btn.style.cssText = `
      width: 100%; margin-top: 12px; background: ${colors.btnSecondaryBg};
      border: 1px solid ${colors.btnSecondaryBorder}; color: ${colors.btnSecondaryText};
      padding: 8px 12px; border-radius: 6px; font-size: 12px; font-weight: 500; cursor: pointer;
    `;

    btn.addEventListener("mouseenter", () => { btn.style.background = colors.btnSecondaryHoverBg; btn.style.borderColor = colors.textSecondary; });
    btn.addEventListener("mouseleave", () => { btn.style.background = colors.btnSecondaryBg; btn.style.borderColor = colors.btnSecondaryBorder; });

    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      showInstructionModal();
    });

    return btn;
  }

  function injectSidebarButton() {
    if (document.getElementById("pr-export-all-reviews-btn")) return;

    let sidebar = document.querySelector(
      "#partial-discussion-sidebar, " +
      "#pr-conversation-sidebar, " +
      ".Layout-sidebar, " +
      ".discussion-sidebar, " +
      "[data-target='pull-request-merge-box-loader.sidebarContainer']"
    );

    if (!sidebar) {
      const sidebarItem = document.querySelector(".discussion-sidebar-item");
      if (sidebarItem) {
        sidebar = sidebarItem.parentElement;
        console.log("[PR Copy] Found sidebar via discussion-sidebar-item parent");
      }
    }

    if (!sidebar) {
      console.log("[PR Copy] No sidebar found");
      return;
    }

    const container = document.createElement("div");
    container.id = "pr-exporter-sidebar-container";
    container.style.cssText = "margin-top: 16px; padding: 0 16px;";

    const editBtn = createEditInstructionButton();
    editBtn.style.marginTop = "0";
    container.appendChild(editBtn);

    const exportBtn = createSidebarExportButton();
    exportBtn.style.marginTop = "8px";
    container.appendChild(exportBtn);

    const markAllBtn = createMarkAllResolvedButton();
    container.appendChild(markAllBtn);

    const sections = sidebar.querySelectorAll(".discussion-sidebar-item");
    const lastSection = sections[sections.length - 1];

    if (lastSection) {
      lastSection.insertAdjacentElement("afterend", container);
    } else {
      sidebar.appendChild(container);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // §8  Entry Point
  // ═══════════════════════════════════════════════════════════════════════════

  function expandHiddenConversations() {
    const forms = document.querySelectorAll(
      "form.js-review-hidden-comment-ids:not([data-pr-copy-expanded])"
    );
    forms.forEach((form) => {
      const btn = form.querySelector('button[type="submit"]');
      if (btn) {
        form.setAttribute("data-pr-copy-expanded", "true");
        btn.click();
      }
    });
  }

  function processAllThreads() {
    if (!isPullRequestPage()) {
      cleanupButtons();
      return;
    }

    expandHiddenConversations();

    const threadContainers = document.querySelectorAll(
      "details.js-comment-container, " +
      ".review-thread-component, " +
      ".js-resolvable-timeline-thread-container, " +
      ".js-timeline-item[id*='pullrequestreview'], " +
      ".TimelineItem:has(.comment-body)"
    );

    threadContainers.forEach((container) => {
      injectButtonsIntoThread(container);
    });

    const inlineContainers = document.querySelectorAll(".js-inline-comments-container");
    inlineContainers.forEach((container) => {
      const parentThread = container.closest(
        "details.js-comment-container, .review-thread-component"
      );
      if (parentThread && !parentThread.querySelector(".pr-review-export-container")) {
        injectButtonsIntoThread(parentThread);
      }
    });

    injectSidebarButton();
  }

  function debounce(fn, delay) {
    let timeoutId;
    return function (...args) {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => fn.apply(this, args), delay);
    };
  }

  function observe() {
    if (document.documentElement.hasAttribute(EXT_MARK)) {
      cleanupButtons();
      document.documentElement.removeAttribute(EXT_MARK);
    }
    document.documentElement.setAttribute(EXT_MARK, "true");

    processAllThreads();

    const debouncedProcess = debounce(processAllThreads, 100);

    const mo = new MutationObserver(debouncedProcess);
    mo.observe(document.body, { childList: true, subtree: true });

    window.addEventListener("pjax:end", () => setTimeout(processAllThreads, 100));
    document.addEventListener("turbo:render", () => setTimeout(processAllThreads, 100));
  }

  observe();
})();
