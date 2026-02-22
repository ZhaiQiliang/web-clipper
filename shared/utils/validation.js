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

module.exports = {
  isValidUrl,
  isValidFolderPath
};
