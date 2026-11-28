import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const source = await readFile(new URL('../code.user.js', import.meta.url), 'utf8');
const region = source.slice(source.indexOf('function calculateMarketReference('), source.indexOf('//#endregion Market reference pricing'));
const calculate = new Function(`return (${region});`)();
const now = Date.parse('2026-11-28T12:00:00Z');
const settings = { algorithm: 1, hours: 12, ignoreLowest: true, minimum: 5, maximum: 1000 };
const book = (ask = 200, buy = 100, firstQuantity = 20, secondQuantity = 30) => ({
    amtMinSellOrder: ask, amtMaxBuyOrder: buy, rgCompactSellOrders: [ask, firstQuantity, ask + 100, secondQuantity]
});
const history = [[new Date(now - 3600000).toISOString(), 400, 1]];
const reference = (prices, orders, overrides = {}, beforeFees = price => price) => calculate(prices, orders, { ...settings, ...overrides }, beforeFees, now);

test('upstream history pricing weights volume, floors cents and excludes the exact time boundary', () => {
    const prices = [
        [new Date(now - 3600000).toISOString(), 301.2, 1],
        [new Date(now - 7200000).toISOString(), 402.2, 3],
        [new Date(now - 12 * 3600000).toISOString(), 10000, 1000]
    ];
    assert.equal(reference(prices, book()), 376);
    assert.equal(reference(prices, book(), { hours: 1 }), 200);
    assert.equal(reference(prices, book(500)), 500);
});

test('all four upstream algorithms retain their history, listing and buy-order priorities', () => {
    assert.equal(reference(history, book()), 400);
    assert.equal(reference(history, book(), { algorithm: 2 }), 200);
    assert.equal(reference(history, book(), { algorithm: 3 }), 100);
    assert.equal(reference(history, book(700, 600), { algorithm: 4 }), 400);
    assert.equal(reference(history, book(200, -2), { algorithm: 3 }), 200);
});

test('all six upstream low-quantity boundaries use per-level quantities and respect the setting', () => {
    for (const [second, limit] of [[1000, 50], [500, 50], [80, 12], [40, 8], [20, 5], [5, 1.5]]) {
        assert.equal(reference([], book(200, 100, limit, second)), 300);
        assert.equal(reference([], book(200, 100, limit + 0.1, second)), 200);
        assert.equal(reference([], book(200, 100, limit, second), { ignoreLowest: false }), 200);
    }
    assert.equal(reference([], { ...book(), rgCompactSellOrders: [200, 1] }), 200);
});

test('upstream clamps before applying the highest buy order, except for history-only mode', () => {
    assert.equal(reference([], null), 1000);
    assert.equal(reference(history, book(), { minimum: 500 }), 500);
    assert.equal(reference(history, book(), { maximum: 300 }), 300);
    assert.equal(reference(history, book(200, 800), { maximum: 300 }), 800);
    assert.equal(reference(history, book(200, 800), { maximum: 300, algorithm: 4 }), 300);
    // All inputs and limits are seller prices after fee conversion; offsets never enter the comparison.
    assert.equal(reference(history, book(), { minimum: 5, maximum: 1000 }, price => Math.floor(price / 2)), 200);
});
