import { PdfToolError } from '../pdf/errors';

/**
 * Budgets for OOXML/ZIP inputs (docx, xlsx), checked BEFORE the real parser
 * runs: the central directory is read directly (no decompression), and inputs
 * whose declared uncompressed size, entry count, or compression ratio look
 * like a zip bomb are rejected up front so the tab never freezes.
 *
 * Only the ZIP container is budgeted — legacy OLE/CFB files (.doc/.xls,
 * magic D0CF) return early since they are not deflated archives.
 */

/** Total declared uncompressed bytes across all entries. */
const MAX_UNCOMPRESSED_BYTES = 512 * 1024 * 1024;
/** Central-directory entry count. */
const MAX_ENTRIES = 4096;
/** Compressed ratio above which an archive counts as a bomb (when sizable). */
const MAX_RATIO = 100;
/** この展開後サイズを超えて初めて圧縮率を問題にする（小さな高圧縮は許容）。 */
const RATIO_MIN_UNCOMPRESSED = 8 * 1024 * 1024;

const EOCD_SIG = 0x06054b50;
const CEN_SIG = 0x02014b50;

function readU16(view: DataView, offset: number): number {
  return view.getUint16(offset, true);
}
function readU32(view: DataView, offset: number): number {
  return view.getUint32(offset, true);
}

export function isZipContainer(bytes: Uint8Array): boolean {
  return bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b;
}

/**
 * Throws PdfToolError('archive-too-large') when the ZIP's declared layout
 * exceeds the budgets. Does nothing for non-ZIP inputs.
 */
export function assertZipBudget(bytes: Uint8Array): void {
  if (!isZipContainer(bytes)) return;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  // End Of Central Directory: scan the trailing 64 KB (+ comment allowance).
  let eocd = -1;
  const scanFrom = Math.max(0, bytes.length - (64 * 1024 + 22));
  for (let i = bytes.length - 22; i >= scanFrom; i -= 1) {
    if (readU32(view, i) === EOCD_SIG) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new PdfToolError('corruptedFile', 'ZIP end of central directory not found');

  const entryCount = readU16(view, eocd + 10);
  let offset = readU32(view, eocd + 16);
  if (entryCount > MAX_ENTRIES) {
    throw new PdfToolError('archive-too-large', `Too many ZIP entries: ${entryCount}`);
  }

  let totalUncompressed = 0;
  let totalCompressed = 0;
  for (let n = 0; n < entryCount; n += 1) {
    if (offset + 46 > bytes.length || readU32(view, offset) !== CEN_SIG) {
      throw new PdfToolError('corruptedFile', 'Malformed ZIP central directory');
    }
    totalCompressed += readU32(view, offset + 20);
    totalUncompressed += readU32(view, offset + 24);
    const nameLen = readU16(view, offset + 28);
    const extraLen = readU16(view, offset + 30);
    const commentLen = readU16(view, offset + 32);
    offset += 46 + nameLen + extraLen + commentLen;
    if (totalUncompressed > MAX_UNCOMPRESSED_BYTES) {
      throw new PdfToolError(
        'archive-too-large',
        `ZIP expands past the budget: ${totalUncompressed} bytes`,
      );
    }
  }
  if (
    totalUncompressed >= RATIO_MIN_UNCOMPRESSED &&
    totalUncompressed / Math.max(1, totalCompressed) > MAX_RATIO
  ) {
    throw new PdfToolError('archive-too-large', 'ZIP compression ratio looks like a zip bomb');
  }
}
