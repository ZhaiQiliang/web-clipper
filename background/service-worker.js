// Background service worker for Web Clipper

// Import shared modules (service workers use importScripts)
importScripts('../shared/constants.js');
importScripts('../shared/utils.js');

// Extension installed event
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.storage.sync.set({
      [CONFIG.STORAGE_KEYS.SETTINGS]: {
        apiUrl: CONFIG.DEFAULT_API_URL,
        apiKey: '',
        targetFolder: CONFIG.DEFAULTS.FOLDER,
        includeMetadata: CONFIG.DEFAULTS.INCLUDE_METADATA
      }
    });
  }

  // Register context menus
  chrome.contextMenus.create({
    id: 'clip-page',
    title: 'Save page to Obsidian',
    contexts: ['page']
  });

  chrome.contextMenus.create({
    id: 'clip-selection',
    title: 'Save selection to Obsidian',
    contexts: ['selection']
  });
});

// Listen for context menu clicks
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'clip-page') {
    await quickClip(tab, 'fullPage');
  } else if (info.menuItemId === 'clip-selection') {
    await quickClip(tab, 'selection');
  }
});

// Listen for keyboard shortcuts
chrome.commands.onCommand.addListener(async (command) => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;

  if (command === 'clip-page') {
    await quickClip(tab, 'fullPage');
  } else if (command === 'clip-selection') {
    await quickClip(tab, 'selection');
  }
});

// Listen for messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'saveToObsidian') {
    handleSaveToObsidian(message.note, message.settings)
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (message.action === 'testConnection') {
    handleTestConnection(message.settings)
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (message.action === 'downloadAndSaveImages') {
    handleDownloadAndSaveImages(message.images, message.settings, message.noteFilename)
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  // Download a single image (for progress tracking)
  if (message.action === 'downloadSingleImage') {
    const { image, settings, noteFilename } = message;
    const attachmentsFolder = `${settings.targetFolder}/${CONFIG.IMAGES.ATTACHMENTS_FOLDER}`;
    downloadAndUploadImage(image, attachmentsFolder, noteFilename, settings.apiUrl, settings.apiKey)
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ success: false, error: error.message, originalSrc: image.originalSrc }));
    return true;
  }

  // Return false for unhandled messages
  return false;
});

// Wrapper with timeout support
async function fetchWithTimeout(url, options, timeout = CONFIG.API_TIMEOUT) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

// Wrapper with retry support (exponential backoff)
async function fetchWithRetry(url, options, retries = 3, timeout = CONFIG.API_TIMEOUT) {
  let lastError;
  for (let i = 0; i < retries; i++) {
    try {
      return await fetchWithTimeout(url, options, timeout);
    } catch (error) {
      lastError = error;
      // Don't retry on abort (user cancelled) or client errors
      if (error.name === 'AbortError') throw error;

      // Wait before retry (exponential backoff: 1s, 2s, 4s)
      if (i < retries - 1) {
        await new Promise(r => setTimeout(r, Math.pow(2, i) * 1000));
      }
    }
  }
  throw lastError;
}

async function handleSaveToObsidian(note, settings) {
  const { apiUrl, apiKey, targetFolder } = settings;

  // Build file path
  const filePath = targetFolder
    ? `${targetFolder}/${note.filename}.md`
    : `${note.filename}.md`;

  // Encode each path segment separately to preserve directory structure
  const encodedPath = filePath.split('/').map(segment => encodeURIComponent(segment)).join('/');
  const url = `${apiUrl}/vault/${encodedPath}`;

  try {
    const headers = {
      'Content-Type': 'text/markdown'
    };

    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    // Use retry for better reliability
    const response = await fetchWithRetry(url, {
      method: 'PUT',
      headers,
      body: note.content
    }, 3);

    if (!response.ok) {
      // Handle specific HTTP errors
      if (response.status === 404) {
        throw new Error('Obsidian vault path not found. Please check target folder.');
      }
      if (response.status === 401) {
        throw new Error(CONFIG.ERRORS.AUTH_FAILED);
      }
      if (response.status >= 500) {
        throw new Error('Obsidian server error. Please try again.');
      }
      throw new Error(`Failed to save (HTTP ${response.status})`);
    }

    return { success: true, path: filePath };
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('Request timed out. Please check your connection.');
    }
    if (error.name === 'TypeError') {
      throw new Error(CONFIG.ERRORS.CONNECTION_FAILED);
    }
    throw error;
  }
}

