// Reader Mode - Simple version showing images directly

const STORAGE_KEYS = {
  READER_THEME: 'reader_theme',
  READER_FONT_SIZE: 'reader_font_size',
  READER_PROGRESS: 'reader_progress_'
};

const DEFAULT_FONT_SIZE = 16;

let pageData = null;
let currentUrl = '';
let imageStorageKey = null;

document.addEventListener('DOMContentLoaded', function() {
  loadPageData();
  initTheme();
  initFontSize();
  initReadingProgress();
  initToc();
  initClipFunction();
  initCleanup();
});

function initCleanup() {
  window.addEventListener('unload', function() {
    if (imageStorageKey) {
      try {
        chrome.storage.local.remove(imageStorageKey);
      } catch (e) {}
    }
  });
}

function loadPageData() {
  var params = new URLSearchParams(window.location.search);
  var contentKey = params.get('key');
  
  console.log('[Reader] Loading with key:', contentKey);
  
  if (!contentKey) {
    showError('No content key found');
    return;
  }

  chrome.storage.local.get(contentKey, function(result) {
    if (chrome.runtime.lastError) {
      showError('Failed to load: ' + chrome.runtime.lastError.message);
      return;
    }
    
    var data = result[contentKey];
    if (!data) {
      showError('Content not found');
      return;
    }
    
    pageData = data;
    currentUrl = pageData.url || '';
    imageStorageKey = pageData.imageKey || null;
    
    console.log('[Reader] Data loaded, title:', pageData.title, 'imageKey:', imageStorageKey);
    
    renderContent();
  });
}

function renderContent() {
  if (!pageData) return;
  
  var article = document.getElementById('articleContent');
  if (!article) return;
  
  var html = '<header class="article-header">';
  html += '<h1 class="article-title">' + escapeHtml(pageData.title || 'Untitled') + '</h1>';
  html += '<div class="article-meta">';
  if (pageData.siteName) {
    html += '<span class="site-name">' + escapeHtml(pageData.siteName) + '</span>';
  }
  if (pageData.byline) {
    html += '<span class="byline">' + escapeHtml(pageData.byline) + '</span>';
  }
  if (pageData.url) {
    html += '<a href="' + escapeHtml(pageData.url) + '" class="original-url" target="_blank">Original</a>';
  }
  html += '</div></header>';
  
  var content = pageData.content || '';
  
  if (pageData.url) {
    content = fixRelativeImageUrls(content, pageData.url);
  }
  
  html += '<div class="article-body">' + content + '</div>';
  
  article.innerHTML = html;
  document.title = pageData.title || 'Reader Mode';
  
  console.log('[Reader] Content rendered, images in HTML:', (content.match(/<img/g) || []).length);
  
  if (imageStorageKey) {
    loadAndReplaceImages();
  }
}

function loadAndReplaceImages() {
  console.log('[Reader] Trying to load images from IndexedDB, key:', imageStorageKey);
  
  var article = document.getElementById('articleContent');
  var images = article.querySelectorAll('img');
  console.log('[Reader] Found', images.length, 'images on page');
  
  // Try to load from IndexedDB via background first
  if (!imageStorageKey) {
    console.log('[Reader] No imageStorageKey, trying to fetch with cookies');
    fetchImagesWithCookies(images);
    return;
  }
  
  // Fetch images from background (IndexedDB)
  chrome.runtime.sendMessage({ action: 'getImages' }, function(response) {
    if (!response || !response.success || !response.images) {
      console.log('[Reader] No images from IndexedDB, trying storage fallback');
      // Fallback to chrome.storage.local
      chrome.storage.local.get(imageStorageKey, function(result) {
        var imageMap = result[imageStorageKey];
        if (!imageMap || Object.keys(imageMap).length === 0) {
          console.log('[Reader] No base64 in storage, trying to fetch with cookies');
          fetchImagesWithCookies(images);
          return;
        }
        replaceImages(images, imageMap);
      });
      return;
    }
    
    var imageMap = response.images;
    var count = Object.keys(imageMap).length;
    console.log('[Reader] Found', count, 'base64 images from IndexedDB');
    
    if (count === 0) {
      console.log('[Reader] No images in IndexedDB, trying to fetch with cookies');
      fetchImagesWithCookies(images);
      return;
    }
    
    replaceImages(images, imageMap);
  });
}

