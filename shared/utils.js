// Web Clipper Shared Utilities
// Common functions used across popup, content script, and service worker

/**
 * Escape HTML special characters to prevent XSS
 * @param {string} str - String to escape
 * @returns {string} Escaped string
 */
function escapeHtml(str) {
  if (!str) return '';
  const escapeMap = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  };
  return str.replace(/[&<>"']/g, char => escapeMap[char]);
}

/**
 * Sanitize filename by removing invalid characters
 * @param {string} title - Original title
 * @param {number} maxLength - Maximum filename length
 * @returns {string} Sanitized filename
 */
function sanitizeFilename(title, maxLength = 100) {
  if (!title) return 'untitled';
  return title
    .replace(/[<>:"/\\|?*]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, maxLength);
}

/**
 * Escape string for YAML frontmatter
 * @param {string} str - String to escape
 * @returns {string} YAML-safe string
 */
function escapeYaml(str) {
  if (!str) return '""';

  // Check if string needs quoting
  const needsQuotes = /[:\[\]{}#&*!|>'"%@`\n]/.test(str) ||
                      str.startsWith(' ') ||
                      str.endsWith(' ') ||
                      str.startsWith('---') ||
                      str.startsWith('...') ||
                      ['true', 'false', 'null', 'yes', 'no'].includes(str.toLowerCase());

  if (needsQuotes) {
    return '"' + str.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n') + '"';
  }
  return str;
}

/**
 * Format ISO date string to localized format
 * @param {string} isoString - ISO date string
 * @returns {string} Formatted date string
 */
function formatDate(isoString) {
  if (!isoString) return '';
  try {
    const date = new Date(isoString);
    return date.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch {
    return isoString;
  }
}

/**
 * Format date as simple string (YYYY-MM-DD HH:mm)
 * @param {string} isoString - ISO date string
 * @returns {string} Simple date string
 */
function formatDateSimple(isoString) {
  if (!isoString) return '';
  try {
    const date = new Date(isoString);
    return date.toISOString().split('T')[0] + ' ' + date.toTimeString().substring(0, 5);
  } catch {
    return isoString;
  }
}

/**
 * Validate URL format
 * @param {string} url - URL to validate
 * @returns {boolean} True if valid
 */
function isValidUrl(url) {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return ['http:', 'https:'].includes(parsed.protocol);
  } catch {
    return false;
  }
}

/**
 * Validate folder path (no dangerous characters)
 * @param {string} path - Folder path to validate
 * @returns {boolean} True if valid
 */
function isValidFolderPath(path) {
  if (!path) return true; // Empty is valid (uses default)
  // Allow alphanumeric, dash, underscore, slash, space, Chinese chars
  return /^[\w\-\s\u4e00-\u9fa5\/]+$/.test(path) && !path.includes('..');
}

/**
 * Strip HTML tags (simple version for fallback)
 * @param {string} html - HTML string
 * @returns {string} Plain text
 */
function stripHtml(html) {
  if (!html) return '';
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Send message with timeout protection
 * @param {number} tabId - Chrome tab ID
 * @param {object} message - Message to send
 * @param {number} timeout - Timeout in ms
 * @returns {Promise} Response or timeout error
 */
async function sendMessageWithTimeout(tabId, message, timeout = 5000) {
  return Promise.race([
    chrome.tabs.sendMessage(tabId, message),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Message timeout - page may not support this operation')), timeout)
    )
  ]);
}

/**
 * Chunk array for batch processing
 * @param {Array} array - Array to chunk
 * @param {number} size - Chunk size
 * @returns {Array} Array of chunks
 */
function chunkArray(array, size) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

/**
 * Get file extension from MIME type
 * @param {string} mimeType - MIME type
 * @returns {string} File extension with dot
 */
function getExtensionFromMimeType(mimeType) {
  const mimeToExt = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/gif': '.gif',
    'image/webp': '.webp',
    'image/svg+xml': '.svg'
  };
  return mimeToExt[mimeType] || '.png';
}

// Export for different contexts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    escapeHtml,
    sanitizeFilename,
    escapeYaml,
    formatDate,
    formatDateSimple,
    isValidUrl,
    isValidFolderPath,
    stripHtml,
    sendMessageWithTimeout,
    chunkArray,
    getExtensionFromMimeType
  };
}
