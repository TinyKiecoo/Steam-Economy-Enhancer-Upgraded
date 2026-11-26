import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { JSDOM } from 'jsdom';

const source = await readFile(new URL('../code.user.js', import.meta.url), 'utf8');
const navigation = '<nav><a href="activelistings">Sell</a><a href="buyorders">Buy</a><a href="history">History</a></nav><div id="native">Steam list</div>';

function entry(id, price = 329, options = {}) {
    return {
        listing: {
            listingid: id,
            time_created: options.time || 1795500000,
            price: String(price - 42),
            steam_fee: '14',
            publisher_fee: '28',
            currencyid: '2029',
            asset: { amount: '1' }
        },
        order: { buy_orderid: id, wallet_currency: 29, price, quantity_remaining: String(options.quantity || 1) },
        description: {
            appid: 753,
            name: options.name || `Item ${id}`,
            market_hash_name: `123-${options.name || `Item ${id}`}`,
            ...(options.icon ? { icon_url: options.icon } : {}),
            type: options.type || 'Trading Card',
            tags: [{ category: 'Game', localized_tag_name: options.game || 'Test Game' }]
        },
        ...(options.typical == null ? {} : { recent_price: options.typical, recent_price_currency: 29 })
    };
}

function query(kind, entries, more = false) {
    return {
        queryKey: kind === 'buyorders' ? ['buy_orders', true] : ['listings', { category: 'active', bGetAllData: true }],
        state: { data: { pages: [{ [kind === 'buyorders' ? 'buy_orders' : 'listings']: entries, more }] } }
    };
}

function legacyRow(id, name = `Item ${id}`, options = {}) {
    const prefix = options.history ? 'history_row' : options.buy ? 'mybuyorder' : 'mylisting';
    return `<div class="market_listing_row" id="${prefix}_${id}">
        ${options.image ? `<img class="market_listing_item_img" src="${options.image}" alt="">` : ''}
        <span class="market_listing_item_name"><a class="market_listing_item_name_link" href="/market/listings/753/123-${id}">${name}</a></span>
        <span class="market_listing_game_name">Steam Trading Card</span>
        <span class="market_listing_price">${options.buy ? '<span class="market_listing_inline_buyorder_qty">99 @</span>' : ''}${options.price || 'HK$ 3.29'}</span>
        ${options.buy ? '<span class="market_listing_buyorder_qty">99</span>' : ''}
        <span class="market_listing_listed_date can_combine">19 Nov</span>
        <span class="market_listing_listed_date can_combine">20 Nov</span>
        <span class="market_listing_gainorloss">+</span></div>`;
}

function response(data, status = 200) {
    return { ok: status === 200, status, json: async () => data };
}

function historyEvent(id, time, name = `History item ${id}`) {
    return {
        listing: { listingid: String(id) },
        description: { appid: 753, name, market_hash_name: `123-${name}`, type: 'Trading Card', icon_url: 'test-icon' },
        purchase: { paid_amount: '300', paid_fee: '42', added_tax: '8', currencyid: '2029' },
        event_type: 4,
        time_event: time,
        time_listing: time - 3600000
    };
}

function historyService(events) {
    return url => {
        if (url.pathname === '/market/actions') {
            assert.equal(url.searchParams.get('q'), 'QueryMyHistory');
            const [start, count] = JSON.parse(url.searchParams.get('qp'));
            assert.equal(count, start === 0 ? 50 : 25);
            return response({ data: { eResult: 1, rgEvents: events.slice(start, start + count), bMore: start + count < events.length } });
        }
        const start = Number(url.searchParams.get('start'));
        const count = Number(url.searchParams.get('count'));
        return response({ success: true, start, total_count: events.length, results_html: events.slice(start, start + count).map(event => legacyRow(event.listing.listingid, event.description.name, { history: true })).join('') });
    };
}

function searchHistory(app, { name = '', from = '', to = '' } = {}) {
    for (const [label, value] of [['Search history by item name', name], ['From date', from], ['To date', to]]) {
        app.document.querySelector(`[aria-label="${label}"]`).value = value;
    }
    app.click('Start search');
}

const searchComplete = app => app.document.querySelector('[role=status]').textContent.startsWith('Search complete.');

async function waitFor(check) {
    for (let tries = 0; tries < 200; tries++) {
        if (check()) {
            return;
        }
        await new Promise(resolve => setTimeout(resolve, 5));
    }
    assert.fail('UI did not settle');
}

