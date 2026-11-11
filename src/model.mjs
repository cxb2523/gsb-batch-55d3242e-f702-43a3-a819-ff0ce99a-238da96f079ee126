// Kaynak listelerini tek bir haftalık rapor modeline dönüştürür ve platformlar arası
// "Haftanın Konuları" sıralamasını hesaplar.
import { normalizeKey, redactSecrets } from './util.mjs';
import * as google from './sources/google-trends.mjs';
import * as wikipedia from './sources/wikipedia.mjs';
import * as youtube from './sources/youtube.mjs';
import * as x from './sources/x.mjs';
import * as tiktok from './sources/tiktok.mjs';
import * as instagram from './sources/instagram.mjs';

/** Raporda görünme sırası */
export const SOURCES = [x, tiktok, instagram, youtube, google, wikipedia];
export const META = Object.fromEntries(SOURCES.map((s) => [s.meta.id, s.meta]));

/** Günlük anlık görüntülerden haftalık listeye dönüşen kaynaklar */
const DAILY_MODULES = [google, youtube, x, tiktok];
export const DAILY_IDS = DAILY_MODULES.map((m) => m.meta.id);

export const TOP_N = 30; // Genel sıralamaya her platformdan alınan konu sayısı
export const KEEP = 25; // Raporda platform başına saklanan satır

/** Sıra tabanlı puan: 1. sıra 100, 30. sıra ~3 — platformların ölçekleri farklı olduğu için */
export const rankPoints = (i) => Math.round(100 * (1 - i / TOP_N));

/** Bir başlığın platformlar arası eşleştirme anahtarı */
export const topicKey = (title) => normalizeKey(title);

/**
 * İki konu başlığı aynı konuyu mu anlatıyor?
 * - Türkçe küçük harf, alt çizgi ve parantezler normalizeKey içinde sadeleştirilir.
 * - "#kışsaati" ile "kış saati" boşluklar atıldığında aynıdır.
 * - Kısa başlık uzun başlığın içinde geçiyorsa (ve en az 5 karakter ise) aynı konudur.
 */
export function sameTopic(a, b) {
  const ka = normalizeKey(a);
  const kb = normalizeKey(b);
  if (!ka || !kb) return false;
  if (ka === kb) return true;
  // Etiketler (#kışsaati) kelimeleri boşluksuz yazar; normal başlık boşluklu olabilir.
  if (ka.replace(/ /g, '') === kb.replace(/ /g, '')) return true;
  const [short, long] = ka.length <= kb.length ? [ka, kb] : [kb, ka];
  return short.length >= 5 && long.includes(short);
}

function mergeTopic(target, other) {
  target.keys.push(...other.keys);
  target.titles.push(...other.titles);
  for (const [id, pts] of Object.entries(other.parts)) {
    if ((target.parts[id] || 0) < pts) {
      target.total += pts - (target.parts[id] || 0);
      target.parts[id] = pts;
    }
  }
}

/**
 * Yalnızca başarılı (status='ok') kaynakları birleştirir. Atlanan veya hata veren
 * kaynakların öğeleri, sağlanmış olsa bile puanlamaya katılmaz.
 */
export function crossPlatform(sources = {}) {
  const topics = [];

  for (const [id, src] of Object.entries(sources || {})) {
    if (!src || src.status !== 'ok' || !Array.isArray(src.items)) continue;
    src.items.slice(0, TOP_N).forEach((item, i) => {
      const title = item?.title == null ? '' : String(item.title);
      const key = topicKey(title);
      if (!key) return;

      const matches = topics.filter((t) => t.keys.some((k) => sameTopic(k, key)));
      let topic;
      if (matches.length) {
        topic = matches[0];
        // Yeni öğe birden çok grubu birbirine bağlıyorsa grupları tek konuda birleştir.
        for (const other of matches.slice(1)) {
          mergeTopic(topic, other);
          topics.splice(topics.indexOf(other), 1);
        }
      } else {
        topic = { keys: [], titles: [], parts: {}, total: 0 };
        topics.push(topic);
      }

      topic.keys.push(key);
      topic.titles.push(title);

      // Bir platform aynı konuyu birden çok sırada gösteriyorsa yalnızca en iyi sırası sayılır.
      const pts = rankPoints(i);
      if ((topic.parts[id] || 0) < pts) {
        topic.total += pts - (topic.parts[id] || 0);
        topic.parts[id] = pts;
      }
    });
  }

  return topics
    .map((t) => ({
      // En kısa başlık genellikle en genel olanıdır (ör. "Galatasaray" vs. uzun video başlığı)
      title: t.titles.slice().sort((a, b) => a.length - b.length)[0],
      platforms: Object.keys(t.parts),
      parts: t.parts,
      total: t.total,
    }))
    .sort((a, b) => b.total - a.total || b.platforms.length - a.platforms.length)
    .slice(0, 20);
}

