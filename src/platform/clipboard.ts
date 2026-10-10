/**
 * Puts text on the clipboard. Resolves to false when the browser refuses, for
 * example because the page is not focused, so the caller can say so (PB-012).
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