function boot(t, kind = 'activelistings', queries = [], handler = () => assert.fail('Unexpected request'), language = 'en-US') {
    const dom = new JSDOM(`<!doctype html><html lang="${language}"><head></head><body><main>${navigation}</main></body></html>`, {
        url: `https://steamcommunity.com/market/${kind}`,
        runScripts: 'outside-only'
    });
    const { window } = dom;
    const calls = [];
    window.SSR = { renderContext: { queryData: JSON.stringify({ queries }) } };
    window.unsafeWindow = window;
    window.jQuery = { noConflict() {} };
    window.async = {};
    window.AbortSignal = AbortSignal;
    window.AbortController = AbortController;
    window.confirm = () => true;
    window.document.cookie = 'sessionid=test-session';
    window.HTMLDialogElement.prototype.showModal = function () {
 this.open = true; 
};
    window.HTMLDialogElement.prototype.close = function () {
 this.open = false; this.dispatchEvent(new window.Event('close')); 
};
    const setTimer = window.setTimeout.bind(window);
    window.setTimeout = (fn, delay, ...args) => setTimer(fn, delay === 1000 ? 0 : delay, ...args);
    window.fetch = async (url, options) => {
        calls.push({ url, options });
        return handler(new URL(url, window.location.origin), options, calls.length);
    };
    window.eval(source);
    t.after(() => {
        window.dispatchEvent(new window.Event('pagehide'));
        dom.window.close();
    });
    const document = window.document;
    const click = text => {
        const node = [...document.querySelectorAll('#see-modern-market button')].find(button => button.textContent === text);
        assert.ok(node, `Missing button: ${text}`);
        node.click();
        return node;
    };
    const search = text => {
        const input = document.querySelector('input[type=search]');
        input.value = text;
        input.dispatchEvent(new window.Event('input'));
    };
    return { window, document, calls, click, search, rows: () => [...document.querySelectorAll('tbody tr[data-id]')] };
}

test('SSR pages initialize without legacy Steam globals; compact rows retain all columns and actions', t => {
    const app = boot(t, 'activelistings', [query('activelistings', [entry('9007199254740993123')])]);
    assert.equal(app.rows().length, 1);
    assert.equal(app.document.querySelectorAll('#see-modern-market img').length, 0);
    assert.equal(app.document.querySelectorAll('thead th').length, 6);
    assert.equal(app.rows()[0].dataset.id, '9007199254740993123');
    assert.ok(app.document.querySelector('#native').hasAttribute('data-see-native-market'));
    app.click('Modify');
    assert.ok(app.document.querySelector('dialog').open);
});

test('sell listings and buy orders retain small lazy-loaded Steam thumbnails', t => {
    for (const kind of ['activelistings', 'buyorders']) {
        const app = boot(t, kind, [query(kind, [entry('1', 329, { icon: 'test-icon' })])]);
        const image = app.document.querySelector('tbody .see-item-image');
        assert.ok(image);
        assert.equal(image.src, 'https://community.steamstatic.com/economy/image/test-icon/64fx64f');
        assert.equal(image.width, 32);
        assert.equal(image.height, 32);
        assert.equal(app.window.getComputedStyle(image).width, '32px');
        assert.equal(app.window.getComputedStyle(image).height, '32px');
        assert.equal(image.loading, 'lazy');
        assert.equal(image.alt, '');
        image.dispatchEvent(new app.window.Event('error'));
        assert.equal(app.document.querySelector('.see-item-image'), null);
        assert.ok(app.rows()[0].textContent.includes('Item 1'));
    }
});

test('compatibility buy orders and history retain their existing Steam images', async t => {
    const imageURL = 'https://community.akamai.steamstatic.com/economy/image/test-icon/38fx38f';
    for (const kind of ['buyorders', 'history']) {
        const app = boot(t, kind, [], url => url.pathname === '/market/actions'
            ? response({}, 429)
            : response({ success: true, start: 0, total_count: 1, results_html: legacyRow('1', 'Item', { buy: kind === 'buyorders', history: kind === 'history', image: imageURL }) }));
        await waitFor(() => app.document.querySelector('.see-item-image'));
        const image = app.document.querySelector('.see-item-image');
        assert.equal(image.src, imageURL);
        assert.equal(image.width, 32);
        assert.equal(image.height, 32);
    }
});

test('untrusted compatibility image URLs are ignored', async t => {
    const app = boot(t, 'history', [], () => response({ success: true, start: 0, total_count: 1, results_html: legacyRow('1', 'Item', { history: true, image: 'https://untrusted.example/image.png' }) }));
    await waitFor(() => app.document.querySelector('tbody a'));
    assert.equal(app.document.querySelector('tbody img'), null);
});

