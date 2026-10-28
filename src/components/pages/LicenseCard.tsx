'use client';

import { useState } from 'react';
import { CheckCircle2, KeyRound, Loader2 } from 'lucide-react';
import type { Dictionary } from '@/i18n/locales/ja';
import { activateLicense, deactivateLicense } from '@/lib/license';
import { useProStatus } from '@/components/tools/use-pro-status';

interface LicenseCardProps {
  dict: Dictionary;
}

/**
 * License key registration card on /pricing/. Activate / deactivate this
 * device against the worker proxy; the key is the only thing that travels.
 */
export function LicenseCard({ dict }: LicenseCardProps) {
  const copy = dict.pricing;
  const { pro, demo, loading } = useProStatus();
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function activate() {
    setBusy(true);
    setError(null);
    const result = await activateLicense(key);
    if (!result.ok) {
      setError(result.error === 'network' ? copy.licenseNetworkError : copy.licenseInvalid);
    }
    setBusy(false);
  }

  async function deactivate() {
    setBusy(true);
    await deactivateLicense();
    setBusy(false);
  }

  return (
    <div
      id="license"
      className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8"
    >
      <h2 className="flex items-center gap-2 text-xl font-bold tracking-tight text-slate-900">
        <KeyRound className="h-5 w-5 text-brand-600" aria-hidden />
        {copy.licenseHeading}
        {demo ? (
          <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
            {dict.pro.demoBadge}
          </span>
        ) : null}
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-slate-600">{copy.licenseHint}</p>

      <p className="mt-4 flex items-center gap-2 text-sm font-semibold">
        {loading ? null : pro ? (
          <span className="inline-flex items-center gap-1.5 text-emerald-700">
            <CheckCircle2 className="h-4 w-4" aria-hidden />
            {copy.licenseActive}
          </span>
        ) : (
          <span className="text-slate-500">{copy.licenseInactive}</span>
        )}
      </p>

      {pro ? (
        <button
          type="button"
          onClick={() => void deactivate()}
          disabled={busy}
          className="mt-4 inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
          {copy.licenseDeactivate}
        </button>
      ) : (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder={copy.licensePlaceholder}
            autoComplete="off"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm sm:max-w-xs"
          />
          <button
            type="button"
            onClick={() => void activate()}
            disabled={busy || !key.trim()}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-700 disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            {copy.licenseActivate}
          </button>
        </div>
      )}
      {error ? (
        <p role="alert" className="mt-3 rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}
