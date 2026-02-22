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

module.exports = {
  formatDate,
  formatDateSimple
};
