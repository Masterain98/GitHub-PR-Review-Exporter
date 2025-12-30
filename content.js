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
  };

  function isPullRequestPage() {
    return location.pathname.includes("/pull/");
  }

  /**
   * Detect which AI bot authored the comment (if any)
   */
  function detectAIBot(commentEl) {
    // Look for author link in the comment header
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
    const bodyEl =
      commentEl.querySelector(".comment-body.markdown-body") ||
      commentEl.querySelector(".comment-body") ||
      commentEl.querySelector(".js-comment-body");

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
   * Get comment body with bot-specific cleanup
   */
  function getCleanedCommentBody(commentEl, botConfig) {
    let body = getRawCommentBody(commentEl);

    // Apply bot-specific cleanup
    if (botConfig && botConfig.name === "Codex") {
      body = cleanCodexContent(body);
    }

    return body;
  }

  /**
   * Build the final copy text
   */
  function buildCopyText(commentEl, botConfig) {
    const filePath = findFilePath(commentEl);
    const lineInfo = findLineInfoText(commentEl);
    const rawBody = getCleanedCommentBody(commentEl, botConfig);

    const parts = [];

    if (filePath) parts.push(filePath);
    if (lineInfo) parts.push(lineInfo);
    if (filePath || lineInfo) parts.push(""); // blank line after header

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
      const result = await chrome.storage.sync.get(["customInstruction"]);
      return result.customInstruction || "";
    } catch (err) {
      console.error("[PR Export] Failed to get instruction:", err);
      return "";
    }
  }

  /**
   * Create the export button with GitHub-like styling
   */
  function createExportButton(commentEl, botConfig, includeInstruction = false) {
    const btn = document.createElement("button");
    btn.className = includeInstruction ? "pr-review-export-instr-btn btn btn-sm" : "pr-review-export-btn btn btn-sm";
    btn.type = "button";

    // Determine label
    let defaultLabel;
    if (includeInstruction) {
      defaultLabel = "Export Instruction & Review";
    } else {
      defaultLabel = botConfig ? botConfig.buttonLabel : "Export Review";
    }
    btn.textContent = defaultLabel;
    btn.style.cssText = "margin-left: 8px;";

    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();

      btn.textContent = "Exporting...";
      btn.disabled = true;

      let text = buildCopyText(commentEl, botConfig);

      // Prepend instruction if requested
      if (includeInstruction) {
        const instruction = await getInstruction();
        if (instruction) {
          text = instruction + "\n\n" + text;
        }
      }

      try {
        await navigator.clipboard.writeText(text);
        btn.textContent = "✓ Exported!";
        setTimeout(() => {
          btn.textContent = defaultLabel;
          btn.disabled = false;
        }, 1500);
      } catch (err) {
        console.error("Clipboard write failed:", err);
        btn.textContent = "Failed";
        setTimeout(() => {
          btn.textContent = defaultLabel;
          btn.disabled = false;
        }, 1500);
      }
    });

    return btn;
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
        ".js-comment[data-gid]"
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
4. Provide your reasoning and any code changes if applicable`;

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

    // Find the sidebar - look for the right column in PR page
    const sidebar = document.querySelector(
      ".Layout-sidebar, " +
      ".discussion-sidebar, " +
      "[data-target='pull-request-merge-box-loader.sidebarContainer']"
    );

    if (!sidebar) return;

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
   * Inject export buttons next to the Resolve conversation button (inline)
   */
  function injectButtonsIntoThread(threadContainer) {
    if (!threadContainer) return;
    if (threadContainer.querySelector(".pr-review-export-btn")) return;

    // Find the first comment in this thread to use for content extraction
    const firstComment = threadContainer.querySelector(
      ".timeline-comment.js-comment, " +
      ".review-comment.js-comment, " +
      ".js-comment[data-gid]"
    );

    if (!firstComment) return;

    // Detect if this is from an AI bot
    const botConfig = detectAIBot(firstComment);

    // Find the Resolve conversation form
    const resolveForm = threadContainer.querySelector(
      ".js-resolvable-timeline-thread-form, " +
      "form[action*='/resolve']"
    );

    if (resolveForm) {
      // Create both buttons
      const exportBtn = createExportButton(firstComment, botConfig, false);
      const exportInstrBtn = createExportButton(firstComment, botConfig, true);

      exportBtn.style.cssText = "margin-left: 8px; display: inline-block; vertical-align: middle;";
      exportInstrBtn.style.cssText = "margin-left: 8px; display: inline-block; vertical-align: middle;";

      // Insert buttons after the resolve form
      resolveForm.insertAdjacentElement("afterend", exportInstrBtn);
      resolveForm.insertAdjacentElement("afterend", exportBtn);

      // Wrap in a flex container if not already
      const parent = resolveForm.parentElement;
      if (parent && !parent.style.display.includes("flex")) {
        parent.style.display = "flex";
        parent.style.alignItems = "center";
        parent.style.flexWrap = "wrap";
        parent.style.gap = "8px";
      }
      return;
    }

    // Fallback: find thread footer area
    const threadFooter = threadContainer.querySelector(
      ".review-thread-reply, " +
      ".inline-comment-form-container"
    );

    if (threadFooter) {
      const exportBtn = createExportButton(firstComment, botConfig, false);
      const exportInstrBtn = createExportButton(firstComment, botConfig, true);

      exportBtn.style.cssText = "margin: 8px 8px 8px 16px; display: inline-block;";
      exportInstrBtn.style.cssText = "margin: 8px 8px 8px 0; display: inline-block;";

      threadFooter.insertAdjacentElement("beforebegin", exportInstrBtn);
      threadFooter.insertAdjacentElement("beforebegin", exportBtn);
    }
  }

  /**
   * Find and process all review threads on the page
   */
  function processAllThreads() {
    // Find all thread containers (the outer details elements)
    const threadContainers = document.querySelectorAll(
      "details.js-comment-container, " +
      ".review-thread-component, " +
      ".js-resolvable-timeline-thread-container"
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
      if (parentThread && !parentThread.querySelector(".pr-review-export-btn")) {
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
    if (document.documentElement.hasAttribute(EXT_MARK)) return;
    document.documentElement.setAttribute(EXT_MARK, "true");

    // Initial processing - run immediately
    processAllThreads();

    // Debounced version for MutationObserver (performance optimization)
    const debouncedProcess = debounce(processAllThreads, 100);

    // Watch for dynamic content with debouncing
    const mo = new MutationObserver(debouncedProcess);
    mo.observe(document.body, { childList: true, subtree: true });

    // Handle page navigation
    window.addEventListener("pjax:end", () => setTimeout(processAllThreads, 100));
    document.addEventListener("turbo:render", () => setTimeout(processAllThreads, 100));
  }

  if (isPullRequestPage()) {
    observe();
  }
})();
