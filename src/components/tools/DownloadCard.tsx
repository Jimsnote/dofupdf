import { Download, FileCheck2 } from 'lucide-react';

interface DownloadCardProps {
  fileName: string;
  sizeBytes: number;
  url: string;
  title: string;
  downloadLabel: string;
}

/** Human-readable file size, e.g. `842 KB` or `2.4 MB`. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 'B';
  for (const next of units) {
    if (value < 1024) break;
    value /= 1024;
    unit = next;
  }
  return `${value.toFixed(1)} ${unit}`;
}

/** Result card shown after processing: file name, size, and download link. */
export function DownloadCard({ fileName, sizeBytes, url, title, downloadLabel }: DownloadCardProps) {
  return (
    <div className="flex flex-col items-start justify-between gap-4 rounded-xl border border-green-200 bg-green-50 p-5 sm:flex-row sm:items-center">
      <div className="flex items-center gap-3">
        <FileCheck2 className="h-8 w-8 shrink-0 text-green-600" aria-hidden />
        <div>
          <p className="font-semibold text-slate-900">{title}</p>
          <p className="text-sm text-slate-600">
            {fileName} · {formatBytes(sizeBytes)}
          </p>
        </div>
      </div>
      <a
        href={url}
        download={fileName}
        className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-700"
      >
        <Download className="h-4 w-4" aria-hidden />
        {downloadLabel}
      </a>
    </div>
  );
}
