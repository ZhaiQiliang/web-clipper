// Turndown service singleton
let turndownInstance = null;

function getTurndownService() {
  if (!turndownInstance && typeof TurndownService !== 'undefined') {
    turndownInstance = new TurndownService({
      headingStyle: 'atx',
      codeBlockStyle: 'fenced',
      emDelimiter: '*'
    });

    // Custom rule for code blocks
    turndownInstance.addRule('pre', {
      filter: 'pre',
      replacement: function(content, node) {
        const code = node.querySelector('code');
        const language = code?.className.match(/language-(\w+)/)?.[1] || '';
        return `\n\`\`\`${language}\n${content.trim()}\n\`\`\`\n`;
      }
    });

    // Remove script and style tags
    turndownInstance.remove(['script', 'style', 'noscript']);
  }
  return turndownInstance;
}

document.addEventListener('DOMContentLoaded', async () => {
  // Elements - Main View
  const mainView = document.getElementById('mainView');
  const settingsView = document.getElementById('settingsView');
  const clipBtn = document.getElementById('clipBtn');
  const settingsBtn = document.getElementById('settingsBtn');
  const backBtn = document.getElementById('backBtn');
  const statusEl = document.getElementById('status');
  const titleInput = document.getElementById('titleInput');
  const previewEl = document.getElementById('preview');
  const previewTitle = document.getElementById('previewTitle');
  const previewExcerpt = document.getElementById('previewExcerpt');
  const previewSite = document.getElementById('previewSite');
  const folderInput = document.getElementById('folderInput');

  // Elements - Tags
  const tagsInput = document.getElementById('tagsInput');
  const tagsContainer = document.getElementById('tagsContainer');
  const tagsSuggestions = document.getElementById('tagsSuggestions');

  // Elements - Notes
  const notesInput = document.getElementById('notesInput');

  // Elements - Clip Mode
  const modeFullPage = document.getElementById('modeFullPage');
  const modeSelection = document.getElementById('modeSelection');
  const selectionInfo = document.getElementById('selectionInfo');

  // Elements - Image Progress
  const imageProgress = document.getElementById('imageProgress');
  const progressLabel = document.getElementById('progressLabel');
  const progressCount = document.getElementById('progressCount');
  const progressFill = document.getElementById('progressFill');
  const progressStats = document.getElementById('progressStats');
  const statsSuccess = document.getElementById('statsSuccess');
  const statsFailed = document.getElementById('statsFailed');

  // Elements - Settings View
  const settingsForm = document.getElementById('settingsForm');
  const apiUrlInput = document.getElementById('apiUrl');
  const apiKeyInput = document.getElementById('apiKey');
  const targetFolderInput = document.getElementById('targetFolder');
  const includeMetadataCheckbox = document.getElementById('includeMetadata');
  const localizeImagesCheckbox = document.getElementById('localizeImages');
  const testConnectionBtn = document.getElementById('testConnectionBtn');
  const connectionStatus = document.getElementById('connectionStatus');

  // Elements - Tags Management View
  const tagsManageView = document.getElementById('tagsManageView');
  const tagsBackBtn = document.getElementById('tagsBackBtn');
  const manageTagsBtn = document.getElementById('manageTagsBtn');
  const clearAllTagsBtn = document.getElementById('clearAllTagsBtn');
  const tagsCountEl = document.getElementById('tagsCount');
  const totalUsageEl = document.getElementById('totalUsage');
  const tagsList = document.getElementById('tagsList');
  const exportTagsBtn = document.getElementById('exportTagsBtn');
  const importTagsBtn = document.getElementById('importTagsBtn');
  const importTagsFile = document.getElementById('importTagsFile');

  // State object for better management
  const state = {
    settings: await loadSettings(),
    currentTags: [],
    tagsHistory: await loadTagsHistory(),
    selectedSuggestionIndex: -1,
    clipMode: 'fullPage',  // 'fullPage' | 'selection'
    hasSelection: false
  };

  folderInput.value = state.settings.targetFolder || CONFIG.DEFAULTS.FOLDER;

  // Auto-fill title on popup open
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.title) {
      titleInput.value = tab.title;
    }
    // Check if there's selected text on the page
    await checkPageSelection(tab);
  } catch (e) {
    // Silently fail - title will be empty
  }

  // Check for text selection on the current page (with timeout protection)
  async function checkPageSelection(tab) {
    try {
      const result = await sendMessageWithTimeout(tab.id, { action: 'checkSelection' }, 2000);
      state.hasSelection = result.hasSelection;
      updateSelectionUI();
    } catch (e) {
      // Timeout or error - page may not support scripting
      state.hasSelection = false;
      updateSelectionUI();
    }
  }

  // Update UI based on selection state
  function updateSelectionUI() {
    if (state.hasSelection) {
      selectionInfo.classList.remove('hidden');
      modeSelection.disabled = false;
    } else {
      selectionInfo.classList.add('hidden');
      modeSelection.disabled = true;
      if (state.clipMode === 'selection') {
        state.clipMode = 'fullPage';
        updateModeButtons();
    }
  }

  return result;
}

  // Update mode button styles
  function updateModeButtons() {
    modeFullPage.classList.toggle('active', state.clipMode === 'fullPage');
    modeSelection.classList.toggle('active', state.clipMode === 'selection');
  }

  // Mode switching
  modeFullPage.addEventListener('click', () => {
    state.clipMode = 'fullPage';
    updateModeButtons();
  });

  modeSelection.addEventListener('click', () => {
    if (state.hasSelection) {
      state.clipMode = 'selection';
      updateModeButtons();
    }
  });

  // Event delegation for tag suggestions (fixes memory leak)
  tagsSuggestions.addEventListener('click', (e) => {
    const suggestion = e.target.closest('.tag-suggestion');
    if (suggestion) {
      addTag(suggestion.dataset.tag);
    }
  });

  // Event delegation for tag removal (fixes memory leak)
  tagsContainer.addEventListener('click', (e) => {
    const removeBtn = e.target.closest('.tag-remove');
    if (removeBtn) {
      e.preventDefault();
      removeTag(removeBtn.dataset.tag);
    }
  });

  // Tags input handlers
  tagsInput.addEventListener('input', () => {
    const query = tagsInput.value.trim().toLowerCase();
    showTagSuggestions(query);
  });

  tagsInput.addEventListener('keydown', (e) => {
    const suggestions = tagsSuggestions.querySelectorAll('.tag-suggestion');

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      state.selectedSuggestionIndex = Math.min(state.selectedSuggestionIndex + 1, suggestions.length - 1);
      updateSuggestionSelection(suggestions);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      state.selectedSuggestionIndex = Math.max(state.selectedSuggestionIndex - 1, -1);
      updateSuggestionSelection(suggestions);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (state.selectedSuggestionIndex >= 0 && suggestions[state.selectedSuggestionIndex]) {
        addTag(suggestions[state.selectedSuggestionIndex].dataset.tag);
      } else if (tagsInput.value.trim()) {
        addTag(tagsInput.value.trim());
      }
    } else if (e.key === 'Escape') {
      hideSuggestions();
    }
  });

  tagsInput.addEventListener('blur', () => {
    setTimeout(() => hideSuggestions(), CONFIG.TAGS.DEBOUNCE_DELAY);
  });

  tagsInput.addEventListener('focus', () => {
    if (tagsInput.value.trim() === '') {
      showTagSuggestions('');
    }
  });

  function showTagSuggestions(query) {
    const filtered = state.tagsHistory
      .filter(t => !state.currentTags.includes(t.name))
      .filter(t => query === '' || t.name.toLowerCase().includes(query))
      .sort((a, b) => b.count - a.count)
      .slice(0, CONFIG.TAGS.SUGGESTIONS_COUNT);

    if (filtered.length === 0 && query === '') {
      hideSuggestions();
      return;
    }

    // Build suggestions HTML (no event binding needed - using delegation)
    let html = filtered.map(t =>
      `<div class="tag-suggestion" data-tag="${escapeHtml(t.name)}">
        ${escapeHtml(t.name)}
        <span class="tag-count">${t.count}</span>
      </div>`
    ).join('');

    if (query && !filtered.some(t => t.name.toLowerCase() === query.toLowerCase())) {
      html += `<div class="tag-suggestion" data-tag="${escapeHtml(query)}">
        Create "${escapeHtml(query)}"
      </div>`;
    }

    tagsSuggestions.innerHTML = html;
    state.selectedSuggestionIndex = -1;
    tagsSuggestions.classList.remove('hidden');
  }

  function hideSuggestions() {
    tagsSuggestions.classList.add('hidden');
    state.selectedSuggestionIndex = -1;
  }

  function updateSuggestionSelection(suggestions) {
    suggestions.forEach((el, i) => {
      el.classList.toggle('active', i === state.selectedSuggestionIndex);
    });
  }

  function addTag(tagName) {
    const normalized = tagName.trim().toLowerCase().replace(/\s+/g, '-');
    if (normalized && !state.currentTags.includes(normalized)) {
      state.currentTags.push(normalized);
      renderTags();
    }
    tagsInput.value = '';
    hideSuggestions();
  }

  function removeTag(tagName) {
    state.currentTags = state.currentTags.filter(t => t !== tagName);
    renderTags();
  }

  function renderTags() {
    // No event binding needed - using delegation
    tagsContainer.innerHTML = state.currentTags.map(tag =>
      `<span class="tag-item">
        #${escapeHtml(tag)}
        <button class="tag-remove" data-tag="${escapeHtml(tag)}">&times;</button>
      </span>`
    ).join('');
  }

  // View switching
  settingsBtn.addEventListener('click', () => {
    populateSettingsForm(state.settings);
    mainView.classList.add('hidden');
    settingsView.classList.remove('hidden');
  });

  backBtn.addEventListener('click', () => {
    settingsView.classList.add('hidden');
    mainView.classList.remove('hidden');
  });

  // Tags Management - View switching
  manageTagsBtn.addEventListener('click', () => {
    renderTagsManageList();
    mainView.classList.add('hidden');
    tagsManageView.classList.remove('hidden');
  });

  tagsBackBtn.addEventListener('click', () => {
    tagsManageView.classList.add('hidden');
    mainView.classList.remove('hidden');
  });

  // Tags Management - Clear all tags
  clearAllTagsBtn.addEventListener('click', async () => {
    if (state.tagsHistory.length === 0) return;

    if (confirm('Are you sure you want to clear all tags? This cannot be undone.')) {
      state.tagsHistory = [];
      await chrome.storage.local.set({ [CONFIG.STORAGE_KEYS.TAGS_HISTORY]: [] });
      renderTagsManageList();
    }
  });

  // Tags Management - Delete single tag (event delegation)
  tagsList.addEventListener('click', async (e) => {
    const deleteBtn = e.target.closest('.tag-delete');
    if (deleteBtn) {
      const tagName = deleteBtn.dataset.tag;
      state.tagsHistory = state.tagsHistory.filter(t => t.name !== tagName);
      await chrome.storage.local.set({ [CONFIG.STORAGE_KEYS.TAGS_HISTORY]: state.tagsHistory });
      renderTagsManageList();
    }
  });

  // Tags Management - Export
  exportTagsBtn.addEventListener('click', () => {
    if (state.tagsHistory.length === 0) {
      alert('No tags to export.');
      return;
    }

    const data = JSON.stringify(state.tagsHistory, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `web-clipper-tags-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });

  // Tags Management - Import (trigger file picker)
  importTagsBtn.addEventListener('click', () => {
    importTagsFile.click();
  });

  // Tags Management - Handle file import
  importTagsFile.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const importedTags = JSON.parse(text);

      if (!Array.isArray(importedTags)) {
        throw new Error('Invalid format: expected an array of tags');
      }

      // Validate and merge tags
      let addedCount = 0;
      for (const tag of importedTags) {
        if (!tag.name || typeof tag.name !== 'string') continue;

        const existing = state.tagsHistory.find(t => t.name === tag.name);
        if (existing) {
          // Merge: add counts, keep higher usage
          existing.count = Math.max(existing.count, tag.count || 1);
        } else {
          // Add new tag
          state.tagsHistory.push({
            name: tag.name,
            count: tag.count || 1,
            lastUsed: tag.lastUsed || Date.now()
          });
          addedCount++;
        }
      }

      // Sort and trim
      state.tagsHistory.sort((a, b) => b.count - a.count);
      state.tagsHistory = state.tagsHistory.slice(0, CONFIG.TAGS.MAX_HISTORY);

      await chrome.storage.local.set({ [CONFIG.STORAGE_KEYS.TAGS_HISTORY]: state.tagsHistory });
      renderTagsManageList();

      alert(`Imported successfully! ${addedCount} new tags added.`);
    } catch (err) {
      alert(`Import failed: ${err.message}`);
    }

    // Reset file input
    importTagsFile.value = '';
  });

  // Render tags management list
  function renderTagsManageList() {
    const totalUsage = state.tagsHistory.reduce((sum, t) => sum + t.count, 0);
    tagsCountEl.textContent = `${state.tagsHistory.length} tags`;
    totalUsageEl.textContent = `${totalUsage} total uses`;

    if (state.tagsHistory.length === 0) {
      tagsList.innerHTML = '<div class="tags-list-empty">No tags yet. Tags will appear here as you use them.</div>';
      return;
    }

    tagsList.innerHTML = state.tagsHistory.map(tag =>
      `<div class="tag-manage-item">
        <span class="tag-name">#${escapeHtml(tag.name)}</span>
        <span class="tag-count">${tag.count} uses</span>
        <button class="tag-delete" data-tag="${escapeHtml(tag.name)}" title="Delete tag">&times;</button>
      </div>`
    ).join('');
  }

  // Clip button click
  clipBtn.addEventListener('click', async () => {
    try {
      clipBtn.disabled = true;
      updateStatus(CONFIG.STATUS.EXTRACTING, 'loading');

      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

      // Choose action based on clip mode (with timeout protection)
      const action = state.clipMode === 'selection' ? 'extractSelection' : 'extractContent';
      const extractResult = await sendMessageWithTimeout(tab.id, { action }, 10000);

      if (!extractResult.success) {
        throw new Error(extractResult.error || CONFIG.ERRORS.EXTRACTION_FAILED);
      }

      showPreview(extractResult.data);

      const customTitle = titleInput.value.trim() || extractResult.data.title;
      let contentWithCustomTitle = { ...extractResult.data, title: customTitle };

      const currentSettings = { ...state.settings, targetFolder: folderInput.value };
      const userNotes = notesInput.value.trim();
      const filename = sanitizeFilename(customTitle);

      // Download images if enabled and images exist (with progress tracking)
      let imageResults = [];
      const images = extractResult.data.images || [];
      if (currentSettings.localizeImages && images.length > 0) {
        // Show progress UI
        imageProgress.classList.remove('hidden');
        progressStats.classList.add('hidden');
        progressFill.style.width = '0%';

        let successCount = 0;
        let failedCount = 0;

        // Download images one by one for progress tracking
        for (let i = 0; i < images.length; i++) {
          // Update progress
          progressLabel.textContent = 'Downloading images...';
          progressCount.textContent = `${i + 1}/${images.length}`;
          progressFill.style.width = `${((i + 1) / images.length) * 100}%`;

          try {
            const result = await chrome.runtime.sendMessage({
              action: 'downloadSingleImage',
              image: images[i],
              settings: currentSettings,
              noteFilename: filename
            });

            imageResults.push(result);
            if (result.success) {
              successCount++;
            } else {
              failedCount++;
            }
          } catch (e) {
            imageResults.push({ success: false, originalSrc: images[i].originalSrc, error: e.message });
            failedCount++;
          }
        }

        // Show final stats
        progressLabel.textContent = 'Images processed';
        progressStats.classList.remove('hidden');
        statsSuccess.textContent = `${successCount} saved`;
        statsFailed.textContent = failedCount > 0 ? `${failedCount} failed` : '';
        statsFailed.style.display = failedCount > 0 ? 'inline' : 'none';
      }

      updateStatus(CONFIG.STATUS.GENERATING, 'loading');
      let markdown = generateMarkdown(contentWithCustomTitle, currentSettings, state.currentTags, userNotes);

      // Replace image URLs in FINAL markdown with wiki links
      if (currentSettings.localizeImages && imageResults.length > 0) {
        markdown = replaceImageUrlsInFinalMarkdown(markdown, imageResults);
      }

      updateStatus(CONFIG.STATUS.SAVING, 'loading');
      const saveResult = await chrome.runtime.sendMessage({
        action: 'saveToObsidian',
        note: {
          filename: filename,
          content: markdown
        },
        settings: currentSettings
      });

      if (!saveResult.success) {
        throw new Error(saveResult.error || CONFIG.ERRORS.SAVE_FAILED);
      }

      await saveTagsToHistory(state.currentTags);
      state.tagsHistory = await loadTagsHistory();

      updateStatus(CONFIG.STATUS.SUCCESS, 'success');

      // Clear inputs after successful clip
      state.currentTags = [];
      renderTags();
      notesInput.value = '';
      titleInput.value = '';

    } catch (error) {
      updateStatus(`Error: ${error.message}`, 'error');
    } finally {
      clipBtn.disabled = false;
    }
  });

  // Test connection
  testConnectionBtn.addEventListener('click', async () => {
    const testSettings = {
      apiUrl: apiUrlInput.value || CONFIG.DEFAULT_API_URL,
      apiKey: apiKeyInput.value
    };

    connectionStatus.textContent = 'Testing...';
    connectionStatus.className = 'connection-status loading';

    const result = await chrome.runtime.sendMessage({
      action: 'testConnection',
      settings: testSettings
    });

    if (result.success) {
      connectionStatus.textContent = 'Connected successfully!';
      connectionStatus.className = 'connection-status success';
    } else {
      connectionStatus.textContent = result.error || 'Connection failed';
      connectionStatus.className = 'connection-status error';
    }
  });

  // Save settings
  settingsForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    state.settings = {
      apiUrl: apiUrlInput.value || CONFIG.DEFAULT_API_URL,
      apiKey: apiKeyInput.value,
      targetFolder: targetFolderInput.value || CONFIG.DEFAULTS.FOLDER,
      includeMetadata: includeMetadataCheckbox.checked,
      localizeImages: localizeImagesCheckbox.checked
    };

    await chrome.storage.sync.set({ [CONFIG.STORAGE_KEYS.SETTINGS]: state.settings });
    folderInput.value = state.settings.targetFolder;

    settingsView.classList.add('hidden');
    mainView.classList.remove('hidden');
    updateStatus(CONFIG.STATUS.SETTINGS_SAVED, 'success');

    setTimeout(() => {
      updateStatus(CONFIG.STATUS.READY, '');
    }, 2000);
  });

  // Helper functions
  function updateStatus(message, type) {
    statusEl.textContent = message;
    statusEl.className = 'status' + (type ? ' ' + type : '');
  }

  function showPreview(data) {
    previewTitle.textContent = data.title;
    previewExcerpt.textContent = data.excerpt || data.textContent?.substring(0, 200) || '';
    previewSite.textContent = data.siteName;
    previewEl.classList.remove('hidden');
  }

  function populateSettingsForm(settings) {
    apiUrlInput.value = settings.apiUrl || CONFIG.DEFAULT_API_URL;
    apiKeyInput.value = settings.apiKey || '';
    targetFolderInput.value = settings.targetFolder || CONFIG.DEFAULTS.FOLDER;
    includeMetadataCheckbox.checked = settings.includeMetadata !== false;
    localizeImagesCheckbox.checked = settings.localizeImages !== false;
    connectionStatus.textContent = '';
    connectionStatus.className = 'connection-status';
  }
});

async function loadSettings() {
  const defaults = {
    apiUrl: CONFIG.DEFAULT_API_URL,
    apiKey: '',
    targetFolder: CONFIG.DEFAULTS.FOLDER,
    includeMetadata: CONFIG.DEFAULTS.INCLUDE_METADATA,
    localizeImages: CONFIG.IMAGES.ENABLED
  };

  const result = await chrome.storage.sync.get(CONFIG.STORAGE_KEYS.SETTINGS);
  return { ...defaults, ...result[CONFIG.STORAGE_KEYS.SETTINGS] };
}

async function loadTagsHistory() {
  const result = await chrome.storage.local.get(CONFIG.STORAGE_KEYS.TAGS_HISTORY);
  return result[CONFIG.STORAGE_KEYS.TAGS_HISTORY] || [];
}

async function saveTagsToHistory(tags) {
  const history = await loadTagsHistory();

  for (const tag of tags) {
    const existing = history.find(t => t.name === tag);
    if (existing) {
      existing.count++;
      existing.lastUsed = Date.now();
    } else {
      history.push({ name: tag, count: 1, lastUsed: Date.now() });
    }
  }

  history.sort((a, b) => b.count - a.count);
  const trimmed = history.slice(0, CONFIG.TAGS.MAX_HISTORY);

  await chrome.storage.local.set({ [CONFIG.STORAGE_KEYS.TAGS_HISTORY]: trimmed });
}

function generateMarkdown(content, settings, customTags = [], userNotes = '') {
  const { includeMetadata } = settings;
  let markdown = '';

  const allTags = [CONFIG.DEFAULTS.TAG, ...customTags];

  if (includeMetadata) {
    markdown += '---\n';
    markdown += `title: ${escapeYaml(content.title)}\n`;
    markdown += `url: ${content.url}\n`;
    markdown += `clipped: ${content.extractedAt}\n`;
    if (content.byline) markdown += `author: ${escapeYaml(content.byline)}\n`;
    if (content.siteName) markdown += `site: ${escapeYaml(content.siteName)}\n`;
    if (content.publishedTime) markdown += `published: ${content.publishedTime}\n`;
    markdown += 'tags:\n';
    allTags.forEach(tag => {
      markdown += `  - ${tag}\n`;
    });
    markdown += '---\n\n';
  }

  markdown += `# ${content.title}\n\n`;

  markdown += `> Source: [${content.siteName || new URL(content.url).hostname}](${content.url})\n`;
  if (content.byline) markdown += `> Author: ${content.byline}\n`;
  markdown += `> Clipped: ${formatDate(content.extractedAt)}\n\n`;

  if (userNotes) {
    markdown += `## My Notes\n\n${userNotes}\n\n`;
  }

  if (content.excerpt) {
    markdown += `## Summary\n\n${content.excerpt}\n\n`;
  }

  markdown += '## Content\n\n';
  markdown += htmlToMarkdown(content.content);

  return markdown;
}

function htmlToMarkdown(html) {
  const service = getTurndownService();
  if (!service) {
    // Fallback if Turndown not loaded
    const temp = document.createElement('div');
    temp.innerHTML = html;
    return temp.textContent || temp.innerText || '';
  }
  return service.turndown(html);
}

// Replace image URLs in final markdown with Obsidian Wiki links
// This is called AFTER generateMarkdown, so we process the complete markdown
function replaceImageUrlsInFinalMarkdown(markdown, imageResults) {
  if (!imageResults || imageResults.length === 0) {
    return markdown;
  }

  let result = markdown;

  // Get list of successfully downloaded images
  const downloadedImages = imageResults.filter(img => img.success && img.originalSrc);

  for (const img of downloadedImages) {
    // Get the local filename
    const localFilename = img.relativePath.split('/').pop();
    const wikiLink = `![[${localFilename}]]`;

    // Try to replace any occurrence of the URL with the wiki link
    // This handles:
    // - ![alt](url)
    // - [](url)
    // - [[[filename.jpg]]](url) (malformed from previous attempts)
    const escapedUrl = img.originalSrc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    
    // Pattern 1: Standard markdown image ![alt](url)
    let pattern = new RegExp('!\\[([^\\]]*)\\]\\(' + escapedUrl + '\\)', 'gi');
    result = result.replace(pattern, wikiLink);

    // Pattern 2: Remove the malformed pattern ![[filename.jpg]](url) and keep just ![[filename.jpg]]
    pattern = new RegExp('!\\[\\[([^\\]]+)\\]\\]\\(' + escapedUrl + '\\)', 'gi');
    result = result.replace(pattern, wikiLink);

    // Pattern 3: If the above didn't match, try partial match by filename
    const urlParts = img.originalSrc.split('/');
    const urlFilename = urlParts[urlParts.length - 1];
    if (urlFilename) {
      // Find any pattern with this filename
      const partialPattern = new RegExp('!\\[.*' + urlFilename.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '.*\\]\\([^)]+\\)', 'gi');
      result = result.replace(partialPattern, wikiLink);
    }
  }

  return result;
}
