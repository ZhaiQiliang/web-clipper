// Shared utility functions for Web Clipper
// This file is loaded via importScripts in service worker

function escapeHtml(str) {
  if (!str) return '';
  const escapeMap = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    '\'': '&#39;'
  };
  return str.replace(/[&<>"']/g, char => escapeMap[char]);
}

function sanitizeFilename(title, maxLength = 100) {
  if (!title) return 'untitled';
  return title
    .replace(/[<>:"/\\|?*]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, maxLength);
}

function escapeYaml(str) {
  if (!str) return '""';

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

function stripHtml(html) {
  if (!html) return '';
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isValidUrl(url) {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return ['http:', 'https:'].includes(parsed.protocol);
  } catch {
    return false;
  }
}

function isValidFolderPath(path) {
  if (!path) return true;
  return /^[\w\-\s\u4e00-\u9fa5\/]+$/.test(path) && !path.includes('..');
}

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

function formatDateSimple(isoString) {
  if (!isoString) return '';
  try {
    const date = new Date(isoString);
    return date.toISOString().split('T')[0] + ' ' + date.toTimeString().substring(0, 5);
  } catch {
    return isoString;
  }
}

async function sendMessageWithTimeout(tabId, message, timeout = 5000) {
  return Promise.race([
    chrome.tabs.sendMessage(tabId, message),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Message timeout - page may not support this operation')), timeout)
    )
  ]);
}

function chunkArray(array, size) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

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
