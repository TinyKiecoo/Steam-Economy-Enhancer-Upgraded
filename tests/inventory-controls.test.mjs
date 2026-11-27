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

async function inventory(t, settings = {}) {
    const errors = [];
    const console = new VirtualConsole();
    console.on('jsdomError', error => {
        if (!error.message.includes('navigation')) {
            errors.push(error);
        }
    });
    const dom = new JSDOM('<!doctype html><html><head></head><body><div id="global_action_menu"></div><div id="inventory_logos"><div id="inventory_applogo"></div></div><div class="inventory_rightnav"></div><div id="inventories"><div class="inventory_ctn"><div class="inventory_page"><div class="itemHolder"><div class="item" id="753_6_123"></div></div></div></div></div></body></html>', {
        url: 'https://steamcommunity.com/id/test/inventory', runScripts: 'outside-only', virtualConsole: console
    });
    t.after(() => dom.window.close());
    const w = dom.window;
    const $ = jquery(w);
    let selectable;
    $.fn.selectable = function (options) {
        selectable = options;
        return this;
    };
    $.fn.observe = function () {
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
    w.g_steamID = 'test';
    w.g_ActiveUser = { strSteamId: 'test' };
    w.CInventory = function () {};
    w.CInventory.prototype.SelectItem = function () {};
    const item = { appid: 753, contextid: '6', marketable: 1, commodity: true, name: 'Test Card', market_hash_name: 'Test Card', owner_actions: [{ link: 'GetGooValue' }] };
    w.g_ActiveInventory = { m_appid: 753, m_contextid: '6', m_rgChildInventories: {}, m_rgAssets: { 123: item }, LoadCompleteInventory: () => ({ done: fn => fn() }) };
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
    await waitFor(() => w.document.querySelector('.sell_manual'));
    const select = async checked => {
        $('.itemHolder').toggleClass('ui-selected', checked);
        selectable[checked ? 'selected' : 'unselected']();
        await new Promise(resolve => setTimeout(resolve, 5));
    };
    return { w, $, select, errors, save: () => saveSettings(), dialog: () => sellDialog };
}

test('mandatory bulk sell stays visible and changes disabled state on selection and deselection', async t => {
    const app = await inventory(t);
    const button = app.w.document.querySelector('.sell_manual');
    assert.equal(button.textContent, '批量出售物品');
    assert.equal(button.disabled, true);
    assert.equal(button.title, '选中至少一件进行批量销售的物品');
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
    assert.equal(button.title, '选中至少一件进行批量销售的物品');
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
