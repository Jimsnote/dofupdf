import type { Dictionary } from '@/i18n/locales/ja';
import { BreadcrumbJsonLd } from '@/components/seo/BreadcrumbJsonLd';

interface TokushohoPageProps {
  dict: Dictionary;
}

/**
 * /tokushoho/ — 特定商取引法に基づく表記。運営者情報（氏名・所在地・
 * 連絡先）は W2.5 定稿どおり記載済み。
 */
export function TokushohoPage({ dict }: TokushohoPageProps) {
  const copy = dict.tokushoho;
  return (
    <article className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
      <BreadcrumbJsonLd
        items={[
          { name: 'ホーム', path: '/' },
          { name: copy.heading, path: '/tokushoho/' },
        ]}
      />
      <h1 className="text-4xl font-extrabold tracking-tight text-slate-900">{copy.heading}</h1>

      <div className="mt-10 overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full border-collapse text-sm">
          <tbody className="divide-y divide-slate-100">
            {copy.rows.map((row) => (
              <tr key={row.label}>
                <th
                  scope="row"
                  className="w-44 bg-slate-50 px-4 py-3 text-left align-top font-semibold text-slate-900"
                >
                  {row.label}
                </th>
                <td className="px-4 py-3 leading-relaxed text-slate-700">{row.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </article>
  );
}