// Replace images with base64 from the image map
function replaceImages(images, imageMap) {
  var replaced = 0;
  images.forEach(function(img) {
    var src = img.getAttribute('src');
    if (src && imageMap[src]) {
      var newSrc = imageMap[src];
      img.setAttribute('src', newSrc);
      console.log('[Reader] Replaced with base64:', src.substring(0, 50));
      replaced++;
    } else {
      console.log('[Reader] Not matched:', src ? src.substring(0, 30) : 'null');
    }
  });
  
  console.log('[Reader] Replaced', replaced, 'images with base64');
  
  // If not all images replaced, try with cookies
  if (replaced < images.length) {
    fetchImagesWithCookies(images);
  }
}

// Fetch images using cookies from the original domain and CDN domains
function fetchImagesWithCookies(images) {
  console.log('[Reader] Fetching images with cookies...');
  
  // Get the source domain from page URL
  if (!currentUrl) {
    console.log('[Reader] No currentUrl, cannot fetch with cookies');
    return;
  }
  
  var mainDomain;
  try {
    mainDomain = new URL(currentUrl).hostname;
  } catch (e) {
    console.log('[Reader] Invalid URL:', currentUrl);
    return;
  }
  
  // Collect all unique domains from image URLs
  var domains = [mainDomain];
  images.forEach(function(img) {
    var src = img.getAttribute('src');
    if (!src || src.startsWith('data:')) return;
    try {
      var imgDomain = new URL(src).hostname;
      if (!domains.includes(imgDomain)) {
        domains.push(imgDomain);
      }
    } catch (e) {
      // Invalid URL, skip
    }
  });
  
  console.log('[Reader] Getting cookies for domains:', domains);
  
  // Get cookies for all domains
  var allCookies = [];
  var pending = domains.length;
  
  domains.forEach(function(domain) {
    chrome.cookies.getAll({ domain: domain }, function(cookies) {
      if (cookies && cookies.length > 0) {
        console.log('[Reader] Found', cookies.length, 'cookies for', domain);
        allCookies = allCookies.concat(cookies);
      } else {
        console.log('[Reader] No cookies found for', domain);
      }
      pending--;
      if (pending === 0) {
        // All domains processed, now fetch images
        if (allCookies.length === 0) {
          console.log('[Reader] No cookies found for any domain');
          return;
        }
        
        console.log('[Reader] Total cookies:', allCookies.length);
        
        // Build cookie header
        var cookieHeader = allCookies.map(function(c) {
          return c.name + '=' + c.value;
        }).join('; ');
        
        // Fetch images with cookies
        var count = 0;
        images.forEach(function(img) {
          var src = img.getAttribute('src');
          if (!src || src.startsWith('data:')) return;
          
          fetch(src, {
            method: 'GET',
            headers: {
              'Cookie': cookieHeader,
              'Referer': currentUrl,
              'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
          })
          .then(function(response) {
            if (!response.ok) {
              console.log('[Reader] Fetch failed:', response.status, src.substring(0, 50));
              return;
            }
            return response.blob();
          })
          .then(function(blob) {
            if (!blob) return;
            var reader = new FileReader();
            reader.onload = function() {
              img.setAttribute('src', reader.result);
              console.log('[Reader] Loaded with cookies:', src.substring(0, 50));
              count++;
            };
            reader.readAsDataURL(blob);
          })
          .catch(function(e) {
            console.log('[Reader] Fetch error:', e.message, src.substring(0, 50));
          });
        });
      }
    });
  });
}

function fixRelativeImageUrls(html, baseUrl) {
  console.log('[Reader] fixRelativeImageUrls called, baseUrl:', baseUrl);
  
  try {
    var base = new URL(baseUrl);
    var processed = 0;
    var result = html.replace(/<img[^>]+src=["']([^"']+)["'][^>]*>/gi, function(match, src) {
      console.log('[Reader] Found img src:', src);
      processed++;
      
      // Already has full URL
      if (src.startsWith('http://') || src.startsWith('https://') || src.startsWith('data:')) {
        console.log('[Reader] Already has full URL');
        return match;
      }
      
      // Protocol-relative URL (//cdnfile.sspai.com/...)
      if (src.startsWith('//')) {
        var fixed = match.replace(src, 'https:' + src);
        console.log('[Reader] Fixed protocol-relative:', src, '->', 'https:' + src);
        return fixed;
      }
      
      // Absolute path (/2026/02/10/...)
      if (src.startsWith('/')) {
        var newSrc = base.origin + src;
        var fixed = match.replace(src, newSrc);
        console.log('[Reader] Fixed absolute path:', src, '->', newSrc);
        return fixed;
      }
      
      // Relative path
      try {
        var absoluteUrl = new URL(src, base.href).href;
        var fixed = match.replace(src, absoluteUrl);
        console.log('[Reader] Fixed relative:', src, '->', absoluteUrl);
        return fixed;
      } catch (e) {
        console.log('[Reader] Failed to fix:', src);
        return match;
      }
    });
    console.log('[Reader] Processed', processed, 'images');
    return result;
  } catch (e) {
    console.log('[Reader] fixRelativeImageUrls error:', e);
    return html;
  }
}

function initTheme() {
  var savedTheme = localStorage.getItem(STORAGE_KEYS.READER_THEME) || 'light';
  setTheme(savedTheme);

  document.querySelectorAll('.theme-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      setTheme(btn.dataset.theme);
    });
  });
}