test('market controls and messages use English even when the Steam page language differs', async t => {
    for (const kind of ['activelistings', 'buyorders', 'history']) {
        const app = boot(t, kind, [query(kind, [entry('1')])], () => response({ success: true, start: 0, total_count: 1, results_html: legacyRow('1', 'Item', { history: true }) }), 'zh-CN');
        if (kind === 'history') {
            await waitFor(() => app.document.querySelector('tbody a'));
        } else if (kind === 'activelistings') {
            app.click('Modify');
        }
        const host = app.document.querySelector('#see-modern-market');
        assert.doesNotMatch(host.textContent, /\p{Script=Han}/u);
        for (const node of host.querySelectorAll('[aria-label], [title], [placeholder]')) {
            assert.doesNotMatch([node.getAttribute('aria-label'), node.getAttribute('title'), node.getAttribute('placeholder')].join(' '), /\p{Script=Han}/u);
        }
    }
});

test('name, dates and numeric prices toggle ascending/descending; missing typical prices stay last', t => {
    const app = boot(t, 'activelistings', [query('activelistings', [
        entry('1', 1050, { name: 'Zebra', time: 1795000000, typical: 100 }),
        entry('2', 329, { name: 'Alpha', time: 1795500000, typical: 200 }),
        entry('3', 900, { name: 'Beta', time: 1795200000 })
    ])]);
    for (const [label, ascending, descending] of [
        ['Name', ['2', '3', '1'], ['1', '3', '2']],
        ['Listed on', ['1', '3', '2'], ['2', '3', '1']],
        ['Asking price', ['2', '3', '1'], ['1', '3', '2']],
        ['Typical price', ['1', '2', '3'], ['2', '1', '3']]
    ]) {
        app.click(label);
        assert.deepEqual(app.rows().map(row => row.dataset.id), ascending);
        app.click(label);
        assert.deepEqual(app.rows().map(row => row.dataset.id), descending);
    }
    assert.equal(app.document.querySelector('th[aria-sort=descending] button').textContent, 'Typical price');
});

test('search covers types, games, localized and decimal prices; selection survives filtering and sorting', t => {
    const app = boot(t, 'activelistings', [query('activelistings', [
        entry('1', 329, { game: 'Steam', type: 'Trading Card' }),
        entry('2', 1050, { game: 'Other', type: 'Booster Pack' })
    ])]);
    for (const term of ['Trading Card', 'Steam', '3.29', '３．２９']) {
        app.search(term);
        assert.deepEqual(app.rows().map(row => row.dataset.id), ['1']);
    }
    app.click('Select All');
    app.search('Booster Pack');
    app.click('Select All');
    app.search('');
    app.click('Asking price');
    assert.equal(app.document.querySelectorAll('tbody input:checked').length, 2);
    app.click('Deselect All');
    assert.equal(app.document.querySelectorAll('tbody input:checked').length, 0);
});

test('buy orders load complete compatibility results when the new endpoint is rate limited', async t => {
    const app = boot(t, 'buyorders', [query('buyorders', [entry('1')], true)], url => {
        if (url.pathname === '/market/actions') {
            return response({}, 429);
        }
        assert.equal(url.pathname, '/market/mylistings');
        return response({ success: true, total_count: 1, results_html: legacyRow('1', 'First', { buy: true }) + legacyRow('2', 'Second', { buy: true }) + legacyRow('3', 'Third', { buy: true }) });
    });
    await waitFor(() => app.rows().length === 3);
    assert.equal(app.calls.length, 2);
    app.search('Second');
    assert.equal(app.rows()[0].querySelectorAll('td')[3].textContent, 'HK$ 3.29');
    assert.equal(app.rows()[0].querySelectorAll('td')[2].textContent, '99');
});

test('new queries advance by actual returned count when Steam clamps page sizes', async t => {
    const app = boot(t, 'buyorders', [], (url, options, number) => {
        const args = JSON.parse(url.searchParams.get('qp'));
        assert.equal(args[0], number === 1 ? 0 : 2);
        assert.equal(args[1], number === 1 ? 50 : 25);
        return response({ data: { eResult: 1, rgBuyOrders: number === 1 ? [entry('1'), entry('2')] : [entry('3')], bMore: number === 1 } });
    });
    await waitFor(() => app.rows().length === 3);
    assert.equal(app.calls.length, 2);
});

