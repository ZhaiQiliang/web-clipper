# Web Clipper for Obsidian

A Chrome extension that clips web pages and saves them directly to Obsidian via Local REST API.

## Features

- **Full Page Clipping**: Extract and save entire web articles
- **Selection Clipping**: Save only selected text from a page
- **Markdown Conversion**: Automatically converts HTML to Markdown format
- **Image Localization**: Download and save images locally to your Obsidian vault
- **Tag Management**: Organize clips with tags, with smart suggestions based on history
- **Metadata Support**: Include YAML frontmatter with title, URL, author, and publication date
- **Quick Actions**: Keyboard shortcuts and context menu support

## Installation

1. Clone or download this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" in the top right corner
4. Click "Load unpacked" and select the extension directory

## Configuration

### Obsidian Setup

1. Install the [Local REST API](https://github.com/obsidian-community/obsidian-local-rest-api) plugin in Obsidian
2. Enable the plugin and note the API URL (default: `http://localhost:27123`)
3. Optionally set an API key for authentication

### Extension Settings

Click the extension icon and go to Settings to configure:

- **API URL**: Obsidian Local REST API endpoint
- **API Key**: Authentication key (if required)
- **Default Folder**: Where to save clipped notes (default: `Clippings`)
- **Include YAML frontmatter**: Add metadata to notes
- **Download images locally**: Save images to attachments folder

## Usage

### Clipping a Page

1. Navigate to any web page you want to clip
2. Click the extension icon or use keyboard shortcut `Ctrl+Shift+S`
3. Edit the title, add tags, and optionally add personal notes
4. Click "Clip this page" to save

### Clipping Selected Text

1. Select text on any web page
2. Click the extension icon or use keyboard shortcut `Ctrl+Shift+X`
3. The selected text will be automatically captured

### Using Tags

- Type in the tags input to see suggestions from your history
- Press Enter to add a tag
- Click the × on a tag to remove it
- Manage all tags in the Tags Management view

### Keyboard Shortcuts

- `Ctrl+Shift+S`: Clip full page
- `Ctrl+Shift+X`: Clip selection

### Context Menu

Right-click on any page or selection to use the context menu:
- "Save page to Obsidian"
- "Save selection to Obsidian"

## Project Structure

```
web_clipper/
├── manifest.json          # Extension manifest
├── popup/                 # Extension popup UI
│   ├── popup.html
│   ├── popup.js
│   └── popup.css
├── content/               # Content script
│   └── content.js
├── background/            # Service worker
│   └── service-worker.js
├── shared/                # Shared modules
│   ├── constants.js       # Configuration
│   ├── utils.js          # Utility functions
│   └── markdown.js       # Markdown generation
├── lib/                   # Third-party libraries
│   ├── Readability.js
│   └── turndown.js
└── styles/                # Content styles
    └── content.css
```

## Technologies

- Chrome Extensions (Manifest V3)
- Readability.js for content extraction
- Turndown for HTML to Markdown conversion
- Obsidian Local REST API

## License

MIT
