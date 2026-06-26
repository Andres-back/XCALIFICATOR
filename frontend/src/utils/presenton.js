export async function openPresentonEditorWithSession(presentation) {
  const directUrl = presentation?.edit_url;
  if (!presentation?.id && !directUrl) return null;

  if (presentation?.id) {
    const bridgeUrl = `/profesor/presentaciones/${presentation.id}/editor`;
    window.open(bridgeUrl, '_blank', 'noopener,noreferrer');
    return bridgeUrl;
  }

  window.open(directUrl, '_blank', 'noopener,noreferrer');
  return directUrl;
}
