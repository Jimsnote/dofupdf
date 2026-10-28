'use client';

import { useState, type ReactNode } from 'react';
import type { Dictionary } from '@/i18n/locales/ja';

interface ToolModeSwitchProps {
  dict: Dictionary;
  /** 単一ファイルモード（既存ツール）。 */
  single: ReactNode;
  /** まとめて処理モード（BatchPdfTool）。 */
  batch: ReactNode;
}

/**
 * 単一／まとめて のモード切替。どちらか一方だけが描画されるので、状態は
 * モード間で持ち越されない（切替時にリセット＝旧結果の残留なし）。
 */
export function ToolModeSwitch({ dict, single, batch }: ToolModeSwitchProps) {
  const [mode, setMode] = useState<'single' | 'batch'>('single');
  return (
    <div>
      <div
        role="tablist"
        aria-label={dict.pro.batchMode}
        className="mb-5 inline-flex rounded-lg border border-slate-200 bg-slate-50 p-1"
      >
        {(['single', 'batch'] as const).map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={mode === value}
            onClick={() => setMode(value)}
            className={`rounded-md px-4 py-2 text-sm font-semibold transition-colors ${
              mode === value
                ? 'bg-white text-brand-700 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {value === 'single' ? dict.pro.singleMode : dict.pro.batchMode}
          </button>
        ))}
      </div>
      {mode === 'single' ? single : batch}
    </div>
  );
}
