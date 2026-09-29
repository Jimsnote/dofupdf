import type { ReactNode } from 'react';
import { Check, Lock } from 'lucide-react';

interface ToolShellProps {
  title: string;
  intro: string;
  /** Trust badges shown right under the intro (e.g. No uploads / Runs locally). */
  chips?: string[];
  /** Fixed privacy line shown directly under the upload area. */
  privacyNote: string;
  /** Upload area (FileDropzone plus any file list). */
  upload: ReactNode;
  /** Tool-specific options (modes, angles, selects). */
  options?: ReactNode;
  /** The process button. */
  action: ReactNode;
  /** Progress / error feedback. */
  status?: ReactNode;
  /** Result download card. */
  result?: ReactNode;
}

/**
 * Shared layout for every tool page's interactive block: H1 + intro, upload
 * area, a fixed privacy note, then slots for options, the action button,
 * status messages, and the result card.
 */
export function ToolShell({
  title,
  intro,
  chips,
  privacyNote,
  upload,
  options,
  action,
  status,
  result,
}: ToolShellProps) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
      <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">{title}</h1>
      <p className="mt-3 leading-relaxed text-slate-600">{intro}</p>
      {chips && chips.length > 0 ? (
        <ul className="mt-4 flex flex-wrap gap-2" aria-label="Trust badges">
          {chips.map((chip) => (
            <li
              key={chip}
              className="inline-flex items-center gap-1.5 rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700"
            >
              <Check className="h-3.5 w-3.5" aria-hidden />
              {chip}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-8">{upload}</div>
      <p className="mt-4 flex items-center gap-2 text-sm text-slate-500">
        <Lock className="h-4 w-4 shrink-0 text-brand-600" aria-hidden />
        {privacyNote}
      </p>

      {options ? <div className="mt-6">{options}</div> : null}
      <div className="mt-6">{action}</div>
      {status ? <div className="mt-4">{status}</div> : null}
      {result ? <div className="mt-6">{result}</div> : null}
    </section>
  );
}
