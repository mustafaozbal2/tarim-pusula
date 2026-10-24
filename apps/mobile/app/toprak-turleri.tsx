import { kv } from '../src/offline/kvStore';
import { tr } from '../src/i18n/tr';
import { loadSoils, soilRows } from '../src/reference/load';
import { RefList } from '../src/reference/RefList';
import { api } from '../src/session';

const t = tr.lists;

/** Toprak türü + tarla kapasitesi / solma noktası (salt okunur). */
export default function SoilListScreen() {
  return (
    <RefList
      testID="toprak-tablosu"
      howTitle={t.soilHow}
      howLines={[...t.soilHowLines]}
      title={t.soilTitle}
      note={t.soilNote}
      searchLabel={t.soilSearch}
      columns={[
        { key: 'ad', title: t.soil, flex: 2 },
        { key: 'fc', title: t.fc },
        { key: 'wp', title: t.wp },
        { key: 'faydali', title: t.whc },
        { key: 'durum', title: 'Onay' },
      ]}
      load={async () => soilRows(await loadSoils(api, kv))}
    />
  );
}