function setTheme(theme) {
  document.body.className = 'theme-' + theme;
  localStorage.setItem(STORAGE_KEYS.READER_THEME, theme);

  document.querySelectorAll('.theme-btn').forEach(function(btn) {
    btn.classList.toggle('active', btn.dataset.theme === theme);
  });
}

function initFontSize() {
  var savedSize = parseInt(localStorage.getItem(STORAGE_KEYS.READER_FONT_SIZE)) || DEFAULT_FONT_SIZE;
  setFontSize(savedSize);

  document.getElementById('decreaseFontBtn').addEventListener('click', function() {
    var currentSize = getCurrentFontSize();
    if (currentSize > 12) {
      setFontSize(currentSize - 2);
    }
  });

  document.getElementById('increaseFontBtn').addEventListener('click', function() {
    var currentSize = getCurrentFontSize();
    if (currentSize < 24) {
      setFontSize(currentSize + 2);
    }
  });
}

function getCurrentFontSize() {
  var article = document.getElementById('articleContent');
  return parseInt(window.getComputedStyle(article).fontSize) || DEFAULT_FONT_SIZE;
}

function setFontSize(size) {
  var article = document.getElementById('articleContent');
  article.style.fontSize = size + 'px';
  document.getElementById('fontSizeDisplay').textContent = size + 'px';
  localStorage.setItem(STORAGE_KEYS.READER_FONT_SIZE, size);
}

function initReadingProgress() {
  var progressEl = document.getElementById('readingProgress');

  function updateProgress() {
    var scrollTop = window.scrollY;
    var docHeight = document.documentElement.scrollHeight - window.innerHeight;
    var progress = docHeight > 0 ? Math.round((scrollTop / docHeight) * 100) : 0;
    progressEl.textContent = progress + '%';

    if (currentUrl) {
      localStorage.setItem(STORAGE_KEYS.READER_PROGRESS + getUrlHash(currentUrl), progress);
    }
  }

  window.addEventListener('scroll', updateProgress);

  if (currentUrl) {
    var savedProgress = parseInt(localStorage.getItem(STORAGE_KEYS.READER_PROGRESS + getUrlHash(currentUrl))) || 0;
    if (savedProgress > 0) {
      setTimeout(function() {
        var docHeight = document.documentElement.scrollHeight - window.innerHeight;
        window.scrollTo(0, (savedProgress / 100) * docHeight);
      }, 100);
    }
  }

  updateProgress();
}

