import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { JSDOM, VirtualConsole } from 'jsdom';
import jquery from 'jquery';
import async from 'async';

const source = await readFile(new URL('../code.user.js', import.meta.url), 'utf8');

async function waitFor(check) {
    for (let i = 0; i < 100; i++) {
        if (check()) {
            return;
        }
        await new Promise(resolve => setTimeout(resolve, 5));
    }
    assert.fail('Inventory UI did not settle');
}

async function inventory(t, settings = {}, config = {}) {
    const errors = [];
    const console = new VirtualConsole();
    console.on('jsdomError', error => {
        if (!error.message.includes('navigation')) {
            errors.push(error);
        }
    });
    const markup = config.trade ? '<div id="inventory_displaycontrols"></div><div class="trade_right"><div><div><div><div class="trade_item_box"></div></div></div></div></div><section><div class="offerheader"><div></div><div></div><div></div></div><span></span><div class="offerheader"><div></div><div></div><div></div></div></section>' : '<div id="global_action_menu"></div><div id="inventory_logos"><div id="inventory_applogo"></div></div><div class="inventory_rightnav"></div><div id="inventories"><div class="inventory_ctn"><div class="inventory_page"><div class="itemHolder"><div class="item" id="753_6_123"></div></div></div></div></div>';
    const dom = new JSDOM(`<!doctype html><html><head></head><body>${markup}</body></html>`, {
        url: config.trade ? 'https://steamcommunity.com/tradeoffer/new/' : 'https://steamcommunity.com/id/test/inventory', runScripts: 'outside-only', virtualConsole: console
    });
    t.after(() => dom.window.close());
    const w = dom.window;
    w.document.documentElement.lang = config.language || '';
    w.g_strLanguage = config.steamLanguage;
    const $ = jquery(w);
    let selectable;
    const observations = [];
    $.fn.selectable = function (options) {
        selectable = options;
        return this;
    };
    $.fn.observe = function (events, callback) {
        observations.push({ target: this[0], callback });
        return this;
    };
    $.ajax = () => assert.fail('Inventory button tests must not contact Steam');
    w.jQuery = $;
    w.unsafeWindow = w;
    w.async = async;
    w.localforage = { createInstance: () => ({ clear: async () => {}, getItem: async () => null, setItem: async () => {} }) };
    w.g_bLoggedIn = true;
    w.g_rgWalletInfo = { wallet_currency: 29, wallet_country: 'HK' };
    w.GetCurrencyCode = () => 'HKD';
    w.v_currencyformat = cents => `HK$${(cents / 100).toFixed(2)}`;
    w.g_steamID = 'test';
    w.g_ActiveUser = { strSteamId: 'test' };
    w.CInventory = function () {};
    w.CInventory.prototype.SelectItem = function () {};
    const item = { appid: 753, contextid: '6', marketable: 1, commodity: true, name: 'Test Card', market_hash_name: 'Test Card', owner_actions: [{ link: 'GetGooValue' }] };
    w.g_ActiveInventory = { m_appid: 753, m_contextid: '6', m_rgChildInventories: {}, m_rgAssets: { 123: item }, LoadCompleteInventory: () => ({ done: fn => fn() }) };
    if (config.trade) {
        w.g_ActiveInventory = { rgChildInventories: {}, rgInventory: {} };
        const price = w.document.createElement('div');
        price.innerHTML = '<span class="inventory_item_price price_329">HK$3.29</span>';
        const tradeItem = { name: '<b>Select All</b>', type: 'Trading Card', marketable: false, element: price };
        w.g_rgCurrentTradeStatus = { me: { assets: [{ appid: 753, contextid: '6', assetid: '123' }, { appid: 753, contextid: '6', assetid: '456' }] }, them: { assets: [] } };
        w.UserYou = { findAsset: () => tradeItem };
        w.UserThem = { findAsset: () => null };
    }
    for (const [key, value] of Object.entries({ SETTING_INVENTORY_PRICE_LABELS: 0, SETTING_QUICK_SELL_BUTTONS: 0, ...settings })) {
        w.localStorage.setItem(key, value);
    }
    let saveSettings;
    let sellDialog;
    w.ShowConfirmDialog = (title, content) => {
        $('<div class="newmodal"></div>').append(content).appendTo(w.document.body);
        return { done: fn => {
            saveSettings = fn;
        } };
    };
    w.ShowDialog = (title, content) => {
        sellDialog = content;
        return { OnDismiss() {} };
    };
    w.ShowAlertDialog = () => {};
    w.eval(source);
    await waitFor(() => w.document.querySelector(config.trade ? '.select_all' : '.sell_manual'));
    const select = async checked => {
        $('.itemHolder').toggleClass('ui-selected', checked);
        selectable[checked ? 'selected' : 'unselected']();
        await new Promise(resolve => setTimeout(resolve, 5));
    };
    return { w, $, select, errors, save: () => saveSettings(), dialog: () => sellDialog, updateTrade: () => observations.find(observation => observation.target?.matches('.trade_item_box')).callback() };
}

test('mandatory bulk sell stays visible and changes disabled state on selection and deselection', async t => {
    const app = await inventory(t);
    const button = app.w.document.querySelector('.sell_manual');
    assert.equal(button.textContent, 'Bulk sell items');
    assert.equal(button.disabled, true);
    assert.equal(button.title, 'Select at least one item to sell in bulk');
    assert.notEqual(app.w.getComputedStyle(button).display, 'none');
    button.click();
    assert.equal(app.dialog(), undefined);
    await app.select(true);
    assert.equal(button.disabled, false);
    button.click();
    await waitFor(() => app.dialog());
    assert.match(app.dialog(), /\/market\/multisell\?appid=753&contextid=6&items\[\]=Test%20Card&qty\[\]=1/);
    await app.select(false);
    assert.equal(button.disabled, true);
    assert.equal(button.title, 'Select at least one item to sell in bulk');
    assert.notEqual(app.w.getComputedStyle(button).display, 'none');
    assert.deepEqual(app.errors, []);
});

