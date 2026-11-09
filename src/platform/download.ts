/**
 * Hands a file to the browser's own download, from a PromoBase page. Needs no
 * permission: the file is made in the page and never leaves the computer.
 */
export function downloadFile(name: string, text: string, type = 'application/json'): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  // The download has its own copy once it has started.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
