'use client';

import { useEffect, useState } from 'react';
import { isDemoLicense, isProActive, subscribeLicense, validateStoredLicense } from '@/lib/license';

export interface ProStatus {
  /** Pro 機能が使えるか（ライセンス保存済み）。 */
  pro: boolean;
  /** DEMO モードのライセンスか（UI に DEMO 角標を出す）。 */
  demo: boolean;
  /** 起動時の再検証が終わるまで true。 */
  loading: boolean;
}

/**
 * Reactive Pro status for gating UI. Reads localStorage synchronously after
 * mount, revalidates in the background (7-day cache), and updates every
 * subscribed component when the license changes in this tab.
 */
export function useProStatus(): ProStatus {
  const [state, setState] = useState<ProStatus>({ pro: false, demo: false, loading: true });

  useEffect(() => {
    const refresh = () =>
      setState({ pro: isProActive(), demo: isDemoLicense(), loading: false });
    refresh();
    // バックグラウンド再検証：失効していたら refresh 経由で無料に降格する
    void validateStoredLicense().then(refresh);
    return subscribeLicense(refresh);
  }, []);

  return state;
}