test('every optional action has a persisted checkbox and selection cannot reveal a disabled action', async t => {
    const app = await inventory(t, { SETTING_SHOW_SELL_SELECTED: 0, SETTING_SHOW_GEM_SELECTED: 0 });
    await app.select(true);
    for (const selector of ['.sell_selected', '.turn_into_gems']) {
        assert.equal(app.w.getComputedStyle(app.w.document.querySelector(selector)).display, 'none');
    }
    app.$('#see_settings a').trigger('click');
    const modal = app.w.document.querySelector('.newmodal');
    const boxes = [...modal.querySelectorAll('.see-button-settings input[type=checkbox]')];
    assert.equal(boxes.length, 9);
    assert.equal(boxes.filter(box => !box.checked).length, 2);
    for (const box of boxes) {
        box.checked = false;
    }
    app.save();
    for (const box of boxes) {
        assert.equal(app.w.localStorage.getItem(box.id), '0');
    }
    await app.select(false);
    await app.select(true);
    for (const button of app.w.document.querySelectorAll('#inventory_sell_buttons a')) {
        assert.equal(app.w.getComputedStyle(button).display, 'none');
    }
    const mandatory = app.w.document.querySelector('.sell_manual');
    assert.equal(mandatory.disabled, false);
    assert.notEqual(app.w.getComputedStyle(mandatory).display, 'none');
    assert.deepEqual(app.errors, []);
});

test('inventory controls, selection counts and settings follow the Steam language', async t => {
    for (const [language, text] of [
        ['schinese', { bulk: '批量出售物品', tip: '选中至少一件进行批量销售的物品', selected: '出售选中的 1 件物品', settings: '价格计算方式：', buttons: '库存操作按钮' }],
        ['russian', { bulk: 'Массовая продажа предметов', tip: 'Выберите хотя бы один предмет для массовой продажи', selected: 'Продать выбранные предметы (1)', settings: 'Способ расчёта цены:', buttons: 'Кнопки действий в инвентаре' }]
    ]) {
        const app = await inventory(t, {}, { steamLanguage: language });
        const manual = app.w.document.querySelector('.sell_manual');
        assert.equal(manual.textContent, text.bulk);
        assert.equal(manual.title, text.tip);
        await app.select(true);
        assert.equal(app.w.document.querySelector('.sell_selected').textContent, text.selected);
        manual.click();
        await waitFor(() => app.dialog());
        assert.match(app.dialog(), /items\[\]=Test%20Card/);
        app.$('#see_settings a').trigger('click');
        const modal = app.w.document.querySelector('.newmodal');
        assert.ok(modal.textContent.includes(text.settings));
        assert.ok(modal.textContent.includes(text.buttons));
        assert.doesNotMatch(modal.textContent, /Calculate prices as the|Show price labels|\{p\d+\}/);
        assert.equal(modal.querySelectorAll('.see-button-settings input[type=checkbox]').length, 9);
        await app.select(false);
        assert.equal(manual.disabled, true);
        assert.equal(manual.title, text.tip);
        assert.deepEqual(app.errors, []);
    }
});

test('obsolete market pricing settings are ignored and absent from the configuration modal', async t => {
    const app = await inventory(t, { SETTING_RELIST_AUTOMATICALLY: 1, SETTING_PRICE_MIN_CHECK_PRICE: 10 });
    app.$('#see_settings a').trigger('click');
    const modal = app.w.document.querySelector('.newmodal');
    assert.equal(modal.querySelector('#SETTING_RELIST_AUTOMATICALLY, #SETTING_PRICE_MIN_CHECK_PRICE, .market_relist_auto'), null);
    assert.doesNotMatch(modal.textContent, /overpriced|underpriced|Don't check market listings/i);
    assert.ok(modal.querySelector('#SETTING_PRICE_ALGORITHM')); // Inventory selling still uses this setting.
    assert.deepEqual(app.errors, []);
});

test('trade-offer controls and totals are localized while item names remain literal', async t => {
    for (const [language, labels] of [
        ['english', { select: 'Select all from page', unique: 'Number of unique items: 1', count: 'Total items: 2' }],
        ['schinese', { select: '选择当前页全部物品', unique: '不同物品种类：1', count: '物品总数：2' }],
        ['russian', { select: 'Выбрать всё на странице', unique: 'Уникальных предметов: 1', count: 'Всего предметов: 2' }]
    ]) {
        const app = await inventory(t, {}, { steamLanguage: language, trade: true });
        assert.equal(app.w.document.querySelector('.select_all').textContent.trim(), labels.select);
        app.updateTrade();
        const summary = app.w.document.querySelector('#trade_offer_your_sum');
        assert.ok(summary.textContent.includes(labels.unique));
        assert.ok(summary.textContent.includes(labels.count));
        assert.ok(summary.textContent.includes('HK$6.58'));
        assert.ok(summary.textContent.includes('<b>Select All</b> (Trading Card)'));
        assert.equal(summary.querySelector('b'), null);
        assert.doesNotMatch(summary.textContent, /\{p\d+\}/);
        assert.deepEqual(app.errors, []);
    }
});
