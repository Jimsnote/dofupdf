'use client';

import { useState } from 'react';
import Link from 'next/link';
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
 * 处理完成后的"下一步"工具推荐。点击后把结果文件写入 IndexedDB 交接记录
 * （随机 transfer ID＋目标绑定＋24h TTL），再跳转下游工具页
 * （?from=handoff&id=...），由该页的 FileDropzone 自动载入。
 * IndexedDB 不可用时降级为普通链接（跳转后手动上传），并显示本地化提示。
 */
export function ChainNext({ dict, slug, blob, fileName }: ChainNextProps) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [handoffFailed, setHandoffFailed] = useState(false);
  const chain = (TOOL_CHAINS[slug] ?? []).filter((target) => dict.tools[target]);
  if (chain.length === 0) return null;

  function hrefFor(target: keyof Dictionary['tools']): string {
    const segment = window.location.pathname.split('/')[1] ?? '';
    const prefix = isLocale(segment) && segment !== 'ja' ? `/${segment}` : '';
    return `${prefix}/${target}/`;
  }

  async function go(target: keyof Dictionary['tools']) {
    setPending(target);
    try {
      const id = await saveHandoff(blob, fileName, target);
      router.push(`${hrefFor(target)}?from=handoff&id=${id}`);
    } catch {
      // IndexedDB 失敗：交接なしで遷移できるよう、以降は通常リンクに降格する
      setPending(null);
      setHandoffFailed(true);
    }
  }

  return (
    <div className="mt-4">
      <p className="text-sm font-semibold text-slate-900">{dict.toolUi.chainNext}</p>
      {handoffFailed ? (
        <p role="alert" className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {dict.toolUi.errors.handoffFailed}
        </p>
      ) : null}
      <div className="mt-2 flex flex-wrap gap-2">
        {chain.map((target) =>
          handoffFailed ? (
            <Link
              key={target}
              href={hrefFor(target)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-brand-200 bg-white px-3.5 py-2 text-sm font-medium text-brand-700 transition-colors hover:border-brand-400 hover:bg-brand-50"
            >
              <ArrowRight className="h-4 w-4" aria-hidden />
              {dict.tools[target].name}
            </Link>
          ) : (
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
          ),
        )}
      </div>
    </div>
  );
}
