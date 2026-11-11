import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isoWeek, weekDays, normalizeKey, redactSecrets } from '../src/util.mjs';
import {
  crossPlatform,
  sameTopic,
  sourcesFromSnapshots,
  buildModel,
} from '../src/model.mjs';
import { aggregate as googleAggregate } from '../src/sources/google-trends.mjs';

test('isoWeek: yıl sınırları dahil ISO 8601 hafta numarası', () => {
  assert.equal(isoWeek(new Date('2026-10-24T12:00:00Z')), '2026-W43');
  assert.equal(isoWeek(new Date('2026-01-01T00:00:00Z')), '2026-W01');
  assert.equal(isoWeek(new Date('2027-01-01T00:00:00Z')), '2026-W53');
});

test('weekDays: Pazartesi..Pazar', () => {
  const d = weekDays('2026-W43');
  assert.equal(d.length, 7);
  assert.equal(d[0], '2026-10-19');
  assert.equal(d[6], '2026-10-25');
});

test('normalizeKey: Türkçe küçük harf ve hashtag ayrıştırma', () => {
  assert.equal(normalizeKey('#GalatasarayFenerbahçe'), 'galatasaray fenerbahçe');
  assert.equal(normalizeKey('İSTANBUL'), 'istanbul');
  assert.equal(normalizeKey('Aziz_Sancar'), 'aziz sancar');
  assert.equal(normalizeKey('Seks ve Genç Kız (film)'), 'seks ve genç kız');
});

test('sameTopic: etiket, büyük/küçük harf ve kısa başlık kuralları', () => {
  assert.equal(sameTopic('#kışsaati', 'kış saati'), true);
  assert.equal(sameTopic('Kış Saati', 'kış saati'), true);
  assert.equal(sameTopic('Aziz_Sancar', 'aziz sancar'), true);
  assert.equal(sameTopic('Seks ve Genç Kız (film)', 'seks ve genç kız'), true);
  assert.equal(sameTopic('deprem', 'adana deprem'), true);
  // 5 karakterden kısa başlık, içinde geçse bile birleşmemeli.
  assert.equal(sameTopic('kar', 'kar yağışı'), false);
  assert.equal(sameTopic('su', 'su sporları'), false);
});

test('crossPlatform: çok platformlu birleşme, puanlar ve platform kümesi', () => {
  const list = crossPlatform({
    x: { status: 'ok', items: [{ title: 'kış saati' }, { title: 'derbi' }, { title: 'Kış Saati' }] },
    tiktok: { status: 'ok', items: [{ title: '#kışsaati' }, { title: '#derbi' }] },
    google: { status: 'ok', items: [{ title: 'başka konu' }, { title: 'ikinci konu' }, { title: 'kış saati' }] },
    youtube: { status: 'error', items: [{ title: '#kışsaati' }] },
  });

  const kis = list.find((t) => t.title === 'kış saati');
  // x: 1. sıra 100 (tekrar eden 4. sıra sayılmaz), tiktok: 1. sıra 100, google: 3. sıra 93
  assert.deepEqual(kis.platforms.sort(), ['google', 'tiktok', 'x']);
  assert.deepEqual(kis.parts, { x: 100, tiktok: 100, google: 93 });
  assert.equal(kis.total, 293);

  const derbi = list.find((t) => t.title === 'derbi');
  assert.deepEqual(derbi.platforms.sort(), ['tiktok', 'x']);
  assert.equal(derbi.total, 194);

  // Hata veren kaynak öğe sağlasa bile puan/katılım üretmez.
  assert.ok(!kis.platforms.includes('youtube'));
});

test('crossPlatform: yalnızca harf büyüklüğü veya # farkı olan başlıklar birleşir', () => {
  const list = crossPlatform({
    x: { status: 'ok', items: [{ title: 'Kış Saati' }] },
    tiktok: { status: 'ok', items: [{ title: '#kışsaati' }] },
    instagram: { status: 'ok', items: [{ title: '#KIŞSAATİ' }] },
    google: { status: 'ok', items: [{ title: 'kış saati' }] },
  });

  assert.equal(list.length, 1);
  assert.equal(list[0].title, 'Kış Saati');
  assert.equal(list[0].total, 400);
  assert.deepEqual(list[0].platforms.sort(), ['google', 'instagram', 'tiktok', 'x']);
});