function getUrlHash(url) {
  var hash = 0;
  for (var i = 0; i < url.length; i++) {
    var char = url.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

function initToc() {
  var toggleBtn = document.getElementById('toggleTocBtn');
  var closeBtn = document.getElementById('closeTocBtn');
  var sidebar = document.getElementById('tocSidebar');

  toggleBtn.addEventListener('click', function() {
    sidebar.classList.toggle('hidden');
  });

  closeBtn.addEventListener('click', function() {
    sidebar.classList.add('hidden');
  });

  generateToc();
}

function generateToc() {
  var tocList = document.getElementById('tocList');
  var articleBody = document.querySelector('.article-body');

  if (!articleBody) {
    tocList.innerHTML = '<div class="toc-empty">No content</div>';
    return;
  }

  var headings = articleBody.querySelectorAll('h1, h2, h3, h4, h5, h6');
  if (headings.length === 0) {
    tocList.innerHTML = '<div class="toc-empty">No headings found</div>';
    return;
  }

  var html = '';
  var currentLevel = 1;

  headings.forEach(function(heading, index) {
    var level = parseInt(heading.tagName.substring(1));
    var text = heading.textContent.trim();

    if (!text) return;

    if (!heading.id) {
      heading.id = 'heading-' + index;
    }

    if (level > currentLevel) {
      for (var i = currentLevel; i < level; i++) {
        html += '<ul class="toc-sublist">';
      }
    } else if (level < currentLevel) {
      for (var i = level; i < currentLevel; i++) {
        html += '</ul>';
      }
    }

    html += '<li class="toc-item toc-level-' + level + '">';
    html += '<a href="#' + heading.id + '" data-target="' + heading.id + '">' + escapeHtml(text) + '</a>';
    html += '</li>';

    currentLevel = level;
  });

  while (currentLevel > 1) {
    html += '</ul>';
    currentLevel--;
  }

  tocList.innerHTML = html;

  tocList.querySelectorAll('a').forEach(function(link) {
    link.addEventListener('click', function(e) {
      e.preventDefault();
      var targetId = link.dataset.target;
      var targetEl = document.getElementById(targetId);
      if (targetEl) {
        targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
        document.getElementById('tocSidebar').classList.add('hidden');
      }
    });
  });
}

function initClipFunction() {
  var clipBtn = document.getElementById('clipBtn');
  var clipStatus = document.getElementById('clipStatus');
  var clipStatusText = document.getElementById('clipStatusText');

  clipBtn.addEventListener('click', function() {
    if (!pageData) {
      showClipStatus('No content to clip', 'error');
      return;
    }

    try {
      showClipStatus('Clipping...', 'loading');
      clipBtn.disabled = true;

      var markdown = generateMarkdown();

      loadSettingsAsync(function(settings) {
        chrome.runtime.sendMessage({
          action: 'saveToObsidian',
          note: {
            filename: sanitizeFilename(pageData.title || 'Untitled'),
            content: markdown
          },
          settings: settings
        }, function(result) {
          if (result.success) {
            showClipStatus('Clipped successfully!', 'success');
          } else {
            showClipStatus('Failed: ' + (result.error || 'Unknown error'), 'error');
          }
          clipBtn.disabled = false;
          setTimeout(function() {
            clipStatus.classList.add('hidden');
          }, 3000);
        });
      });

    } catch (error) {
      showClipStatus('Error: ' + error.message, 'error');
      clipBtn.disabled = false;
    }
  });
}

function loadSettingsAsync(callback) {
  var defaults = {
    apiUrl: 'https://127.0.0.1:27124',
    apiKey: '',
    targetFolder: 'Clippings',
    includeMetadata: true,
    localizeImages: false
  };

  try {
    chrome.storage.sync.get('clipperSettings', function(result) {
      callback(Object.assign({}, defaults, result.clipperSettings));
    });
  } catch (e) {
    callback(defaults);
  }
}

function generateMarkdown() {
  var markdown = '';

  if (pageData.title) {
    markdown += '---\n';
    markdown += 'title: ' + escapeYaml(pageData.title) + '\n';
    markdown += 'url: ' + (pageData.url || '') + '\n';
    if (pageData.byline) markdown += 'author: ' + escapeYaml(pageData.byline) + '\n';
    if (pageData.siteName) markdown += 'site: ' + escapeYaml(pageData.siteName) + '\n';
    markdown += 'reader_mode: true\n';
    markdown += '---\n\n';
  }

  markdown += '# ' + (pageData.title || 'Untitled') + '\n\n';

  if (pageData.siteName || pageData.url) {
    var hostname = pageData.url ? new URL(pageData.url).hostname : '';
    markdown += '> Source: [' + (pageData.siteName || hostname) + '](' + (pageData.url || '') + ')\n';
    if (pageData.byline) markdown += '> Author: ' + pageData.byline + '\n';
    markdown += '\n';
  }

  markdown += '## Content\n\n';
  markdown += htmlToMarkdown(pageData.content || '');

  return markdown;
}

function htmlToMarkdown(html) {
  var temp = document.createElement('div');
  temp.innerHTML = html;
  var markdown = temp.innerHTML;

  markdown = markdown.replace(/<h1[^>]*>(.*?)<\/h1>/gi, '# $1\n\n');
  markdown = markdown.replace(/<h2[^>]*>(.*?)<\/h2>/gi, '## $1\n\n');
  markdown = markdown.replace(/<h3[^>]*>(.*?)<\/h3>/gi, '### $1\n\n');
  markdown = markdown.replace(/<h4[^>]*>(.*?)<\/h4>/gi, '#### $1\n\n');
  markdown = markdown.replace(/<h5[^>]*>(.*?)<\/h5>/gi, '##### $1\n\n');
  markdown = markdown.replace(/<h6[^>]*>(.*?)<\/h6>/gi, '###### $1\n\n');

  markdown = markdown.replace(/<strong[^>]*>(.*?)<\/strong>/gi, '**$1**');
  markdown = markdown.replace(/<b[^>]*>(.*?)<\/b>/gi, '**$1**');
  markdown = markdown.replace(/<em[^>]*>(.*?)<\/em>/gi, '*$1*');
  markdown = markdown.replace(/<i[^>]*>(.*?)<\/i>/gi, '*$1*');

  markdown = markdown.replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, '[$2]($1)');
  markdown = markdown.replace(/<img[^>]*src="([^"]*)"[^>]*>/gi, '![]($1)');

  markdown = markdown.replace(/<blockquote[^>]*>(.*?)<\/blockquote>/gi, '> $1\n\n');
  markdown = markdown.replace(/<pre[^>]*><code[^>]*>(.*?)<\/code><\/pre>/gi, '```\n$1\n```\n');
  markdown = markdown.replace(/<code[^>]*>(.*?)<\/code>/gi, '`$1`');

  markdown = markdown.replace(/<li[^>]*>(.*?)<\/li>/gi, '- $1\n');
  markdown = markdown.replace(/<ul[^>]*>(.*?)<\/ul>/gi, '$1');
  markdown = markdown.replace(/<ol[^>]*>(.*?)<\/ol>/gi, '$1');
  markdown = markdown.replace(/<\/li>/g, '\n');

  markdown = markdown.replace(/<p[^>]*>(.*?)<\/p>/gi, '$1\n\n');
  markdown = markdown.replace(/<br\s*\/?>/gi, '\n');

  markdown = markdown.replace(/<[^>]+>/g, '');

  markdown = markdown.replace(/&nbsp;/g, ' ');
  markdown = markdown.replace(/&amp;/g, '&');
  markdown = markdown.replace(/&lt;/g, '<');
  markdown = markdown.replace(/&gt;/g, '>');
  markdown = markdown.replace(/&quot;/g, '"');

  markdown = markdown.replace(/\n{3,}/g, '\n\n');

  return markdown.trim();
}

function showClipStatus(message, type) {
  var clipStatus = document.getElementById('clipStatus');
  var clipStatusText = document.getElementById('clipStatusText');

  clipStatusText.textContent = message;
  clipStatus.className = 'clip-status ' + type;
  clipStatus.classList.remove('hidden');
}

function showError(message) {
  var article = document.getElementById('articleContent');
  article.innerHTML = '<div class="error-message">' + escapeHtml(message) + '</div>';
}

function escapeHtml(text) {
  var div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function escapeYaml(text) {
  return text.replace(/[|>&]/g, '').trim();
}

function sanitizeFilename(title) {
  var filename = title.replace(/[<>:"/\\|?*]/g, '').trim();
  filename = filename.replace(/\s+/g, '-');
  return filename || 'Untitled';
}
