/**
 * Popup script for GitHub PR Review Export extension
 * Handles saving/loading custom instruction from Chrome storage
 */

// Default instruction template
const DEFAULT_INSTRUCTION = `Please review the following code review comments. For each comment:
1. Assess if the concern is valid and applicable
2. If valid, analyze the suggested fix or solution
3. Decide whether to adopt, modify, or reject the suggestion
4. Provide your reasoning and any code changes if applicable`;

const instructionTextarea = document.getElementById("instruction");
const charCountSpan = document.getElementById("charCount");
const saveBtn = document.getElementById("saveBtn");
const clearBtn = document.getElementById("clearBtn");
const defaultBtn = document.getElementById("defaultBtn");
const statusDiv = document.getElementById("status");

// Load saved instruction on popup open
async function loadInstruction() {
    try {
        const result = await chrome.storage.sync.get(["customInstruction"]);
        if (result.customInstruction) {
            instructionTextarea.value = result.customInstruction;
            updateCharCount();
        }
    } catch (err) {
        console.error("Failed to load instruction:", err);
    }
}

// Save instruction to Chrome storage
async function saveInstruction() {
    const instruction = instructionTextarea.value;

    try {
        await chrome.storage.sync.set({ customInstruction: instruction });
        showStatus("Instruction saved successfully!", "success");
    } catch (err) {
        console.error("Failed to save instruction:", err);
        showStatus("Failed to save instruction.", "error");
    }
}

// Clear the instruction
async function clearInstruction() {
    instructionTextarea.value = "";
    updateCharCount();

    try {
        await chrome.storage.sync.remove(["customInstruction"]);
        showStatus("Instruction cleared.", "success");
    } catch (err) {
        console.error("Failed to clear instruction:", err);
        showStatus("Failed to clear instruction.", "error");
    }
}

// Use default instruction
function useDefaultInstruction() {
    instructionTextarea.value = DEFAULT_INSTRUCTION;
    updateCharCount();
    showStatus("Default instruction loaded. Click Save to apply.", "success");
}

// Update character count display
function updateCharCount() {
    charCountSpan.textContent = instructionTextarea.value.length;
}

// Show status message
function showStatus(message, type) {
    statusDiv.textContent = message;
    statusDiv.className = `status ${type}`;

    // Hide after 3 seconds
    setTimeout(() => {
        statusDiv.className = "status";
    }, 3000);
}

// Event listeners
instructionTextarea.addEventListener("input", updateCharCount);
saveBtn.addEventListener("click", saveInstruction);
clearBtn.addEventListener("click", clearInstruction);
if (defaultBtn) {
    defaultBtn.addEventListener("click", useDefaultInstruction);
}

// Initialize
loadInstruction();

