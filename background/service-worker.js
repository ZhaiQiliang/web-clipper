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
    
    // If image has base64 data, save directly without fetching
    if (image.base64) {
      saveBase64Image(image, attachmentsFolder, noteFilename, settings.apiUrl, settings.apiKey)
        .then(result => sendResponse(result))
        .catch(error => sendResponse({ success: false, error: error.message, originalSrc: image.originalSrc }));
    } else {
      downloadAndUploadImage(image, attachmentsFolder, noteFilename, settings.apiUrl, settings.apiKey)
        .then(result => sendResponse(result))
        .catch(error => sendResponse({ success: false, error: error.message, originalSrc: image.originalSrc }));
    }
    return true;
  }

  // Convert images to base64 using background script (bypasses CORS)
  if (message.action === 'convertImagesInBackground') {
    handleConvertImagesToBase64(message.imageUrls, message.sourceUrl)
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  // Fetch image with cookies for Reader Mode
  if (message.action === 'fetchImageWithCookies') {
    fetchImageWithCookies(message.imageUrl)
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  // Store images in IndexedDB
  if (message.action === 'storeImages') {
    handleStoreImages(message.images, message.imageKey)
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  // Get all images from IndexedDB
  if (message.action === 'getImages') {
    handleGetImages()
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  // Clear old images from IndexedDB
  if (message.action === 'clearImages') {
    handleClearImages()
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ success: false, error: error.message }));
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
      throw new Error('Request timed out. Please check your connection.', { cause: error });
    }
    if (error.name === 'TypeError') {
      throw new Error(CONFIG.ERRORS.CONNECTION_FAILED, { cause: error });
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

// Save base64 image directly to Obsidian (no need to fetch)
async function saveBase64Image(image, attachmentsFolder, noteFilename, apiUrl, apiKey) {
  try {
    // Decode base64 to binary
    const base64Data = image.base64.replace(/^data:image\/\w+;base64,/, '');
    const binaryString = atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    
    // Detect image type from base64 header
    let contentType = 'image/png';
    if (image.base64.startsWith('data:image/jpeg')) {
      contentType = 'image/jpeg';
    } else if (image.base64.startsWith('data:image/webp')) {
      contentType = 'image/webp';
    } else if (image.base64.startsWith('data:image/gif')) {
      contentType = 'image/gif';
    }
    
    // Generate filename
    const ext = getExtensionFromMimeType(contentType);
    const safeNoteFilename = sanitizeFilename(noteFilename).substring(0, 50);
    const filename = `${safeNoteFilename}_${image.index}${ext}`;
    const filePath = `${attachmentsFolder}/${filename}`;
    
    // Upload to Obsidian
    const arrayBuffer = bytes.buffer;
    await uploadBinaryToObsidian(filePath, arrayBuffer, contentType, apiUrl, apiKey);
    
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



// Convert images to base64 (for reader mode - bypasses CORS)
async function handleConvertImagesToBase64(imageUrls, sourceUrl) {
  const results = [];
  const timeout = 15000; // 15 seconds per image
  
  // Extract domain from source URL for Referer and cookies
  let referer = sourceUrl || 'https://sspai.com/';
  let sourceDomain = 'sspai.com';
  try {
    const sourceUrlObj = new URL(sourceUrl);
    sourceDomain = sourceUrlObj.hostname;
  } catch (e) {}
  
  console.log('[Background] Converting images, sourceUrl:', sourceUrl, 'domain:', sourceDomain);
  
  for (const url of imageUrls) {
    try {
      // Get the domain from the image URL
      const imgUrlObj = new URL(url);
      const imgDomain = imgUrlObj.hostname;
      
      // Get cookies for both the image domain and the source domain
      // (cookies might be set on parent domain, not CDN subdomain)
      const allCookies = [];
      const imgDomainCookies = await chrome.cookies.getAll({ domain: imgDomain });
      const sourceDomainCookies = await chrome.cookies.getAll({ domain: sourceDomain });
      
      // Combine and deduplicate cookies
      const cookieMap = new Map();
      for (const c of [...imgDomainCookies, ...sourceDomainCookies]) {
        cookieMap.set(c.name, c.value);
      }
      const cookieHeader = Array.from(cookieMap.entries())
        .map(([name, value]) => `${name}=${value}`)
        .join('; ');
      
      console.log('[Background] Fetching image:', url.substring(0, 50), 'cookies:', cookieHeader ? 'yes' : 'none');
      
      let response;
      try {
        response = await fetchWithTimeout(url, {
          method: 'GET',
          mode: 'cors',
          headers: {
            'Cookie': cookieHeader,
            'Referer': referer,
            'Origin': `https://${sourceDomain}`,
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/png,image/jpeg,image/gif,*/*'
          }
        }, timeout);
        
        if (!response.ok) {
          console.log('[Background] Request failed with status:', response.status);
          throw new Error('HTTP ' + response.status);
        }
      } catch (fetchError) {
        console.log('[Background] Fetch error:', fetchError.message);
        // Try no-cors as fallback
        response = await fetchWithTimeout(url, {
          method: 'GET',
          mode: 'no-cors',
          headers: {
            'Cookie': cookieHeader,
            'Referer': referer,
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
          }
        }, timeout);
      }
      
      // Get the blob
      const blob = await response.blob();
      console.log('[Background] Got blob, size:', blob.size, 'type:', blob.type);
      
      // Validate it's an image
      if (blob.type && !blob.type.startsWith('image/')) {
        results.push({ url: url, base64: null, error: `Not an image: ${blob.type}` });
        continue;
      }
      
      const base64 = await blobToBase64(blob);
      results.push({ url: url, base64: base64 });
      console.log('[Background] Successfully converted:', url.substring(0, 50));
    } catch (e) {
      console.log('[Background] Failed to convert:', url.substring(0, 50), e.message);
      results.push({ url: url, base64: null, error: e.message });
    }
  }
  
  return { success: true, results };
}

// Convert blob to base64
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// Fetch a single image with cookies (for Reader Mode)
async function fetchImageWithCookies(imageUrl) {
  try {
    const url = new URL(imageUrl);
    const imgDomain = url.hostname;
    
    // Get the current page URL for source domain
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    let sourceDomain = imgDomain;
    let sourceUrl = '';
    if (tab?.url) {
      try {
        const tabUrl = new URL(tab.url);
        sourceDomain = tabUrl.hostname;
        sourceUrl = tab.url;
      } catch (e) {}
    }
    
    // Get cookies for multiple possible domains
    // 1. Exact image domain
    // 2. Exact source domain  
    // 3. Parent domains (e.g., .sspai.com for cdnfile.sspai.com)
    const allCookies = [];
    
    // Get cookies for exact domains
    const imgDomainCookies = await chrome.cookies.getAll({ domain: imgDomain });
    const sourceDomainCookies = await chrome.cookies.getAll({ domain: sourceDomain });
    allCookies.push(...imgDomainCookies, ...sourceDomainCookies);
    
    // Get cookies for parent domains
    const domainParts = imgDomain.split('.');
    if (domainParts.length > 2) {
      // Try .example.com for cdn.example.com
      const parentDomain = '.' + domainParts.slice(-2).join('.');
      const parentCookies = await chrome.cookies.getAll({ domain: parentDomain });
      allCookies.push(...parentCookies);
    }
    
    // Also try getting ALL cookies for the tab's URL
    if (tab?.url) {
      const tabUrl = new URL(tab.url);
      const tabCookies = await chrome.cookies.getAll({ url: tab.url });
      allCookies.push(...tabCookies);
    }
    
    // Combine and deduplicate cookies
    const cookieMap = new Map();
    for (const c of allCookies) {
      // Only include non-httpOnly cookies (they can't be sent via headers)
      if (!c.httpOnly) {
        cookieMap.set(c.name, c.value);
      }
    }
    const cookieHeader = Array.from(cookieMap.entries())
      .map(([name, value]) => `${name}=${value}`)
      .join('; ');
    
    // Build Referer (use the source page, not the image URL)
    const referer = sourceUrl || `https://${sourceDomain}/`;
    
    console.log('[Background] fetchImageWithCookies:', imageUrl.substring(0, 80), 'sourceDomain:', sourceDomain, 'cookies:', cookieHeader ? 'yes (' + cookieMap.size + ')' : 'none');
    
    // Fetch with more complete headers
    const response = await fetch(imageUrl, {
      method: 'GET',
      headers: {
        'Cookie': cookieHeader,
        'Referer': referer,
        'Origin': `https://${sourceDomain}`,
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/png,image/jpeg,image/gif,*/*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Sec-Fetch-Dest': 'image',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'cross-site'
      },
      credentials: 'include',
      mode: 'cors'
    });
    
    if (!response.ok) {
      console.log('[Background] fetchImageWithCookies failed:', response.status, response.statusText);
      return { success: false, error: `HTTP ${response.status}` };
    }
    
    const blob = await response.blob();
    const base64 = await blobToBase64(blob);
    
    console.log('[Background] fetchImageWithCookies success:', imageUrl.substring(0, 50), 'base64 length:', base64.length);
    
    return { success: true, base64 };
  } catch (error) {
    console.log('[Background] fetchImageWithCookies error:', error.message);
    return { success: false, error: error.message };
  }
}

// Handle storing images in IndexedDB
async function handleStoreImages(images, imageKey) {
  try {
    for (const img of images) {
      await saveImageToDB(img.url, img.base64);
    }
    console.log('[Background] Stored', images.length, 'images with key:', imageKey);
    return { success: true, imageKey: imageKey, count: images.length };
  } catch (error) {
    console.log('[Background] Failed to store images:', error.message);
    return { success: false, error: error.message };
  }
}

// Handle getting all images from IndexedDB
async function handleGetImages() {
  try {
    const images = await getAllImagesFromDB();
    console.log('[Background] Retrieved', Object.keys(images).length, 'images from IndexedDB');
    return { success: true, images: images };
  } catch (error) {
    console.log('[Background] Failed to get images:', error.message);
    return { success: false, error: error.message };
  }
}

// Handle clearing old images from IndexedDB
async function handleClearImages() {
  try {
    const deletedCount = await clearOldImagesFromDB(24 * 60 * 60 * 1000); // 24 hours
    console.log('[Background] Cleared', deletedCount, 'old images from IndexedDB');
    return { success: true, deletedCount: deletedCount };
  } catch (error) {
    console.log('[Background] Failed to clear images:', error.message);
    return { success: false, error: error.message };
  }
}