async function handleTestConnection(settings) {
  const { apiUrl, apiKey } = settings;

  // Normalize URL - remove trailing slash
  const baseUrl = apiUrl.replace(/\/+$/, '');
  const testUrl = `${baseUrl}/`;

  try {
    const headers = {
      'Accept': 'application/json'
    };
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    const response = await fetchWithTimeout(testUrl, {
      method: 'GET',
      headers,
      mode: 'cors'
    });

    if (response.ok) {
      const data = await response.json();
      return {
        success: true,
        authenticated: data.authenticated,
        service: data.service
      };
    }

    if (response.status === 401) {
      return { success: false, error: CONFIG.ERRORS.AUTH_FAILED };
    }

    return { success: false, error: `HTTP ${response.status}` };
  } catch (error) {
    if (error.name === 'AbortError') {
      return { success: false, error: 'Connection timed out' };
    }
    return { success: false, error: CONFIG.ERRORS.CONNECTION_FAILED };
  }
}

// Quick clip function for keyboard shortcuts and context menu
async function quickClip(tab, mode) {
  try {
    // Load settings
    const result = await chrome.storage.sync.get(CONFIG.STORAGE_KEYS.SETTINGS);
    const settings = result[CONFIG.STORAGE_KEYS.SETTINGS] || {
      apiUrl: CONFIG.DEFAULT_API_URL,
      apiKey: '',
      targetFolder: CONFIG.DEFAULTS.FOLDER,
      includeMetadata: CONFIG.DEFAULTS.INCLUDE_METADATA
    };

    // Extract content from page
    const action = mode === 'selection' ? 'extractSelection' : 'extractContent';
    const extractResult = await chrome.tabs.sendMessage(tab.id, { action });

    if (!extractResult.success) {
      await showPageNotification(tab.id, 'error', extractResult.error || 'Failed to extract content');
      return;
    }

    // Generate simple markdown (service worker has no DOM, so we use a simplified version)
    const content = extractResult.data;
    const markdown = generateSimpleMarkdown(content, settings);

    // Save to Obsidian
    const filename = sanitizeFilename(content.title);
    const saveResult = await handleSaveToObsidian({ filename, content: markdown }, settings);

    if (saveResult.success) {
      await showPageNotification(tab.id, 'success', 'Saved to Obsidian!');
    } else {
      await showPageNotification(tab.id, 'error', saveResult.error || 'Failed to save');
    }
  } catch (error) {
    await showPageNotification(tab.id, 'error', error.message);
  }
}

// Generate markdown without DOM (simplified version for quick clip)
// Uses functions from shared/utils.js: escapeYaml, formatDateSimple, stripHtml, sanitizeFilename
function generateSimpleMarkdown(content, settings) {
  const { includeMetadata, targetFolder } = settings;
  let markdown = '';

  const tags = [CONFIG.DEFAULTS.TAG];

  if (includeMetadata) {
    markdown += '---\n';
    markdown += `title: ${escapeYaml(content.title)}\n`;
    markdown += `url: ${content.url}\n`;
    markdown += `clipped: ${content.extractedAt}\n`;
    if (content.byline) markdown += `author: ${escapeYaml(content.byline)}\n`;
    if (content.siteName) markdown += `site: ${escapeYaml(content.siteName)}\n`;
    if (content.publishedTime) markdown += `published: ${content.publishedTime}\n`;
    markdown += 'tags:\n';
    tags.forEach(tag => {
      markdown += `  - ${tag}\n`;
    });
    markdown += '---\n\n';
  }

  markdown += `# ${content.title}\n\n`;

  const siteName = content.siteName || new URL(content.url).hostname;
  markdown += `> Source: [${siteName}](${content.url})\n`;
  if (content.byline) markdown += `> Author: ${content.byline}\n`;
  markdown += `> Clipped: ${formatDateSimple(content.extractedAt)}\n\n`;

  if (content.excerpt) {
    markdown += `## Summary\n\n${content.excerpt}\n\n`;
  }

  markdown += '## Content\n\n';
  // Use textContent since we can't use Turndown in service worker
  markdown += content.textContent || stripHtml(content.content);

  return markdown;
}

