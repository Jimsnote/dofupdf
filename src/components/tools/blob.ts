/**
 * Wraps generated PDF bytes in a downloadable Blob. The caller owns `bytes`
 * (freshly produced by pdf-lib), so the Blob can share the underlying
 * ArrayBuffer instead of paying for another full copy. A view onto a larger
 * pooled buffer still gets sliced down to its exact region.
 */
export function pdfBlob(bytes: Uint8Array): Blob {
  const buffer =
    bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength
      ? (bytes.buffer as ArrayBuffer)
      : (bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
  return new Blob([buffer], { type: 'application/pdf' });
}
