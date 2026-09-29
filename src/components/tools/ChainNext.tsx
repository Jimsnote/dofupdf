'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Loader2 } from 'lucide-react';
import { isLocale } from '@/i18n/config';
import type { Dictionary } from '@/i18n/locales/ja';
import { TOOL_CHAINS } from '@/lib/tool-chains';
import { saveHandoff } from '@/lib/tool-handoff';

interface ChainNextProps {
  dict: Dictionary;
  /** 当前工具的 slug，用于查推荐链。 */
  slug: keyof Dictionary['tools'];
  /** 处理结果（仅单 PDF 结果时渲染本组件）。 */
  blob: Blob;
  fileName: string;
}

/**
 * 处理完成后的"下一步"工具推荐。点击后把结果文件写入 IndexedDB 交接槽，
 * 再跳转下游工具页（?from=handoff），由该页的 FileDropzone 自动载入，
 * 用户无需重新上传。
 */
export function ChainNext({ dict, slug, blob, fileName }: ChainNextProps) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const chain = (TOOL_CHAINS[slug] ?? []).filter((target) => dict.tools[target]);
  if (chain.length === 0) return null;

  async function go(target: keyof Dictionary['tools']) {
    setPending(target);
    try {
      await saveHandoff(blob, fileName);
      const segment = window.location.pathname.split('/')[1] ?? '';
      const prefix = isLocale(segment) && segment !== 'ja' ? `/${segment}` : '';
      router.push(`${prefix}/${target}/?from=handoff`);
    } catch {
      setPending(null);
    }
  }

  return (
    <div className="mt-4">
      <p className="text-sm font-semibold text-slate-900">{dict.toolUi.chainNext}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {chain.map((target) => (
          <button
            key={target}
            type="button"
            disabled={pending !== null}
            onClick={() => go(target)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-brand-200 bg-white px-3.5 py-2 text-sm font-medium text-brand-700 transition-colors hover:border-brand-400 hover:bg-brand-50 disabled:opacity-50"
          >
            {pending === target ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <ArrowRight className="h-4 w-4" aria-hidden />
            )}
            {dict.tools[target].name}
          </button>
        ))}
      </div>
    </div>
  );
}
