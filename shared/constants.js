// Web Clipper Constants
// Centralized configuration to avoid hardcoded values

const CONFIG = {
  // API Configuration
  DEFAULT_API_URL: 'https://127.0.0.1:27124',
  API_TIMEOUT: 10000,

  // Storage Keys
  STORAGE_KEYS: {
    SETTINGS: 'clipperSettings',
    TAGS_HISTORY: 'tagsHistory'
  },

  // Default Settings
  DEFAULTS: {
    FOLDER: 'Clippings',
    TAG: 'web-clip',
    INCLUDE_METADATA: true
  },

  // Tags Configuration
  TAGS: {
    MAX_HISTORY: 100,
    SUGGESTIONS_COUNT: 8,
    DEBOUNCE_DELAY: 150
  },

  // Image Localization
  IMAGES: {
    ENABLED: true,
    ATTACHMENTS_FOLDER: 'attachments',
    MAX_SIZE_MB: 10,
    ALLOWED_TYPES: ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'],
    TIMEOUT: 15000,
    MAX_CONCURRENT: 3
  },

  // Content Extraction
  CONTENT: {
    MAX_TEXT_LENGTH: 10000,
    MIN_CONTENT_LENGTH: 200,
    MAX_FILENAME_LENGTH: 100,
    CONTENT_SELECTORS: [
      'article',
      '[role="main"]',
      'main',
      '.post-content',
      '.article-content',
      '.entry-content',
      '.content',
      '#content'
    ],
    AUTHOR_SELECTORS: [
      'meta[name="author"]',
      'meta[property="article:author"]',
      '.author',
      '.byline',
      '[rel="author"]'
    ],
    TIME_SELECTORS: [
      'meta[property="article:published_time"]',
      'meta[name="publishdate"]',
      'meta[name="date"]',
      'time[datetime]'
    ]
  },

  // Error Messages (with help text for better user experience)
  ERRORS: {
    CONNECTION_FAILED: 'Cannot connect to Obsidian. Please ensure Obsidian is running with Local REST API plugin enabled.',
    AUTH_FAILED: 'Authentication failed. Please check your API key in Settings.',
    EXTRACTION_FAILED: 'Failed to extract content. This page may not support clipping.',
    SAVE_FAILED: 'Failed to save to Obsidian. Please try again.',
    TIMEOUT: 'Request timed out. Please check your network connection.',
    FOLDER_NOT_FOUND: 'Target folder not found. Please create it in Obsidian first.',
    INVALID_URL: 'Invalid API URL. Please check your settings.',
    PAGE_NOT_SUPPORTED: 'This page cannot be clipped (e.g., chrome://, about:).'
  },

  // Status Messages
  STATUS: {
    EXTRACTING: 'Extracting content...',
    GENERATING: 'Generating Markdown...',
    SAVING: 'Saving to Obsidian...',
    SUCCESS: 'Saved successfully!',
    READY: 'Ready to clip',
    SETTINGS_SAVED: 'Settings saved!'
  }
};

// Export for use in different contexts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = CONFIG;
}