const cleanReason = (reason, fallback) => redactSecrets(reason || fallback || '');

/**
 * Günlük anlık görüntülerden haftalık kaynak durumlarını çıkarır.
 * Hiç anlık görüntü yoksa kaynak "atlandı" olur ve açıklama döner; uydurma öğe üretilmez.
 */
export function sourcesFromSnapshots(snapshots = []) {
  const snaps = Array.isArray(snapshots) ? snapshots : [];
  const result = {};
  for (const mod of DAILY_MODULES) {
    const id = mod.meta.id;
    const ok = snaps
      .filter((s) => s?.sources?.[id]?.status === 'ok' && Array.isArray(s.sources[id].items))
      .map((s) => ({ date: s.date, ...s.sources[id] }));

    if (ok.length) {
      result[id] = { status: 'ok', items: mod.aggregate(ok) };
      continue;
    }

    const last = [...snaps].reverse().find((s) => s?.sources?.[id]);
    const state = last?.sources?.[id];
    if (state && state.status !== 'ok') {
      const fallback = state.status === 'skipped' ? 'Veri yok' : 'Veri alınamadı';
      result[id] = { status: state.status, reason: cleanReason(state.reason, fallback) };
    } else {
      result[id] = { status: 'skipped', reason: 'Bu hafta için anlık görüntü yok' };
    }
  }
  return result;
}

/**
 * @param sources { [id]: { status: 'ok'|'skipped'|'error', reason?, items? } }
 */
export function buildModel({ week, days, sources = {}, snapshotDays = 0, sample = false, now = new Date() }) {
  const today = now.toISOString().slice(0, 10);
  const unknownReason = () =>
    snapshotDays === 0 ? 'Bu hafta için anlık görüntü yok' : 'Veri yok';

  const normalized = SOURCES.map(({ meta }) => {
    const raw = sources?.[meta.id] || {};
    // Yalnızca açıkça başarılı kaynak puanlamaya girer; diğerleri durum + kısa neden olarak saklanır.
    const status = raw.status === 'ok' ? 'ok' : raw.status === 'error' ? 'error' : 'skipped';
    const items = status === 'ok' && Array.isArray(raw.items) ? raw.items : [];
    return { meta, status, items };
  });

  const trimmed = Object.fromEntries(
    normalized.map(({ meta, status, items }) => {
      const base = {
        ...meta,
        id: meta.id,
        status,
        // Raporda platform başına yalnızca ilk KEEP satır gösterilir; puanlama için
        // tam liste (ilk 30) aşağıda crossPlatform'a verilir.
        items: items.slice(0, KEEP),
        total: items.length,
      };
      if (status !== 'ok') {
        base.reason = cleanReason(
          sources?.[meta.id]?.reason,
          status === 'error' ? 'Veri alınamadı' : unknownReason(),
        );
      }
      return [meta.id, base];
    }),
  );

  const mergeInput = Object.fromEntries(
    normalized.map(({ meta, status, items }) => [meta.id, { status, items }]),
  );
  const overall = crossPlatform(mergeInput);
  const activeSources = Object.values(trimmed)
    .filter((s) => s.status === 'ok')
    .map((s) => s.id);
  const mergedSources = normalized
    .filter(({ status, items }) => status === 'ok' && items.some((it) => it?.title != null && topicKey(String(it.title))))
    .map(({ meta }) => meta.id);

  return {
    week,
    days,
    start: days[0],
    end: days[6],
    final: today > days[6],
    sample,
    generatedAt: now.toISOString(),
    snapshotDays,
    activeSources,
    mergedSources,
    participatingSources: mergedSources,
    sources: trimmed,
    overall,
  };
}
