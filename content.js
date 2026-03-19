/**
 * GitHub PR Review Copy Button
 * Requirements:
 * 1) Button should be placed in each comment bubble's header
 * 2) Copied text should end with "\n\n---\n"
 * 3) Copy raw comment body (the text in edit textarea)
 * 4) Only copy content from the specific comment bubble clicked
 */

(function () {
  const EXT_MARK = "data-pr-review-copy-installed";

  // Known AI bots configuration
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
  };

  function isPullRequestPage() {
    return location.pathname.includes("/pull/");
  }

  /**
   * Detect which AI bot authored the comment (if any)
   */
  function detectAIBot(commentEl) {
    // Look for author link in the comment header (old GitHub layout)
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

    // New Copilot AutomatedReviewThreadComment structure (React-based)
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

    // Also check for links to known bot app pages
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

  /**
   * Clean up Codex-specific content patterns
   */
  function cleanCodexContent(text) {
    let cleaned = text;

    // Remove footer: "Useful? React with 👍 / 👎."
    cleaned = cleaned.replace(/\n*Useful\?\s*React with\s*👍\s*\/\s*👎\.?\s*$/i, "");

    // Remove <sub> wrapped content from first line (badge images)
    // Pattern: **<sub><sub>![Badge](url)</sub></sub>  Title**
    // We want to extract just the title
    cleaned = cleaned.replace(
      /^\*\*<sub><sub>.*?<\/sub><\/sub>\s*/i,
      ""
    );

    // Also handle if it appears in rendered text form (without HTML tags)
    // Remove lines that are just badge-related
    cleaned = cleaned.replace(/^\s*P\d+\s*\n/i, "");

    // Remove trailing ** if the line was bold wrapped
    cleaned = cleaned.replace(/\*\*\s*$/m, "");

    return cleaned.trim();
  }

  /**
   * Clean up Sentry-specific content patterns
   * Extracts:
   * 1. Bug title: "Bug: [description]" + "Severity: [level] | Confidence: [confidence]"
   * 2. From "Prompt for AI Agent": Location and Potential issue (skipping instruction paragraph)
   */
  function cleanSentryContent(text) {
    let result = [];

    // Extract Bug title
    // Pattern: **Bug:** [description]
    const bugTitleMatch = text.match(/\*\*Bug:\*\*\s*(.+?)(?=\n|<sub>|$)/s);
    if (bugTitleMatch) {
      result.push("Bug: " + bugTitleMatch[1].trim());
    }

    // Severity is already surfaced as "Priority:" in the copy header via detectPriority(),
    // so we intentionally skip it here to avoid duplication.

    // Extract Location from "Prompt for AI Agent" section
    // Pattern: Location: [file path]#L[lines]
    const locationMatch = text.match(/Location:\s*(.+?)(?=\n|Potential issue:|$)/s);
    if (locationMatch) {
      result.push("");
      result.push("Location: " + locationMatch[1].trim());
    }

    // Extract Potential issue from "Prompt for AI Agent" section
    // Pattern: Potential issue: [description] (until end of code block or details section)
    const potentialIssueMatch = text.match(/Potential issue:\s*(.+?)(?=```|<\/details>|Did we get this right|$)/s);
    if (potentialIssueMatch) {
      result.push("");
      result.push("Potential issue: " + potentialIssueMatch[1].trim());
    }

    // If we extracted something, return it; otherwise return original
    if (result.length > 0) {
      return result.join("\n");
    }

    return text.trim();
  }

  /**
   * Clean up CodeRabbit-specific content patterns.
   * Extracts the meaningful review content from CodeRabbit's inline comments:
   * - Removes the category/severity first line (surfaced via detectPriority)
   * - Removes collapsed section labels (建议修改, Committable suggestion, Prompt for AI Agents, Analysis chain)
   * - Keeps the title, description, and "Also applies to" references
   */
  function cleanCodeRabbitContent(text) {
    let cleaned = text;

    // Remove severity/category header line (e.g. "⚠️ Potential issue | 🟡 Minor")
    cleaned = cleaned.replace(/^[^\n]*(?:Potential issue|Verification successful|Nitpick|Praise)[^\n]*\n?/m, "");

    // Remove Analysis chain label line (when section is closed)
    cleaned = cleaned.replace(/^\s*🧩\s*Analysis chain\s*\n?/m, "");
    // Remove Analysis chain bash script blocks (when section was expanded):
    // Each block runs from "🏁 Script executed:" to "Length of output: N"
    cleaned = cleaned.replace(/🏁\s*Script executed:[\s\S]*?Length of output:\s*\d+\s*\n?/g, "");
    // Remove "Repository: owner/repo" lines that accompany script block output
    cleaned = cleaned.replace(/^Repository:\s*\S+\s*\n?/gm, "");

    // Remove 建议修改 label only — preserve any diff content that follows
    cleaned = cleaned.replace(/^\s*🛠️?\s*建议修改\s*\n?/m, "");
    cleaned = cleaned.replace(/^\s*建议修改\s*\n?/m, "");

    // Cut from "📝 Committable suggestion" to end of text
    // (verbose duplicate of the suggestion diff, not needed)
    cleaned = cleaned.replace(/\n?\s*📝\s*Committable suggestion[\s\S]*/g, "");

    // Cut from "🤖 Prompt for AI Agents" to end of text (label + its content)
    // Must cut label+content together so the content doesn't leak when label is matched first
    cleaned = cleaned.replace(/\n?\s*🤖\s*Prompt for AI Agents[\s\S]*/g, "");

    // Remove CodeRabbit boilerplate footer
    cleaned = cleaned.replace(/\n*Thanks for using CodeRabbit[\s\S]*/i, "");
    cleaned = cleaned.replace(/\n*❤️\s*Share[\s\S]*/i, "");
    cleaned = cleaned.replace(/\n*Comment\s+@coderabbitai\s+help[\s\S]*/i, "");

    // Remove review-level summary labels (from the "left a comment" overview block)
    cleaned = cleaned.replace(/^\s*Actionable comments posted:\s*\d+\s*\n?/m, "");
    cleaned = cleaned.replace(/^\s*🧹\s*Nitpick(?:\s+comments)?\s*(?:\(\d+\))?\s*\n?/m, "");
    cleaned = cleaned.replace(/^\s*🤖\s*Prompt for all review comments with AI agents\s*\n?/m, "");
    cleaned = cleaned.replace(/^\s*ℹ️\s*Review info\s*\n?/m, "");

    // Convert whitespace-only lines to empty lines
    // (GitHub's collapsed accordion sections contribute spaces-only lines to innerText)
    cleaned = cleaned.split('\n').map(line => (/^\s+$/.test(line) ? '' : line)).join('\n');

    // Collapse 3+ consecutive blank lines to at most 2
    cleaned = cleaned.replace(/\n{3,}/g, "\n\n");

    return cleaned.trim();
  }

  /**
   * Find the outer thread container that contains file path, line info, AND comments
   * This is the <details> element with class "js-comment-container"
   */
  function findThreadContainer(el) {
    // First find the inner inline comments container
    const inlineContainer = el.closest(".js-inline-comments-container");

    // Then find the OUTER container that wraps everything
    // This is typically a <details> element with class js-comment-container
    const outerContainer =
      el.closest("details.js-comment-container") ||
      el.closest(".js-comment-container") ||
      el.closest(".review-thread-component") ||
      el.closest("details.review-thread") ||
      (inlineContainer ? inlineContainer.closest("details, .js-comment-container") : null);

    console.log("[PR Copy] Outer container:", outerContainer);
    return outerContainer || inlineContainer;
  }

  /**
   * Find the file container that houses this comment
   */
  function findFileContainer(el) {
    return (
      el.closest(".file") ||
      el.closest(".js-file") ||
      el.closest("[data-tagsearch-path]") ||
      el.closest(".js-diff-progressive-container")
    );
  }

  /**
   * Find file path from the thread container's summary or file header
   */
  function findFilePath(el) {
    const threadContainer = findThreadContainer(el);
    console.log("[PR Copy] Looking for file path in:", threadContainer);

    if (threadContainer) {
      // Look in the <summary> element for the file path link
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

      // Also try finding any link that looks like a file path
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

    // Fallback: look in file container
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

  /**
   * Find "Comment on lines +X to +Y" text from thread container
   */
  function findLineInfoText(el) {
    const threadContainer = findThreadContainer(el);
    console.log("[PR Copy] Looking for line info in:", threadContainer);

    if (!threadContainer) {
      console.log("[PR Copy] No thread container found");
      return "";
    }

    // Get all text content from thread container, clean it up
    const fullText = (threadContainer.textContent || "").replace(/\s+/g, " ");

    // Try to match the "Comment on lines" pattern
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

    // Also try looking specifically in the header area (before the comments)
    // The line info is typically in a div with class f6 before the comments
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

  /**
   * Extract suggestion content from the hidden form inputs
   * GitHub stores the suggestion lines in hidden inputs with name="value[]"
   */
  function extractSuggestionContent(commentEl) {
    // Look for the suggestion form
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

  /**
   * Get the raw markdown content for a comment.
   * Priority:
   * 1. Hidden textarea in edit form (best source - contains raw markdown)
   * 2. task-lists textarea (GitHub's JS component)
   * 3. Rendered comment body + extracted suggestion blocks
   */
  function getRawCommentBody(commentEl) {
    // Method 1: Look for hidden edit form textarea
    // This is the most reliable source for raw markdown (includes suggestion syntax)
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

    // Method 2: Look for task-lists with textarea (GitHub uses this for some comments)
    const taskLists = commentEl.querySelector("task-lists");
    if (taskLists) {
      const textarea = taskLists.querySelector("textarea");
      if (textarea && textarea.value && textarea.value.trim()) {
        console.log("[PR Copy] Found raw markdown in task-lists");
        return textarea.value.trim();
      }
    }

    // Method 3: Build content from rendered body + suggestion blocks
    // Also support new Copilot AutomatedReviewThreadComment layout
    const bodyEl =
      commentEl.querySelector(".comment-body.markdown-body") ||
      commentEl.querySelector(".comment-body") ||
      commentEl.querySelector(".js-comment-body") ||
      commentEl.querySelector('[class*="automatedComment__body"] .markdown-body') ||
      commentEl.querySelector('[class*="automatedComment__content"] .markdown-body') ||
      commentEl.querySelector('.markdown-body');

    if (bodyEl) {
      // Clone the element to manipulate without affecting the page
      const clone = bodyEl.cloneNode(true);

      // Remove the suggestion UI elements (we'll add them back in markdown format)
      const suggestionBlocks = clone.querySelectorAll(
        ".js-suggested-changes-blob, " +
        ".suggested-change-form-container, " +
        ".js-apply-changes, " +
        "button, " +
        ".flash"
      );
      suggestionBlocks.forEach((el) => el.remove());

      // Get the main text content (the comment without suggestion UI)
      let mainText = clone.innerText.trim();

      // Remove any "Suggested change" header text that got left behind
      mainText = mainText.replace(/^\s*Suggested change\s*/i, "").trim();

      // Extract suggestion content from hidden form inputs
      const suggestionContent = extractSuggestionContent(commentEl);

      // If there's a suggestion, format it as markdown
      if (suggestionContent) {
        console.log("[PR Copy] Found suggestion content");
        return mainText + "\n```suggestion\n" + suggestionContent + "\n```";
      }

      console.log("[PR Copy] Using rendered body text only");
      return mainText;
    }

    return "";
  }

  /**
   * Detect priority/severity level from comment
   * - Copilot (new layout): reads from BadgesGroupContainer label (High, Medium, Low, Critical)
   * - Codex: reads from P0/P1/P2 badge image alt text
   */
  function detectPriority(commentEl, botConfig) {
    // Copilot new automated review layout: priority badge in header
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

    // Codex: P0/P1/P2/P3 badge image with alt text like "P1 Badge"
    const badgeImgs = commentEl.querySelectorAll('img[alt*="Badge"]');
    for (const img of badgeImgs) {
      const alt = img.alt || "";
      const match = alt.match(/P(\d+)\s*Badge/i);
      if (match) {
        console.log("[PR Copy] Detected Codex priority: P" + match[1]);
        return "P" + match[1];
      }
    }

    // Codex fallback: check raw markdown for badge URL pattern
    // e.g. ![P1](https://img.shields.io/badge/P1-orange?style=flat)
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

    // Sentry: severity from rendered comment body text (e.g. "Severity: HIGH")
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

    // CodeRabbit: severity from the first line of the comment body
    // Pattern: "⚠️ Potential issue | 🟡 Minor" or "⚠️ Potential issue | 🟠 Major"
    if (botConfig && botConfig.name === "CodeRabbit") {
      const bodyEl = commentEl.querySelector(".comment-body, .js-comment-body");
      if (bodyEl) {
        const bodyText = (bodyEl.textContent || "").trim();
        // Match severity emoji + label: 🔴 Critical, 🟠 Major, 🟡 Minor, 🟢 Low
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

  /**
   * Get comment body with bot-specific cleanup
   */
  function getCleanedCommentBody(commentEl, botConfig) {
    let body = getRawCommentBody(commentEl);

    // Apply bot-specific cleanup
    if (botConfig && botConfig.name === "Codex") {
      body = cleanCodexContent(body);
    } else if (botConfig && botConfig.name === "Sentry") {
      body = cleanSentryContent(body);
    } else if (botConfig && botConfig.name === "CodeRabbit") {
      body = cleanCodeRabbitContent(body);
    }

    return body;
  }

  /**
   * Build the final copy text
   */
  function buildCopyText(commentEl, botConfig) {
    const filePath = findFilePath(commentEl);
    const lineInfo = findLineInfoText(commentEl);
    const priority = detectPriority(commentEl, botConfig);
    const rawBody = getCleanedCommentBody(commentEl, botConfig);

    const parts = [];

    if (filePath) parts.push(filePath);
    if (lineInfo) parts.push(lineInfo);
    if (priority) parts.push("Priority: " + priority);
    if (filePath || lineInfo || priority) parts.push(""); // blank line after header

    if (rawBody) parts.push(rawBody);

    // requirement: add newline then --- as markdown separator
    parts.push("");
    parts.push("---");

    return parts.join("\n");
  }

  /**
   * Get saved instruction from Chrome storage
   */
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

  /**
   * Get GitHub Primer-compatible button styles
   */
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

  /**
   * Ensure shared styles for the thread export dropdown are present.
   */
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

  /**
   * Copy a single review thread to clipboard.
   */
  async function exportReviewToClipboard(commentEl, botConfig, includeInstruction = false) {
    let text = buildCopyText(commentEl, botConfig);

    if (includeInstruction) {
      const instruction = await getInstruction();
      if (instruction) {
        text = instruction + "\n\n" + text;
      }
    }

    await navigator.clipboard.writeText(text);
  }

  /**
   * Create a compact export dropdown for a single thread.
   */
  function createThreadExportControl(commentEl, botConfig, variant = "header") {
    ensureThreadExportStyles();

    const styles = getButtonStyles();
    const details = document.createElement("details");
    details.className = "pr-review-export-container";

    const summary = document.createElement("summary");
    summary.className = `pr-review-export-trigger pr-review-export-trigger--${variant}`;
    summary.textContent = "Export";

    const summaryBaseStyle = variant === "header"
      ? `
        display: inline-flex;
        align-items: center;
        gap: 4px;
      `
      : styles.base + styles.secondary + `
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding-right: 10px;
        white-space: nowrap;
      `;

    const summaryHoverStyle = variant === "header"
      ? `
        display: inline-flex;
        align-items: center;
        gap: 4px;
      `
      : styles.base + styles.secondaryHover + `
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding-right: 10px;
        white-space: nowrap;
      `;

    summary.style.cssText = summaryBaseStyle;
    summary.insertAdjacentHTML(
      "beforeend",
      '<svg aria-hidden="true" viewBox="0 0 16 16" width="12" height="12" style="fill: currentColor;"><path d="M4.427 6.427a.75.75 0 0 1 1.06 0L8 8.94l2.513-2.513a.75.75 0 1 1 1.06 1.06L8.53 10.53a.75.75 0 0 1-1.06 0L4.427 7.487a.75.75 0 0 1 0-1.06Z"></path></svg>'
    );

    summary.addEventListener("mouseenter", () => {
      summary.style.cssText = summaryHoverStyle;
    });
    summary.addEventListener("mouseleave", () => {
      summary.style.cssText = summaryBaseStyle;
    });

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
        display: block;
        width: 100%;
        padding: 7px 10px;
        margin: 0;
        border: 0;
        border-radius: 6px;
        background: transparent;
        color: inherit;
        font: inherit;
        font-size: 12px;
        line-height: 1.4;
        text-align: left;
        cursor: pointer;
      `;

      item.addEventListener("mouseenter", () => {
        item.style.background = "var(--color-neutral-muted, rgba(175, 184, 193, 0.2))";
      });
      item.addEventListener("mouseleave", () => {
        item.style.background = "transparent";
      });

      item.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();

        const defaultLabel = "Export";
        summary.textContent = "Copying...";
        summary.style.pointerEvents = "none";

        try {
          await exportReviewToClipboard(commentEl, botConfig, includeInstruction);
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

  /**
   * Check if a thread is resolved
   */
  function isThreadResolved(threadContainer) {
    // Check for resolved attribute or visual indicators
    if (threadContainer.hasAttribute("data-resolved") &&
      threadContainer.getAttribute("data-resolved") === "true") {
      return true;
    }
    // Check for resolved class or hidden state
    if (threadContainer.classList.contains("resolved")) {
      return true;
    }
    // Check for resolved badge text
    const resolvedBadge = threadContainer.querySelector(".timeline-comment-label");
    if (resolvedBadge && resolvedBadge.textContent.toLowerCase().includes("resolved")) {
      return true;
    }
    return false;
  }

  /**
   * Get all unresolved thread data
   */
  function getAllUnresolvedReviews() {
    const reviews = [];
    const threadContainers = document.querySelectorAll(
      "details.js-comment-container, " +
      ".review-thread-component, " +
      ".js-resolvable-timeline-thread-container"
    );

    threadContainers.forEach((container) => {
      // Skip resolved threads
      if (isThreadResolved(container)) return;

      const firstComment = container.querySelector(
        ".timeline-comment.js-comment, " +
        ".review-comment.js-comment, " +
        ".js-comment[data-gid], " +
        ".js-comments-holder, " +
        ".comment-body, " +
        '[class*="AutomatedReviewThreadComment"]'
      );

      if (firstComment) {
        const botConfig = detectAIBot(firstComment);
        const text = buildCopyText(firstComment, botConfig);
        if (text.trim()) {
          reviews.push(text);
        }
      }
    });

    return reviews;
  }

  /**
   * Create the sidebar export all button
   */
  function createMarkAllResolvedButton() {
    const btn = document.createElement("button");
    btn.id = "pr-mark-all-resolved-btn";
    btn.className = "btn btn-sm btn-block";
    btn.type = "button";
    btn.textContent = "Mark all Reviews as Resolved";
    btn.style.cssText = `
      width: 100%;
      margin-top: 8px;
      background: #1f6feb;
      border: 1px solid #1f6feb;
      color: #fff;
      padding: 8px 12px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
    `;

    btn.addEventListener("mouseenter", () => {
      btn.style.background = "#388bfd";
    });
    btn.addEventListener("mouseleave", () => {
      btn.style.background = "#1f6feb";
    });

    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();

      // Count only "Resolve conversation" buttons (not "Unresolve conversation")
      const allForms = document.querySelectorAll(".js-resolvable-timeline-thread-form");
      let pendingCount = 0;
      allForms.forEach((form) => {
        const btn = form.querySelector('button[type="submit"]');
        if (btn) {
          const t = (btn.textContent || "").trim().toLowerCase();
          if (!t.includes("unresolve")) pendingCount++;
        }
      });
      const confirmMsg = pendingCount > 0
        ? `Resolve all ${pendingCount} conversation${pendingCount > 1 ? "s" : ""}?`
        : "No unresolved conversations found. Proceed anyway?";
      if (!window.confirm(confirmMsg)) return;

      const resolveForms = document.querySelectorAll(
        ".js-resolvable-timeline-thread-form"
      );
      let clicked = 0;
      resolveForms.forEach((form) => {
        const submitBtn = form.querySelector('button[type="submit"]');
        if (submitBtn) {
          // Only click "Resolve conversation", skip "Unresolve conversation"
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
      width: 100%;
      margin-top: 12px;
      background: #238636;
      border: 1px solid #238636;
      color: #fff;
      padding: 8px 12px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
    `;

    btn.addEventListener("mouseenter", () => {
      btn.style.background = "#2ea043";
    });
    btn.addEventListener("mouseleave", () => {
      btn.style.background = "#238636";
    });

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
          setTimeout(() => {
            btn.textContent = "Export Reviews with Instruction";
            btn.disabled = false;
          }, 2000);
          return;
        }

        let text = "";
        if (instruction) {
          text = instruction + "\n\n";
        }
        text += reviews.join("\n");

        await navigator.clipboard.writeText(text);
        btn.textContent = `✓ Exported ${reviews.length} reviews!`;
        setTimeout(() => {
          btn.textContent = "Export Reviews with Instruction";
          btn.disabled = false;
        }, 2000);
      } catch (err) {
        console.error("Export failed:", err);
        btn.textContent = "Failed";
        setTimeout(() => {
          btn.textContent = "Export Reviews with Instruction";
          btn.disabled = false;
        }, 2000);
      }
    });

    return btn;
  }

  // Default instruction template
  const DEFAULT_INSTRUCTION = `Please review the following code review comments. For each comment:
1. Assess if the concern is valid and applicable
2. If valid, analyze the suggested fix or solution
3. Decide whether to adopt, modify, or reject the suggestion
4. Provide your reasoning and any code changes if applicable
5. If you are unsure about the business logic or design intent, ask me clarifying questions before proceeding`;

  /**
   * Detect if GitHub is in dark mode
   */
  function isDarkMode() {
    const html = document.documentElement;
    const colorMode = html.getAttribute("data-color-mode");

    if (colorMode === "dark") return true;
    if (colorMode === "light") return false;

    // Check for auto mode with dark preference
    if (colorMode === "auto") {
      const darkTheme = html.getAttribute("data-dark-theme");
      if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) {
        return true;
      }
    }

    // Fallback: check computed background color
    const bgColor = getComputedStyle(document.body).backgroundColor;
    if (bgColor) {
      const rgb = bgColor.match(/\d+/g);
      if (rgb && rgb.length >= 3) {
        const brightness = (parseInt(rgb[0]) + parseInt(rgb[1]) + parseInt(rgb[2])) / 3;
        return brightness < 128;
      }
    }

    return true; // Default to dark
  }

  /**
   * Get theme colors based on current mode
   */
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

  /**
   * Create and show the instruction editing modal
   */
  function showInstructionModal() {
    // Remove existing modal if any
    const existingModal = document.getElementById("pr-instruction-modal");
    if (existingModal) existingModal.remove();

    // Get theme colors
    const colors = getThemeColors();

    // Create modal overlay
    const overlay = document.createElement("div");
    overlay.id = "pr-instruction-modal";
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: ${colors.overlay};
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 99999;
    `;

    // Create modal content
    const modal = document.createElement("div");
    modal.style.cssText = `
      background: ${colors.modalBg};
      border: 1px solid ${colors.modalBorder};
      border-radius: 12px;
      width: 500px;
      max-width: 90vw;
      max-height: 80vh;
      overflow: hidden;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
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
          width: 100%;
          min-height: 150px;
          padding: 12px;
          background: ${colors.inputBg};
          border: 1px solid ${colors.inputBorder};
          border-radius: 6px;
          color: ${colors.inputText};
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
          font-size: 13px;
          line-height: 1.5;
          resize: vertical;
          box-sizing: border-box;
        " placeholder="Enter your custom instruction here..."></textarea>
        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 12px;">
          <span id="pr-modal-char-count" style="font-size: 11px; color: ${colors.textMuted};">0 characters</span>
          <div style="display: flex; gap: 8px;">
            <button id="pr-modal-default" style="
              padding: 8px 12px;
              font-size: 12px;
              font-weight: 500;
              border-radius: 6px;
              cursor: pointer;
              background: ${colors.btnSecondaryBg};
              border: 1px solid ${colors.btnSecondaryBorder};
              color: ${colors.btnSecondaryText};
            ">Use Default</button>
            <button id="pr-modal-clear" style="
              padding: 8px 12px;
              font-size: 12px;
              font-weight: 500;
              border-radius: 6px;
              cursor: pointer;
              background: ${colors.btnSecondaryBg};
              border: 1px solid ${colors.btnSecondaryBorder};
              color: ${colors.btnSecondaryText};
            ">Clear</button>
            <button id="pr-modal-save" style="
              padding: 8px 16px;
              font-size: 12px;
              font-weight: 500;
              border-radius: 6px;
              cursor: pointer;
              background: ${colors.btnPrimaryBg};
              border: 1px solid ${colors.btnPrimaryBorder};
              color: ${colors.btnPrimaryText};
            ">Save</button>
          </div>
        </div>
        <div id="pr-modal-status" style="
          margin-top: 12px;
          padding: 8px 12px;
          border-radius: 6px;
          font-size: 12px;
          display: none;
        "></div>
      </div>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // Get elements
    const textarea = document.getElementById("pr-modal-instruction");
    const charCount = document.getElementById("pr-modal-char-count");
    const closeBtn = document.getElementById("pr-modal-close");
    const defaultBtn = document.getElementById("pr-modal-default");
    const clearBtn = document.getElementById("pr-modal-clear");
    const saveBtn = document.getElementById("pr-modal-save");
    const statusDiv = document.getElementById("pr-modal-status");

    // Load current instruction
    getInstruction().then((instruction) => {
      textarea.value = instruction;
      charCount.textContent = `${instruction.length} characters`;
    });

    // Update char count on input
    textarea.addEventListener("input", () => {
      charCount.textContent = `${textarea.value.length} characters`;
    });

    // Close modal
    const closeModal = () => overlay.remove();
    closeBtn.addEventListener("click", closeModal);
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) closeModal();
    });

    // Show status
    const showStatus = (message, isSuccess) => {
      statusDiv.textContent = message;
      statusDiv.style.display = "block";
      statusDiv.style.background = isSuccess ? colors.successBg : colors.errorBg;
      statusDiv.style.border = isSuccess ? `1px solid ${colors.successBorder}` : `1px solid ${colors.errorBorder}`;
      statusDiv.style.color = isSuccess ? colors.successText : colors.errorText;
      setTimeout(() => {
        statusDiv.style.display = "none";
      }, 3000);
    };

    // Use default
    defaultBtn.addEventListener("click", () => {
      textarea.value = DEFAULT_INSTRUCTION;
      charCount.textContent = `${textarea.value.length} characters`;
      showStatus("Default instruction loaded. Click Save to apply.", true);
    });

    // Clear
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

    // Save
    saveBtn.addEventListener("click", async () => {
      try {
        await chrome.storage.sync.set({ customInstruction: textarea.value });
        showStatus("Instruction saved successfully!", true);
      } catch (err) {
        showStatus("Failed to save.", false);
      }
    });

    // Focus textarea
    textarea.focus();
  }

  /**
   * Create the Edit Instruction button for sidebar
   */
  function createEditInstructionButton() {
    const colors = getThemeColors();

    const btn = document.createElement("button");
    btn.id = "pr-edit-instruction-btn";
    btn.className = "btn btn-sm btn-block";
    btn.type = "button";
    btn.textContent = "✏️ Edit Instruction";
    btn.style.cssText = `
      width: 100%;
      margin-top: 12px;
      background: ${colors.btnSecondaryBg};
      border: 1px solid ${colors.btnSecondaryBorder};
      color: ${colors.btnSecondaryText};
      padding: 8px 12px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
    `;

    btn.addEventListener("mouseenter", () => {
      btn.style.background = colors.btnSecondaryHoverBg;
      btn.style.borderColor = colors.textSecondary;
    });
    btn.addEventListener("mouseleave", () => {
      btn.style.background = colors.btnSecondaryBg;
      btn.style.borderColor = colors.btnSecondaryBorder;
    });

    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      showInstructionModal();
    });

    return btn;
  }

  /**
   * Inject sidebar buttons
   */
  function injectSidebarButton() {
    if (document.getElementById("pr-export-all-reviews-btn")) return;

    // Find the sidebar - GitHub's layout has changed, try multiple selectors
    // New GitHub layout uses #partial-discussion-sidebar or #pr-conversation-sidebar
    // Old layout used .Layout-sidebar or .discussion-sidebar
    let sidebar = document.querySelector(
      "#partial-discussion-sidebar, " +
      "#pr-conversation-sidebar, " +
      ".Layout-sidebar, " +
      ".discussion-sidebar, " +
      "[data-target='pull-request-merge-box-loader.sidebarContainer']"
    );

    // Fallback: find the parent of .discussion-sidebar-item elements
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


    // Create container for our buttons
    const container = document.createElement("div");
    container.id = "pr-exporter-sidebar-container";
    container.style.cssText = "margin-top: 16px; padding: 0 16px;";

    // Add Edit Instruction button
    const editBtn = createEditInstructionButton();
    editBtn.style.marginTop = "0";
    container.appendChild(editBtn);

    // Add Export button
    const exportBtn = createSidebarExportButton();
    exportBtn.style.marginTop = "8px";
    container.appendChild(exportBtn);

    // Add Mark all as Resolved button
    const markAllBtn = createMarkAllResolvedButton();
    container.appendChild(markAllBtn);

    // Find a good place to insert - after the last section
    const sections = sidebar.querySelectorAll(".discussion-sidebar-item");
    const lastSection = sections[sections.length - 1];

    if (lastSection) {
      lastSection.insertAdjacentElement("afterend", container);
    } else {
      // Fallback: append to sidebar
      sidebar.appendChild(container);
    }
  }

  /**
   * Create a container for export buttons with responsive layout
   */
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

  /**
   * Try to mount the export control into a native header action cluster.
   */
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

      // Put Export at the far left of Copilot's action rail, before all native items
      // including priority badges and the kebab menu.
      automatedActions.insertBefore(exportControl, automatedActions.firstChild);
      return true;
    }

    const oldActionGroup = firstComment.querySelector(".timeline-comment-actions");
    if (oldActionGroup && oldActionGroup.parentElement) {
      // Old GitHub comment headers use flex-row-reverse, so DOM order is inverted.
      // Insert after the kebab group in the DOM so Export appears to its left visually.
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

  /**
   * Mount the export control into the resolve footer row for inline threads.
   */
  function mountExportControlInResolveRow(resolveForm, exportControl) {
    if (!resolveForm || !resolveForm.parentElement) return false;

    const originalParent = resolveForm.parentElement;

    const row = document.createElement("div");
    row.className = "pr-review-export-row";
    row.style.cssText = `
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin-top: 8px;
      width: 100%;
    `;

    const left = document.createElement("div");
    left.style.cssText = `
      display: flex;
      align-items: center;
      min-width: 0;
      flex: 1 1 auto;
    `;
    left.appendChild(exportControl);

    const right = document.createElement("div");
    right.style.cssText = `
      display: flex;
      align-items: center;
      justify-content: flex-end;
      flex: 0 0 auto;
    `;
    right.appendChild(resolveForm);

    row.appendChild(left);
    row.appendChild(right);
    originalParent.appendChild(row);
    return true;
  }

  /**
   * Mount the export control into the file-path summary row at the top of the thread.
   * The <summary> element shows the file name and has empty space on its right side.
   * Stops click propagation so the Export dropdown doesn't toggle the thread open/closed.
   */
  function mountExportControlInSummary(threadContainer, exportControl) {
    const summaryEl = threadContainer.querySelector(
      ":scope > summary.js-toggle-outdated-comments, :scope > summary"
    );
    if (!summaryEl) return false;

    const flexRow = summaryEl.querySelector(".d-flex.flex-items-center");
    if (!flexRow) {
      // Summary exists but its inner row isn't rendered yet (GitHub lazy-loads active threads).
      // Return true to block any fallback injection in the wrong place.
      // The MutationObserver will retry injectButtonsIntoThread once the DOM updates,
      // and at that point the guard (no .pr-review-export-container yet) will let it through.
      return true;
    }

    // Prevent clicks on the Export dropdown from toggling the parent <details> thread
    exportControl.addEventListener("click", (e) => e.stopPropagation());

    // Insert Export before the Show/Hide resolved links so it sits right of the file path
    const showHideBtn = flexRow.querySelector(".Details-content--closed, .Details-content--open");
    if (showHideBtn) {
      exportControl.style.marginRight = "8px";
      flexRow.insertBefore(exportControl, showHideBtn);
    } else {
      flexRow.appendChild(exportControl);
    }

    return true;
  }

  /**
   * Inject export buttons next to the Resolve conversation button (inline)
   * Uses a responsive container that keeps buttons on same line when possible,
   * but wraps gracefully when width is insufficient
   */
  function injectButtonsIntoThread(threadContainer) {
    if (!threadContainer) return;
    if (threadContainer.querySelector(".pr-review-export-container")) return;

    // Skip the PR author's main description comment — it's a .TimelineItem but
    // NOT inside a pullrequestreview block and has no resolve form.
    if (
      threadContainer.classList.contains("TimelineItem") &&
      !threadContainer.closest('[id*="pullrequestreview"]') &&
      !threadContainer.querySelector(".js-resolvable-timeline-thread-form")
    ) {
      return;
    }

    // Find the first comment in this thread to use for content extraction
    // Include selectors for AI bot reviews (Copilot, Codex) which have different structure
    // Also include selectors for Conversation page which uses different DOM structure
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

    // Fallback: if no specific comment found, use the thread container itself
    // This handles edge cases where the DOM structure is unexpected
    if (!firstComment) {
      console.log("[PR Copy] No specific comment element found, using thread container");
      firstComment = threadContainer;
    }



    // Detect if this is from an AI bot
    const botConfig = detectAIBot(firstComment);

    // Primary: place Export in the file-path summary row (universal — works for all thread types)
    const exportControlForSummary = createThreadExportControl(firstComment, botConfig, "header");
    if (mountExportControlInSummary(threadContainer, exportControlForSummary)) {
      return;
    }

    // Find the Resolve conversation form
    const resolveForm = threadContainer.querySelector(
      ".js-resolvable-timeline-thread-form, " +
      "form[action*='/resolve']"
    );

    if (resolveForm) {
      const exportControl = createThreadExportControl(firstComment, botConfig, "header");

      if (mountExportControlInHeader(threadContainer, firstComment, exportControl)) {
        return;
      }

      if (mountExportControlInResolveRow(resolveForm, exportControl)) {
        return;
      }

      // If the resolve form is inside the comment header row, adding buttons there
      // makes the header row taller. Instead, insert a dedicated row after the header.
      const headerEl = resolveForm.closest(".timeline-comment-header");
      if (headerEl) {
        const btnRow = document.createElement("div");
        btnRow.className = "pr-review-export-row";
        btnRow.style.cssText = `
          display: flex;
          align-items: center;
          justify-content: flex-end;
          padding: 6px 8px 0 8px;
        `;
        btnRow.appendChild(exportControl);
        headerEl.insertAdjacentElement("afterend", btnRow);
      } else {
        // No header ancestor — insert inline after the resolve form
        const btnContainer = createButtonContainer();
        btnContainer.style.marginTop = "8px";
        btnContainer.appendChild(createThreadExportControl(firstComment, botConfig, "panel"));
        resolveForm.insertAdjacentElement("afterend", btnContainer);
      }
      return;
    }

    // Fallback: find thread footer area
    const threadFooter = threadContainer.querySelector(
      ".review-thread-reply, " +
      ".inline-comment-form-container"
    );

    if (threadFooter) {
      // Create button container
      const btnContainer = createButtonContainer();
      btnContainer.style.padding = "8px 0 0 0";

      const exportControl = createThreadExportControl(firstComment, botConfig, "header");

      if (mountExportControlInHeader(threadContainer, firstComment, exportControl)) {
        return;
      }

      btnContainer.appendChild(createThreadExportControl(firstComment, botConfig, "panel"));

      threadFooter.insertAdjacentElement("beforebegin", btnContainer);
      return;
    }

    // Final fallback: handles AI review threads (Copilot, Codex) that don't have resolve forms
    console.log("[PR Copy] Using final fallback for button injection");

    const exportControl = createThreadExportControl(firstComment, botConfig, "header");

    if (mountExportControlInHeader(threadContainer, firstComment, exportControl)) {
      return;
    }

    // If the thread has a .timeline-comment-header (Codex, Sentry, old-layout bots),
    // inserting inside that header row makes it taller. Insert a dedicated row after it.
    const commentHeader = firstComment.querySelector(".timeline-comment-header");
    if (commentHeader) {
      const btnRow = document.createElement("div");
      btnRow.className = "pr-review-export-row";
      btnRow.style.cssText = `
        display: flex;
        align-items: center;
        justify-content: flex-end;
        padding: 6px 12px 0 12px;
      `;
      btnRow.appendChild(createThreadExportControl(firstComment, botConfig, "panel"));
      commentHeader.insertAdjacentElement("afterend", btnRow);
      return;
    }

    // For new-layout bots (e.g. new Copilot React layout) that have no header row,
    // append after the comment body element.
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

  /**
   * Remove all injected buttons and containers when leaving a PR page
   */
  function cleanupButtons() {
    // Remove sidebar container
    const sidebarContainer = document.getElementById("pr-exporter-sidebar-container");
    if (sidebarContainer) sidebarContainer.remove();

    // Remove all export button containers
    const buttonContainers = document.querySelectorAll(".pr-review-export-container, .pr-review-export-row");
    buttonContainers.forEach((container) => container.remove());

    // Remove individual export controls that might not be in containers
    const exportBtns = document.querySelectorAll(".pr-review-export-trigger, .pr-review-export-menu-item");
    exportBtns.forEach((btn) => btn.remove());

    // Remove any open instruction modal
    const modal = document.getElementById("pr-instruction-modal");
    if (modal) modal.remove();
  }

  /**
   * Auto-expand hidden conversations.
   * GitHub collapses some inline threads behind a "N hidden conversation(s)" submit
   * button inside a form.js-review-hidden-comment-ids (ajax-pagination-form).
   * We click each such button once and mark the form so we don't re-trigger it.
   */
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

  /**
   * Find and process all review threads on the page
   */
  function processAllThreads() {
    // If not on a PR page, clean up any existing buttons and exit
    if (!isPullRequestPage()) {
      cleanupButtons();
      return;
    }

    // Expand any hidden conversations first so they are visible for processing
    expandHiddenConversations();

    // Find all thread containers (the outer details elements)
    // Include selectors for Conversation page (TimelineItem) and Files page (review-thread-component)
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

    // Also try finding inline comments containers directly
    const inlineContainers = document.querySelectorAll(".js-inline-comments-container");
    inlineContainers.forEach((container) => {
      const parentThread = container.closest(
        "details.js-comment-container, .review-thread-component"
      );
      if (parentThread && !parentThread.querySelector(".pr-review-export-container")) {
        injectButtonsIntoThread(parentThread);
      }
    });

    // Also inject sidebar button
    injectSidebarButton();
  }

  /**
   * Debounce helper to limit function calls
   */
  function debounce(fn, delay) {
    let timeoutId;
    return function (...args) {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => fn.apply(this, args), delay);
    };
  }

  /**
   * Set up observer for dynamic content
   */
  function observe() {
    // If the mark is already set, a previous inject (e.g., after extension reload)
    // left stale buttons in the DOM. Clean them up and re-initialise.
    if (document.documentElement.hasAttribute(EXT_MARK)) {
      cleanupButtons();
      document.documentElement.removeAttribute(EXT_MARK);
    }
    document.documentElement.setAttribute(EXT_MARK, "true");

    // Initial processing - run immediately
    processAllThreads();

    // Debounced version for MutationObserver (performance optimization)
    const debouncedProcess = debounce(processAllThreads, 100);

    // Watch for dynamic content with debouncing
    const mo = new MutationObserver(debouncedProcess);
    mo.observe(document.body, { childList: true, subtree: true });

    // Handle page navigation - processAllThreads will check isPullRequestPage()
    // and clean up if navigated away from a PR page
    window.addEventListener("pjax:end", () => setTimeout(processAllThreads, 100));
    document.addEventListener("turbo:render", () => setTimeout(processAllThreads, 100));
  }

  // Run on initial load - observe will set up listeners for future navigations
  // Even if we start on a non-PR page, we need the observer for SPA navigation
  observe();
})();