test('buy-order batches appear before loading completes and preserve search, sorting and selection', async t => {
    const makeEntries = (start, count) => Array.from({ length: count }, (_, i) => {
        const id = start + i;
        return entry(String(id), 329, { name: `${id % 2 === 0 ? 'Group' : 'Other'} ${id}`, quantity: id });
    });
    const pending = new Map();
    const app = boot(t, 'buyorders', [query('buyorders', makeEntries(1, 50), true)], url => {
        const [offset, count] = JSON.parse(url.searchParams.get('qp'));
        assert.equal(count, 25);
        return new Promise(resolve => pending.set(offset, resolve));
    });
    assert.equal(app.rows().length, 50);
    assert.ok(pending.has(50));
    app.search('Group');
    app.click('Quantity');
    app.click('Select All');
    assert.equal(app.document.querySelectorAll('tbody input:checked').length, 25);
    assert.ok([...app.document.querySelectorAll('button')].find(node => node.textContent === 'Cancel selected').disabled);

    pending.get(50)(response({ data: { eResult: 1, rgBuyOrders: makeEntries(51, 25), bMore: true } }));
    await waitFor(() => pending.has(75));
    assert.equal(app.rows().length, 37);
    assert.equal(app.document.querySelector('input[type=search]').value, 'Group');
    assert.equal(app.document.querySelector('th[aria-sort=ascending] button').textContent, 'Quantity');
    assert.equal(app.document.querySelectorAll('tbody input:checked').length, 25);
    assert.ok(app.document.querySelector('thead input').indeterminate);
    assert.match(app.document.querySelector('[role=status]').textContent, /75 loaded/);

    pending.get(75)(response({ data: { eResult: 1, rgBuyOrders: makeEntries(76, 5), bMore: false } }));
    await waitFor(() => ![...app.document.querySelectorAll('button')].find(node => node.textContent === 'Cancel selected').disabled);
    assert.equal(app.rows().length, 40);
    assert.equal(app.document.querySelectorAll('tbody input:checked').length, 25);
    assert.deepEqual(app.rows().map(row => Number(row.dataset.id)), Array.from({ length: 40 }, (_, i) => (i + 1) * 2));
    app.search('');
    assert.equal(app.rows().length, 80);
    assert.equal(new Set(app.rows().map(row => row.dataset.id)).size, 80);
});

test('already displayed buy orders survive failure of both remaining queries and compatibility fallback', async t => {
    const app = boot(t, 'buyorders', [query('buyorders', [entry('1'), entry('2')], true)], url => response({}, url.pathname === '/market/actions' ? 429 : 503));
    assert.equal(app.rows().length, 2);
    app.click('Select All');
    await waitFor(() => [...app.document.querySelectorAll('button')].some(node => node.textContent === 'Retry'));
    assert.equal(app.rows().length, 2);
    assert.equal(app.document.querySelectorAll('tbody input:checked').length, 2);
    assert.match(app.document.querySelector('[role=status]').textContent, /503/);
});

test('compatibility refresh uses current prices instead of stale SSR prices', async t => {
    const app = boot(t, 'activelistings', [query('activelistings', [entry('1', 329, { typical: 350 })])], url => {
        if (url.pathname === '/market/actions') {
            return response({}, 429);
        }
        return response({ success: true, total_count: 1, results_html: legacyRow('1', 'Item 1', { price: 'HK$ 4.29 (HK$ 3.73)' }) });
    });
    app.click('Refresh');
    await waitFor(() => app.rows()[0]?.querySelectorAll('td')[3].textContent.includes('4.29'));
    assert.equal(app.rows()[0].querySelectorAll('td')[4].textContent, 'HK$3.50');
    app.click('Modify');
    assert.equal(app.document.querySelector('dialog input').value, '3.73');
});

test('missing wallet metadata cannot cause a compatibility price change in the wrong currency', async t => {
    const app = boot(t, 'activelistings', [], url => url.pathname === '/market/actions'
        ? response({}, 429)
        : response({ success: true, total_count: 1, results_html: legacyRow('1', 'Item', { price: 'HK$ 3.29 (HK$ 2.87)' }) }));
    await waitFor(() => app.rows().length === 1);
    app.click('Modify');
    assert.equal(app.document.querySelector('dialog'), null);
    assert.match(app.document.querySelector('[role=status]').textContent, /Cannot determine the listing currency/);
    assert.equal(app.calls.filter(call => call.options.method === 'POST').length, 0);
});

