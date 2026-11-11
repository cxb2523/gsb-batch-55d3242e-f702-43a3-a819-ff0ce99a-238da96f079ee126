// @three-ws/see: the contract an agent depends on.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { see, toMessageContent, VIEWS, SeeError } from '../src/index.js';

const OK = {
	model_url: 'https://cdn.test/robot.glb',
	size: 512,
	views: [
		{ view: 'three-quarter', theta: 35, phi: 78, image_url: 'https://cdn.test/a.png' },
		{ view: 'back', theta: 180, phi: 80, image_url: 'https://cdn.test/b.png' },
	],
	stats: { triangles: 12400, materials: 2 },
	notes: ['12,400 triangles, a normal real-time budget for a hero prop or character.'],
	viewer_url: 'https://three.ws/viewer?src=x',
	ar_url: 'https://three.ws/api/ar?src=x',
};

const jsonRes = (status, body) => ({ ok: status < 400, status, json: async () => body });

test('rejects a non-https model URL before any network call', async () => {
	let called = false;
	await assert.rejects(
		() => see('ftp://example.com/x.glb', { fetch: async () => { called = true; } }),
		(e) =>
			e instanceof SeeError &&
			e.code === 'invalid_url' &&
			// No HTTP exchange happened: no fabricated status, but the target
			// deployment is still named for diagnostics.
			e.status === null &&
			e.baseUrl === 'https://three.ws',
	);
	assert.equal(called, false);
});

test('rejects an invalid URL against a custom baseUrl without faking a status', async () => {
	let called = false;
	await assert.rejects(
		() => see('not-a-url', { baseUrl: 'https://staging.three.ws', fetch: async () => { called = true; } }),
		(e) => e instanceof SeeError && e.code === 'invalid_url' && e.status === null && e.baseUrl === 'https://staging.three.ws',
	);
	assert.equal(called, false);
});

test('returns camelCase views, stats and links from the service payload', async () => {
	const look = await see('https://cdn.test/robot.glb', { fetch: async () => jsonRes(200, OK) });
	assert.equal(look.modelUrl, 'https://cdn.test/robot.glb');
	assert.deepEqual(look.views.map((v) => v.view), ['three-quarter', 'back']);
	assert.equal(look.views[0].imageUrl, 'https://cdn.test/a.png');
	assert.equal(look.stats.triangles, 12400);
	assert.equal(look.viewerUrl, 'https://three.ws/viewer?src=x');
	assert.deepEqual(look.missingViews, []);
});

test('sends only the options the caller set, so service defaults stand', async () => {
	let sent;
	await see('https://cdn.test/robot.glb', {
		fetch: async (_u, init) => { sent = JSON.parse(init.body); return jsonRes(200, OK); },
	});
	assert.deepEqual(sent, { glb_url: 'https://cdn.test/robot.glb' });

	await see('https://cdn.test/robot.glb', {
		views: ['back'], size: 256, stats: false,
		fetch: async (_u, init) => { sent = JSON.parse(init.body); return jsonRes(200, OK); },
	});
	assert.deepEqual(sent, { glb_url: 'https://cdn.test/robot.glb', views: ['back'], size: 256, stats: false });
});

test('surfaces a rate limit as a typed error carrying retryAfter, status and baseUrl', async () => {
	await assert.rejects(
		() => see('https://cdn.test/robot.glb', {
			baseUrl: 'https://edge.three.ws/',
			fetch: async () => jsonRes(429, { error: 'rate_limited', message: 'slow down', retry_after: 42 }),
		}),
		(e) =>
			e instanceof SeeError &&
			e.code === 'rate_limited' &&
			e.status === 429 &&
			e.retryAfter === 42 &&
			// Trailing slash is normalised away so the deployment is identifiable.
			e.baseUrl === 'https://edge.three.ws',
	);
});

test('marks a look complete when every requested view comes back', async () => {
	const look = await see('https://cdn.test/robot.glb', { fetch: async () => jsonRes(200, OK) });
	assert.equal(look.completeness, 'complete');
	assert.deepEqual(look.missingViews, []);
});

test('marks a look partial and keeps each missing view with its reason', async () => {
	const look = await see('https://cdn.test/robot.glb', {
		fetch: async () => jsonRes(200, { ...OK, missing_views: [{ view: 'top', error: 'render timed out' }] }),
	});
	assert.equal(look.completeness, 'partial');
	assert.equal(look.missingViews.length, 1);
	assert.equal(look.missingViews[0].view, 'top');
	assert.equal(look.missingViews[0].error, 'render timed out');
});

test('does not treat stats:false as incompleteness', async () => {
	const look = await see('https://cdn.test/robot.glb', {
		stats: false,
		fetch: async () => jsonRes(200, { ...OK, stats: null }),
	});
	assert.equal(look.stats, null);
	assert.equal(look.completeness, 'complete');
});

test('ignores unknown angles but still completes based on the recognised ones', async () => {
	let sent;
	// Unknown names are still passed through for the server to ignore.
	const look = await see('https://cdn.test/robot.glb', {
		views: ['back', 'worm-cam'],
		fetch: async (_u, init) => { sent = JSON.parse(init.body); return jsonRes(200, OK); },
	});
	assert.deepEqual(sent.views, ['back', 'worm-cam']);
	assert.equal(look.completeness, 'complete');
});

