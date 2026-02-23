// Content script for web clipping

// Listen for messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'extractContent') {
    extractPageContent()
      .then(result => sendResponse({ success: true, data: result }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (message.action === 'extractSelection') {
    try {
      const selection = getSelectedContent();
      if (selection) {
        // Extract images from selection HTML
        const images = extractImagesFromHtml(selection.html);

        sendResponse({
          success: true,
          data: {
            title: document.title,
            url: window.location.href,
            content: selection.html,
            textContent: selection.text,
            excerpt: selection.text.substring(0, 200),
            byline: getAuthor(),
            siteName: getSiteName(),
            publishedTime: getPublishedTime(),
            extractedAt: new Date().toISOString(),
            isSelection: true,
            images: images
          }
        });
      } else {
        sendResponse({ success: false, error: 'No text selected' });
      }
    } catch (error) {
      sendResponse({ success: false, error: error.message });
    }
    return true;
  }

  if (message.action === 'checkSelection') {
    const selection = window.getSelection();
    const hasSelection = selection && !selection.isCollapsed && selection.toString().trim().length > 10;
    sendResponse({ hasSelection });
    return true;
  }

  if (message.action === 'showNotification') {
    showInPageNotification(message.type, message.message);
    sendResponse({ success: true });
    return true;
  }
  // Only return true if we handle the message
});

async function extractPageContent() {
  // Clone document to avoid modifying the original page
  const documentClone = document.cloneNode(true);

  // Try to use Readability for content extraction
  if (typeof Readability !== 'undefined') {
    const reader = new Readability(documentClone, {
      charThreshold: 100
    });

    const article = reader.parse();

    if (article && article.content) {
      const images = extractImagesFromHtml(article.content);
      const { imageKey, imagesWithBase64 } = await processAndStoreImages(images, article.content);

      return {
        title: article.title || document.title,
        url: window.location.href,
        content: article.content,
        textContent: article.textContent,
        excerpt: article.excerpt || getMetaDescription(),
        byline: article.byline || getAuthor(),
        siteName: article.siteName || getSiteName(),
        publishedTime: getPublishedTime(),
        extractedAt: new Date().toISOString(),
        images: imagesWithBase64,
        imageKey: imageKey
      };
    }
  }

  // Fallback: extract content with improved strategy
  const mainContent = getMainContent();
  const images = extractImagesFromHtml(mainContent);
  const { imageKey, imagesWithBase64 } = await processAndStoreImages(images, mainContent);

  return {
    title: document.title,
    url: window.location.href,
    content: mainContent,
    textContent: getCleanTextContent(),
    excerpt: getMetaDescription(),
    byline: getAuthor(),
    siteName: getSiteName(),
    publishedTime: getPublishedTime(),
    extractedAt: new Date().toISOString(),
    images: imagesWithBase64,
    imageKey: imageKey
  };
}

function getMainContent() {
  // Try content selectors from config
  const selectors = CONFIG.CONTENT.CONTENT_SELECTORS;

  for (const selector of selectors) {
    const el = document.querySelector(selector);
    if (el && el.innerText.length > CONFIG.CONTENT.MIN_CONTENT_LENGTH) {
      // Clone and clean the element
      const clone = el.cloneNode(true);
      removeUnwantedElements(clone);
      return clone.innerHTML;
    }
  }

  // Last resort: use body but clean it first
  const bodyClone = document.body.cloneNode(true);
  removeUnwantedElements(bodyClone);
  return bodyClone.innerHTML;
}

function removeUnwantedElements(container) {
  // Remove common non-content elements
  const unwantedSelectors = [
    'script', 'style', 'noscript', 'iframe',
    'nav', 'header', 'footer', 'aside',
    '.sidebar', '.navigation', '.nav', '.menu',
    '.header', '.footer', '.ads', '.ad',
    '.advertisement', '.social-share', '.comments',
    '.related-posts', '.recommended', '.popup',
    '[role="navigation"]', '[role="banner"]',
    '[role="complementary"]', '[role="contentinfo"]'
  ];

  unwantedSelectors.forEach(selector => {
    container.querySelectorAll(selector).forEach(el => el.remove());
  });
}

function getCleanTextContent() {
  const bodyClone = document.body.cloneNode(true);
  removeUnwantedElements(bodyClone);
  return bodyClone.innerText.substring(0, CONFIG.CONTENT.MAX_TEXT_LENGTH);
}

function getMetaDescription() {
  const meta = document.querySelector('meta[name="description"]') ||
               document.querySelector('meta[property="og:description"]');
  return meta?.content || '';
}

function getAuthor() {
  // Try meta tags first
  const authorMeta = document.querySelector('meta[name="author"]') ||
                     document.querySelector('meta[property="article:author"]');
  if (authorMeta?.content) return authorMeta.content;

  // Try common author elements
  const authorEl = document.querySelector('.author, .byline, [rel="author"], .post-author');
  if (authorEl) {
    // Get text, but avoid getting too much content
    const text = authorEl.textContent?.trim();
    if (text && text.length < 100) {
      return text.replace(/^by\s+/i, '');
    }
  }

  return '';
}