test('header selection is scoped to filtered rows and indicates partial selections', t => {
    const app = boot(t, 'buyorders', [query('buyorders', [entry('1', 329, { quantity: 20 }), entry('2', 329, { quantity: 3 })])]);
    app.click('Quantity');
    assert.deepEqual(app.rows().map(row => row.dataset.id), ['2', '1']);
    app.rows()[0].querySelector('input').click();
    assert.ok(app.document.querySelector('thead input').indeterminate);
    app.search('Item 1');
    app.document.querySelector('thead input').click();
    app.search('');
    assert.ok(app.document.querySelector('thead input').checked);
});

test('sell removal recognizes the legacy empty-array response, while unknown responses stop', async t => {
    const app = boot(t, 'activelistings', [query('activelistings', [entry('1'), entry('2')])], (url, options, number) => response(number === 1 ? [] : {}));
    app.click('Select All');
    app.click('Remove selected');
    await waitFor(() => app.document.querySelector('[role=status]').textContent.includes('operation stopped'));
    assert.deepEqual(app.rows().map(row => row.dataset.id), ['2']);
    assert.equal(app.document.querySelectorAll('tbody input:checked').length, 1);
});

test('batch removal confirms hidden selections, sends exact string IDs and stops on application failure', async t => {
    const confirmations = [];
    const app = boot(t, 'activelistings', [query('activelistings', [entry('9007199254740993123', 329, { name: 'Hidden' }), entry('2', 329, { name: 'Visible' })])], (url, options) => {
        assert.equal(options.method, 'POST');
        assert.equal(options.body.get('sessionid'), 'test-session');
        return response({ success: false, message: 'denied' });
    });
    app.click('Select All');
    app.search('Visible');
    app.window.confirm = message => {
 confirmations.push(message); return false; 
};
    app.click('Remove selected');
    assert.equal(app.calls.length, 0);
    app.window.confirm = message => {
 confirmations.push(message); return true; 
};
    app.click('Remove selected');
    await waitFor(() => app.document.querySelector('[role=status]').textContent.includes('operation stopped'));
    assert.match(confirmations.at(-1), /1 selected item is hidden by the current filter/);
    assert.equal(app.calls.length, 1);
    assert.match(app.calls[0].url, /9007199254740993123$/);
    app.search('');
    assert.equal(app.rows().length, 2);
    assert.equal(app.document.querySelectorAll('tbody input:checked').length, 2);
});

test('successful batch removal deletes only confirmed successes and updates zero counts', async t => {
    const app = boot(t, 'buyorders', [query('buyorders', [entry('1'), entry('2')])], (url, options) => {
        assert.equal(url.pathname, '/market/cancelbuyorder/');
        assert.equal(options.body.get('buy_orderid'), String(app.calls.length));
        return response({ success: 1 });
    });
    app.click('Select All');
    app.click('Cancel selected');
    await waitFor(() => app.calls.length === 2 && app.rows().length === 0);
    assert.match(app.document.querySelector('.see-status').textContent, /0 \/ 0/);
    assert.ok(app.document.querySelector('input[type=checkbox]').disabled);
});

test('modify submits seller price and currency to the native action and reports mobile confirmation', async t => {
    const app = boot(t, 'activelistings', [query('activelistings', [entry('9007199254740993123')])], (url, options) => {
        assert.equal(url.pathname, '/market/actions');
        assert.deepEqual(JSON.parse(options.body), { m: 'UpdateSellListingPrice', mp: ['9007199254740993123', 300, 2029] });
        return response({ data: { eResult: 1, eUpdateResult: 1, bRequiresConfirmation: true } });
    });
    app.click('Modify');
    app.document.querySelector('dialog input').value = '3.00';
    app.click('Save price');
    await waitFor(() => app.document.querySelector('dialog').textContent.includes('Submitted'));
    assert.ok(app.document.querySelector('dialog button').disabled);
    app.click('Close');
    assert.equal(app.document.querySelector('dialog'), null);
});

test('history defaults to 500, supports numbered pages, jumps and a partial final page', async t => {
    const app = boot(t, 'history', [], url => {
        assert.equal(url.pathname, '/market/myhistory/render/');
        const start = Number(url.searchParams.get('start'));
        const count = Number(url.searchParams.get('count'));
        return response({ success: true, start, total_count: 1250, results_html: Array.from({ length: Math.min(count, 1250 - start) }, (_, i) => legacyRow(String(start + i), 'History Item', { history: true })).join('') });
    });
    await waitFor(() => app.document.querySelectorAll('tbody tr').length === 500);
    assert.equal(new URL(app.calls[0].url, app.window.location.origin).searchParams.get('count'), '500');
    app.click('2');
    await waitFor(() => app.document.querySelector('[aria-current=page]')?.textContent === '2');
    assert.equal(app.document.querySelectorAll('tbody tr').length, 500);
    const jump = app.document.querySelector('input[aria-label="Page number"]');
    jump.value = '3';
    app.document.querySelector('.see-history-pagination').dispatchEvent(new app.window.Event('submit', { cancelable: true }));
    await waitFor(() => app.document.querySelector('[aria-current=page]')?.textContent === '3');
    assert.equal(app.document.querySelectorAll('tbody tr').length, 250);
    assert.equal(new URL(app.calls.at(-1).url, app.window.location.origin).searchParams.get('start'), '1000');
});