// Show notification on the page
async function showPageNotification(tabId, type, message) {
  try {
    await chrome.tabs.sendMessage(tabId, {
      action: 'showNotification',
      type: type,
      message: message
    });
  } catch (e) {
    // Page might not have content script loaded, silently fail
    console.log('Could not show notification:', e.message);
  }
}

// Download and save images to Obsidian
async function handleDownloadAndSaveImages(images, settings, noteFilename) {
  const { apiUrl, apiKey, targetFolder } = settings;
  const attachmentsFolder = `${targetFolder}/${CONFIG.IMAGES.ATTACHMENTS_FOLDER}`;
  const results = [];

  // Process images with concurrency control
  const chunks = chunkArray(images, CONFIG.IMAGES.MAX_CONCURRENT);

  for (const chunk of chunks) {
    const chunkResults = await Promise.all(
      chunk.map(image => downloadAndUploadImage(image, attachmentsFolder, noteFilename, apiUrl, apiKey))
    );
    results.push(...chunkResults);
  }

  return { success: true, results };
}

// Download a single image and upload to Obsidian
async function downloadAndUploadImage(image, attachmentsFolder, noteFilename, apiUrl, apiKey) {
  try {
    // Download the image
    const response = await fetchWithTimeout(image.originalSrc, {
      method: 'GET',
      mode: 'cors'
    }, CONFIG.IMAGES.TIMEOUT);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    // Get image data as blob
    const blob = await response.blob();

    // Validate type
    if (!CONFIG.IMAGES.ALLOWED_TYPES.includes(blob.type)) {
      throw new Error('Unsupported image type: ' + blob.type);
    }

    // Validate size
    if (blob.size > CONFIG.IMAGES.MAX_SIZE_MB * 1024 * 1024) {
      throw new Error('Image too large: ' + Math.round(blob.size / 1024 / 1024) + 'MB');
    }

    // Generate filename
    const ext = getExtensionFromMimeType(blob.type);
    const safeNoteFilename = sanitizeFilename(noteFilename).substring(0, 50);
    const filename = `${safeNoteFilename}_${image.index}${ext}`;
    const filePath = `${attachmentsFolder}/${filename}`;

    // Upload to Obsidian
    const arrayBuffer = await blob.arrayBuffer();
    await uploadBinaryToObsidian(filePath, arrayBuffer, blob.type, apiUrl, apiKey);

    return {
      originalSrc: image.originalSrc,
      localPath: filePath,
      relativePath: `${CONFIG.IMAGES.ATTACHMENTS_FOLDER}/${filename}`,
      success: true
    };
  } catch (error) {
    return {
      originalSrc: image.originalSrc,
      localPath: null,
      relativePath: null,
      success: false,
      error: error.message
    };
  }
}

// Upload binary data to Obsidian vault
async function uploadBinaryToObsidian(filePath, data, contentType, apiUrl, apiKey) {
  const encodedPath = filePath.split('/').map(segment => encodeURIComponent(segment)).join('/');
  const url = `${apiUrl}/vault/${encodedPath}`;

  const headers = { 'Content-Type': contentType };
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  const response = await fetchWithTimeout(url, {
    method: 'PUT',
    headers,
    body: data
  }, CONFIG.IMAGES.TIMEOUT);

  if (!response.ok) {
    throw new Error(`Upload failed: HTTP ${response.status}`);
  }
}

// getExtensionFromMimeType and chunkArray are now in shared/utils.js
