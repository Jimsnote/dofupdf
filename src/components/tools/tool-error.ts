import type { Dictionary } from '@/i18n/locales/ja';
import { classifyPdfError, PdfToolError } from '@/lib/pdf/errors';

/**
 * Maps any error thrown during processing to a localized, user-facing
 * message from `dict.toolUi.errors`.
 */
export function toolErrorMessage(err: unknown, dict: Dictionary): string {
  const { errors } = dict.toolUi;
  // A failed lazy-chunk download is a network problem, not a file problem —
  // tell the user to retry instead of blaming the document.
  if (
    err instanceof TypeError &&
    /dynamically imported module|Loading chunk|Importing a module script failed/i.test(
      err.message,
    )
  ) {
    return errors.engineDownload;
  }
  if (err instanceof PdfToolError) {
    if (err.code === 'invalidRange') return errors.invalidRange;
    if (err.code === 'rangeOutOfBounds') return errors.rangeOutOfBounds;
    if (err.code === 'noPages') return errors.noPages;
    if (err.code === 'encrypted') return errors.encrypted;
    if (err.code === 'no-images') return errors.noImages;
    if (err.code === 'corruptedFile') return errors.corruptedFile;
    if (err.code === 'corrupted') return errors.corrupted;
    if (err.code === 'wrong-password') return errors.wrongPassword;
    if (err.code === 'not-encrypted') return errors.notEncrypted;
    if (err.code === 'no-text') return errors.noText;
    // The limit is carried in the error message by the throwing lib.
    if (err.code === 'tooManyPages') return errors.tooManyPages.replace('{max}', err.message);
    return errors.generic;
  }
  return errors[classifyPdfError(err)];
}