test('history name search scans all batches and results paginate locally', async t => {
    const events = Array.from({ length: 520 }, (_, i) => historyEvent(i, Date.now() - i * 1000, `Needle ${i}`));
    const app = boot(t, 'history', [], historyService(events));
    await waitFor(() => app.document.querySelector('tbody a'));
    searchHistory(app, { name: 'ＮＥＥＤＬＥ' });
    await waitFor(() => searchComplete(app));
    assert.match(app.document.querySelector('[role=status]').textContent, /520 matches/);
    assert.equal(app.document.querySelectorAll('tbody tr').length, 500);
    const before = app.calls.length;
    app.click('Next');
    assert.equal(app.calls.length, before);
    assert.equal(app.document.querySelectorAll('tbody tr').length, 20);
    assert.match(app.document.querySelector('tbody').textContent, /Needle 519/);
    assert.ok(app.calls.some(call => new URL(call.url, app.window.location.origin).searchParams.get('start') === '500'));
});

test('date-only history search uses binary page lookup and exact full timestamps', async t => {
    const base = new Date('2026-11-26T12:00:00').getTime();
    const events = Array.from({ length: 8192 }, (_, i) => historyEvent(i, base - i * 3600000));
    const app = boot(t, 'history', [], historyService(events));
    await waitFor(() => app.document.querySelector('tbody a'));
    searchHistory(app, { from: '2026-03-01', to: '2026-03-02' });
    await waitFor(() => searchComplete(app));
    assert.match(app.document.querySelector('[role=status]').textContent, /48 matches/);
    assert.equal(app.document.querySelectorAll('tbody tr').length, 48);
    const queries = app.calls.filter(call => new URL(call.url, app.window.location.origin).pathname === '/market/actions');
    assert.ok(queries.length < 35, `Expected a binary lookup, received ${queries.length} page requests`);
    assert.ok(queries.every(call => JSON.parse(new URL(call.url, app.window.location.origin).searchParams.get('qp'))[0] > 1000));
    for (const row of app.document.querySelectorAll('tbody tr')) {
        assert.match(row.children[2].textContent, /3\/[12]\/2026/);
        assert.equal(row.children[3].textContent, 'HK$3.50');
    }
});

test('date boundaries include the full final day and do not confuse identical dates in different years', async t => {
    const events = [
        historyEvent('newer', new Date('2026-03-02T00:00:00').getTime()),
        historyEvent('late', new Date('2026-03-01T23:59:59.999').getTime()),
        historyEvent('early', new Date('2026-03-01T00:00:00').getTime()),
        historyEvent('older', new Date('2025-03-01T12:00:00').getTime())
    ];
    const app = boot(t, 'history', [], historyService(events));
    await waitFor(() => app.document.querySelector('tbody a'));
    searchHistory(app, { from: '2026-03-01', to: '2026-03-01' });
    await waitFor(() => searchComplete(app));
    assert.deepEqual([...app.document.querySelectorAll('tbody a')].map(a => a.textContent), ['History item late', 'History item early']);
    assert.equal(app.calls.filter(call => new URL(call.url, app.window.location.origin).pathname === '/market/actions').length, 1);
});

test('date lookup retains all equal timestamps across page boundaries', async t => {
    const times = [
        ...Array(12).fill(new Date('2026-03-02T00:00:00').getTime()),
        ...Array(50).fill(new Date('2026-03-01T00:00:00').getTime()),
        ...Array(16).fill(new Date('2026-02-28T23:59:59.999').getTime())
    ];
    const events = times.map((time, i) => historyEvent(i, time));
    const app = boot(t, 'history', [], historyService(events));
    await waitFor(() => app.document.querySelector('tbody a'));
    searchHistory(app, { from: '2026-03-01', to: '2026-03-01' });
    await waitFor(() => searchComplete(app));
    assert.equal(app.document.querySelectorAll('tbody a').length, 50);
    assert.deepEqual([...app.document.querySelectorAll('tbody a')].map(a => a.textContent), events.slice(12, 62).map(event => event.description.name));
});

