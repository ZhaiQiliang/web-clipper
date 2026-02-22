// Markdown generation utilities
// Shared functions for generating markdown content

let turndownInstance = null;

function getTurndownService() {
  if (!turndownInstance && typeof TurndownService !== 'undefined') {
    turndownInstance = new TurndownService({
      headingStyle: 'atx',
      codeBlockStyle: 'fenced',
      emDelimiter: '*'
    });

    turndownInstance.addRule('pre', {
      filter: 'pre',
      replacement: function(content, node) {
        const code = node.querySelector('code');
        const language = code?.className.match(/language-(\w+)/)?.[1] || '';
        return `\n\`\`\`${language}\n${content.trim()}\n\`\`\`\n`;
      }
    });

    turndownInstance.remove(['script', 'style', 'noscript']);
  }
  return turndownInstance;
}

function htmlToMarkdown(html) {
  const service = getTurndownService();
  if (!service) {
    const temp = document.createElement('div');
    temp.innerHTML = html;
    return temp.textContent || temp.innerText || '';
  }
  return service.turndown(html);
}

function generateMarkdown(content, settings, customTags = [], userNotes = '') {
  const { includeMetadata } = settings;
  let markdown = '';

  const allTags = [CONFIG.DEFAULTS.TAG, ...customTags];

  if (includeMetadata) {
    markdown += buildFrontmatter(content, settings, allTags);
  }

  markdown += buildMarkdownHeader(content, formatDate);

  if (userNotes) {
    markdown += `## My Notes\n\n${userNotes}\n\n`;
  }

  if (content.excerpt) {
    markdown += `## Summary\n\n${content.excerpt}\n\n`;
  }

  markdown += '## Content\n\n';
  markdown += htmlToMarkdown(content.content);

  return markdown;
}

function replaceImageUrlsInFinalMarkdown(markdown, imageResults) {
  if (!imageResults || imageResults.length === 0) {
    return markdown;
  }

  let result = markdown;
  const downloadedImages = imageResults.filter(img => img.success && img.originalSrc);

  for (const img of downloadedImages) {
    const localFilename = img.relativePath.split('/').pop();
    const wikiLink = `![[${localFilename}]]`;

    const escapedUrl = img.originalSrc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    let pattern = new RegExp('!\\[([^\\]]*)\\]\\(' + escapedUrl + '\\)', 'gi');
    result = result.replace(pattern, wikiLink);

    pattern = new RegExp('!\\[\\[([^\\]]+)\\]\\]\\(' + escapedUrl + '\\)', 'gi');
    result = result.replace(pattern, wikiLink);

    const urlParts = img.originalSrc.split('/');
    const urlFilename = urlParts[urlParts.length - 1];
    if (urlFilename) {
      const partialPattern = new RegExp('!\\[.*' + urlFilename.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '.*\\]\\([^)]+\\)', 'gi');
      result = result.replace(partialPattern, wikiLink);
    }
  }

  return result;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    getTurndownService,
    htmlToMarkdown,
    generateMarkdown,
    replaceImageUrlsInFinalMarkdown
  };
}
