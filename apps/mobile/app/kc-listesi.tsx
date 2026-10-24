import { kv } from '../src/offline/kvStore';
import { tr } from '../src/i18n/tr';
import { kcRows, loadKc } from '../src/reference/load';
import { RefList } from '../src/reference/RefList';
import { api } from '../src/session';

const t = tr.lists;

/** Bitki türü + Kc tablosu (salt okunur; eski uygulamadaki liste ekranı). */
export default function KcListScreen() {
  return (
    <RefList
      testID="kc-tablosu"
      howTitle={t.kcHow}
      howLines={[...t.kcHowLines]}
      title={t.kcTitle}
      note={t.kcNote}
      searchLabel={t.kcSearch}
      columns={[
        { key: 'ad', title: t.plant, flex: 2 },
        { key: 'ilk', title: 'Kc ilk' },
        { key: 'orta', title: 'Kc orta' },
        { key: 'son', title: 'Kc son' },
        { key: 'durum', title: 'Onay' },
      ]}
      load={async () => kcRows(await loadKc(api, kv))}
    />
  );
}