test('name and date criteria are combined, and either date bound can be omitted', async t => {
    const events = [
        historyEvent('1', new Date('2026-03-03T12:00:00').getTime(), 'Needle new'),
        historyEvent('2', new Date('2026-03-02T12:00:00').getTime(), 'Other'),
        historyEvent('3', new Date('2026-03-01T12:00:00').getTime(), 'Needle old')
    ];
    const app = boot(t, 'history', [], historyService(events));
    await waitFor(() => app.document.querySelector('tbody a'));
    searchHistory(app, { name: 'needle', from: '2026-03-02' });
    await waitFor(() => searchComplete(app));
    assert.deepEqual([...app.document.querySelectorAll('tbody a')].map(a => a.textContent), ['Needle new']);
    searchHistory(app, { to: '2026-03-02' });
    await waitFor(() => searchComplete(app));
    assert.deepEqual([...app.document.querySelectorAll('tbody a')].map(a => a.textContent), ['Other', 'Needle old']);
});

test('a date range outside the recorded history returns no matches', async t => {
    const events = Array.from({ length: 60 }, (_, i) => historyEvent(i, new Date('2026-03-01T12:00:00').getTime() - i * 3600000));
    const app = boot(t, 'history', [], historyService(events));
    await waitFor(() => app.document.querySelector('tbody a'));
    searchHistory(app, { from: '2027-01-01', to: '2027-01-02' });
    await waitFor(() => searchComplete(app));
    assert.match(app.document.querySelector('[role=status]').textContent, /0 matches/);
    assert.equal(app.document.querySelectorAll('tbody a').length, 0);
});

test('history search rejects empty criteria and reversed dates before sending requests', async t => {
    const app = boot(t, 'history', [], historyService([historyEvent('1', Date.now())]));
    await waitFor(() => app.document.querySelector('tbody a'));
    const before = app.calls.length;
    searchHistory(app);
    assert.match(app.document.querySelector('[role=status]').textContent, /Enter an item name/);
    searchHistory(app, { from: '2026-03-02', to: '2026-03-01' });
    assert.match(app.document.querySelector('[role=status]').textContent, /valid date range/);
    assert.equal(app.calls.length, before);
});

test('stopping history name search aborts the pending request and retains results already found', async t => {
    const events = Array.from({ length: 520 }, (_, i) => historyEvent(i, Date.now() - i * 1000, i === 0 ? 'Needle' : 'Other'));
    const service = historyService(events);
    let pendingSignal;
    const app = boot(t, 'history', [], (url, options) => {
        if (url.searchParams.get('start') === '500') {
            pendingSignal = options.signal;
            return new Promise((resolve, reject) => options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true }));
        }
        return service(url);
    });
    await waitFor(() => app.document.querySelector('tbody a'));
    searchHistory(app, { name: 'Needle' });
    await waitFor(() => pendingSignal);
    assert.equal(app.document.querySelectorAll('tbody a').length, 1);
    app.click('Stop search');
    await waitFor(() => app.document.querySelector('[role=status]').textContent.startsWith('Search stopped.'));
    assert.ok(pendingSignal.aborted);
    assert.equal(app.document.querySelector('tbody a').textContent, 'Needle');
    assert.ok(!app.document.querySelector('[aria-label="Search history by item name"]').disabled);
    app.click('Clear search');
    await waitFor(() => app.document.querySelectorAll('tbody a').length === 500);
});

test('stopping during binary date lookup also aborts immediately', async t => {
    const events = Array.from({ length: 100 }, (_, i) => historyEvent(i, Date.now() - i * 3600000));
    const service = historyService(events);
    let pendingSignal;
    const app = boot(t, 'history', [], (url, options) => {
        if (url.pathname === '/market/actions') {
            pendingSignal = options.signal;
            return new Promise((resolve, reject) => options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true }));
        }
        return service(url);
    });
    await waitFor(() => app.document.querySelector('tbody a'));
    searchHistory(app, { from: '2026-03-01' });
    await waitFor(() => pendingSignal);
    app.click('Stop search');
    await waitFor(() => app.document.querySelector('[role=status]').textContent.startsWith('Search stopped.'));
    assert.ok(pendingSignal.aborted);
    assert.equal(app.document.querySelectorAll('tbody a').length, 0);
});