test('crossPlatform: 5 karakterden kısa başlık içerilme nedeniyle birleşmez', () => {
  const list = crossPlatform({
    google: { status: 'ok', items: [{ title: 'kar' }, { title: 'kar yağışı' }, { title: 'su' }, { title: 'su sporları' }] },
    x: { status: 'ok', items: [{ title: 'deprem' }, { title: 'adana deprem' }] },
  });

  const kar = list.find((t) => t.title === 'kar');
  const karYagisi = list.find((t) => t.title === 'kar yağışı');
  const su = list.find((t) => t.title === 'su');
  const suSporlari = list.find((t) => t.title === 'su sporları');
  assert.deepEqual(kar.platforms, ['google']);
  assert.deepEqual(karYagisi.platforms, ['google']);
  assert.notEqual(kar, karYagisi);
  assert.notEqual(su, suSporlari);

  // 5+ karakterli kısa başlık ise içerilme kuralıyla birleşir; aynı platformun
  // iki sırası toplanmaz, yalnızca en iyi sırası (100) sayılır.
  const deprem = list.find((t) => t.title === 'deprem');
  assert.deepEqual(deprem.platforms, ['x']);
  assert.equal(deprem.total, 100);
  assert.equal(list.filter((t) => t.title === 'adana deprem').length, 0);
});

test('crossPlatform: atlanan ve hatalı kaynaklar puanlamaya katılmaz', () => {
  const list = crossPlatform({
    x: { status: 'skipped', items: [{ title: 'kış saati' }] },
    tiktok: { status: 'error', reason: 'HTTP 500', items: [{ title: '#kışsaati' }] },
    google: { status: 'ok', items: [{ title: 'kış saati' }] },
  });

  const kis = list.find((t) => t.title === 'kış saati');
  assert.deepEqual(kis.platforms, ['google']);
  assert.deepEqual(kis.parts, { google: 100 });
  assert.equal(kis.total, 100);
});

test('sourcesFromSnapshots: hiç anlık görüntü yoksa kaynaklar atlandı ve açıklamalı', () => {
  const sources = sourcesFromSnapshots([]);
  for (const id of ['x', 'tiktok', 'youtube', 'google']) {
    assert.equal(sources[id].status, 'skipped');
    assert.equal(sources[id].reason, 'Bu hafta için anlık görüntü yok');
  }
  assert.equal(sources.x.items, undefined);
});

test('sourcesFromSnapshots: hatanın son durumu ve başarılı günler korunur', () => {
  const sources = sourcesFromSnapshots([
    { date: '2026-11-09', sources: { x: { status: 'ok', items: [{ title: 'a', rank: 1 }] }, google: { status: 'ok', items: [{ title: 'g', traffic: 1 }] } } },
    { date: '2026-11-10', sources: { x: { status: 'error', reason: 'HTTP 429' }, google: { status: 'ok', items: [{ title: 'g2', traffic: 2 }] } } },
  ]);
  assert.equal(sources.x.status, 'ok');
  assert.equal(sources.google.status, 'ok');
});

test('buildModel: puanlama için ilk 30 sıra kullanılır (rapor 25 satır gösterse bile)', () => {
  const googleItems = Array.from({ length: 30 }, (_, i) => ({ title: `konu ${i + 1}` }));
  googleItems[29] = { title: 'hedef konu' }; // 30. sıra, 3 puan
  const m = buildModel({
    week: '2026-W46',
    days: weekDays('2026-W46'),
    snapshotDays: 1,
    now: new Date('2026-11-11T00:00:00Z'),
    sources: {
      x: { status: 'ok', items: [{ title: 'hedef konu' }] },
      google: { status: 'ok', items: googleItems },
    },
  });

  const hedef = m.overall.find((t) => t.title === 'hedef konu');
  assert.equal(hedef.total, 103); // x 100 + google 30. sıra 3
  assert.deepEqual(hedef.parts, { x: 100, google: 3 });
});

test('sourcesFromSnapshots: yalnızca hata olan kaynak hatası ve maskeli nedeniyle korunur', () => {
  const sources = sourcesFromSnapshots([
    { date: '2026-11-10', sources: { youtube: { status: 'error', reason: 'HTTP 403 — ?key=AIzaSECRET&token=TKN' } } },
  ]);
  assert.equal(sources.youtube.status, 'error');
  assert.ok(!sources.youtube.reason.includes('AIzaSECRET'));
  assert.ok(sources.youtube.reason.includes('key=***'));
  assert.equal(sources.x.status, 'skipped');
  assert.equal(sources.x.reason, 'Bu hafta için anlık görüntü yok');
});