test('a missing entry for an unknown, unrequested-by-vocabulary angle cannot make it partial', async () => {
	// The caller only asked for 'back'; a report about another angle is irrelevant
	// to the completeness verdict of what was actually requested.
	const look = await see('https://cdn.test/robot.glb', {
		views: ['back'],
		fetch: async () => jsonRes(200, { ...OK, missing_views: [{ view: 'top', error: 'render timed out' }] }),
	});
	assert.equal(look.completeness, 'complete');
	assert.deepEqual(look.missingViews, [{ view: 'top', error: 'render timed out' }]);
});

test('goes partial when a requested, recognised angle is reported missing', async () => {
	const look = await see('https://cdn.test/robot.glb', {
		views: ['back', 'top'],
		fetch: async () => jsonRes(200, { ...OK, missing_views: [{ view: 'top', error: 'render timed out' }] }),
	});
	assert.equal(look.completeness, 'partial');
});

test('a timeout is a timeout error naming the deployment, with no HTTP status', async () => {
	const err = Object.assign(new Error('aborted'), { name: 'TimeoutError' });
	await assert.rejects(
		() => see('https://cdn.test/robot.glb', {
			baseUrl: 'https://eu.three.ws',
			fetch: async () => { throw err; },
		}),
		(e) =>
			e instanceof SeeError &&
			e.code === 'timeout' &&
			e.status === null &&
			e.baseUrl === 'https://eu.three.ws',
	);
});

test('an unreachable network is reported as unreachable with the baseUrl attached', async () => {
	await assert.rejects(
		() => see('https://cdn.test/robot.glb', {
			baseUrl: 'https://offline.three.ws',
			fetch: async () => { throw new TypeError('fetch failed'); },
		}),
		(e) =>
			e instanceof SeeError &&
			e.code === 'unreachable' &&
			e.status === null &&
			e.baseUrl === 'https://offline.three.ws',
	);
});

test('shapes a look into multimodal content, one labelled image per angle', async () => {
	const look = await see('https://cdn.test/robot.glb', { fetch: async () => jsonRes(200, OK) });
	const content = await toMessageContent(look);
	assert.equal(content[0].type, 'text');
	assert.match(content[0].text, /Geometry:/);
	const images = content.filter((c) => c.type === 'image');
	assert.equal(images.length, 2);
	assert.equal(images[0].source.url, 'https://cdn.test/a.png');
	assert.equal(content[1].text, 'View: three-quarter');
});

test('inlines base64 when the target API will not fetch a URL', async () => {
	const look = await see('https://cdn.test/robot.glb', { fetch: async () => jsonRes(200, OK) });
	const content = await toMessageContent(look, {
		fetchImages: true,
		fetch: async () => ({ ok: true, arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer }),
	});
	const img = content.find((c) => c.type === 'image');
	assert.equal(img.source.type, 'base64');
	assert.equal(img.source.media_type, 'image/png');
	assert.equal(img.source.data, Buffer.from([1, 2, 3]).toString('base64'));
});

test('publishes the angle vocabulary so a caller need not guess', () => {
	assert.ok(VIEWS.includes('three-quarter') && VIEWS.includes('bottom'));
	assert.equal(VIEWS.length, 6);
});

test('complete looks carry no missing-view paragraph in message content', async () => {
	const look = await see('https://cdn.test/robot.glb', { fetch: async () => jsonRes(200, OK) });
	const content = await toMessageContent(look);
	assert.equal(content.some((c) => /Missing views/.test(c.text || '')), false);
});

test('partial looks name every missing angle and reason before the frames', async () => {
	const partial = {
		...OK,
		completeness: 'partial',
		missing_views: [
			{ view: 'top', error: 'render timed out' },
			{ view: 'bottom', error: 'out of memory' },
		],
	};
	const look = await see('https://cdn.test/robot.glb', { fetch: async () => jsonRes(200, partial) });
	assert.equal(look.completeness, 'partial');
	const content = await toMessageContent(look);

	const notice = content.find((c) => /Missing views/.test(c.text || ''));
	assert.ok(notice, 'a missing-view paragraph must be inserted');
	assert.match(notice.text, /top \(render timed out\)/);
	assert.match(notice.text, /bottom \(out of memory\)/);

	// Position: after the geometry note, before any per-view label or image.
	const noticeAt = content.indexOf(notice);
	assert.match(content[noticeAt - 1].text, /Geometry:/);
	assert.equal(noticeAt + 1, content.findIndex((c) => c.text === 'View: three-quarter'));
});

test('throws a recognisable SeeError when an inlined image cannot be downloaded', async () => {
	const look = await see('https://cdn.test/robot.glb', { fetch: async () => jsonRes(200, OK) });
	await assert.rejects(
		() => toMessageContent(look, {
			fetchImages: true,
			fetch: async () => { throw new TypeError('network down'); },
		}),
		(e) =>
			e instanceof SeeError &&
			e.code === 'image_fetch_failed' &&
			e.status === null &&
			e.baseUrl === 'https://cdn.test/a.png',
	);
});

test('a non-OK image response is an error, not a silently skipped frame', async () => {
	const look = await see('https://cdn.test/robot.glb', { fetch: async () => jsonRes(200, OK) });
	await assert.rejects(
		() => toMessageContent(look, {
			fetchImages: true,
			fetch: async () => ({ ok: false, status: 502 }),
		}),
		(e) => e instanceof SeeError && e.code === 'image_fetch_failed' && e.status === 502,
	);
});