test('date search reports failure instead of guessing years when the timestamp endpoint fails', async t => {
    const events = [historyEvent('1', Date.now())];
    const service = historyService(events);
    const app = boot(t, 'history', [], url => url.pathname === '/market/actions' ? response({}, 429) : service(url));
    await waitFor(() => app.document.querySelector('tbody a'));
    searchHistory(app, { from: '2026-03-01' });
    await waitFor(() => app.document.querySelector('[role=status]').textContent.includes('Search stopped:'));
    assert.match(app.document.querySelector('[role=status]').textContent, /429/);
    assert.equal(app.document.querySelectorAll('tbody a').length, 0);
});

test('history fills a display page from clamped responses without skipping offsets', async t => {
    const offsets = [];
    const app = boot(t, 'history', [], url => {
        const start = Number(url.searchParams.get('start'));
        offsets.push(start);
        return response({ success: true, start, total_count: 80, results_html: Array.from({ length: Math.min(25, 80 - start) }, (_, i) => legacyRow(String(start + i), 'History', { history: true })).join('') });
    });
    await waitFor(() => app.document.querySelectorAll('tbody tr').length === 80);
    assert.deepEqual(offsets, [0, 25, 50, 75]);
});

test('history errors retain the current page and provide retry; loading disables pagination', async t => {
    let fail = false;
    const app = boot(t, 'history', [], url => {
        if (fail) {
            return response({}, 429);
        }
        const start = Number(url.searchParams.get('start'));
        return response({ success: true, start, total_count: 1000, results_html: Array.from({ length: 500 }, (_, i) => legacyRow(String(start + i), 'Record', { history: true })).join('') });
    });
    await waitFor(() => app.document.querySelectorAll('tbody tr').length === 500);
    fail = true;
    app.click('Next');
    assert.ok(app.document.querySelector('.see-history-pagination button').disabled);
    await waitFor(() => app.document.querySelector('[role=status]').textContent.includes('429'));
    assert.equal(app.document.querySelectorAll('tbody tr').length, 500);
    assert.equal(app.document.querySelector('[aria-current=page]').textContent, '1');
    fail = false;
    app.click('Retry');
    await waitFor(() => app.document.querySelector('[aria-current=page]')?.textContent === '2');
});

test('changing history page size keeps the current position and rolls back after a failed request', async t => {
    let fail = false;
    const app = boot(t, 'history', [], url => {
        if (fail) {
            return response({}, 429);
        }
        const start = Number(url.searchParams.get('start'));
        const count = Number(url.searchParams.get('count'));
        return response({ success: true, start, total_count: 1250, results_html: Array.from({ length: Math.min(count, 1250 - start) }, (_, i) => legacyRow(String(start + i), 'Record', { history: true })).join('') });
    });
    await waitFor(() => app.document.querySelectorAll('tbody tr').length === 500);
    app.click('2');
    await waitFor(() => app.document.querySelector('[aria-current=page]')?.textContent === '2');
    let select = app.document.querySelector('select');
    fail = true;
    select.value = '100';
    select.dispatchEvent(new app.window.Event('change'));
    await waitFor(() => app.document.querySelector('[role=status]').textContent.includes('429'));
    assert.equal(app.document.querySelector('select').value, '500');
    fail = false;
    app.click('Retry');
    await waitFor(() => app.document.querySelectorAll('tbody tr').length === 100);
    select = app.document.querySelector('select');
    assert.equal(select.value, '100');
    assert.equal(app.document.querySelector('[aria-current=page]').textContent, '6');
    assert.equal(new URL(app.calls.at(-1).url, app.window.location.origin).searchParams.get('start'), '500');
});

test('untrusted names render as text; native content can be restored; SPA navigation remounts once', async t => {
    const app = boot(t, 'activelistings', [query('activelistings', [entry('1', 329, { name: '<img src=x onerror=alert(1)>' })]), query('buyorders', [])]);
    assert.equal(app.document.querySelectorAll('#see-modern-market img').length, 0);
    assert.match(app.rows()[0].textContent, /<img/);
    app.click('Show original Steam list');
    assert.equal(app.document.querySelector('#see-modern-market'), null);
    assert.ok(!app.document.querySelector('#native').hasAttribute('data-see-native-market'));
    app.window.history.pushState({}, '', '/market/buyorders');
    app.window.dispatchEvent(new app.window.Event('popstate'));
    await waitFor(() => app.document.querySelector('#see-modern-market'));
    assert.equal(app.document.querySelectorAll('#see-modern-market').length, 1);
    assert.match(app.document.querySelector('#see-modern-market').textContent, /Buy orders/);
});