test('buildModel: atlanan kaynak puan üretmez, durumu ve nedeni korunur', () => {
  const days = weekDays('2026-W46');
  const m = buildModel({
    week: '2026-W46',
    days,
    snapshotDays: 1,
    now: new Date('2026-11-11T00:00:00Z'),
    sources: {
      google: { status: 'ok', items: [{ title: 'kış saati' }] },
      x: { status: 'skipped', reason: 'X_BEARER_TOKEN tanımlı değil', items: [{ title: 'kış saati' }] },
      youtube: { status: 'error', reason: 'HTTP 500', items: [{ title: 'kış saati' }] },
    },
  });

  assert.equal(m.overall.length, 1);
  assert.deepEqual(m.overall[0].platforms, ['google']);
  assert.equal(m.overall[0].total, 100);
  assert.deepEqual(m.activeSources, ['google']);
  assert.deepEqual(m.mergedSources, ['google']);
  assert.equal(m.sources.x.status, 'skipped');
  assert.equal(m.sources.x.reason, 'X_BEARER_TOKEN tanımlı değil');
  assert.deepEqual(m.sources.x.items, []);
  assert.equal(m.sources.youtube.status, 'error');
  assert.equal(m.sources.youtube.reason, 'HTTP 500');
});

test('buildModel: haftada anlık görüntü yoksa tüm günlük kaynaklar atlandı', () => {
  const days = weekDays('2026-W46');
  const sources = sourcesFromSnapshots([]);
  const m = buildModel({ week: '2026-W46', days, snapshotDays: 0, sources, now: new Date('2026-11-11T00:00:00Z') });

  assert.equal(m.snapshotDays, 0);
  assert.deepEqual(m.overall, []);
  assert.deepEqual(m.activeSources, []);
  assert.deepEqual(m.mergedSources, []);
  for (const id of ['x', 'tiktok', 'youtube', 'google', 'instagram', 'wikipedia']) {
    assert.equal(m.sources[id].status, 'skipped');
    assert.equal(m.sources[id].reason, 'Bu hafta için anlık görüntü yok');
    assert.deepEqual(m.sources[id].items, []);
  }
});

test('redactSecrets: key, token ve access_token değerleri maskelenir', () => {
  assert.equal(
    redactSecrets('HTTP 401 — https://api.test?key=SECRET&access_token=TOKEN&token=abc'),
    'HTTP 401 — https://api.test?key=***&access_token=***&token=***',
  );
  assert.equal(redactSecrets('client_key=my-key client_secret=my-secret'), 'client_key=*** client_secret=my-secret');
});

test('buildModel: hata nedenindeki anahtar değerleri modele yazılmaz', () => {
  const days = weekDays('2026-W46');
  const m = buildModel({
    week: '2026-W46',
    days,
    snapshotDays: 1,
    now: new Date('2026-11-11T00:00:00Z'),
    sources: {
      google: { status: 'ok', items: [{ title: 'gündem' }] },
      youtube: { status: 'error', reason: 'HTTP 403 — https://www.googleapis.com/youtube/v3/videos?key=AIzaSECRET' },
      tiktok: { status: 'error', reason: 'token alınamadı: {"access_token":"TOPSECRET"}' },
    },
  });

  assert.equal(m.sources.youtube.status, 'error');
  assert.ok(!m.sources.youtube.reason.includes('AIzaSECRET'));
  assert.ok(m.sources.youtube.reason.includes('key=***'));
  assert.ok(!m.sources.tiktok.reason.includes('TOPSECRET'));
  assert.ok(m.sources.tiktok.reason.includes('***'));
  assert.ok(!JSON.stringify(m).includes('AIzaSECRET'));
  assert.ok(!JSON.stringify(m).includes('TOPSECRET'));
});

test('Google Trends: günlük görüntüler toplanır', () => {
  const items = googleAggregate([
    { date: '2026-10-19', items: [{ title: 'Derbi', traffic: 1000, news: [] }] },
    { date: '2026-10-20', items: [{ title: 'derbi', traffic: 500, news: [] }, { title: 'Kar', traffic: 2000, news: [] }] },
  ]);
  assert.equal(items[0].title, 'Kar');
  assert.equal(items[1].traffic, 1500);
  assert.equal(items[1].days, 2);
});