function getSiteName() {
  const siteMeta = document.querySelector('meta[property="og:site_name"]');
  if (siteMeta?.content) return siteMeta.content;

  // Try application-name
  const appName = document.querySelector('meta[name="application-name"]');
  if (appName?.content) return appName.content;

  return window.location.hostname.replace(/^www\./, '');
}

function getPublishedTime() {
  const selectors = CONFIG.CONTENT.TIME_SELECTORS;

  for (const selector of selectors) {
    const el = document.querySelector(selector);
    if (el) {
      const value = el.getAttribute('content') || el.getAttribute('datetime');
      if (value && isValidDate(value)) {
        return value;
      }
    }
  }
  return '';
}

function isValidDate(str) {
  if (!str) return false;
  const date = new Date(str);
  return !isNaN(date.getTime());
}

// Get selected content from the page
function getSelectedContent() {
  const selection = window.getSelection();

  if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
    return null;
  }

  const range = selection.getRangeAt(0);
  const fragment = range.cloneContents();

  // Create temporary container to get HTML
  const container = document.createElement('div');
  container.appendChild(fragment);

  // Clean the selected content
  removeUnwantedElements(container);

  const html = container.innerHTML;
  const text = container.textContent || '';

  if (text.trim().length < 10) {
    return null;
  }

  return {
    html: html,
    text: text.trim()
  };
}

// Show in-page notification for quick clip results
function showInPageNotification(type, message) {
  // Remove existing notification
  const existing = document.getElementById('web-clipper-notification');
  if (existing) existing.remove();

  // Create notification element
  const notification = document.createElement('div');
  notification.id = 'web-clipper-notification';
  notification.className = `wc-notification wc-notification-${type}`;
  notification.innerHTML = `
    <div class="wc-notification-icon">${type === 'success' ? '✓' : '✕'}</div>
    <div class="wc-notification-message">${escapeHtml(message)}</div>
  `;

  document.body.appendChild(notification);

  // Auto-dismiss after 3 seconds
  setTimeout(() => {
    notification.classList.add('wc-notification-hide');
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}

// escapeHtml is now in shared/utils.js

// Extract images from HTML string using regex to preserve original URLs
// This ensures the URLs match exactly what's in the HTML content
function extractImagesFromHtml(htmlContent) {
  const images = [];
  const imgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
  let match;
  let index = 0;

  while ((match = imgRegex.exec(htmlContent)) !== null) {
    const fullMatch = match[0];
    const src = match[1];

    // Skip base64 and non-http images
    if (src && !src.startsWith('data:') && src.startsWith('http')) {
      // Extract alt if present
      const altMatch = /alt=["']([^"']*)["']/.exec(fullMatch);
      const alt = altMatch ? altMatch[1] : '';

      images.push({
        originalSrc: src,
        alt: alt,
        index: index,
        // Keep the original img tag for replacement
        originalTag: fullMatch
      });
      index++;
    }
  }

  return images;
}

// Process images: convert to base64 and store in IndexedDB via background
async function processAndStoreImages(images, htmlContent) {
  if (!images || images.length === 0) {
    return { imageKey: null, imagesWithBase64: [] };
  }

  // Generate unique key for this batch of images
  const imageKey = 'img_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);

  // Convert images to base64
  const base64Images = [];
  const imagesWithBase64 = [];
  
  for (const img of images) {
    try {
      const base64 = await convertImageToBase64(img.originalSrc);
      if (base64) {
        base64Images.push({
          url: img.originalSrc,
          base64: base64
        });
        // Add base64 to the image object for returning
        imagesWithBase64.push({
          ...img,
          base64: base64,
          success: true
        });
      } else {
        imagesWithBase64.push({
          ...img,
          success: false
        });
      }
    } catch (e) {
      console.log('[Content] Failed to convert image:', img.originalSrc, e.message);
      imagesWithBase64.push({
        ...img,
        success: false
      });
    }
  }

  if (base64Images.length === 0) {
    return { imageKey: null, imagesWithBase64 };
  }

  // Send to background to store in IndexedDB
  try {
    await chrome.runtime.sendMessage({
      action: 'storeImages',
      images: base64Images,
      imageKey: imageKey
    });
    console.log('[Content] Stored', base64Images.length, 'images with key:', imageKey);
  } catch (e) {
    console.log('[Content] Failed to store images:', e.message);
  }

  return { imageKey, imagesWithBase64 };
}

// Convert image URL to base64 using canvas
function convertImageToBase64(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    
    img.onload = function() {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        
        const dataUrl = canvas.toDataURL('image/png');
        resolve(dataUrl);
      } catch (e) {
        reject(e);
      }
    };
    
    img.onerror = function(e) {
      reject(new Error('Failed to load image'));
    };
    
    img.src = url;
    
    // Timeout after 10 seconds
    setTimeout(() => reject(new Error('Image conversion timeout')), 10000);
  });
}

