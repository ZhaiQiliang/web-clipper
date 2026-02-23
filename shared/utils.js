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


// IndexedDB helpers for image storage
const DB_NAME = 'WebClipperImages';
const DB_VERSION = 1;
const STORE_NAME = 'images';

function openImageDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onerror = () => reject(request.error);
    
    request.onsuccess = () => resolve(request.result);
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'url' });
        store.createIndex('timestamp', 'timestamp', { unique: false });
      }
    };
  });
}

async function saveImageToDB(url, base64) {
  const db = await openImageDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    
    const request = store.put({
      url: url,
      base64: base64,
      timestamp: Date.now()
    });
    
    request.onsuccess = () => resolve(true);
    request.onerror = () => reject(request.error);
  });
}

async function getImageFromDB(url) {
  const db = await openImageDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(url);
    
    request.onsuccess = () => resolve(request.result?.base64 || null);
    request.onerror = () => reject(request.error);
  });
}

async function getAllImagesFromDB() {
  const db = await openImageDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();
    
    request.onsuccess = () => {
      const results = request.result || [];
      const imageMap = {};
      results.forEach(item => {
        imageMap[item.url] = item.base64;
      });
      resolve(imageMap);
    };
    request.onerror = () => reject(request.error);
  });
}

async function clearOldImagesFromDB(maxAgeMs = 24 * 60 * 60 * 1000) {
  const db = await openImageDB();
  const cutoffTime = Date.now() - maxAgeMs;
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const index = store.index('timestamp');
    
    const range = IDBKeyRange.upperBound(cutoffTime);
    const request = index.openCursor(range);
    
    let deletedCount = 0;
    
    request.onsuccess = (event) => {
      const cursor = event.target.result;
      if (cursor) {
        cursor.delete();
        deletedCount++;
        cursor.continue();
      }
    };
    
    transaction.oncomplete = () => resolve(deletedCount);
    transaction.onerror = () => reject(transaction.error);
  });
}
