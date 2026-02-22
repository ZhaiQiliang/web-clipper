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

module.exports = {
  sendMessageWithTimeout,
  chunkArray,
  getExtensionFromMimeType
};
