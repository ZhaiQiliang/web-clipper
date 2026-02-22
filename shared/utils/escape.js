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

module.exports = {
  escapeHtml,
  sanitizeFilename,
  escapeYaml,
  stripHtml
};
