'use client';

import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { CloudUpload } from 'lucide-react';
import type { Dictionary } from '@/i18n/locales/ja';
import { takeHandoff } from '@/lib/tool-handoff';
import { UploadMeter } from './UploadMeter';

export type AcceptedKind = 'pdf' | 'images' | 'docx' | 'excel' | 'heic';

interface FileDropzoneProps {
  accept: AcceptedKind;
  multiple?: boolean;
  /** Maximum total number of files, including the ones already selected. */
  maxFiles: number;
  /** Number of files already selected. */
  currentCount: number;
  /** Per-file size limit in bytes. */
  maxSizeBytes: number;
  /** Ignore new files while the parent is busy processing. */
  disabled?: boolean;
  onFiles: (files: File[]) => void;
  dict: Dictionary;
}

function isAccepted(file: File, accept: AcceptedKind): boolean {
  const name = file.name.toLowerCase();
  if (accept === 'pdf') return file.type === 'application/pdf' || name.endsWith('.pdf');
  if (accept === 'docx') return name.endsWith('.docx');
  if (accept === 'excel') return /\.(xlsx|xls)$/.test(name);
  if (accept === 'heic') {
    return (
      file.type === 'image/heic' || file.type === 'image/heif' || /\.(heic|heif)$/.test(name)
    );
  }
  return file.type === 'image/jpeg' || file.type === 'image/png' || /\.(jpe?g|png)$/.test(name);
}

/**
 * Drag-and-drop area with click-to-browse fallback. Validates type, size,
 * and file count before handing valid files to the parent; violations are
 * shown as localized error text below the dropzone. A mixed drop keeps the
 * supported files and reports how many were skipped, instead of rejecting
 * the whole batch.
 */
export function FileDropzone({
  accept,
  multiple = true,
  maxFiles,
  currentCount,
  maxSizeBytes,
  disabled = false,
  onFiles,
  dict,
}: FileDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toolUi } = dict;

  // 工具链接力接收侧：URL 带 ?from=handoff 时，从 IndexedDB 取出上一个工具的
  // 结果文件并自动载入（一次性消费），让用户免重新上传。仅 PDF 工具参与。
  useEffect(() => {
    if (accept !== 'pdf') return;
    if (new URLSearchParams(window.location.search).get('from') !== 'handoff') return;
    let cancelled = false;
    takeHandoff()
      .then((entry) => {
        if (!entry || cancelled) return;
        onFiles([new File([entry.blob], entry.name, { type: 'application/pdf' })]);
        window.history.replaceState(null, '', window.location.pathname);
      })
      .catch(() => {
        // IndexedDB 不可用等场景下静默降级为普通上传流程
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 仅在挂载时执行一次
  }, []);
  const copyByKind = {
    pdf: { drop: toolUi.dropPdfs, only: toolUi.errors.onlyPdf, acceptAttr: '.pdf,application/pdf' },
    images: {
      drop: toolUi.dropImages,
      only: toolUi.errors.onlyImages,
      acceptAttr: '.jpg,.jpeg,.png,image/jpeg,image/png',
    },
    docx: {
      drop: toolUi.dropDocx,
      only: toolUi.errors.onlyDocx,
      acceptAttr: '.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    },
    excel: {
      drop: toolUi.dropExcel,
      only: toolUi.errors.onlyExcel,
      acceptAttr: '.xlsx,.xls',
    },
    heic: {
      drop: toolUi.dropHeic,
      only: toolUi.errors.onlyHeic,
      acceptAttr: '.heic,.heif,image/heic,image/heif',
    },
  }[accept];

  function handleIncoming(incoming: File[]) {
    if (disabled || incoming.length === 0) return;
    setError(null);
    const valid = incoming.filter((file) => isAccepted(file, accept));
    const skipped = incoming.length - valid.length;
    if (valid.length === 0) {
      setError(copyByKind.only);
      return;
    }
    const messages: string[] = [];
    if (skipped > 0) {
      messages.push(toolUi.errors.filesSkipped.replace('{count}', String(skipped)));
    }
    const oversized = valid.find((file) => file.size > maxSizeBytes);
    if (oversized) {
      const maxMb = Math.round(maxSizeBytes / (1024 * 1024));
      messages.push(
        toolUi.errors.fileTooLarge
          .replace('{name}', oversized.name)
          .replace('{max}', String(maxMb)),
      );
      setError(messages.join(' '));
      return;
    }
    const capacity = maxFiles - currentCount;
    let accepted = valid;
    if (valid.length > capacity) {
      messages.push(toolUi.errors.tooManyFiles.replace('{max}', String(maxFiles)));
      accepted = valid.slice(0, Math.max(capacity, 0));
    }
    if (messages.length > 0) setError(messages.join(' '));
    if (accepted.length > 0) onFiles(multiple ? accepted : accepted.slice(0, 1));
  }

  function onDrop(event: DragEvent<HTMLButtonElement>) {
    event.preventDefault();
    setDragging(false);
    handleIncoming(Array.from(event.dataTransfer.files));
  }

  function onChange(event: ChangeEvent<HTMLInputElement>) {
    handleIncoming(Array.from(event.target.files ?? []));
    event.target.value = '';
  }

  return (
    <div>
      <button
        type="button"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`flex w-full flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-12 text-center transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
          dragging
            ? 'border-brand-500 bg-brand-50'
            : 'border-slate-300 bg-slate-50 hover:border-brand-400 hover:bg-brand-50'
        }`}
      >
        <CloudUpload className="h-10 w-10 text-brand-600" aria-hidden />
        <span className="text-sm font-medium text-slate-700">{copyByKind.drop}</span>
      </button>
      <input
        ref={inputRef}
        type="file"
        hidden
        multiple={multiple}
        accept={copyByKind.acceptAttr}
        onChange={onChange}
      />
      <UploadMeter label={toolUi.sessionUpload} />
      {error ? (
        <p role="alert" className="mt-3 rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}
