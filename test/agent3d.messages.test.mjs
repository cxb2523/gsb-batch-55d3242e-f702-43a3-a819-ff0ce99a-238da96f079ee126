// <Agent3D> postMessage behavior tests, run in a real (jsdom) DOM against the
// built bundle: the host ↔ iframe message protocol, origin/window validation,
// and the baseUrl-switch edge cases (stale iframe windows, path-only changes).
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { JSDOM } from 'jsdom';

// DOM globals must exist before react-dom and the bundle are imported.
const dom = new JSDOM('<!doctype html><html><body></body></html>', {
	url: 'https://app.example',
});
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const React = await import('react');
const { createRoot } = await import('react-dom/client');
const { Agent3D } = await import('../dist/index.mjs');

const { act } = React;
const roots = [];

afterEach(() => {
	while (roots.length) {
		const root = roots.pop();
		act(() => root.unmount());
	}
	document.body.innerHTML = '';
});

function mount(props) {
	const container = document.createElement('div');
	document.body.appendChild(container);
	const root = createRoot(container);
	roots.push(root);
	const ref = React.createRef();
	act(() => root.render(React.createElement(Agent3D, { ...props, ref })));
	return {
		ref,
		rerender: (next) =>
			act(() => root.render(React.createElement(Agent3D, { ...next, ref }))),
		iframe: () => container.querySelector('iframe'),
	};
}

/** Stub an iframe window's postMessage and return the recorded calls. */
function recordPosts(iframe) {
	const posts = [];
	iframe.contentWindow.postMessage = (msg, origin) => posts.push({ msg, origin });
	return posts;
}

/** Dispatch an inbound message as if it came from `source` at `origin`. */
function sendReady(source, origin) {
	act(() => {
		window.dispatchEvent(
			new window.MessageEvent('message', {
				data: { type: 'walk:ready' },
				origin,
				source,
			}),
		);
	});
}

// --- Normal path ------------------------------------------------------------

test('ready from the current iframe fires onLoad and applies speed exactly once', () => {
	let loads = 0;
	const { iframe } = mount({ agentId: 'ag-1', speed: 1.5, onLoad: () => loads++ });
	const frame = iframe();
	const posts = recordPosts(frame);

	// Nothing is sent to the player before it announces itself.
	assert.equal(loads, 0);
	assert.equal(posts.length, 0);

	sendReady(frame.contentWindow, 'https://three.ws');
	assert.equal(loads, 1);
	assert.deepEqual(posts, [
		{ msg: { type: 'walk:config', speed: 1.5 }, origin: 'https://three.ws' },
	]);

	// A duplicate ready from the same iframe must not re-apply speed or onLoad.
	sendReady(frame.contentWindow, 'https://three.ws');
	assert.equal(loads, 1);
	assert.equal(posts.length, 1);

	// Wrong window or wrong origin is ignored outright.
	sendReady(window, 'https://three.ws');
	sendReady(frame.contentWindow, 'https://evil.example');
	assert.equal(loads, 1);
	assert.equal(posts.length, 1);
});

// --- Negative path: baseUrl switches to a different origin -------------------

test('stale ready from the previous iframe is ignored after a cross-origin baseUrl switch', () => {
	let loads = 0;
	const props = {
		agentId: 'ag-1',
		speed: 2,
		baseUrl: 'https://staging.example.com',
		onLoad: () => loads++,
	};
	const view = mount(props);
	const oldIframe = view.iframe();
	const oldWindow = oldIframe.contentWindow;
	const oldPosts = recordPosts(oldIframe);

	// The staging player loads fine while it is current.
	sendReady(oldWindow, 'https://staging.example.com');
	assert.equal(loads, 1);
	assert.deepEqual(oldPosts, [
		{ msg: { type: 'walk:config', speed: 2 }, origin: 'https://staging.example.com' },
	]);

	// Switch back to the default origin: the iframe is remounted.
	view.rerender({ ...props, baseUrl: 'https://three.ws' });
	const newIframe = view.iframe();
	assert.notEqual(newIframe, oldIframe, 'origin change must remount the iframe');
	assert.notEqual(newIframe.contentWindow, oldWindow);
	const newPosts = recordPosts(newIframe);

	// A late ready from the old iframe — whether it claims its own origin or
	// forges the new one — must not fire onLoad or push speed into the new player.
	sendReady(oldWindow, 'https://staging.example.com');
	sendReady(oldWindow, 'https://three.ws');
	assert.equal(loads, 1);
	assert.equal(newPosts.length, 0);

	// The new iframe's legitimate ready still works.
	sendReady(newIframe.contentWindow, 'https://three.ws');
	assert.equal(loads, 2);
	assert.deepEqual(newPosts, [
		{ msg: { type: 'walk:config', speed: 2 }, origin: 'https://three.ws' },
	]);
});

// --- Boundary: origin unchanged ----------------------------------------------

test('path-only baseUrl change (same origin) keeps the embed functional', () => {
	let loads = 0;
	const props = {
		agentId: 'ag-1',
		speed: 1.2,
		baseUrl: 'https://example.com/app',
		onLoad: () => loads++,
	};
	const view = mount(props);
	const frame = view.iframe();
	const posts = recordPosts(frame);

	view.rerender({ ...props, baseUrl: 'https://example.com/other' });
	assert.equal(view.iframe(), frame, 'same-origin change must not remount the iframe');

	sendReady(frame.contentWindow, 'https://example.com');
	assert.equal(loads, 1);
	assert.deepEqual(posts, [
		{ msg: { type: 'walk:config', speed: 1.2 }, origin: 'https://example.com' },
	]);
});

test('a new embed URL at the same origin re-arms ready handling for the fresh player', () => {
	let loads = 0;
	const props = {
		agentId: 'ag-1',
		speed: 1.5,
		environment: 'studio',
		onLoad: () => loads++,
	};
	const view = mount(props);
	const frame = view.iframe();
	const posts = recordPosts(frame);

	sendReady(frame.contentWindow, 'https://three.ws');
	assert.equal(loads, 1);
	assert.equal(posts.length, 1);

	// Same origin, but a new player load: its ready must be honored again so
	// speed is re-applied. (jsdom swaps contentWindow when src changes — real
	// browsers keep the WindowProxy — so re-stub the current window.)
	view.rerender({ ...props, environment: 'desert' });
	const posts2 = recordPosts(frame);
	sendReady(frame.contentWindow, 'https://three.ws');
	assert.equal(loads, 2);
	assert.equal(posts.length, 1, 'nothing more is sent to the previous window');
	assert.deepEqual(posts2, [
		{ msg: { type: 'walk:config', speed: 1.5 }, origin: 'https://three.ws' },
	]);
});
