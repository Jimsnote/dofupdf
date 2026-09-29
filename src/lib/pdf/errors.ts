/**
 * Shared error classification for the client-side PDF tools. Processing
 * functions in `src/lib/pdf/` throw raw pdf-lib errors; the UI layer maps
 * them to localized messages through these codes.
 */
export type PdfErrorCode = 'encrypted' | 'corrupted' | 'generic';

/** Error carrying a stable code the UI can translate. */
export class PdfToolError extends Error {
  constructor(
    public readonly code: string,
    message?: string,
  ) {
    super(message ?? code);
    this.name = 'PdfToolError';
  }
}

/**
 * Maps an unknown thrown value (typically from `PDFDocument.load`) to a
 * `PdfErrorCode`. Encrypted PDFs are detected via pdf-lib's error name and
 * message — and via pdf.js's `PasswordException`, thrown when a document
 * needs a password before it can even be rendered; anything that fails to
 * parse is treated as corrupted.
 */
export function classifyPdfError(err: unknown): PdfErrorCode {
  if (err instanceof PdfToolError) return 'generic';
  const name = err instanceof Error ? err.name : '';
  const message = err instanceof Error ? err.message : String(err);
  if (
    name === 'EncryptedPDFError' ||
    name === 'PasswordException' ||
    /encrypt/i.test(message) ||
    /password/i.test(message)
  ) {
    return 'encrypted';
  }
  if (/invalid|parse|corrupt|PDF header|not a PDF|trailer/i.test(message)) return 'corrupted';
  return 'generic';
}
