// ==UserScript==
// @name         Steam-Economy-Enhancer-Upgraded
// @icon         data:image/svg+xml,%0A%3Csvg xmlns="http://www.w3.org/2000/svg" xml:space="preserve" fill-rule="evenodd" stroke-linejoin="round" stroke-miterlimit="2" clip-rule="evenodd" viewBox="0 0 267 267"%3E%3Ccircle cx="133.3" cy="133.3" r="133.3" fill="%2326566c"/%3E%3Cpath fill="%23ebebeb" fill-rule="nonzero" d="m50 133 83-83 84 83-84 84-83-84Zm83 62 62-61-62-62v123Z"/%3E%3C/svg%3E
// @namespace    https://github.com/TinyKiecoo
// @author       TinyKiecoo
// @license      MIT
// @version      7.6.1
// @description  Enhances the Steam Inventory and Steam Market.
// @match        https://steamcommunity.com/id/*/inventory*
// @match        https://steamcommunity.com/profiles/*/inventory*
// @match        https://steamcommunity.com/market*
// @match        https://steamcommunity.com/tradeoffer*
// @require      https://cdnjs.cloudflare.com/ajax/libs/jquery/3.7.1/jquery.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/jqueryui/1.14.1/jquery-ui.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/async/3.2.6/async.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/localforage/1.10.0/localforage.min.js
// @require      https://raw.githubusercontent.com/kapetan/jquery-observe/ca67b735bb3ae8d678d1843384ebbe7c02466c61/jquery-observe.js
// @grant        unsafeWindow
// @homepageURL  https://github.com/TinyKiecoo/Steam-Economy-Enhancer-Upgraded
// @homepage     https://github.com/TinyKiecoo/Steam-Economy-Enhancer-Upgraded
// @supportURL   https://github.com/TinyKiecoo/Steam-Economy-Enhancer-Upgraded/issues
// @downloadURL  https://raw.githubusercontent.com/TinyKiecoo/Steam-Economy-Enhancer-Upgraded/master/code.user.js
// @updateURL    https://raw.githubusercontent.com/TinyKiecoo/Steam-Economy-Enhancer-Upgraded/master/code.user.js
// ==/UserScript==

/*
 * Steam-Economy-Enhancer-Upgraded is a fork of Steam Economy Enhancer by Nuklon.
 * Upstream: https://github.com/Nuklon/Steam-Economy-Enhancer
 * Original copyright and MIT permission notice are retained below.
 *
 * MIT License
 *
 * Copyright (c) 2016
 * Copyright (c) 2026 TinyKiecoo (fork modifications)
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

/* disable some eslint rules until the code is cleaned up */
/* global unsafeWindow, jQuery, async, localforage */
/* eslint no-undef: off */

// jQuery is already added by Steam, force no conflict mode.
(function ($, async) {
    $.noConflict(true);

    // The SSR market has neither the legacy DOM nor GetCurrencyCode/g_rgWalletInfo.
    // Keep its initialization ahead of all code which requires those globals.
    if (location.pathname.startsWith('/market')) {
        initializeModernMarket();
        return;
    }

    //#region Modern market
    function initializeModernMarket() {
        const currencyCodes = 'USD GBP EUR CHF RUB PLN BRL JPY NOK IDR MYR PHP SGD THB VND KRW TRY UAH MXN CAD AUD NZD CNY INR CLP PEN COP ZAR HKD TWD SAR AED SEK ARS ILS BYN KZT KWD QAR CRC UYU BGN HRK CZK DKK HUF RON'.split(' ');
        const seed = readMarketSeed();
        const walletCurrency = seed.queries.find(q => q.queryKey[0] === 'CurrentUserWalletDetails')?.state.data?.currency_code || null;
        const locale = 'en-US';
        const sourceLocale = document.documentElement.lang || navigator.language || locale;
        let view;
        let suppressedPath;
        let scheduled;

        function readMarketSeed() {
            try {
                const ssr = unsafeWindow.SSR || JSON.parse(document.getElementById('valve-ssr-data').textContent);
                const data = typeof ssr.renderContext.queryData === 'string' ? JSON.parse(ssr.renderContext.queryData) : ssr.renderContext.queryData;
                return Array.isArray(data?.queries) ? data : { queries: [] };
            } catch {
                return { queries: [] };
            }
        }

        function element(tag, text, className) {
            const node = document.createElement(tag);
            if (text != null) {
                node.textContent = text;
            }
            if (className) {
                node.className = className;
            }
            return node;
        }

        function button(text, action, parent) {
            const node = element('button', text);
            node.type = 'button';
            node.addEventListener('click', action);
            parent?.append(node);
            return node;
        }

        function money(value, currency = walletCurrency) {
            const id = Number(currency) >= 2000 ? Number(currency) - 2000 : Number(currency);
            const code = currencyCodes[id - 1];
            if (!code) {
                return `${(Number(value) / 100).toFixed(2)} (${currency})`;
            }
            // Steam expresses even zero-decimal currencies in hundredths.
            return new Intl.NumberFormat(locale, { style: 'currency', currency: code }).format(Number(value) / 100);
        }

        function numberFromPrice(text) {
            const token = text.replace(/\([^)]*\)/g, '').match(/[\d][\d\s.,\u00a0]*/)?.[0].trim() || '0';
            const decimal = token.match(/[.,](\d{1,2})$/);
            const whole = (decimal ? token.slice(0, decimal.index) : token).replace(/\D/g, '');
            return Number(whole) * 100 + Number((decimal?.[1] || '').padEnd(2, '0'));
        }

        function dateText(value) {
            return value ? new Date(value).toLocaleString(locale) : '—';
        }

        function itemURL(description) {
            return `/market/listings/${Number(description.appid)}/${encodeURIComponent(description.market_bucket_group_id || description.market_hash_name || description.name || '')}`;
        }

        function itemImage(description, fallback = '') {
            const source = description.icon_url
                ? `https://community.steamstatic.com/economy/image/${description.icon_url}/64fx64f`
                : fallback;
            try {
                const url = new URL(source);
                return url.protocol === 'https:' && (url.hostname.endsWith('.steamstatic.com') || url.hostname.endsWith('.akamaihd.net')) ? url.href : '';
            } catch {
                return '';
            }
        }

        function seedRows(kind) {
            return seed.queries.filter(q => kind === 'buyorders'
                ? q.queryKey[0] === 'buy_orders' && q.queryKey[1] === true
                : q.queryKey[0] === 'listings' && q.queryKey[1]?.category === 'active' && q.queryKey[1]?.bGetAllData)
                .flatMap(q => q.state.data?.pages || []);
        }

        function modernRow(entry, kind) {
            const buy = kind === 'buyorders';
            const data = buy ? entry.order : entry.listing;
            const description = entry.description || {};
            const currency = buy ? data.wallet_currency : data.currencyid;
            const seller = Number(data.original_price_per_unit ?? data.price);
            const price = buy ? Number(data.price) : seller + Number(data.steam_fee_per_unit ?? data.steam_fee ?? 0) + Number(data.publisher_fee_per_unit ?? data.publisher_fee ?? 0);
            return {
                id: String(buy ? data.buy_orderid : data.listingid),
                name: description.market_name || description.name || data.hash_name,
                type: description.type || '',
                game: description.tags?.find(t => t.category === 'Game')?.localized_tag_name || (Number(description.appid) === 753 ? 'Steam Community Items' : ''),
                description,
                href: itemURL(description),
                image: itemImage(description),
                date: Number(data.time_created || 0) * 1000,
                dateText: dateText(Number(data.time_created || 0) * 1000),
                quantity: Number(buy ? data.quantity_remaining : data.asset?.amount || 1),
                price,
                priceText: money(price, currency),
                seller,
                pendingConfirmation: data.price_update_pending_confirmation === true || Number(data.price_update_pending_confirmation) === 1,
                sellerText: buy ? '' : money(seller, currency),
                typical: entry.recent_price == null ? null : Number(entry.recent_price),
                typicalText: entry.recent_price == null ? '—' : money(entry.recent_price, entry.recent_price_currency),
                currency
            };
        }

        function parseLegacy(data, kind) {
            // Parse only text and known attributes. Never execute Steam's hover JS or inject response HTML.
            const parsed = new DOMParser().parseFromString(data.results_html || '', 'text/html');
            const descriptions = new Map();
            const hoverPattern = /CreateItemHoverFromContainer\(\s*g_rgAssets\s*,\s*'([^']+)_name'\s*,\s*(\d+)\s*,\s*'(\d+)'\s*,\s*'(\d+)'/g;
            for (const match of (data.hovers || '').matchAll(hoverPattern)) {
                descriptions.set(match[1], data.assets?.[match[2]]?.[match[3]]?.[match[4]] || {});
            }
            const enriched = new Map(seedRows(kind).flatMap(p => p[kind === 'buyorders' ? 'buy_orders' : 'listings'] || []).map(e => {
                const row = modernRow(e, kind);
                return [row.id, row];
            }));
            const selector = kind === 'history' ? '.market_listing_row' : kind === 'buyorders' ? '[id^="mybuyorder_"].market_listing_row' : '[id^="mylisting_"].market_listing_row';
            return Array.from(parsed.querySelectorAll(selector), node => {
                const name = node.querySelector('.market_listing_item_name');
                const link = node.querySelector('.market_listing_item_name_link');
                const priceNode = node.querySelector('.market_listing_price')?.cloneNode(true);
                priceNode?.querySelector('.market_listing_inline_buyorder_qty')?.remove();
                const priceText = priceNode?.textContent.replace(/\s+/g, ' ').trim() || '—';
                const id = node.id.replace(/^my(?:listing|buyorder)_/, '');
                const description = descriptions.get(node.id) || descriptions.get(node.id.replace('mybuyorder_', 'mbuyorder_')) || {};
                const dates = node.querySelectorAll('.market_listing_listed_date.can_combine');
                const href = link?.getAttribute('href') || itemURL(description);
                const row = {
                    id,
                    name: name?.textContent.trim() || '',
                    type: description.type || node.querySelector('.market_listing_game_name')?.textContent.trim() || '',
                    game: description.tags?.find(t => t.category === 'Game')?.localized_tag_name || (Number(description.appid || new URL(href, location.origin).pathname.split('/')[3]) === 753 ? 'Steam Community Items' : ''),
                    description,
                    href,
                    image: itemImage(description, node.querySelector('.market_listing_item_img')?.getAttribute('src')),
                    date: legacyDate(dates[0]?.textContent || ''),
                    dateText: dates[0]?.textContent.trim() || '—',
                    actedText: dates[1]?.textContent.trim() || '—',
                    action: node.querySelector('.market_listing_gainorloss')?.textContent.includes('+') ? 'Purchased' : 'Sold',
                    quantity: Number(node.querySelector('.market_listing_buyorder_qty')?.textContent.trim() || description.amount || 1),
                    price: numberFromPrice(priceText),
                    priceText: priceText.split('(')[0].trim(),
                    sellerText: priceText.match(/\(([^)]+)\)/)?.[1] || '',
                    typical: null,
                    typicalText: '—',
                    currency: walletCurrency
                };
                const known = enriched.get(id);
                return known ? {
                    ...row,
                    description: known.description,
                    image: known.image || row.image,
                    game: known.game,
                    date: known.date,
                    dateText: known.dateText,
                    typical: known.typical,
                    typicalText: known.typicalText,
                    currency: known.currency,
                    seller: numberFromPrice(row.sellerText)
                } : row;
            });
        }

        function legacyDate(text) {
            // The compatibility endpoint omits the year. Prefer exact SSR timestamps when available.
            const now = new Date();
            let month;
            let day;
            const numeric = text.match(/(\d+)\s*月\s*(\d+)/);
            if (numeric) {
                month = Number(numeric[1]) - 1;
                day = Number(numeric[2]);
            } else {
                day = Number(text.match(/\d+/)?.[0]);
                const languages = [sourceLocale, locale];
                month = Array.from({ length: 12 }, (_, i) => i).find(i => languages.some(language => {
                    const label = new Intl.DateTimeFormat(language, { month: 'short' }).format(new Date(2020, i, 1));
                    return text.toLocaleLowerCase().includes(label.toLocaleLowerCase());
                }));
            }
            if (month == null || !day) {
                return 0;
            }
            const date = new Date(now.getFullYear(), month, day);
            if (date > now) {
                date.setFullYear(date.getFullYear() - 1);
            }
            return date.getTime();
        }

        async function jsonRequest(url, state, options = {}) {
            const response = await fetch(url, {
                credentials: 'same-origin',
                ...options,
                signal: AbortSignal.any([state.controller.signal, ...(options.signal ? [options.signal] : []), AbortSignal.timeout(30000)])
            });
            if (!response.ok) {
                const error = new Error(response.status === 429 ? 'Too many Steam requests. Please try again later (429).' : `Steam request failed (${response.status}).`);
                error.status = response.status;
                throw error;
            }
            try {
                return await response.json();
            } catch {
                throw new Error('Steam returned a non-JSON response. Please check that you are still signed in.');
            }
        }

        async function queryAction(name, args, state, signal) {
            const params = new URLSearchParams({ q: name, qp: JSON.stringify(args) });
            const result = await jsonRequest(`/market/actions?${params}`, state, { headers: { 'x-valve-request-type': 'queryAction' }, signal });
            if (result.data?.eResult !== 1) {
                throw new Error(`Steam ${name} failed (${result.data?.eResult ?? 'no data'}).`);
            }
            return result.data;
        }

        async function loadOrders(state, fresh = false) {
            state.loading = true;
            state.notice = '';
            renderOrders(state);
            state.status.textContent = 'Loading items…';
            try {
                const pages = fresh ? [] : seedRows(state.kind);
                const rows = new Map(pages.flatMap(p => p[state.kind === 'buyorders' ? 'buy_orders' : 'listings'] || []).map(e => {
                    const row = modernRow(e, state.kind);
                    return [row.id, row];
                }));
                const publish = () => {
                    if (!state.controller.signal.aborted) {
                        state.rows = Array.from(rows.values()).filter(row => !state.item || matchesItem(row, state.item));
                        renderOrders(state);
                    }
                };
                publish();
                let more = !pages.length || pages.at(-1).more;
                let offset = rows.size;
                try {
                    while (more) {
                        const buy = state.kind === 'buyorders';
                        // Steam accepts 50 initially, but only 25 on subsequent pages.
                        const count = offset === 0 ? 50 : 25;
                        const data = await queryAction(buy ? 'QueryMyBuyOrders' : 'QueryMyListings', [offset, count, buy ? true : { bGetAllData: true, category: 'active' }], state);
                        if (state.controller.signal.aborted) {
                            return;
                        }
                        const entries = data[buy ? 'rgBuyOrders' : 'rgListings'] || [];
                        const previousSize = rows.size;
                        entries.forEach(entry => {
                            const row = modernRow(entry, state.kind);
                            rows.set(row.id, row);
                        });
                        more = data.bMore;
                        if (more && (!entries.length || rows.size === previousSize)) {
                            throw new Error('Steam returned a duplicate or empty page. Please refresh and try again.');
                        }
                        offset += entries.length;
                        publish();
                        if (more) {
                            await pause(1000);
                        }
                    }
                } catch (error) {
                    if (state.controller.signal.aborted) {
                        throw error;
                    }
                    const loaded = new Map(rows);
                    rows.clear();
                    offset = 0;
                    do {
                        const data = await jsonRequest(`/market/mylistings?start=${offset}&count=100`, state);
                        if (state.controller.signal.aborted) {
                            return;
                        }
                        if (!data.success) {
                            throw new Error('Steam did not return valid listings. Please check that you are signed in.');
                        }
                        const batch = parseLegacy(data, state.kind);
                        const before = rows.size;
                        batch.forEach(row => {
                            const known = loaded.get(row.id);
                            rows.set(row.id, known ? {
                                ...row,
                                description: known.description,
                                image: known.image || row.image,
                                game: known.game,
                                date: known.date,
                                dateText: known.dateText,
                                typical: known.typical,
                                typicalText: known.typicalText,
                                currency: known.currency
                            } : row);
                        });
                        publish();
                        // The legacy endpoint includes ALL buy orders on every sell-listing page.
                        if (state.kind === 'buyorders') {
                            break;
                        }
                        offset += batch.length;
                        more = offset < Number(data.total_count);
                        if (more && rows.size === before) {
                            throw new Error('Steam could not return the next batch of listings. Please refresh and try again.');
                        }
                        if (more) {
                            await pause(1000);
                        }
                    } while (more);
                    state.notice = 'Using the Steam compatibility endpoint. Unavailable typical prices are shown as —.';
                }
                if (state.controller.signal.aborted) {
                    return;
                }
                state.rows = Array.from(rows.values()).filter(row => !state.item || matchesItem(row, state.item));
                const available = new Set(state.rows.map(row => row.id));
                state.selected = new Set([...state.selected].filter(id => available.has(id)));
                state.loading = false;
                renderOrders(state);
            } catch (error) {
                showError(state, error, () => loadOrders(state, true));
            }
        }

        function pause(ms, signal) {
            return new Promise((resolve, reject) => {
                if (signal?.aborted) {
                    reject(signal.reason);
                    return;
                }
                const done = () => {
                    signal?.removeEventListener('abort', abort);
                    resolve();
                };
                const timer = setTimeout(done, ms);
                const abort = () => {
                    clearTimeout(timer);
                    reject(signal.reason);
                };
                signal?.addEventListener('abort', abort, { once: true });
            });
        }

        function searchText(row) {
            return [row.name, row.game, row.type, row.description.market_hash_name,
                ...(row.description.tags || []).map(t => t.localized_tag_name),
                ...(row.description.descriptions || []).map(d => d.value),
                row.dateText, row.quantity, row.priceText, (row.price / 100).toFixed(2), row.sellerText, row.typicalText,
                row.typical == null ? '' : (row.typical / 100).toFixed(2)].join(' ').normalize('NFKC').toLocaleLowerCase();
        }

        function matches(state) {
            const terms = state.search.value.normalize('NFKC').toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
            return state.rows.filter(row => terms.every(term => searchText(row).includes(term)));
        }

        function renderOrders(state) {
            const rows = matches(state);
            if (state.sort) {
                const { key, direction } = state.sort;
                rows.sort((a, b) => {
                    if (a[key] == null || b[key] == null) {
                        return a[key] == null ? (b[key] == null ? 0 : 1) : -1;
                    }
                    return direction * (typeof a[key] === 'number' ? a[key] - b[key] : String(a[key]).localeCompare(String(b[key]), locale, { numeric: true }));
                });
            }
            state.body.replaceChildren();
            for (const row of rows) {
                const tr = element('tr');
                tr.dataset.id = row.id;
                const td = element('td');
                const checkbox = element('input');
                checkbox.type = 'checkbox';
                checkbox.checked = state.selected.has(row.id);
                checkbox.disabled = state.busy;
                checkbox.setAttribute('aria-label', `Select ${row.name}`);
                checkbox.addEventListener('change', () => {
                    if (checkbox.checked) {
                        state.selected.add(row.id);
                    } else {
                        state.selected.delete(row.id);
                    }
                    updateSelection(state);
                });
                td.append(checkbox);
                tr.append(td, itemCell(row));
                tr.append(element('td', state.kind === 'buyorders' ? row.quantity : row.dateText));
                const price = element('td', row.priceText);
                if (row.sellerText) {
                    price.append(element('small', `(${row.sellerText})`));
                }
                tr.append(price, element('td', row.typicalText));
                const actions = element('td');
                const action = button(state.kind === 'buyorders' ? 'Cancel' : 'Modify', () => state.kind === 'buyorders' ? removeOrders(state, [row]) : modifyOrder(state, row), actions);
                action.disabled = state.busy || state.loading;
                tr.append(actions);
                state.body.append(tr);
            }
            if (!rows.length) {
                const cell = element('td', state.loading ? 'Loading…' : 'No matching items.');
                cell.colSpan = 6;
                const tr = element('tr');
                tr.append(cell);
                state.body.append(tr);
            }
            state.count.textContent = `Showing ${rows.length} / ${state.rows.length} items · ${state.selected.size} selected`;
            state.status.textContent = state.loading ? `Loading items… ${state.rows.length} loaded.` : state.notice || '';
            updateSelection(state);
        }

        function itemCell(row) {
            const td = element('td', null, 'see-item');
            const content = element('div', null, 'see-item-content');
            if (row.image) {
                const image = element('img', null, 'see-item-image');
                image.src = row.image;
                image.alt = '';
                image.width = 32;
                image.height = 32;
                image.loading = 'lazy';
                image.decoding = 'async';
                image.addEventListener('error', () => image.remove(), { once: true });
                content.append(image);
            }
            const text = element('div', null, 'see-item-text');
            const link = element('a', row.name);
            const url = new URL(row.href, location.origin);
            if (url.origin === location.origin && url.pathname.startsWith('/market/listings/')) {
                link.href = url.href;
            }
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            text.append(link, element('small', [...new Set([row.game, row.type].filter(Boolean))].join(' · ')));
            content.append(text);
            td.append(content);
            return td;
        }

        function updateSelection(state) {
            const rows = matches(state);
            const count = rows.filter(row => state.selected.has(row.id)).length;
            state.all.checked = rows.length > 0 && count === rows.length;
            state.all.indeterminate = count > 0 && count < rows.length;
            state.all.disabled = state.busy || !rows.length;
            state.remove.disabled = state.loading || state.busy || !state.selected.size;
            state.select.disabled = state.busy || !rows.length;
            state.deselect.disabled = state.busy || !state.selected.size;
            state.refresh.disabled = state.loading || state.busy;
            if (state.reprice) {
                state.reprice.disabled = state.loading || state.busy || !state.selected.size;
            }
            state.count.textContent = `Showing ${rows.length} / ${state.rows.length} items · ${state.selected.size} selected`;
            renderTotals(state, rows);
        }

        function renderTotals(state, visible) {
            const total = rows => {
                const groups = new Map();
                for (const row of rows) {
                    const currency = row.currency == null ? null : Number(row.currency) >= 2000 ? Number(row.currency) - 2000 : Number(row.currency);
                    const value = groups.get(currency) || { buyer: 0, seller: 0, missing: false };
                    value.buyer += row.price * row.quantity;
                    const seller = row.seller ?? (row.sellerText ? numberFromPrice(row.sellerText) : null);
                    value.seller += (seller || 0) * row.quantity;
                    value.missing ||= seller == null;
                    groups.set(currency, value);
                }
                return [...groups].map(([currency, value]) => state.kind === 'buyorders'
                    ? money(value.buyer, currency)
                    : `${money(value.buyer, currency)} buyer pays / ${value.missing ? 'unavailable' : money(value.seller, currency)} you receive`).join(' · ') || '—';
            };
            state.totals.replaceChildren(element('div', `${state.kind === 'buyorders' ? 'Buy order commitment' : 'Sell listing total'}${state.loading ? ' (loaded so far)' : ''}: ${total(state.rows)}`));
            if (visible.length !== state.rows.length) {
                state.totals.append(element('div', `Filtered: ${total(visible)}`));
            }
            if (state.selected.size) {
                state.totals.append(element('div', `Selected: ${total(state.rows.filter(row => state.selected.has(row.id)))}`));
            }
        }

        async function cancelOrder(state, row) {
            const sessionid = document.cookie.split('; ').find(c => c.startsWith('sessionid='))?.slice(10);
            if (!sessionid) {
                throw new Error('Steam session not found. Please sign in again and retry.');
            }
            const buy = state.kind === 'buyorders';
            const body = new URLSearchParams({ sessionid, ...(buy ? { buy_orderid: row.id } : {}) });
            const result = await jsonRequest(buy ? '/market/cancelbuyorder/' : `/market/removelisting/${row.id}`, state, { method: 'POST', body });
            // The legacy sell-removal endpoint uses [] for a successful cancellation.
            const accepted = !buy && Array.isArray(result) && result.length === 0 || result?.success === true || result?.success === 1;
            if (!accepted) {
                throw new Error(result?.message || `Steam did not confirm cancellation (${result?.success ?? 'no result'}).`);
            }
        }

        async function removeOrders(state, rows) {
            if (state.loading || state.busy || !rows.length) {
                return;
            }
            const visible = new Set(matches(state).map(row => row.id));
            const hidden = rows.filter(row => !visible.has(row.id)).length;
            if (!unsafeWindow.confirm(`${state.kind === 'buyorders' ? 'Cancel' : 'Remove'} these ${rows.length} ${state.kind === 'buyorders' ? 'buy orders' : 'listings'}?${hidden ? `\n${hidden} selected ${hidden === 1 ? 'item is' : 'items are'} hidden by the current filter.` : ''}\n${rows.slice(0, 5).map(row => `${row.name} · ${row.priceText}`).join('\n')}`)) {
                return;
            }
            state.busy = true;
            renderOrders(state);
            let completed = 0;
            try {
                for (const row of rows) {
                    if (state.controller.signal.aborted) {
                        return;
                    }
                    state.status.textContent = `Cancelling ${completed + 1} / ${rows.length}…`;
                    await cancelOrder(state, row);
                    completed++;
                    state.rows = state.rows.filter(r => r.id !== row.id);
                    state.selected.delete(row.id);
                    renderOrders(state);
                    if (completed < rows.length) {
                        await pause(1000);
                    }
                }
                state.notice = `Successfully cancelled ${completed} items.`;
            } catch (error) {
                // A failed/ambiguous POST is never retried automatically.
                state.notice = `Cancelled ${completed} items; operation stopped: ${error.message} Refresh to verify the results before trying again.`;
            } finally {
                state.busy = false;
                if (!state.controller.signal.aborted) {
                    renderOrders(state);
                }
            }
        }

        async function updateListingPrice(state, row, cents) {
            const currency = Number(row.currency) < 2000 ? Number(row.currency) + 2000 : Number(row.currency);
            const result = await jsonRequest('/market/actions', state, {
                method: 'POST',
                headers: { 'x-valve-request-type': 'mutationAction', 'Content-Type': 'application/json; charset=utf-8' },
                body: JSON.stringify({ m: 'UpdateSellListingPrice', mp: [row.id, cents, currency] })
            });
            const data = result.data;
            if (data?.eResult !== 1 || data.eUpdateResult !== 1) {
                throw new Error(`Steam did not confirm the price change (${data?.eUpdateResult ?? data?.eResult ?? 'no result'}).`);
            }
            return data;
        }

        async function loadOrderBook(state, appid, name, signal) {
            const params = new URLSearchParams({ q: 'Load', qp: JSON.stringify([Number(appid), name]) });
            const result = await jsonRequest(`/market/orderbook?${params}`, state, { signal });
            const book = result.data?.success ? result.data.data : null;
            if (!book || !Array.isArray(book.rgCompactSellOrders) || !Array.isArray(book.rgCompactBuyOrders)) {
                throw new Error('Steam did not return a complete order book.');
            }
            return book;
        }

        function listingQuote(seller, fees, wallet) {
            const minimum = Number(wallet.wallet_market_minimum);
            const increment = Number(wallet.wallet_currency_increment);
            const base = seller <= minimum ? minimum : Math.ceil(seller / increment) * increment;
            const fee = rule => {
                if (Number(rule.fee_rate ?? 0) <= 0.0000001) {
                    return 0;
                }
                const amount = Math.max(minimum, Math.floor(Math.trunc(base * Number(rule.fee_rate ?? 0)) / increment + 0.5) * increment);
                return Number(rule.fee_cap) > 0 ? Math.min(Number(rule.fee_cap), amount) : amount;
            };
            return { seller: base, price: base + fee(fees.steam_fee) + fee(fees.publisher_fee) };
        }

        function quoteAtAsk(ask, fees, wallet) {
            let low = 1;
            let high = ask;
            let quote;
            while (low <= high) {
                const mid = Math.floor((low + high) / 2);
                const candidate = listingQuote(mid, fees, wallet);
                if (candidate.price <= ask) {
                    quote = candidate;
                    low = mid + 1;
                } else {
                    high = mid - 1;
                }
            }
            return quote;
        }

        async function repriceOrders(state) {
            const rows = state.rows.filter(row => state.selected.has(row.id));
            if (state.loading || state.busy || !rows.length) {
                return;
            }
            state.busy = true;
            renderOrders(state);
            const controller = new AbortController();
            const dialog = element('dialog', null, 'see-market-dialog see-reprice-dialog');
            dialog.append(element('h3', 'Reprice selected listings'));
            dialog.append(element('p', 'Use the current lowest sell price per item. Asking prices include Steam and publisher fees; rounding may leave the buyer price slightly below the target. All selected items, including filtered-out items, appear here.'));
            const message = element('p', 'Loading fresh prices and fee rules…', 'see-status');
            dialog.append(message);
            const preview = makeTable({ host: dialog });
            const header = preview.createTHead().insertRow();
            ['Item', 'Current ask', 'Lowest ask', 'New ask', 'You receive', 'Status'].forEach(text => header.append(element('th', text)));
            const body = preview.createTBody();
            const controls = element('div', null, 'see-toolbar');
            dialog.append(controls);
            let submitting = false;
            let preparedAt;
            const prepared = [];
            const save = button('Apply price changes', async () => {
                if (Date.now() - preparedAt > 60000) {
                    save.disabled = true;
                    message.textContent = 'This preview is over one minute old. Close it and prepare a fresh preview.';
                    return;
                }
                if (!unsafeWindow.confirm(`Directly update ${prepared.length} listing prices shown in this preview?`)) {
                    return;
                }
                submitting = true;
                save.disabled = true;
                close.disabled = true;
                let completed = 0;
                let confirmations = 0;
                try {
                    for (const item of prepared) {
                        item.status.textContent = 'Submitting…';
                        const result = await updateListingPrice(state, item.row, item.quote.seller);
                        completed++;
                        if (result.bRequiresConfirmation) {
                            confirmations++;
                            item.row.pendingConfirmation = true;
                            item.status.textContent = 'Confirm in Steam app / email';
                        } else {
                            const quote = listingQuote(Number(result.nPrice ?? item.quote.seller), item.fees, item.wallet);
                            Object.assign(item.row, quote, { priceText: money(quote.price, item.row.currency), sellerText: money(quote.seller, item.row.currency) });
                            item.status.textContent = 'Updated';
                        }
                        renderOrders(state);
                        if (completed < prepared.length) {
                            await pause(1000, state.controller.signal);
                        }
                    }
                    message.textContent = `Updated ${completed} listings. ${confirmations} require Steam confirmation. Refresh to verify final prices.`;
                } catch (error) {
                    message.textContent = `Updated ${completed} listings; stopped: ${error.message} Refresh to verify results before trying again.`;
                } finally {
                    submitting = false;
                    close.disabled = false;
                }
            }, controls);
            save.disabled = true;
            const close = button('Close', () => dialog.close(), controls);
            dialog.addEventListener('cancel', event => {
                if (submitting) {
                    event.preventDefault();
                }
            });
            dialog.addEventListener('close', () => {
                controller.abort();
                dialog.remove();
                state.busy = false;
                if (!state.controller.signal.aborted) {
                    renderOrders(state);
                }
            }, { once: true });
            state.host.append(dialog);
            dialog.showModal();
            try {
                const wallet = (await jsonRequest('/market/userbillinginfo', state, { signal: controller.signal })).wallet_info;
                if (!wallet || !Number.isSafeInteger(Number(wallet.wallet_market_minimum)) || Number(wallet.wallet_market_minimum) < 1 || !Number.isSafeInteger(Number(wallet.wallet_currency_increment)) || Number(wallet.wallet_currency_increment) < 1) {
                    throw new Error('Steam wallet rounding rules are unavailable.');
                }
                const cache = new Map();
                const feeCache = new Map();
                for (const row of rows) {
                    if (controller.signal.aborted) {
                        return;
                    }
                    const tr = body.insertRow();
                    tr.append(element('td', row.name), element('td', row.priceText));
                    const currency = Number(row.currency) >= 2000 ? Number(row.currency) - 2000 : Number(row.currency);
                    const appid = Number(row.description.appid);
                    const name = row.description.market_hash_name;
                    if (!currency || !appid || !name || Number(wallet.wallet_currency) !== currency) {
                        throw new Error('Cannot determine the item identity or matching wallet currency.');
                    }
                    const key = JSON.stringify([appid, name, currency]);
                    if (!cache.has(key)) {
                        const book = await loadOrderBook(state, appid, name, controller.signal);
                        if (Number(book.eCurrency) !== currency) {
                            throw new Error('Order book currency does not match the listing.');
                        }
                        const feeKey = JSON.stringify([appid, currency]);
                        if (!feeCache.has(feeKey)) {
                            const params = new URLSearchParams({ q: 'QueryFeeStructure', qp: JSON.stringify([appid, currency]) });
                            const result = await jsonRequest(`/market/actions?${params}`, state, { headers: { 'x-valve-request-type': 'queryAction' }, signal: controller.signal });
                            feeCache.set(feeKey, result.data);
                        }
                        const fees = feeCache.get(feeKey);
                        if (![fees?.steam_fee, fees?.publisher_fee].every(fee => fee && Number.isFinite(Number(fee.fee_rate ?? 0)) && Number(fee.fee_rate ?? 0) >= 0 && (fee.fee_cap == null || Number.isFinite(Number(fee.fee_cap))))) {
                            throw new Error('Steam fee rules are unavailable.');
                        }
                        cache.set(key, { ask: Number(book.amtMinSellOrder), fees });
                        await pause(1000, controller.signal);
                    }
                    const { ask, fees } = cache.get(key);
                    const quote = Number.isSafeInteger(ask) && ask > 0 ? quoteAtAsk(ask, fees, wallet) : null;
                    const status = element('td', row.pendingConfirmation ? 'Pending confirmation; skipped' : !quote ? 'No valid lowest ask; skipped' : quote.seller === row.seller ? 'Unchanged; skipped' : 'Ready');
                    tr.append(element('td', ask > 0 ? money(ask, currency) : '—'), element('td', quote ? money(quote.price, currency) : '—'), element('td', quote ? money(quote.seller, currency) : '—'), status);
                    if (quote && !row.pendingConfirmation && quote.seller !== row.seller) {
                        prepared.push({ row, quote, fees, wallet, status });
                    }
                }
                preparedAt = Date.now();
                message.textContent = `${prepared.length} / ${rows.length} listings ready. Review the prices before applying. Prices are a snapshot taken while preparing this preview.`;
                save.disabled = !prepared.length;
            } catch (error) {
                if (!controller.signal.aborted && !state.controller.signal.aborted) {
                    message.textContent = `Could not prepare prices: ${error.message}`;
                }
            }
        }

        function modifyOrder(state, row) {
            if (state.busy || state.loading) {
                return;
            }
            if (!row.currency) {
                state.status.textContent = 'Cannot determine the listing currency. Please refresh the page or modify it in the original Steam list.';
                return;
            }
            const dialog = element('dialog', null, 'see-market-dialog');
            state.host.append(dialog);
            dialog.append(element('h3', 'Modify listing'), element('p', row.name), element('p', `Asking price: ${row.priceText} · Typical price: ${row.typicalText}`));
            const label = element('label', 'You receive per item (after fees):');
            const input = element('input');
            input.type = 'number';
            input.min = '0.01';
            input.step = '0.01';
            input.value = ((row.seller ?? numberFromPrice(row.sellerText)) / 100).toFixed(2);
            label.append(input);
            dialog.append(label);
            const message = element('p', 'Lowering the price may require confirmation in the Steam mobile app or by email.', 'see-status');
            dialog.append(message);
            const controls = element('div', null, 'see-toolbar');
            dialog.append(controls);
            const save = button('Save price', async () => {
                const value = Number(input.value);
                const cents = Math.round(value * 100);
                if (!input.value || !Number.isFinite(value) || cents < 1 || Math.abs(value * 100 - cents) > 0.00001) {
                    message.textContent = 'Enter a price greater than zero with at most two decimal places.';
                    return;
                }
                if (!unsafeWindow.confirm(`Change the amount you receive per item for ${row.name} to ${money(cents, row.currency)}?`)) {
                    return;
                }
                save.disabled = true;
                remove.disabled = true;
                close.disabled = true;
                try {
                    const data = await updateListingPrice(state, row, cents);
                    message.textContent = data.bRequiresConfirmation ? 'Submitted. Confirm in the Steam mobile app or by email, then refresh the list.' : 'Price updated. Refresh the list to see the final Steam price.';
                } catch (error) {
                    message.textContent = `${error.message} Refresh to verify the result before trying again.`;
                } finally {
                    close.disabled = false;
                    remove.disabled = false;
                }
            }, controls);
            const remove = button('Remove this item', async () => {
                dialog.close();
                await removeOrders(state, [row]);
            }, controls);
            const close = button('Close', () => dialog.close(), controls);
            dialog.addEventListener('close', () => dialog.remove(), { once: true });
            dialog.showModal();
        }

        function ordersUI(state) {
            const toolbar = element('div', null, 'see-toolbar');
            state.search = element('input');
            state.search.type = 'search';
            state.search.placeholder = 'Search names, games, types, prices…';
            state.search.setAttribute('aria-label', 'Search all item information');
            state.search.addEventListener('input', () => renderOrders(state));
            state.remove = button(state.kind === 'buyorders' ? 'Cancel selected' : 'Remove selected', () => removeOrders(state, state.rows.filter(row => state.selected.has(row.id))), toolbar);
            if (state.kind !== 'buyorders') {
                state.reprice = button('重新上架选中物品', () => repriceOrders(state), toolbar);
                state.reprice.title = 'Reprice selected listings to the current lowest sell price';
            }
            const select = checked => {
                if (checked) {
                    matches(state).forEach(row => state.selected.add(row.id));
                } else {
                    state.selected.clear();
                }
                renderOrders(state);
            };
            state.select = button('Select All', () => select(true), toolbar);
            state.deselect = button('Deselect All', () => select(false), toolbar);
            state.refresh = button('Refresh', () => loadOrders(state, true), toolbar);
            toolbar.append(state.search);
            state.count = element('p', '', 'see-status');
            state.totals = element('div', '', 'see-totals');
            state.totals.setAttribute('aria-live', 'polite');
            state.host.append(state.totals, toolbar, state.count);
            const table = makeTable(state);
            const head = table.createTHead().insertRow();
            const selection = element('th');
            state.all = element('input');
            state.all.type = 'checkbox';
            state.all.setAttribute('aria-label', 'Select all matching items');
            state.all.addEventListener('change', () => {
                const checked = state.all.checked;
                matches(state).forEach(row => checked ? state.selected.add(row.id) : state.selected.delete(row.id));
                renderOrders(state);
            });
            selection.append(state.all);
            head.append(selection);
            const columns = [['name', 'Name'], [state.kind === 'buyorders' ? 'quantity' : 'date', state.kind === 'buyorders' ? 'Quantity' : 'Listed on'], ['price', state.kind === 'buyorders' ? 'Bid price' : 'Asking price'], ['typical', 'Typical price']];
            for (const [key, text] of columns) {
                const th = element('th');
                th.scope = 'col';
                th.setAttribute('aria-sort', 'none');
                const sort = button(text, () => {
                    state.sort = { key, direction: state.sort?.key === key ? -state.sort.direction : 1 };
                    head.querySelectorAll('[aria-sort]').forEach(h => h.setAttribute('aria-sort', 'none'));
                    th.setAttribute('aria-sort', state.sort.direction === 1 ? 'ascending' : 'descending');
                    renderOrders(state);
                }, th);
                sort.title = `Sort by ${text.toLowerCase()} in ascending or descending order`;
                head.append(th);
            }
            head.append(element('th', 'Action'));
            state.body = table.createTBody();
            loadOrders(state);
        }

        function makeTable(state) {
            const wrap = element('div', null, 'see-table-wrap');
            const table = element('table', null, 'see-table');
            wrap.append(table);
            state.host.append(wrap);
            return table;
        }

        function historyUI(state) {
            state.page = 1;
            state.pageSize = 500;
            state.total = 0;
            historySearchUI(state);
            state.pager = element('form', null, 'see-toolbar see-history-pagination');
            state.host.append(state.pager);
            const table = makeTable(state);
            const head = table.createTHead().insertRow();
            ['Name', 'Listed on', 'Acted on', 'Price', 'Action'].forEach(text => head.append(element('th', text)));
            state.body = table.createTBody();
            loadHistory(state, 1);
        }

        function historySearchUI(state) {
            const form = element('form', null, 'see-toolbar see-history-search');
            const field = (text, type, ariaLabel) => {
                const label = element('label', text);
                const input = element('input');
                input.type = type;
                input.setAttribute('aria-label', ariaLabel);
                label.append(input);
                form.append(label);
                return input;
            };
            state.historyName = field('Item name', 'search', 'Search history by item name');
            state.historyName.placeholder = 'Enter all or part of an item name';
            state.historyFrom = field('From date', 'date', 'From date');
            state.historyTo = field('To date', 'date', 'To date');
            state.historySearchButton = button('Start search', () => {
                if (state.historySearchRun) {
                    state.historySearchButton.disabled = true;
                    state.status.textContent = 'Stopping search…';
                    state.historySearchRun.controller.abort();
                } else {
                    searchHistory(state);
                }
            }, form);
            state.historyClear = button('Clear search', () => {
                state.historySearchRun?.controller.abort();
                state.historySearchRun = null;
                state.searchResults = null;
                state.historyName.value = '';
                state.historyFrom.value = '';
                state.historyTo.value = '';
                loadHistory(state, Math.floor((state.historyBrowseStart || 0) / state.pageSize) + 1);
            }, form);
            form.addEventListener('submit', event => {
                event.preventDefault();
                state.historySearchButton.click();
            });
            state.host.append(form, element('p', 'Search by item name, transaction date, or both. Dates use your local time; the end date is included.', 'see-status'));
        }

        function syncHistorySearch(state) {
            const active = Boolean(state.historySearchRun);
            state.historySearchButton.textContent = active ? 'Stop search' : 'Start search';
            state.historySearchButton.disabled = state.loading;
            state.historyClear.disabled = state.loading || (!active && state.searchResults == null);
            [state.historyName, state.historyFrom, state.historyTo].forEach(input => {
                input.disabled = active || state.loading;
            });
        }

        async function legacyHistoryBatch(state, start, count, signal) {
            const data = await jsonRequest(`/market/myhistory/render/?query=&start=${start}&count=${count}`, state, { signal });
            if (!data.success || !Number.isFinite(Number(data.total_count)) || Number(data.start) !== start) {
                throw new Error('Steam did not return valid market history. Please check that you are signed in.');
            }
            const rows = parseLegacy(data, 'history');
            const total = Number(data.total_count);
            if (!rows.length && start < total) {
                throw new Error('Steam returned an empty page. Please try again later.');
            }
            return { rows, total };
        }

        function historyEventRow(event) {
            const description = event.description || {};
            const purchase = event.purchase || {};
            const bought = event.event_type === 4;
            const price = bought
                ? Number(purchase.paid_amount || 0) + Number(purchase.paid_fee || 0) + Number(purchase.added_tax || 0)
                : Number(purchase.received_amount || 0);
            return {
                name: description.market_name || description.name || '',
                type: description.type || '',
                game: description.tags?.find(tag => tag.category === 'Game')?.localized_tag_name || (Number(description.appid) === 753 ? 'Steam Community Items' : ''),
                description,
                href: itemURL(description),
                image: itemImage(description),
                dateText: dateText(Number(event.time_listing)),
                actedText: dateText(Number(event.time_event)),
                priceText: money(price, bought ? purchase.currencyid : purchase.received_currencyid),
                action: bought ? 'Purchased' : 'Sold'
            };
        }

        function historyRows(state, rows) {
            state.body.replaceChildren();
            rows.forEach(row => {
                const tr = element('tr');
                tr.append(itemCell(row), ...[row.dateText, row.actedText, row.priceText, row.action].map(text => element('td', text)));
                state.body.append(tr);
            });
            if (!rows.length) {
                const cell = element('td', state.searchResults == null ? 'No market history.' : 'No matching records found.');
                cell.colSpan = 5;
                state.body.insertRow().append(cell);
            }
        }

        function showHistoryResults(state) {
            const pages = Math.max(1, Math.ceil(state.searchResults.length / state.pageSize));
            state.page = Math.min(state.page, pages);
            const start = (state.page - 1) * state.pageSize;
            historyRows(state, state.searchResults.slice(start, start + state.pageSize));
            renderPager(state);
        }

        async function paceHistorySearch(run) {
            if (run.requests++ > 0) {
                await pause(1000, run.controller.signal);
            }
            run.controller.signal.throwIfAborted();
        }

        async function historySearchPage(state, run, page) {
            if (!run.pages.has(page)) {
                await paceHistorySearch(run);
                // Steam requires exactly 50 at offset 0, and 25 for subsequent requests.
                const start = page * 25;
                const data = await queryAction('QueryMyHistory', [start, start === 0 ? 50 : 25], state, run.controller.signal);
                const events = data.rgEvents;
                if (!Array.isArray(events) || !events.length || events.some(event => !Number.isFinite(Number(event.time_event)) || Number(event.time_event) <= 0)) {
                    throw new Error('Steam did not return complete transaction dates. The date search cannot continue.');
                }
                for (let i = 0; i < events.length; i += 25) {
                    run.pages.set(page + i / 25, events.slice(i, i + 25));
                }
            }
            return run.pages.get(page);
        }

        async function historyDateBound(state, run, totalPages, before, useOldest) {
            let low = 0;
            let high = totalPages;
            while (low < high) {
                run.controller.signal.throwIfAborted();
                const middle = Math.floor((low + high) / 2);
                const events = await historySearchPage(state, run, middle);
                const time = Number((useOldest ? events.at(-1) : events[0]).time_event);
                if (time < before) {
                    high = middle;
                } else {
                    low = middle + 1;
                }
            }
            return low;
        }

        async function searchHistory(state) {
            if (state.loading || state.historySearchRun) {
                return;
            }
            const name = state.historyName.value.normalize('NFKC').toLocaleLowerCase(locale).trim();
            const from = state.historyFrom.value;
            const to = state.historyTo.value;
            if (!name && !from && !to) {
                state.status.textContent = 'Enter an item name, a start date or an end date.';
                return;
            }
            const since = from ? new Date(`${from}T00:00:00`).getTime() : null;
            const endDate = to ? new Date(`${to}T00:00:00`) : null;
            endDate?.setDate(endDate.getDate() + 1);
            const until = endDate?.getTime() ?? null;
            if (since != null && !Number.isFinite(since) || until != null && !Number.isFinite(until) || since != null && until != null && since >= until) {
                state.status.textContent = 'Choose a valid date range with the start date on or before the end date.';
                return;
            }
            if (state.searchResults == null) {
                state.historyBrowseStart = (state.page - 1) * state.pageSize;
            }
            const run = { controller: new AbortController(), pages: new Map(), requests: 0, scanned: 0, target: 0 };
            state.historySearchRun = run;
            state.searchResults = [];
            state.page = 1;
            showHistoryResults(state);
            state.status.textContent = 'Starting search…';
            try {
                await paceHistorySearch(run);
                const { total } = await legacyHistoryBatch(state, 0, 1, run.controller.signal);
                const matchesName = row => row.name.normalize('NFKC').toLocaleLowerCase(locale).includes(name);
                const update = () => {
                    if (state.controller.signal.aborted || run.controller.signal.aborted) {
                        return;
                    }
                    showHistoryResults(state);
                    state.status.textContent = `Searching… ${run.scanned.toLocaleString(locale)} / ${run.target.toLocaleString(locale)} records checked · ${state.searchResults.length.toLocaleString(locale)} matches.`;
                };
                if (since == null && until == null) {
                    run.target = total;
                    let offset = 0;
                    while (offset < total) {
                        await paceHistorySearch(run);
                        const batch = await legacyHistoryBatch(state, offset, Math.min(500, total - offset), run.controller.signal);
                        run.controller.signal.throwIfAborted();
                        state.searchResults.push(...batch.rows.filter(matchesName));
                        offset += batch.rows.length;
                        run.scanned += batch.rows.length;
                        update();
                    }
                } else if (total) {
                    state.status.textContent = 'Locating records in the selected date range…';
                    const totalPages = Math.ceil(total / 25);
                    const first = until == null ? 0 : await historyDateBound(state, run, totalPages, until, true);
                    const last = since == null ? totalPages : await historyDateBound(state, run, totalPages, since, false);
                    run.target = Math.max(0, Math.min(total, last * 25) - first * 25);
                    for (let page = first; page < last; page++) {
                        const events = await historySearchPage(state, run, page);
                        run.controller.signal.throwIfAborted();
                        for (const event of events) {
                            const time = Number(event.time_event);
                            if ((since == null || time >= since) && (until == null || time < until)) {
                                const row = historyEventRow(event);
                                if (matchesName(row)) {
                                    state.searchResults.push(row);
                                }
                            }
                        }
                        run.scanned += events.length;
                        run.pages.delete(page);
                        update();
                    }
                }
                state.status.textContent = `Search complete. Checked ${run.scanned.toLocaleString(locale)} records; found ${state.searchResults.length.toLocaleString(locale)} matches.`;
            } catch (error) {
                if (!state.controller.signal.aborted && state.historySearchRun === run) {
                    state.status.textContent = run.controller.signal.aborted
                        ? `Search stopped. Checked ${run.scanned.toLocaleString(locale)} records; found ${state.searchResults.length.toLocaleString(locale)} matches.`
                        : `Search stopped: ${error.message} Found ${state.searchResults.length.toLocaleString(locale)} matches. You can start a new search.`;
                }
            } finally {
                if (state.historySearchRun === run) {
                    state.historySearchRun = null;
                    if (!state.controller.signal.aborted) {
                        showHistoryResults(state);
                    }
                }
            }
        }

        function renderPager(state) {
            const searching = state.searchResults != null;
            const total = searching ? state.searchResults.length : state.total;
            const totalPages = Math.max(1, Math.ceil(total / state.pageSize));
            state.pager.replaceChildren();
            const navigate = (label, page, disabled) => {
                const node = button(label, () => {
                    if (searching) {
                        state.page = page;
                        showHistoryResults(state);
                    } else {
                        loadHistory(state, page);
                    }
                }, state.pager);
                node.disabled = disabled || state.loading;
                if (page === state.page && /^\d+$/.test(label)) {
                    node.setAttribute('aria-current', 'page');
                }
            };
            navigate('Previous', state.page - 1, state.page <= 1);
            const numbers = [...new Set([1, ...Array.from({ length: 5 }, (_, i) => state.page + i - 2), totalPages])].filter(p => p > 0 && p <= totalPages).sort((a, b) => a - b);
            numbers.forEach((page, i) => {
                if (i && page - numbers[i - 1] > 1) {
                    state.pager.append(element('span', '…'));
                }
                navigate(String(page), page, page === state.page);
            });
            navigate('Next', state.page + 1, state.page >= totalPages);
            const jump = element('input');
            jump.type = 'number';
            jump.min = '1';
            jump.max = String(totalPages);
            jump.step = '1';
            jump.value = String(state.page);
            jump.disabled = state.loading;
            jump.setAttribute('aria-label', 'Page number');
            state.pager.append(jump);
            const go = element('button', 'Go');
            go.type = 'submit';
            go.disabled = state.loading;
            state.pager.append(go);
            state.pager.onsubmit = event => {
                event.preventDefault();
                const page = Number(jump.value);
                if (Number.isInteger(page) && page >= 1 && page <= totalPages) {
                    if (searching) {
                        state.page = page;
                        showHistoryResults(state);
                    } else {
                        loadHistory(state, page);
                    }
                }
            };
            const size = element('select');
            size.setAttribute('aria-label', 'Rows per page');
            [25, 50, 100, 500].forEach(value => {
                const option = element('option', `${value} per page`);
                option.value = String(value);
                size.append(option);
            });
            size.value = String(state.pageSize);
            size.disabled = state.loading;
            size.addEventListener('change', () => {
                const firstRecord = (state.page - 1) * state.pageSize;
                const requestedSize = Number(size.value);
                if (searching) {
                    state.pageSize = requestedSize;
                    state.page = Math.floor(firstRecord / requestedSize) + 1;
                    showHistoryResults(state);
                } else {
                    loadHistory(state, Math.floor(firstRecord / requestedSize) + 1, requestedSize);
                }
            });
            state.pager.append(size, element('span', `${total.toLocaleString(locale)} ${searching ? 'matches' : total === 1 ? 'record' : 'records'} / ${totalPages.toLocaleString(locale)} ${totalPages === 1 ? 'page' : 'pages'}`));
            syncHistorySearch(state);
        }

        async function loadHistory(state, page, pageSize = state.pageSize) {
            if (state.loading) {
                return;
            }
            state.loading = true;
            state.status.textContent = `Loading page ${page}…`;
            state.body.style.opacity = '0.5';
            renderPager(state);
            const start = (page - 1) * pageSize;
            try {
                let rows = [];
                let total;
                do {
                    const offset = start + rows.length;
                    const batch = await legacyHistoryBatch(state, offset, pageSize - rows.length);
                    total = batch.total;
                    rows = rows.concat(batch.rows);
                    state.status.textContent = `Loading page ${page}: ${rows.length} records…`;
                    if (rows.length < pageSize && start + rows.length < total) {
                        // If Steam clamps a request to 25/100, fill this display page without skipping records.
                        await pause(1000);
                    }
                } while (rows.length < pageSize && start + rows.length < total);
                if (state.controller.signal.aborted) {
                    return;
                }
                state.total = total;
                if (total && start >= total) {
                    state.loading = false;
                    return loadHistory(state, Math.ceil(total / pageSize), pageSize);
                }
                state.page = page;
                state.pageSize = pageSize;
                historyRows(state, rows);
                state.status.textContent = `${total ? start + 1 : 0}–${start + rows.length} / ${total.toLocaleString(locale)} records. Dates are shown as returned by Steam and may omit the year.`;
            } catch (error) {
                showError(state, error, () => loadHistory(state, page, pageSize));
            } finally {
                state.loading = false;
                state.body.style.opacity = '';
                if (!state.controller.signal.aborted) {
                    renderPager(state);
                }
            }
        }

        function showError(state, error, retry) {
            if (state.controller.signal.aborted) {
                return;
            }
            state.loading = false;
            if (state.kind !== 'history') {
                renderOrders(state);
            }
            state.status.replaceChildren(element('span', error.message || 'Loading failed. Please try again.'));
            button('Retry', retry, state.status);
        }

        function cleanup() {
            if (view) {
                view.historySearchRun?.controller.abort();
                view.controller.abort();
                view.host.remove();
                view.books?.forEach(detachItemBook);
                if (view.restoreFetch) {
                    view.restoreFetch();
                }
                view = null;
            }
            document.querySelectorAll('[data-see-native-market]').forEach(node => node.removeAttribute('data-see-native-market'));
        }

        function mount() {
            const path = location.pathname.replace(/\/+$/, '');
            const kind = path.match(/^\/market\/(activelistings|buyorders|history)$/)?.[1];
            if (view?.path === path && view.host.isConnected) {
                if (view.item) {
                    attachItemTables(view);
                }
                return;
            }
            cleanup();
            const itemPath = path.match(/^\/market\/listings\/(\d+)\/([^/]+)(?:\/[^/]+)?$/);
            if (itemPath && suppressedPath !== path) {
                mountItemPage(path, Number(itemPath[1]), decodeURIComponent(itemPath[2]));
                return;
            }
            if (!kind || suppressedPath === path) {
                return;
            }
            // Semantic links survive Steam's changing CSS-module hashes and translated labels.
            const navigation = Array.from(document.querySelectorAll('a[href="activelistings"], a[href="/market/activelistings"], a[href$="/market/activelistings/"]'))
                .map(link => link.parentElement)
                .find(parent => parent.querySelector('a[href="history"], a[href="/market/history"], a[href$="/market/history/"]'));
            if (!navigation) {
                return;
            }
            const host = element('section', null, 'see-modern-market');
            host.id = 'see-modern-market';
            for (let sibling = navigation.nextElementSibling; sibling; sibling = sibling.nextElementSibling) {
                sibling.setAttribute('data-see-native-market', '');
            }
            navigation.after(host);
            const state = { host, path, kind, controller: new AbortController(), rows: [], selected: new Set(), loading: false, busy: false };
            view = state;
            const title = element('div', null, 'see-toolbar');
            title.append(element('strong', `Steam-Economy-Enhancer-Upgraded · ${kind === 'history' ? 'Market history' : kind === 'buyorders' ? 'Buy orders' : 'Sell listings'}`));
            button('Show original Steam list', () => {
                suppressedPath = path;
                cleanup();
            }, title);
            host.append(title);
            state.status = element('div', '', 'see-status');
            state.status.setAttribute('role', 'status');
            if (kind === 'history') {
                historyUI(state);
            } else {
                ordersUI(state);
            }
            host.append(state.status);
        }

        function matchesItem(row, item) {
            const path = new URL(row.href, location.origin).pathname;
            return Number(row.description.appid) === item.appid && [row.description.market_hash_name, row.description.market_bucket_group_id].includes(item.name)
                || path === `/market/listings/${item.appid}/${encodeURIComponent(item.name)}`;
        }

        function itemLoaderData() {
            try {
                return (unsafeWindow.SSR?.loaderData || []).map(data => typeof data === 'string' ? JSON.parse(data) : data).find(data => data?.myOrders) || {};
            } catch {
                return {};
            }
        }

        function renderItemBook(state, book) {
            const data = state.orderBook;
            if (!data) {
                return;
            }
            const compact = data[book.side === 'sell' ? 'rgCompactSellOrders' : 'rgCompactBuyOrders'];
            const levels = [];
            for (let i = 0; i + 1 < compact.length; i += 2) {
                levels.push({ price: Number(compact[i]), quantity: Number(compact[i + 1]) });
            }
            const nativeRows = [...book.source.tBodies[0].rows];
            if (!nativeRows.length) {
                return;
            }
            // Steam's summary adds a translated suffix to its price. Compare with
            // a regular price without depending on the page's language or currency.
            const priceLabel = row => row.cells[0].textContent.replace(/[\p{N}\p{P}\p{Z}]/gu, '');
            const summary = nativeRows.length > 1 && priceLabel(nativeRows.at(-1)) !== priceLabel(nativeRows[0]) ? nativeRows.at(-1) : null;
            if (book.summary && book.summary !== summary) {
                book.summary.removeAttribute('data-see-book-summary-hidden');
            }
            book.summary = summary;
            const nativeCount = nativeRows.length - (summary ? 1 : 0);
            const depth = Math.max(book.depth, nativeCount);
            const expanded = depth > nativeCount;
            summary?.toggleAttribute('data-see-book-summary-hidden', expanded);
            const template = nativeRows[0];
            book.body.replaceChildren();
            for (const level of levels.slice(nativeCount, depth)) {
                const tr = itemBookRow(template, money(level.price, data.eCurrency), level.quantity.toLocaleString(locale));
                tr.dataset.price = String(level.price);
                book.body.append(tr);
            }
            const rest = levels.slice(depth);
            if (expanded && rest.length) {
                const tr = itemBookRow(summary || template, `${money(rest[0].price, data.eCurrency)} or ${book.side === 'sell' ? 'more' : 'less'}`, rest.reduce((sum, level) => sum + level.quantity, 0).toLocaleString(locale));
                tr.classList.add('see-book-remainder');
                book.body.append(tr);
            }
            book.expand.disabled = !rest.length;
            book.expand.textContent = rest.length ? 'Show 5 more price levels' : 'All price levels shown';
        }

        function itemBookRow(template, ...values) {
            const row = template.cloneNode(true);
            row.removeAttribute('id');
            row.removeAttribute('data-see-book-summary-hidden');
            row.querySelectorAll('[id]').forEach(node => node.removeAttribute('id'));
            values.forEach((value, index) => {
                const cell = row.cells[index];
                const walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT);
                let text = walker.nextNode();
                if (text) {
                    text.textContent = value;
                    while ((text = walker.nextNode())) {
                        text.textContent = '';
                    }
                } else {
                    cell.append(document.createTextNode(value));
                }
            });
            return row;
        }

        function detachItemBook(book) {
            book.body?.remove();
            book.foot?.remove();
            book.summary?.removeAttribute('data-see-book-summary-hidden');
            book.source?.removeAttribute('data-see-orderbook-side');
        }

        function attachItemTables(state) {
            // Commodity tables are the only native two-column price/quantity tables.
            const tables = state.orderBook ? [...document.querySelectorAll('table')].filter(table => !table.closest('.see-modern-market') && table.tHead?.rows[0]?.cells.length === 2 && table.tBodies[0]?.rows[0]?.cells.length === 2) : [];
            const used = new Set();
            for (const table of tables) {
                let book = state.books.find(book => book.source === table);
                if (!book) {
                    const first = table.tBodies[0].rows[0];
                    const price = numberFromPrice(first.cells[0].textContent);
                    const quantity = Number(first.cells[1].textContent.replace(/\D/g, ''));
                    const sides = ['sell', 'buy'];
                    const side = sides.find(side => {
                        const levels = state.orderBook?.[side === 'sell' ? 'rgCompactSellOrders' : 'rgCompactBuyOrders'];
                        return levels && Number(levels[0]) === price && Number(levels[1]) === quantity;
                    }) || (tables.length === 2 ? sides[tables.indexOf(table)] : 'buy');
                    book = state.books.find(book => book.side === side);
                    if (!book) {
                        book = { side, depth: 5 };
                        state.books.push(book);
                    } else {
                        detachItemBook(book);
                    }
                    book.source = table;
                    book.body = element('tbody');
                    book.body.setAttribute('data-see-book-extra', '');
                    book.foot = element('tfoot');
                    book.foot.setAttribute('data-see-book-controls', '');
                    const row = itemBookRow(first, '');
                    row.deleteCell(1);
                    const cell = row.cells[0];
                    cell.colSpan = 2;
                    book.foot.append(row);
                    // Preserve the native typography wrappers around the new control.
                    const content = cell.querySelector(':empty') || cell;
                    content.replaceChildren();
                    book.expand = button('Show 5 more price levels', () => {
                        book.depth += 5;
                        renderItemBook(state, book);
                    }, content);
                }
                used.add(book);
                // Keep Steam's table, header and first rows in place for React.
                table.dataset.seeOrderbookSide = book.side;
                if (book.body.parentElement !== table || book.foot.parentElement !== table) {
                    table.append(book.body, book.foot);
                }
                if (state.orderBook) {
                    renderItemBook(state, book);
                }
            }
            for (const book of state.books) {
                if (!used.has(book) && !book.source?.isConnected) {
                    detachItemBook(book);
                }
            }
            const nativeOwn = [...document.querySelectorAll('[style*="max-content max-content 1fr"]')].find(node => !node.closest('.see-modern-market') && node.querySelector('button'));
            if (nativeOwn && !state.ownStates.length) {
                // Client navigation can render new orders without replacing the initial SSR payload.
                mountItemOrders(state);
            }
            if (nativeOwn && state.ownStates.length) {
                const panel = nativeOwn.parentElement;
                panel.setAttribute('data-see-native-market', '');
                if (panel.nextElementSibling !== state.host) {
                    panel.after(state.host);
                }
            }
        }

        function mountItemOrders(state, myOrders) {
            const title = element('div', null, 'see-toolbar');
            title.append(element('strong', 'Your orders for this item'));
            button('Show original Steam list', () => {
                suppressedPath = state.path;
                cleanup();
            }, title);
            state.host.append(title);
            for (const [kind, native] of [['activelistings', myOrders?.rgSellOrders], ['buyorders', myOrders?.rgBuyOrders]]) {
                if (myOrders && !native?.length) {
                    continue;
                }
                const section = element('section');
                section.append(element('h3', kind === 'activelistings' ? 'Your sell listings' : 'Your buy orders'));
                state.host.append(section);
                const own = { host: section, kind, item: state.item, controller: state.controller, rows: [], selected: new Set(), loading: false, busy: false };
                own.status = element('div', '', 'see-status');
                own.status.setAttribute('role', 'status');
                state.ownStates.push(own);
                ordersUI(own);
                section.append(own.status);
            }
        }

        function mountItemPage(path, appid, name) {
            const anchor = document.querySelector('main') || document.querySelector('body > div');
            if (!anchor) {
                return;
            }
            const host = element('section', null, 'see-modern-market');
            host.id = 'see-modern-market';
            anchor.prepend(host);
            const state = { path, host, item: { appid, name }, controller: new AbortController(), books: [], ownStates: [] };
            view = state;
            const receive = result => {
                const book = result?.data?.success ? result.data.data : null;
                if (!state.controller.signal.aborted && book && Array.isArray(book.rgCompactSellOrders) && Array.isArray(book.rgCompactBuyOrders)) {
                    state.orderBook = book;
                    state.bookError?.remove();
                    attachItemTables(state);
                }
            };
            // Reuse Steam's live order-book responses without adding a second polling loop.
            const originalFetch = unsafeWindow.fetch;
            const observeFetch = function (...args) {
                const promise = originalFetch.apply(this, args);
                try {
                    const url = new URL(typeof args[0] === 'string' || args[0] instanceof URL ? args[0] : args[0].url, location.origin);
                    const query = JSON.parse(url.searchParams.get('qp') || 'null');
                    if (url.origin === location.origin && url.pathname === '/market/orderbook' && url.searchParams.get('q') === 'Load' && Number(query?.[0]) === appid && query?.[1] === name) {
                        promise.then(response => response.ok && response.clone().json().then(receive)).catch(() => {});
                    }
                } catch {
                    // Unrelated fetches keep their original behavior.
                }
                return promise;
            };
            unsafeWindow.fetch = observeFetch;
            state.restoreFetch = () => {
                if (unsafeWindow.fetch === observeFetch) {
                    unsafeWindow.fetch = originalFetch;
                }
            };
            const loader = itemLoaderData();
            const myOrders = loader.myOrders;
            if (myOrders?.rgSellOrders?.length || myOrders?.rgBuyOrders?.length) {
                mountItemOrders(state, myOrders);
            }
            attachItemTables(state);
            loadOrderBook(state, appid, name).then(book => receive({ data: { success: true, data: book } })).catch(error => {
                if (!state.controller.signal.aborted && !state.orderBook) {
                    // Keep working native tables visible when the initial read fails.
                    state.books.forEach(detachItemBook);
                    state.books = [];
                    state.bookError = element('p', `Order book expansion unavailable: ${error.message}`, 'see-status');
                    host.append(state.bookError);
                }
            });
        }

        injectCss(`
            [data-see-native-market] { display:none !important; }
            #see-modern-market:empty { display:none; }
            .see-modern-market { color:#d6d7d8; margin-top:16px; font:14px/1.4 Arial,sans-serif; }
            .see-modern-market .see-toolbar { display:flex; align-items:center; flex-wrap:wrap; gap:8px; margin:10px 0; }
            .see-modern-market button, .see-modern-market input, .see-modern-market select { font:inherit; color:#e8edf2; border:1px solid #526779; border-radius:3px; padding:6px 10px; background:#263b4d; }
            .see-modern-market button { cursor:pointer; }
            .see-modern-market button:hover:not(:disabled) { background:#36556f; }
            .see-modern-market button:disabled { opacity:.5; cursor:default; }
            .see-modern-market input[type=search] { flex:1; min-width:180px; background:#152332; }
            .see-modern-market input[type=number] { width:80px; }
            .see-modern-market input[type=checkbox] { width:16px; height:16px; accent-color:#66c0f4; cursor:pointer; }
            .see-modern-market button:focus-visible, .see-modern-market input:focus-visible { outline:2px solid #66c0f4; outline-offset:2px; }
            .see-table-wrap { overflow-x:auto; }
            .see-table { width:100%; border-collapse:collapse; text-align:left; background:#192a39; }
            .see-table th, .see-table td { padding:7px 10px; border-bottom:1px solid #344554; vertical-align:middle; }
            .see-table th { background:#22384b; white-space:nowrap; }
            .see-table th button { padding:0; background:none; border:0; }
            .see-table th[aria-sort=ascending] button::after { content:' ▲'; }
            .see-table th[aria-sort=descending] button::after { content:' ▼'; }
            .see-table tbody tr:hover { background:#243c50; }
            .see-table .see-item { min-width:230px; }
            .see-item-content { display:flex; align-items:center; gap:8px; }
            .see-item-image { display:block; width:32px; height:32px; flex:0 0 32px; object-fit:contain; }
            .see-item-text { min-width:0; }
            .see-table a { color:#d8e9f5; text-decoration:none; overflow-wrap:anywhere; }
            .see-table a:hover { color:#66c0f4; text-decoration:underline; }
            .see-table small { display:block; color:#99aaba; font-size:12px; }
            .see-table td:not(.see-item) { white-space:nowrap; }
            .see-modern-market [aria-current=page] { background:#42738c; opacity:1 !important; }
            .see-status { color:#a9bac9; margin:8px 0; }
            .see-status button { margin-left:8px; }
            .see-totals { padding:10px; border:1px solid #344554; background:#192a39; font-variant-numeric:tabular-nums; }
            [data-see-book-summary-hidden] { display:none !important; }
            [data-see-book-controls] button { all:unset; display:block; box-sizing:border-box; width:100%; color:inherit; font:inherit; text-align:center; cursor:pointer; }
            [data-see-book-controls] button:disabled { cursor:default; }
            [data-see-book-controls] button:focus-visible { outline:1px solid currentColor; outline-offset:2px; }
            .see-market-dialog { color:#e8edf2; background:#192a39; border:1px solid #526779; border-radius:6px; max-width:560px; padding:24px; }
            .see-market-dialog::backdrop { background:#000a; }
            .see-reprice-dialog { max-width:min(1100px, 90vw); max-height:85vh; }
            .see-market-dialog input { display:block; width:150px !important; margin-top:8px; }
            .see-history-search label { display:flex; flex-direction:column; gap:4px; }
            .see-history-search label:first-child { flex:1; min-width:220px; }
            .see-history-search input[type=date] { min-width:145px; }
            .see-history-search button { align-self:end; }
        `);
        const observer = new MutationObserver(records => {
            if (records.every(record => record.target.nodeType === 1 && record.target.closest('.see-modern-market, [data-see-book-extra], [data-see-book-controls]'))) {
                return;
            }
            clearTimeout(scheduled);
            scheduled = setTimeout(mount, 50);
        });
        observer.observe(document.body, { childList: true, subtree: true });
        const timer = setInterval(mount, 1000);
        addEventListener('popstate', mount);
        addEventListener('pagehide', event => {
            if (event.persisted) {
                return;
            }
            cleanup();
            observer.disconnect();
            clearInterval(timer);
            clearTimeout(scheduled);
            removeEventListener('popstate', mount);
        });
        mount();
    }
    //#endregion Modern market

    const PAGE_TRADEOFFER = 2;
    const PAGE_INVENTORY = 3;

    const COLOR_ERROR = '#8A4243';
    const COLOR_SUCCESS = '#407736';
    const COLOR_PENDING = '#908F44';
    const COLOR_PRICE_NOT_CHECKED = '#26566c';

    const ERROR_SUCCESS = null;
    const ERROR_FAILED = 1;
    const ERROR_DATA = 2;

    let totalNumberOfProcessedQueueItems = 0;
    let totalNumberOfQueuedItems = 0;
    let totalPriceWithFeesOnMarket = 0;
    let totalPriceWithoutFeesOnMarket = 0;
    let totalScrap = 0;

    let numberOfFailedRequests = 0;

    const enableConsoleLog = false;

    const country = typeof unsafeWindow.g_strCountryCode !== 'undefined' ? unsafeWindow.g_strCountryCode : undefined;
    const isLoggedIn = typeof unsafeWindow.g_rgWalletInfo !== 'undefined' && unsafeWindow.g_rgWalletInfo != null || typeof unsafeWindow.g_bLoggedIn !== 'undefined' && unsafeWindow.g_bLoggedIn;

    const currentPage = window.location.href.includes('.com/tradeoffer') ? PAGE_TRADEOFFER : PAGE_INVENTORY;

    const market = new SteamMarket(
        unsafeWindow.g_rgAppContextData,
        getInventoryUrl(),
        isLoggedIn ? unsafeWindow.g_rgWalletInfo : undefined
    );

    const currencyId =
        isLoggedIn &&
            market != null &&
            market.walletInfo != null &&
            market.walletInfo.wallet_currency != null
            ? market.walletInfo.wallet_currency
            : 3;

    const currencyCountry =
        isLoggedIn &&
            market != null &&
            market.walletInfo != null &&
            market.walletInfo.wallet_country != null
            ? market.walletInfo.wallet_country
            : 'US';

    const currencyCode = unsafeWindow.GetCurrencyCode(currencyId);

    // Currencies affected by the December 2025 Steam Market rule changes.
    // These currencies use round instead of floor.
    // Reference: https://steamcommunity.com/groups/community_market/discussions/0/682988196226679356
    // Alternative approach: Check currency code instead of ID for better reliability
    const CURRENCY_CODES_TO_ROUND = [
        'JPY',  // Japanese Yen (unit: 1)
        'IDR',  // Indonesian Rupiah (unit: 1)
        'UAH',  // Ukrainian Hryvnia (unit: 1)
        'CLP',  // Chilean Peso (unit: 1)
        'COP',  // Colombian Peso (unit: 1)
        'TWD',  // New Taiwan Dollar (unit: 1)
        'KZT',  // Kazakhstani Tenge (unit: 1)
        'CRC',  // Costa Rican Colón (unit: 5)
        'UYU',  // Uruguayan Peso (unit: 1)
        'KRW',  // South Korean Won (unit: 10)
        'VND',  // Vietnamese Dong (unit: 500)
    ];

    // Check if the current currency uses round for fees.
    const useRound = CURRENCY_CODES_TO_ROUND.includes(currencyCode);

    function SteamMarket(appContext, inventoryUrl, walletInfo) {
        this.appContext = appContext;
        this.inventoryUrl = inventoryUrl;
        this.walletInfo = walletInfo;
        this.inventoryUrlBase = inventoryUrl.replace('/inventory/json', '');
        if (!this.inventoryUrlBase.endsWith('/')) {
            this.inventoryUrlBase += '/';
        }
    }

    request.queue = [];
    request.errors = 0;
    request.pending = false;
    request.stopped = false;

    function request(url, options, callback) {
        callback = callback || function () { };

        // If the request was stopped, we don't want to send it to the server and continue other requests.
        if (request.stopped) {
            const error = new Error('Request was not sent to the server, something went wrong');

            setTimeout(() => request.queue.shift()?.(), 1);
            setTimeout(() => callback(error, null), 0);

            return;
        }

        // Add the request to the queue if another one is processing.
        if (request.pending) {
            const args = Array.prototype.slice.call(arguments);

            request.queue.push(() => request(...args));

            return;
        }

        request.pending = true;

        $.ajax({
            url: url,

            type: options.method,

            data: options.data,

            dataType: options.responseType,

            /**
             *
             * @param {*} data - parsed response data, if the request was successful.
             * @param {string} statusText - one of `success`, `notmodified`, `nocontent`.
             * @param {XMLHttpRequest} xhr - XMLHttpRequest object with additional jQuery properties.
             */
            success: function (data, statusText, xhr) {
                setTimeout(() => callback(null, data), 0);
            },

            /**
             *
             * @param {XMLHttpRequest} xhr - XMLHttpRequest object with additional jQuery properties.
             * @param {string} statusText - one of `error`, `abort`, `timeout` or `parsererror`.
             * @param {string} httpErrorText - textual portion of the HTTP status, in context of HTTP/2 it may be empty string.
             */
            error: (xhr, statusText, httpErrorText) => {
                const error = new Error(`Request failed with status ${xhr.status || 0} (${statusText === 'error' ? 'http error' : statusText})`);

                error.url = url;
                error.method = options.method;
                error.errorText = statusText || '';
                error.statusCode = xhr.status || 0;
                error.responseText = xhr.responseText || '';

                setTimeout(() => callback(error, null), 0);
            },

            /**
             * @param {XMLHttpRequest} xhr - XMLHttpRequest object with additional jQuery properties.
             * @param {string} statusText - one of `success`, `notmodified`, `nocontent`, `error`, `timeout`, `abort`, or `parsererror`.
             */
            complete: (xhr, statusText) => {
                let delay = 300; // Short delay to avoid hammering the server.

                // Slow down market requests to avoid hitting the rate limits.
                if (url.startsWith('https://steamcommunity.com/market/')) {
                    delay = 1000;
                }

                // Better to wait for a bit longer if we hit an error.
                if (xhr.status === 0 || xhr.status >= 400 || statusText === 'error') {
                    delay = 5000;
                }

                // Probably something broken, better to stop here.
                if ([400, 401, 403, 404, 405, 429].includes(xhr.status)) {
                    if (request.errors++ === 0) {
                        setTimeout(() => request.errors = 0, 5 * 60 * 1000);
                    }

                    if (request.errors >= 5) {
                        request.stopped = true;
                        request.errors = 0;
                    }
                }

                const next = () => {
                    request.pending = false;
                    request.queue.shift()?.();
                }

                setTimeout(next, delay);
            }
        });
    };

    function getInventoryUrl() {
        if (unsafeWindow.g_strInventoryLoadURL) {
            return unsafeWindow.g_strInventoryLoadURL;
        }

        let profileUrl = `${window.location.origin}/my/`;

        if (unsafeWindow.g_strProfileURL) {
            profileUrl = unsafeWindow.g_strProfileURL;
        } else {
            const avatar = document.querySelector('#global_actions a.user_avatar');

            if (avatar) {
                profileUrl = avatar.href;
            }
        }

        return `${profileUrl.replace(/\/$/, '')}/inventory/json/`;
    }

    //#region Settings
    const SETTING_MIN_NORMAL_PRICE = 'SETTING_MIN_NORMAL_PRICE';
    const SETTING_MAX_NORMAL_PRICE = 'SETTING_MAX_NORMAL_PRICE';
    const SETTING_MIN_FOIL_PRICE = 'SETTING_MIN_FOIL_PRICE';
    const SETTING_MAX_FOIL_PRICE = 'SETTING_MAX_FOIL_PRICE';
    const SETTING_MIN_MISC_PRICE = 'SETTING_MIN_MISC_PRICE';
    const SETTING_MAX_MISC_PRICE = 'SETTING_MAX_MISC_PRICE';
    const SETTING_PRICE_OFFSET = 'SETTING_PRICE_OFFSET';
    const SETTING_PRICE_MIN_CHECK_PRICE = 'SETTING_PRICE_MIN_CHECK_PRICE';
    const SETTING_PRICE_MIN_LIST_PRICE = 'SETTING_PRICE_MIN_LIST_PRICE';
    const SETTING_PRICE_ALGORITHM = 'SETTING_PRICE_ALGORITHM';
    const SETTING_PRICE_IGNORE_LOWEST_Q = 'SETTING_PRICE_IGNORE_LOWEST_Q';
    const SETTING_PRICE_HISTORY_HOURS = 'SETTING_PRICE_HISTORY_HOURS';
    const SETTING_INVENTORY_PRICE_LABELS = 'SETTING_INVENTORY_PRICE_LABELS';
    const SETTING_TRADEOFFER_PRICE_LABELS = 'SETTING_TRADEOFFER_PRICE_LABELS';
    const SETTING_QUICK_SELL_BUTTONS = 'SETTING_QUICK_SELL_BUTTONS';
    const SETTING_LAST_CACHE = 'SETTING_LAST_CACHE';
    const SETTING_RELIST_AUTOMATICALLY = 'SETTING_RELIST_AUTOMATICALLY';
    const inventoryButtonSettings = [
        ['SELL_ALL', '.sell_all', 'Sell all items'],
        ['SELL_DUPLICATES', '.sell_all_duplicates', 'Sell all duplicate items'],
        ['SELL_SELECTED', '.sell_selected', 'Sell selected items automatically'],
        ['SELL_CARDS', '.sell_all_cards', 'Sell all cards'],
        ['GEM_SELECTED', '.turn_into_gems', 'Turn selected items into gems'],
        ['UNPACK_ALL', '.unpack_all_booster_packs', 'Unpack all booster packs'],
        ['UNPACK_SELECTED', '.unpack_selected_booster_packs', 'Unpack selected booster packs'],
        ['GEM_DUPLICATES', '.gem_all_duplicates', 'Turn all duplicate items into gems'],
        ['SELL_CRATES', '.sell_all_crates', 'Sell all crates (TF2)']
    ].map(([name, selector, label]) => ({ key: `SETTING_SHOW_${name}`, selector, label }));

    const settingDefaults = {
        SETTING_MIN_NORMAL_PRICE: 0.05,
        SETTING_MAX_NORMAL_PRICE: 2.50,
        SETTING_MIN_FOIL_PRICE: 0.15,
        SETTING_MAX_FOIL_PRICE: 10,
        SETTING_MIN_MISC_PRICE: 0.05,
        SETTING_MAX_MISC_PRICE: 10,
        SETTING_PRICE_OFFSET: 0.00,
        SETTING_PRICE_MIN_CHECK_PRICE: 0.00,
        SETTING_PRICE_MIN_LIST_PRICE: 0.03,
        SETTING_PRICE_ALGORITHM: 1,
        SETTING_PRICE_IGNORE_LOWEST_Q: 1,
        SETTING_PRICE_HISTORY_HOURS: 12,
        SETTING_INVENTORY_PRICE_LABELS: 1,
        SETTING_TRADEOFFER_PRICE_LABELS: 1,
        SETTING_QUICK_SELL_BUTTONS: 1,
        SETTING_LAST_CACHE: 0,
        SETTING_RELIST_AUTOMATICALLY: 0,
        ...Object.fromEntries(inventoryButtonSettings.map(setting => [setting.key, 1]))
    };

    function getSettingWithDefault(name) {
        return getLocalStorageItem(name) ?? (name in settingDefaults ? settingDefaults[name] : null);
    }

    function setSetting(name, value) {
        setLocalStorageItem(name, value);
    }

    function applyInventoryButtonSettings() {
        for (const setting of inventoryButtonSettings) {
            $(`#inventory_sell_buttons ${setting.selector}`).attr('data-see-inventory-hidden', getSettingWithDefault(setting.key) == 1 ? null : '');
        }
    }
    //#endregion

    //#region Storage

    const storagePersistent = localforage.createInstance({
        name: 'see_persistent'
    });

    let storageSession;

    const currentUrl = new URL(window.location.href);
    const noCache = currentUrl.searchParams.get('no-cache') != null;

    // This does not work the same as the 'normal' session storage because opening a new browser session/tab will clear the cache.
    // For this reason, a rolling cache is used.
    if (getSessionStorageItem('SESSION') == null || noCache) {
        let lastCache = getSettingWithDefault(SETTING_LAST_CACHE);
        if (lastCache > 5) {
            lastCache = 0;
        }

        setSetting(SETTING_LAST_CACHE, lastCache + 1);

        storageSession = localforage.createInstance({
            name: `see_session_${lastCache}`
        });

        storageSession.clear(); // Clear any previous data.
        setSessionStorageItem('SESSION', lastCache);
    } else {
        storageSession = localforage.createInstance({
            name: `see_session_${getSessionStorageItem('SESSION')}`
        });
    }

    function getLocalStorageItem(name) {
        try {
            return localStorage.getItem(name);
        } catch (e) {
            logConsole(`Failed to get local storage item ${name}, ${e}.`);
            return null;
        }
    }

    function setLocalStorageItem(name, value) {
        try {
            localStorage.setItem(name, value);
            return true;
        } catch (e) {
            logConsole(`Failed to set local storage item ${name}, ${e}.`);
            return false;
        }
    }

    function getSessionStorageItem(name) {
        try {
            return sessionStorage.getItem(name);
        } catch (e) {
            logConsole(`Failed to get session storage item ${name}, ${e}.`);
            return null;
        }
    }

    function setSessionStorageItem(name, value) {
        try {
            sessionStorage.setItem(name, value);
            return true;
        } catch (e) {
            logConsole(`Failed to set session storage item ${name}, ${e}.`);
            return false;
        }
    }
    //#endregion

    //#region Price helpers
    function formatPrice(valueInCents) {
        return unsafeWindow.v_currencyformat(valueInCents, currencyCode, currencyCountry);
    }

    function getPriceInformationFromItem(item) {
        const isTradingCard = getIsTradingCard(item);
        const isFoilTradingCard = getIsFoilTradingCard(item);
        return getPriceInformation(isTradingCard, isFoilTradingCard);
    }

    function getPriceInformation(isTradingCard, isFoilTradingCard) {
        let maxPrice = 0;
        let minPrice = 0;

        if (!isTradingCard) {
            maxPrice = getSettingWithDefault(SETTING_MAX_MISC_PRICE);
            minPrice = getSettingWithDefault(SETTING_MIN_MISC_PRICE);
        } else {
            maxPrice = isFoilTradingCard
                ? getSettingWithDefault(SETTING_MAX_FOIL_PRICE)
                : getSettingWithDefault(SETTING_MAX_NORMAL_PRICE);
            minPrice = isFoilTradingCard
                ? getSettingWithDefault(SETTING_MIN_FOIL_PRICE)
                : getSettingWithDefault(SETTING_MIN_NORMAL_PRICE);
        }

        maxPrice = maxPrice * 100.0;
        minPrice = minPrice * 100.0;

        const maxPriceBeforeFees = market.getPriceBeforeFees(maxPrice);
        const minPriceBeforeFees = market.getPriceBeforeFees(minPrice);

        return {
            maxPrice,
            minPrice,
            maxPriceBeforeFees,
            minPriceBeforeFees
        };
    }

    // Calculates the average history price, before the fee.
    function calculateAverageHistoryPriceBeforeFees(history) {
        let highest = 0;
        let total = 0;

        if (history != null) {
            // Highest average price in the last xx hours.
            const timeAgo = Date.now() - getSettingWithDefault(SETTING_PRICE_HISTORY_HOURS) * 60 * 60 * 1000;

            history.forEach((historyItem) => {
                const d = new Date(historyItem[0]);
                if (d.getTime() > timeAgo) {
                    highest += historyItem[1] * historyItem[2];
                    total += historyItem[2];
                }
            });
        }

        if (total == 0) {
            return 0;
        }

        highest = Math.floor(highest / total);
        return market.getPriceBeforeFees(highest);
    }

    // Calculates the listing price, before the fee.
    function calculateListingPriceBeforeFees(orderbook) {
        if (typeof orderbook === 'undefined' ||
            orderbook == null ||
            orderbook.lowest_sell_order == null ||
            orderbook.sell_order_graph == null) {
            return 0;
        }

        let listingPrice = market.getPriceBeforeFees(orderbook.lowest_sell_order);

        const shouldIgnoreLowestListingOnLowQuantity = getSettingWithDefault(SETTING_PRICE_IGNORE_LOWEST_Q) == 1;

        if (shouldIgnoreLowestListingOnLowQuantity && orderbook.sell_order_graph.length >= 2) {
            const listingPrice2ndLowest = market.getPriceBeforeFees(orderbook.sell_order_graph[1][0] * 100);

            if (listingPrice2ndLowest > listingPrice) {
                const numberOfListingsLowest = orderbook.sell_order_graph[0][1];
                const numberOfListings2ndLowest = orderbook.sell_order_graph[1][1];

                const percentageLower = 100 * (numberOfListingsLowest / numberOfListings2ndLowest);

                // The percentage should change based on the quantity (for example, 1200 listings vs 5, or 1 vs 25).
                if (numberOfListings2ndLowest >= 1000 && percentageLower <= 5) {
                    listingPrice = listingPrice2ndLowest;
                } else if (numberOfListings2ndLowest < 1000 && percentageLower <= 10) {
                    listingPrice = listingPrice2ndLowest;
                } else if (numberOfListings2ndLowest < 100 && percentageLower <= 15) {
                    listingPrice = listingPrice2ndLowest;
                } else if (numberOfListings2ndLowest < 50 && percentageLower <= 20) {
                    listingPrice = listingPrice2ndLowest;
                } else if (numberOfListings2ndLowest < 25 && percentageLower <= 25) {
                    listingPrice = listingPrice2ndLowest;
                } else if (numberOfListings2ndLowest < 10 && percentageLower <= 30) {
                    listingPrice = listingPrice2ndLowest;
                }
            }
        }

        return listingPrice;
    }

    function calculateBuyOrderPriceBeforeFees(orderbook) {
        if (typeof orderbook === 'undefined') {
            return 0;
        }

        return market.getPriceBeforeFees(orderbook.highest_buy_order);
    }

    // Calculate the sell price based on the history and listings.
    // applyOffset specifies whether the price offset should be applied when the listings are used to determine the price.
    function calculateSellPriceBeforeFees(history, orderbook, applyOffset, minPriceBeforeFees, maxPriceBeforeFees) {
        const historyPrice = calculateAverageHistoryPriceBeforeFees(history);
        const listingPrice = calculateListingPriceBeforeFees(orderbook);
        const buyPrice = calculateBuyOrderPriceBeforeFees(orderbook);

        const shouldUseAverage = getSettingWithDefault(SETTING_PRICE_ALGORITHM) == 1;
        const shouldUseBuyOrder = getSettingWithDefault(SETTING_PRICE_ALGORITHM) == 3;
        const shouldUseHistory = getSettingWithDefault(SETTING_PRICE_ALGORITHM) == 4;

        // If the highest average price is lower than the first listing, return the offset + that listing.
        // Otherwise, use the highest average price instead.
        let calculatedPrice = 0;
        if (shouldUseBuyOrder && buyPrice !== -2) {
            calculatedPrice = buyPrice;
        } else if ((historyPrice < listingPrice || !shouldUseAverage) && !shouldUseHistory) {
            calculatedPrice = listingPrice;
        } else {
            calculatedPrice = historyPrice;
        }

        let changedToMax = false;
        // List for the maximum price if there are no listings yet.
        if (calculatedPrice == 0) {
            calculatedPrice = maxPriceBeforeFees;
            changedToMax = true;
        }


        // Apply the offset to the calculated price, but only if the price wasn't changed to the max (as otherwise it's impossible to list for this price).
        if (!changedToMax && applyOffset) {
            calculatedPrice = calculatedPrice + getSettingWithDefault(SETTING_PRICE_OFFSET) * 100;
        }


        // Keep our minimum and maximum in mind.
        calculatedPrice = clamp(calculatedPrice, minPriceBeforeFees, maxPriceBeforeFees);

        // In case there's a buy order higher than the calculated price.
        if (!shouldUseHistory && typeof orderbook !== 'undefined' && orderbook != null && orderbook.highest_buy_order != null) {
            const buyOrderPrice = market.getPriceBeforeFees(orderbook.highest_buy_order);
            if (buyOrderPrice > calculatedPrice) {
                calculatedPrice = buyOrderPrice;
            }
        }

        return calculatedPrice;
    }
    //#endregion

    //#region Integer helpers
    function getRandomInt(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    function getNumberOfDigits(x) {
        return (Math.log10((x ^ x >> 31) - (x >> 31)) | 0) + 1;
    }

    function padLeftZero(str, max) {
        str = str.toString();
        return str.length < max ? padLeftZero(`0${str}`, max) : str;
    }

    function replaceNonNumbers(str) {
        return str.replace(/\D/g, '');
    }
    //#endregion

    //#region Steam Market

    // Sell an item with a price in cents.
    // Price is before fees.
    SteamMarket.prototype.sellItem = function (item, price, callback /*err, data*/) {
        const url = `${window.location.origin}/market/sellitem/`;

        const options = {
            method: 'POST',
            data: {
                sessionid: readCookie('sessionid'),
                appid: item.appid,
                contextid: item.contextid,
                assetid: item.assetid || item.id,
                amount: item.amount || 1,
                price: price
            },
            responseType: 'json'
        };

        request(url, options, callback);
    };

    // Get the price history for an item.
    //
    // PriceHistory is an array of prices in the form [data, price, number sold].
    // Example: [["Fri, 19 Jul 2013 01:00:00 +0000",7.30050206184,362]]
    // Prices are ordered by oldest to most recent.
    // Price is inclusive of fees.
    SteamMarket.prototype.getPriceHistory = function (item, cache, callback) {
        const shouldUseAverage = (getSettingWithDefault(SETTING_PRICE_ALGORITHM) == 1) || (getSettingWithDefault(SETTING_PRICE_ALGORITHM) == 4);

        if (!shouldUseAverage) {
            // The price history is only used by the "average price" calculation
            return callback(ERROR_SUCCESS, null, true);
        }

        try {
            const market_name = getMarketHashName(item);
            if (market_name == null) {
                callback(ERROR_FAILED);
                return;
            }

            const appid = item.appid;

            if (cache) {
                const storage_hash = `pricehistory_${appid}+${market_name}`;

                storageSession.getItem(storage_hash).
                    then((value) => {
                        if (value != null) {
                            callback(ERROR_SUCCESS, value, true);
                        } else {
                            market.getCurrentPriceHistory(appid, market_name, callback);
                        }
                    }).
                    catch(() => {
                        market.getCurrentPriceHistory(appid, market_name, callback);
                    });
            } else {
                market.getCurrentPriceHistory(appid, market_name, callback);
            }
        } catch {
            return callback(ERROR_FAILED);
        }
    };

    SteamMarket.prototype.getGooValue = function (item, callback) {
        try {
            let appid = item.market_fee_app;

            for (const action of item.owner_actions) {
                if (!action.link || !action.link.startsWith('javascript:GetGooValue')) {
                    continue;
                }

                const rgMatches = action.link.match(/GetGooValue\( *'%contextid%', *'%assetid%', *'?(?<appid>[0-9]+)'?/);

                if (!rgMatches) {
                    continue;
                }

                appid = rgMatches.groups.appid;
                break;
            }

            const url = `${this.inventoryUrlBase}ajaxgetgoovalue/`;

            const options = {
                method: 'GET',
                data: {
                    sessionid: readCookie('sessionid'),
                    appid: appid,
                    assetid: item.assetid,
                    contextid: item.contextid
                },
                responseType: 'json'
            };

            request(
                url,
                options,
                (error, data) => {
                    if (error) {
                        callback(ERROR_FAILED, data);
                        return;
                    }

                    callback(ERROR_SUCCESS, data);
                }
            );
        } catch {
            return callback(ERROR_FAILED);
        }
        //http://steamcommunity.com/auction/ajaxgetgoovalueforitemtype/?appid=582980&item_type=18&border_color=0
        // OR
        //http://steamcommunity.com/my/ajaxgetgoovalue/?sessionid=xyz&appid=535690&assetid=4830605461&contextid=6
        //sessionid=xyz
        //appid = 535690
        //assetid = 4830605461
        //contextid = 6
    };


    // Grinds the item into gems.
    SteamMarket.prototype.grindIntoGoo = function (item, callback) {
        try {
            const url = `${this.inventoryUrlBase}ajaxgrindintogoo/`;

            const options = {
                method: 'POST',
                data: {
                    sessionid: readCookie('sessionid'),
                    appid: item.market_fee_app,
                    assetid: item.assetid,
                    contextid: item.contextid,
                    goo_value_expected: item.goo_value_expected
                },
                responseType: 'json'
            };

            request(
                url,
                options,
                (error, data) => {
                    if (error) {
                        callback(ERROR_FAILED, data);
                        return;
                    }

                    callback(ERROR_SUCCESS, data);
                }
            );
        } catch {
            return callback(ERROR_FAILED);
        }

        //sessionid = xyz
        //appid = 535690
        //assetid = 4830605461
        //contextid = 6
        //goo_value_expected = 10
        //http://steamcommunity.com/my/ajaxgrindintogoo/
    };


    // Unpacks the booster pack.
    SteamMarket.prototype.unpackBoosterPack = function (item, callback) {
        try {
            const url = `${this.inventoryUrlBase}ajaxunpackbooster/`;

            const options = {
                method: 'POST',
                data: {
                    sessionid: readCookie('sessionid'),
                    appid: item.market_fee_app,
                    communityitemid: item.assetid
                },
                responseType: 'json'
            };

            request(
                url,
                options,
                (error, data) => {
                    if (error) {
                        callback(ERROR_FAILED, data);
                        return;
                    }

                    callback(ERROR_SUCCESS, data);
                }
            );
        } catch {
            return callback(ERROR_FAILED);
        }

        //sessionid = xyz
        //appid = 535690
        //communityitemid = 4830605461
        //http://steamcommunity.com/my/ajaxunpackbooster/
    };

    // Get the current price history for an item.
    SteamMarket.prototype.getCurrentPriceHistory = function (appid, market_name, callback) {
        const url = `${window.location.origin}/market/pricehistory/`;

        const options = {
            method: 'GET',
            data: {
                appid: appid,
                market_hash_name: market_name
            },
            responseType: 'json'
        };

        request(
            url,
            options,
            (error, data) => {
                if (error) {
                    callback(ERROR_FAILED);
                    return;
                }

                if (data && (!data.success || !data.prices)) {
                    callback(ERROR_DATA);
                    return;
                }

                // Multiply prices so they're in pennies.
                for (let i = 0; i < data.prices.length; i++) {
                    data.prices[i][1] *= 100;
                    data.prices[i][2] = parseInt(data.prices[i][2]);
                }

                // Store the price history in the session storage.
                const storage_hash = `pricehistory_${appid}+${market_name}`;
                storageSession.setItem(storage_hash, data.prices);

                callback(ERROR_SUCCESS, data.prices, false);
            }
        );
    };

    function buildOrderBook(data) {
        if (!data || !data.success || !data.data) {
            return null;
        }

        const orderBook = data.data;

        const buildGraph = (compactOrders) => {
            const graph = [];

            if (!Array.isArray(compactOrders)) {
                return graph;
            }

            for (let i = 0; i < compactOrders.length; i += 2) {
                const price = parseInt(compactOrders[i], 10);
                const quantity = parseInt(compactOrders[i + 1], 10);

                if (isNaN(price) || isNaN(quantity)) {
                    continue;
                }

                graph.push([
                    price / 100,
                    quantity,
                    ''
                ]);
            }

            return graph;
        };

        return {
            success: 1,
            highest_buy_order: orderBook.amtMaxBuyOrder != null ? parseInt(orderBook.amtMaxBuyOrder, 10) : 0,
            lowest_sell_order: orderBook.amtMinSellOrder != null ? parseInt(orderBook.amtMinSellOrder, 10) : 0,
            buy_order_graph: buildGraph(orderBook.rgCompactBuyOrders),
            sell_order_graph: buildGraph(orderBook.rgCompactSellOrders),
            cBuyOrders: orderBook.cBuyOrders,
            cSellOrders: orderBook.cSellOrders,
            eCurrency: orderBook.eCurrency
        };
    }

    // Get the order book for this item in the market, with more information.
    SteamMarket.prototype.getOrderBook = function (item, cache, callback) {
        try {
            const market_name = getMarketHashName(item);
            if (market_name == null) {
                callback(ERROR_FAILED);
                return;
            }

            const appid = item.appid;

            if (cache) {
                const storage_hash = `orderbook_${appid}+${market_name}`;
                storageSession.getItem(storage_hash).
                    then((value) => {
                        if (value != null) {
                            callback(ERROR_SUCCESS, value, true);
                        } else {
                            market.getCurrentOrderBook(item, market_name, callback);
                        }
                    }).
                    catch(() => {
                        market.getCurrentOrderBook(item, market_name, callback);
                    });
            } else {
                market.getCurrentOrderBook(item, market_name, callback);
            }

        } catch {
            return callback(ERROR_FAILED);
        }
    };

    // Get the current order book for this item in the market.
    SteamMarket.prototype.getCurrentOrderBook = function (item, market_name, callback) {
        const url = `${window.location.origin}/market/orderbook`;

        const options = {
            method: 'GET',
            data: {
                q: 'Load',
                qp: JSON.stringify([item.appid, market_name])
            },
            responseType: 'json'
        };

        request(
            url,
            options,
            (error, data) => {
                if (error) {
                    callback(ERROR_FAILED, null);
                    return;
                }

                const orderbook = buildOrderBook(data?.data);
                if (orderbook == null) {
                    callback(ERROR_DATA, null);
                    return;
                }

                // Store the order book in the session storage.
                const storage_hash = `orderbook_${item.appid}+${market_name}`;
                storageSession.setItem(storage_hash, orderbook);

                callback(ERROR_SUCCESS, orderbook, false);
            }
        );
    };

    // Calculate the price before fees (seller price) from the buyer price
    SteamMarket.prototype.getPriceBeforeFees = function (price, item) {
        let publisherFee = -1;

        if (item != null) {
            if (item.market_fee != null) {
                publisherFee = item.market_fee;
            } else if (item.description != null && item.description.market_fee != null) {
                publisherFee = item.description.market_fee;
            }
        }

        if (publisherFee == -1) {
            if (this.walletInfo != null) {
                publisherFee = this.walletInfo['wallet_publisher_fee_percent_default'];
            } else {
                publisherFee = 0.10;
            }
        }

        price = Math.round(price);
        const feeInfo = CalculateFeeAmount(price, publisherFee, this.walletInfo);

        return (price > feeInfo.fees) ? price - feeInfo.fees : 1;
    };

    // Calculate the buyer price from the seller price
    SteamMarket.prototype.getPriceIncludingFees = function (price, item) {
        let publisherFee = -1;
        if (item != null) {
            if (item.market_fee != null) {
                publisherFee = item.market_fee;
            } else if (item.description != null && item.description.market_fee != null) {
                publisherFee = item.description.market_fee;
            }
        }
        if (publisherFee == -1) {
            if (this.walletInfo != null) {
                publisherFee = this.walletInfo['wallet_publisher_fee_percent_default'];
            } else {
                publisherFee = 0.10;
            }
        }

        price = Math.round(price);
        const feeInfo = CalculateAmountToSendForDesiredReceivedAmount(price, publisherFee, this.walletInfo);
        return feeInfo.amount;
    };
    //#endregion

    //#region Steam Market / Inventory helpers
    function getMarketHashName(item) {
        if (item == null) {
            return null;
        }

        if (item.description != null && item.description.market_hash_name != null) {
            return item.description.market_hash_name;
        }

        if (item.description != null && item.description.name != null) {
            return item.description.name;
        }

        if (item.market_hash_name != null) {
            return item.market_hash_name;
        }

        if (item.name != null) {
            return item.name;
        }

        return null;
    }

    function getIsCrate(item) {
        if (item == null) {
            return false;
        }
        // This is available on the inventory page.
        const tags = item.tags != null
            ? item.tags
            : item.description != null && item.description.tags != null
                ? item.description.tags
                : null;
        if (tags != null) {
            let isTaggedAsCrate = false;
            tags.forEach((arrayItem) => {
                if (arrayItem.category == 'Type') {
                    if (arrayItem.internal_name == 'Supply Crate') {
                        isTaggedAsCrate = true;
                    }
                }
            });
            if (isTaggedAsCrate) {
                return true;
            }
        }
    }

    function getIsTradingCard(item) {
        if (item == null) {
            return false;
        }

        // This is available on the inventory page.
        const tags = item.tags != null
            ? item.tags
            : item.description != null && item.description.tags != null
                ? item.description.tags
                : null;
        if (tags != null) {
            let isTaggedAsTradingCard = false;
            tags.forEach((arrayItem) => {
                if (arrayItem.category == 'item_class') {
                    if (arrayItem.internal_name == 'item_class_2') { // trading card.
                        isTaggedAsTradingCard = true;
                    }
                }
            });
            if (isTaggedAsTradingCard) {
                return true;
            }
        }

        // This is available on the market page.
        if (item.owner_actions != null) {
            for (let i = 0; i < item.owner_actions.length; i++) {
                if (item.owner_actions[i].link == null) {
                    continue;
                }

                // Cards include a link to the gamecard page.
                // For example: "http://steamcommunity.com/my/gamecards/503820/".
                if (item.owner_actions[i].link.toString().toLowerCase().includes('gamecards')) {
                    return true;
                }
            }
        }

        // A fallback for the market page (only works with language on English).
        if (item.type != null && item.type.toLowerCase().includes('trading card')) {
            return true;
        }

        return false;
    }

    function getIsFoilTradingCard(item) {
        if (!getIsTradingCard(item)) {
            return false;
        }

        // This is available on the inventory page.
        const tags = item.tags != null
            ? item.tags
            : item.description != null && item.description.tags != null
                ? item.description.tags
                : null;
        if (tags != null) {
            let isTaggedAsFoilTradingCard = false;
            tags.forEach((arrayItem) => {
                if (arrayItem.category == 'cardborder' && arrayItem.internal_name == 'cardborder_1') { // foil border.
                    isTaggedAsFoilTradingCard = true;
                }
            });
            if (isTaggedAsFoilTradingCard) {
                return true;
            }
        }

        // This is available on the market page.
        if (item.owner_actions != null) {
            for (let i = 0; i < item.owner_actions.length; i++) {
                if (item.owner_actions[i].link == null) {
                    continue;
                }

                // Cards include a link to the gamecard page.
                // The border parameter specifies the foil cards.
                // For example: "http://steamcommunity.com/my/gamecards/503820/?border=1".
                if (item.owner_actions[i].link.toString().toLowerCase().includes('gamecards') &&
                    item.owner_actions[i].link.toString().toLowerCase().includes('border')) {
                    return true;
                }
            }
        }

        // A fallback for the market page (only works with language on English).
        if (item.type != null && item.type.toLowerCase().includes('foil trading card')) {
            return true;
        }

        return false;
    }

    function CalculateFeeAmount(amount, publisherFee, walletInfo) {
        if (walletInfo == null || !walletInfo['wallet_fee']) {
            return {
                fees: 0
            };
        }

        publisherFee = publisherFee == null ? 0 : publisherFee;
        // Since CalculateFeeAmount has a Math.floor, we could be off a cent or two. Let's check:
        let iterations = 0; // shouldn't be needed, but included to be sure nothing unforseen causes us to get stuck
        let nEstimatedAmountOfWalletFundsReceivedByOtherParty =
            parseInt((amount - parseInt(walletInfo['wallet_fee_base'])) /
                (parseFloat(walletInfo['wallet_fee_percent']) + parseFloat(publisherFee) + 1));
        let bEverUndershot = false;
        let fees = CalculateAmountToSendForDesiredReceivedAmount(
            nEstimatedAmountOfWalletFundsReceivedByOtherParty,
            publisherFee,
            walletInfo
        );
        while (fees.amount != amount && iterations < 10) {
            if (fees.amount > amount) {
                if (bEverUndershot) {
                    fees = CalculateAmountToSendForDesiredReceivedAmount(
                        nEstimatedAmountOfWalletFundsReceivedByOtherParty - 1,
                        publisherFee,
                        walletInfo
                    );
                    fees.steam_fee += amount - fees.amount;
                    fees.fees += amount - fees.amount;
                    fees.amount = amount;
                    break;
                } else {
                    nEstimatedAmountOfWalletFundsReceivedByOtherParty--;
                }
            } else {
                bEverUndershot = true;
                nEstimatedAmountOfWalletFundsReceivedByOtherParty++;
            }
            fees = CalculateAmountToSendForDesiredReceivedAmount(
                nEstimatedAmountOfWalletFundsReceivedByOtherParty,
                publisherFee,
                walletInfo
            );
            iterations++;
        }
        // fees.amount should equal the passed in amount
        return fees;
    }

    // Clamps cur between min and max (inclusive).
    function clamp(cur, min, max) {
        if (cur < min) {
            cur = min;
        }

        if (cur > max) {
            cur = max;
        }

        return cur;
    }

    // Strangely named function, it actually works out the fees and buyer price for a seller price
    // Updated for December 2025 Steam Market rule changes:
    // - 12 specific currencies now use round instead of floor for fees
    // - Global minimum fee increased to $0.01 for both Steam fee and publisher fee
    // Reference: https://steamcommunity.com/groups/community_market/discussions/0/682988196226679356/
    function CalculateAmountToSendForDesiredReceivedAmount(receivedAmount, publisherFee, walletInfo) {
        if (walletInfo == null || !walletInfo['wallet_fee']) {
            return {
                amount: receivedAmount
            };
        }

        // Select the appropriate rounding function based on currency.
        const roundFee = useRound ? Math.round : Math.floor;

        // December 2025 change: Both Steam fee and publisher fee now have a minimum of $0.01.
        // The wallet_fee_minimum from Steam represents $0.01 in the user's local currency.
        // Previously, publisher fee minimum was hardcoded to 1 (the smallest currency unit),
        // but now it should also be at least $0.01 equivalent in local currency.
        const minFee = walletInfo['wallet_fee_minimum'] || 1;

        publisherFee = publisherFee == null ? 0 : publisherFee;

        // IMPORTANT: Apply rounding/flooring BEFORE comparing with minimum fee.
        // Correct order per Steam's December 2025 rule changes:
        // 1. Calculate percentage fee (e.g., 0.05 * receivedAmount)
        // 2. Add base fee (usually 0)
        // 3. Apply round/floor based on currency
        // 4. Compare with minimum fee and take maximum
        const nSteamFee = Math.max(
            parseInt(roundFee(receivedAmount * parseFloat(walletInfo['wallet_fee_percent']) + parseInt(walletInfo['wallet_fee_base']))),
            minFee
        );

        // Publisher fee: same logic, round/floor first, then compare with minFee
        const nPublisherFee = publisherFee > 0 ? Math.max(
            parseInt(roundFee(receivedAmount * publisherFee)),
            minFee
        ) : 0;
        const nAmountToSend = receivedAmount + nSteamFee + nPublisherFee;
        return {
            steam_fee: nSteamFee,
            publisher_fee: nPublisherFee,
            fees: nSteamFee + nPublisherFee,
            amount: parseInt(nAmountToSend)
        };
    }

    function readCookie(name) {
        const nameEQ = `${name}=`;
        const ca = document.cookie.split(';');
        for (let i = 0; i < ca.length; i++) {
            let c = ca[i];
            while (c.charAt(0) == ' ') {
                c = c.substring(1, c.length);
            }
            if (c.indexOf(nameEQ) == 0) {
                return decodeURIComponent(c.substring(nameEQ.length, c.length));
            }
        }
        return null;
    }

    function isRetryMessage(message) {
        const messageList = [
            'You cannot sell any items until your previous action completes.',
            'There was a problem listing your item. Refresh the page and try again.',
            'We were unable to contact the game\'s item server. The game\'s item server may be down or Steam may be experiencing temporary connectivity issues. Your listing has not been created. Refresh the page and try again.'
        ];

        return messageList.indexOf(message) !== -1;
    }
    //#endregion

    //#region Logging
    let userScrolled = false;
    const logger = document.createElement('div');
    logger.setAttribute('id', 'logger');

    function updateScroll() {
        if (!userScrolled) {
            const element = document.getElementById('logger');
            element.scrollTop = element.scrollHeight;
        }
    }

    function logDOM(text) {
        logger.innerHTML += `${text}<br/>`;

        updateScroll();
    }

    function logConsole(text) {
        if (enableConsoleLog) {
            console.log(text);
        }
    }
    //#endregion

    //#region Inventory
    if (currentPage == PAGE_INVENTORY) {

        function onQueueDrain() {
            if (itemQueue.length() == 0 && sellQueue.length() == 0 && scrapQueue.length() == 0 && boosterQueue.length() == 0) {
                removeSpinner();
            }
        }

        function updateTotals() {
            if ($('#loggerTotal').length == 0) {
                $(logger).parent().append('<div id="loggerTotal"></div>');
            }

            const totals = document.getElementById('loggerTotal');
            totals.innerHTML = '';

            if (totalPriceWithFeesOnMarket > 0) {
                totals.innerHTML += `<div><strong>Total listed for ${formatPrice(totalPriceWithFeesOnMarket)}, you will receive ${formatPrice(totalPriceWithoutFeesOnMarket)}.</strong></div>`;
            }
            if (totalScrap > 0) {
                totals.innerHTML += `<div><strong>Total scrap ${totalScrap}.</strong></div>`;
            }
        }

        const sellQueue = async.queue(
            (task, next) => {
                totalNumberOfProcessedQueueItems++;

                const digits = getNumberOfDigits(totalNumberOfQueuedItems);
                const itemId = task.item.assetid || task.item.id;
                const itemName = task.item.name || task.item.description.name;
                const itemNameWithAmount = task.item.amount == 1 ? itemName : `${task.item.amount}x ${itemName}`;
                const padLeft = `${padLeftZero(`${totalNumberOfProcessedQueueItems}`, digits)} / ${totalNumberOfQueuedItems}`;

                if (getSettingWithDefault(SETTING_PRICE_MIN_LIST_PRICE) * 100 >= market.getPriceIncludingFees(task.sellPrice)) {
                    logDOM(`${padLeft} - ${itemNameWithAmount} is not listed due to ignoring price settings.`);
                    $(`#${task.item.appid}_${task.item.contextid}_${itemId}`).css('background', COLOR_PRICE_NOT_CHECKED);
                    next();
                    return;
                }

                market.sellItem(
                    task.item,
                    task.sellPrice,
                    (error, data) => {
                        const success = Boolean(data?.success);
                        const message = data?.message || '';

                        const callback = () => setTimeout(() => next(), getRandomInt(1000, 1500));

                        if (success) {
                            logDOM(`${padLeft} - ${itemNameWithAmount} listed for ${formatPrice(market.getPriceIncludingFees(task.sellPrice) * task.item.amount)}, you will receive ${formatPrice(task.sellPrice * task.item.amount)}.`);
                            $(`#${task.item.appid}_${task.item.contextid}_${itemId}`).css('background', COLOR_SUCCESS);

                            totalPriceWithoutFeesOnMarket += task.sellPrice * task.item.amount;
                            totalPriceWithFeesOnMarket += market.getPriceIncludingFees(task.sellPrice) * task.item.amount;

                            updateTotals();
                            callback()

                            return;
                        }

                        if (message && isRetryMessage(message)) {
                            logDOM(`${padLeft} - ${itemNameWithAmount} retrying listing because: ${message.charAt(0).toLowerCase()}${message.slice(1)}`);

                            totalNumberOfProcessedQueueItems--;
                            sellQueue.unshift(task);
                            sellQueue.pause();

                            setTimeout(() => sellQueue.resume(), getRandomInt(30000, 45000));
                            callback();

                            return;
                        }

                        logDOM(`${padLeft} - ${itemNameWithAmount} not added to market${message ? ` because:  ${message.charAt(0).toLowerCase()}${message.slice(1)}` : '.'}`);
                        $(`#${task.item.appid}_${task.item.contextid}_${itemId}`).css('background', COLOR_ERROR);

                        callback();
                    }
                );
            },
            1
        );

        sellQueue.drain(() => {
            onQueueDrain();
        });

        function sellAllItems() {
            renderSpinner('Loading inventory items');

            loadAllInventories().then(() => {
                removeSpinner();

                const items = getInventoryItems();
                const filteredItems = [];

                items.forEach((item) => {
                    if (!item.marketable) {
                        return;
                    }

                    filteredItems.push(item);
                });

                sellItems(filteredItems);
            });
        }

        function sellAllDuplicateItems() {
            renderSpinner('Loading inventory items');

            loadAllInventories().then(() => {
                removeSpinner();

                const items = getInventoryItems();
                const marketableItems = [];
                let filteredItems = [];

                items.forEach((item) => {
                    if (!item.marketable) {
                        return;
                    }

                    marketableItems.push(item);
                });

                filteredItems = marketableItems.filter((e, i) => marketableItems.map((m) => m.classid).indexOf(e.classid) !== i);

                sellItems(filteredItems);
            });
        }

        function gemAllDuplicateItems() {
            renderSpinner('Loading inventory items');

            loadAllInventories().then(() => {
                removeSpinner();

                const items = getInventoryItems();
                let filteredItems = [];
                let numberOfQueuedItems = 0;

                filteredItems = items.filter((e, i) => items.map((m) => m.classid).indexOf(e.classid) !== i);

                filteredItems.forEach((item) => {
                    if (item.queued != null) {
                        return;
                    }

                    if (item.owner_actions == null) {
                        return;
                    }

                    let canTurnIntoGems = false;
                    for (const owner_action in item.owner_actions) {
                        if (item.owner_actions[owner_action].link != null && item.owner_actions[owner_action].link.includes('GetGooValue')) {
                            canTurnIntoGems = true;
                        }
                    }

                    if (!canTurnIntoGems) {
                        return;
                    }

                    item.queued = true;
                    scrapQueue.push(item);
                    numberOfQueuedItems++;
                });

                if (numberOfQueuedItems > 0) {
                    totalNumberOfQueuedItems += numberOfQueuedItems;

                    renderSpinner(`Processing ${numberOfQueuedItems} items`);
                }
            });
        }

        function sellAllCards() {
            renderSpinner('Loading inventory items');

            loadAllInventories().then(() => {
                removeSpinner();

                const items = getInventoryItems();
                const filteredItems = [];

                items.forEach((item) => {
                    if (!getIsTradingCard(item) || !item.marketable) {
                        return;
                    }

                    filteredItems.push(item);
                });

                sellItems(filteredItems);
            });
        }

        function sellAllCrates() {
            renderSpinner('Loading inventory items');

            loadAllInventories().then(() => {
                removeSpinner();

                const items = getInventoryItems();
                const filteredItems = [];
                items.forEach((item) => {
                    if (!getIsCrate(item) || !item.marketable) {
                        return;
                    }
                    filteredItems.push(item);
                });

                sellItems(filteredItems);
            });
        }

        const scrapQueue = async.queue((item, next) => {
            scrapQueueWorker(item, (success) => {
                if (success) {
                    setTimeout(() => {
                        next();
                    }, 250);
                } else {
                    const delay = numberOfFailedRequests > 1
                        ? getRandomInt(30000, 45000)
                        : getRandomInt(1000, 1500);

                    if (numberOfFailedRequests > 3) {
                        numberOfFailedRequests = 0;
                    }

                    setTimeout(() => {
                        next();
                    }, delay);
                }
            });
        }, 1);

        scrapQueue.drain(() => {
            onQueueDrain();
        });

        function scrapQueueWorker(item, callback) {
            const itemName = item.name || item.description.name;
            const itemId = item.assetid || item.id;

            market.getGooValue(
                item,
                (err, goo) => {
                    totalNumberOfProcessedQueueItems++;

                    const digits = getNumberOfDigits(totalNumberOfQueuedItems);
                    const padLeft = `${padLeftZero(`${totalNumberOfProcessedQueueItems}`, digits)} / ${totalNumberOfQueuedItems}`;

                    if (err != ERROR_SUCCESS) {
                        logConsole(`Failed to get gems value for ${itemName}`);
                        logDOM(`${padLeft} - ${itemName} not turned into gems due to missing gems value.`);

                        $(`#${item.appid}_${item.contextid}_${itemId}`).css('background', COLOR_ERROR);
                        return callback(false);
                    }

                    item.goo_value_expected = parseInt(goo.goo_value, 10);

                    market.grindIntoGoo(
                        item,
                        (err) => {
                            if (err != ERROR_SUCCESS) {
                                logConsole(`Failed to turn item into gems for ${itemName}`);
                                logDOM(`${padLeft} - ${itemName} not turned into gems due to unknown error.`);

                                $(`#${item.appid}_${item.contextid}_${itemId}`).css('background', COLOR_ERROR);
                                return callback(false);
                            }

                            logConsole('============================');
                            logConsole(itemName);
                            logConsole(`Turned into ${goo.goo_value} gems`);
                            logDOM(`${padLeft} - ${itemName} turned into ${item.goo_value_expected} gems.`);
                            $(`#${item.appid}_${item.contextid}_${itemId}`).css('background', COLOR_SUCCESS);

                            totalScrap += item.goo_value_expected;
                            updateTotals();

                            callback(true);
                        }
                    );
                }
            );
        }

        const boosterQueue = async.queue((item, next) => {
            boosterQueueWorker(item, (success) => {
                if (success) {
                    setTimeout(() => {
                        next();
                    }, 250);
                } else {
                    const delay = numberOfFailedRequests > 1
                        ? getRandomInt(30000, 45000)
                        : getRandomInt(1000, 1500);

                    if (numberOfFailedRequests > 3) {
                        numberOfFailedRequests = 0;
                    }

                    setTimeout(() => {
                        next();
                    }, delay);
                }
            });
        }, 1);

        boosterQueue.drain(() => {
            onQueueDrain();
        });

        function boosterQueueWorker(item, callback) {
            const itemName = item.name || item.description.name;
            const itemId = item.assetid || item.id;

            market.unpackBoosterPack(
                item,
                (err) => {
                    totalNumberOfProcessedQueueItems++;

                    const digits = getNumberOfDigits(totalNumberOfQueuedItems);
                    const padLeft = `${padLeftZero(`${totalNumberOfProcessedQueueItems}`, digits)} / ${totalNumberOfQueuedItems}`;

                    if (err != ERROR_SUCCESS) {
                        logConsole(`Failed to unpack booster pack ${itemName}`);
                        logDOM(`${padLeft} - ${itemName} not unpacked.`);

                        $(`#${item.appid}_${item.contextid}_${itemId}`).css('background', COLOR_ERROR);
                        return callback(false);
                    }

                    logDOM(`${padLeft} - ${itemName} unpacked.`);
                    $(`#${item.appid}_${item.contextid}_${itemId}`).css('background', COLOR_SUCCESS);

                    callback(true);
                }
            );
        }


        // Turns the selected items into gems.
        function turnSelectedItemsIntoGems() {
            const ids = getSelectedItems();

            renderSpinner('Loading inventory items');

            loadAllInventories().then(() => {
                removeSpinner();

                const items = getInventoryItems();

                let numberOfQueuedItems = 0;
                items.forEach((item) => {
                    // Ignored queued items.
                    if (item.queued != null) {
                        return;
                    }

                    if (item.owner_actions == null) {
                        return;
                    }

                    let canTurnIntoGems = false;
                    for (const owner_action in item.owner_actions) {
                        if (item.owner_actions[owner_action].link != null && item.owner_actions[owner_action].link.includes('GetGooValue')) {
                            canTurnIntoGems = true;
                        }
                    }

                    if (!canTurnIntoGems) {
                        return;
                    }

                    const itemId = item.assetid || item.id;
                    if (ids.indexOf(itemId) !== -1) {
                        item.queued = true;
                        scrapQueue.push(item);
                        numberOfQueuedItems++;
                    }
                });

                if (numberOfQueuedItems > 0) {
                    totalNumberOfQueuedItems += numberOfQueuedItems;

                    renderSpinner(`Processing ${numberOfQueuedItems} items`);
                }
            });
        }

        // Unpacks all booster packs.
        function unpackAllBoosterPacks() {
            renderSpinner('Loading inventory items');

            loadAllInventories().then(() => {
                removeSpinner();

                const items = getInventoryItems();

                let numberOfQueuedItems = 0;

                items.forEach((item) => {
                    if (item.queued != null || item.owner_actions == null) {
                        return;
                    }

                    let canOpenBooster = false;

                    for (const owner_action in item.owner_actions) {
                        if (item.owner_actions[owner_action].link != null && item.owner_actions[owner_action].link.includes('OpenBooster')) {
                            canOpenBooster = true;
                        }
                    }

                    if (!canOpenBooster) {
                        return;
                    }

                    item.queued = true;
                    boosterQueue.push(item);
                    numberOfQueuedItems++;
                });

                if (numberOfQueuedItems === 0) {
                    logDOM('No booster packs found in the inventory to unpack.');

                    return;
                }

                totalNumberOfQueuedItems += numberOfQueuedItems;

                renderSpinner(`Processing ${numberOfQueuedItems} items`);
            });
        }

        // Unpacks the selected booster packs.
        function unpackSelectedBoosterPacks() {
            const ids = getSelectedItems();

            renderSpinner('Loading inventory items');

            loadAllInventories().then(() => {
                removeSpinner();

                const items = getInventoryItems();

                let numberOfQueuedItems = 0;
                items.forEach((item) => {
                    // Ignored queued items.
                    if (item.queued != null || item.owner_actions == null) {
                        return;
                    }

                    let canOpenBooster = false;
                    for (const owner_action in item.owner_actions) {
                        if (item.owner_actions[owner_action].link != null && item.owner_actions[owner_action].link.includes('OpenBooster')) {
                            canOpenBooster = true;
                        }
                    }

                    if (!canOpenBooster) {
                        return;
                    }

                    const itemId = item.assetid || item.id;
                    if (ids.indexOf(itemId) !== -1) {
                        item.queued = true;
                        boosterQueue.push(item);
                        numberOfQueuedItems++;
                    }
                });

                if (numberOfQueuedItems > 0) {
                    totalNumberOfQueuedItems += numberOfQueuedItems;

                    renderSpinner(`Processing ${numberOfQueuedItems} items`);
                }
            });
        }

        function sellSelectedItems() {
            getInventorySelectedMarketableItems((items) => {
                sellItems(items);
            });
        }

        function canSellSelectedItemsManually(items) {
            // We have to construct an URL like this
            // https://steamcommunity.com/market/multisell?appid=730&contextid=2&items[]=Falchion%20Case&qty[]=100
            if (!items.length) {
                return false;
            }
            const contextid = items[0].contextid;
            let hasInvalidItem = false;

            items.forEach((item) => {
                if (item.contextid != contextid || item.appid != items[0].appid || item.commodity == false) {
                    hasInvalidItem = true;
                }
            });

            return !hasInvalidItem;
        }

        function sellSelectedItemsManually() {
            getInventorySelectedMarketableItems((items) => {
                if (!items.length) {
                    return;
                }
                if (!canSellSelectedItemsManually(items)) {
                    unsafeWindow.ShowAlertDialog('Bulk sell', 'Steam multisell requires commodity items from the same inventory.');
                    return;
                }
                // We have to construct an URL like this
                // https://steamcommunity.com/market/multisell?appid=730&contextid=2&items[]=Falchion%20Case&qty[]=100

                const appid = items[0].appid;
                const contextid = items[0].contextid;

                const itemsWithQty = {};

                items.forEach((item) => {
                    itemsWithQty[item.market_hash_name] = itemsWithQty[item.market_hash_name] + 1 || 1;
                });

                let itemsString = '';
                for (const itemName in itemsWithQty) {
                    itemsString += `&items[]=${encodeURIComponent(itemName)}&qty[]=${itemsWithQty[itemName]}`;
                }

                const baseUrl = `${window.location.origin}/market/multisell`;
                const redirectUrl = `${baseUrl}?appid=${appid}&contextid=${contextid}${itemsString}`;

                const dialog = unsafeWindow.ShowDialog('Steam-Economy-Enhancer-Upgraded', `<iframe frameBorder="0" height="650" width="900" src="${redirectUrl}"></iframe>`);
                dialog.OnDismiss(() => {
                    items.forEach((item) => {
                        const itemId = item.assetid || item.id;
                        $(`#${item.appid}_${item.contextid}_${itemId}`).css('background', COLOR_PENDING);
                    });
                });
            });
        }

        function sellItems(items) {
            if (items.length == 0) {
                logDOM('These items cannot be added to the market...');

                return;
            }

            let numberOfQueuedItems = 0;

            items.forEach((item) => {
                // Ignored queued items.
                if (item.queued != null) {
                    return;
                }

                item.queued = true;
                item.ignoreErrors = false;
                itemQueue.push(item);
                numberOfQueuedItems++;
            });

            if (numberOfQueuedItems > 0) {
                totalNumberOfQueuedItems += numberOfQueuedItems;

                renderSpinner(`Processing ${numberOfQueuedItems} items`);
            }
        }

        const itemQueue = async.queue((item, next) => {
            itemQueueWorker(
                item,
                item.ignoreErrors,
                (success, cached) => {
                    if (success) {
                        setTimeout(() => next(), cached ? 0 : getRandomInt(1000, 1500));
                    } else {
                        if (!item.ignoreErrors) {
                            item.ignoreErrors = true;
                            itemQueue.push(item);
                        }

                        const delay = numberOfFailedRequests > 1 ? getRandomInt(30000, 45000) : getRandomInt(1000, 1500);
                        numberOfFailedRequests = numberOfFailedRequests > 3 ? 0 : numberOfFailedRequests;

                        setTimeout(() => next(), cached ? 0 : delay);
                    }
                }
            );
        }, 1);

        function itemQueueWorker(item, ignoreErrors, callback) {
            const priceInfo = getPriceInformationFromItem(item);

            let failed = 0;
            const itemName = item.name || item.description.name;

            market.getPriceHistory(
                item,
                true,
                (err, history, cachedHistory) => {
                    if (err) {
                        logConsole(`Failed to get price history for ${itemName}`);

                        if (err != ERROR_SUCCESS) {
                            failed += 1;
                        }
                    }

                    market.getOrderBook(
                        item,
                        true,
                        (err, orderbook, cachedListings) => {
                            if (err) {
                                logConsole(`Failed to get order book for ${itemName}`);

                                if (err != ERROR_SUCCESS) {
                                    failed += 1;
                                }
                            }

                            if (failed > 0 && !ignoreErrors) {
                                return callback(false, cachedHistory && cachedListings);
                            }

                            logConsole('============================');
                            logConsole(itemName);

                            const sellPrice = calculateSellPriceBeforeFees(
                                history,
                                orderbook,
                                true,
                                priceInfo.minPriceBeforeFees,
                                priceInfo.maxPriceBeforeFees
                            );


                            logConsole(`Sell price: ${sellPrice / 100.0} (${market.getPriceIncludingFees(sellPrice) / 100.0})`);

                            sellQueue.push({
                                item: item,
                                sellPrice: sellPrice
                            });

                            return callback(true, cachedHistory && cachedListings);
                        }
                    );
                }
            );
        }

        // Initialize the inventory UI.
        function initializeInventoryUI() {
            const isOwnInventory = unsafeWindow.g_ActiveUser.strSteamId == unsafeWindow.g_steamID;
            let previousSelection = -1; // To store the index of the previous selection.
            updateInventoryUI(isOwnInventory);

            $('.games_list_tabs').on('click', '*', () => {
                updateInventoryUI(isOwnInventory);
            }
            );

            // Ignore selection on other user's inventories.
            if (!isOwnInventory) {
                return;
            }

            // Steam adds 'display:none' to items while searching. These should not be selected while using shift/ctrl.
            const filter = '.itemHolder:not([style*=none])';
            $('#inventories').selectable({
                filter: filter,
                selecting: function (e, ui) {
                    // Get selected item index.
                    const selectedIndex = $(ui.selecting.tagName, e.target).index(ui.selecting);

                    // If shift key was pressed and there is previous - select them all.
                    if (e.shiftKey && previousSelection > -1) {
                        $(ui.selecting.tagName, e.target).
                            slice(
                                Math.min(previousSelection, selectedIndex),
                                1 + Math.max(previousSelection, selectedIndex)
                            ).each(function () {
                                if ($(this).is(filter)) {
                                    $(this).addClass('ui-selected');
                                }
                            });
                        previousSelection = -1; // Reset previous.
                    } else {
                        previousSelection = selectedIndex; // Save previous.
                    }
                },
                selected: function () {
                    updateButtons();
                },
                unselected: function () {
                    updateButtons();
                }
            });

            if (typeof unsafeWindow.CInventory !== 'undefined') {
                const originalSelectItem = unsafeWindow.CInventory.prototype.SelectItem;

                unsafeWindow.CInventory.prototype.SelectItem = function (event, elItem, rgItem) {
                    originalSelectItem.apply(this, arguments);

                    updateButtons();
                    updateInventorySelection(rgItem);
                };
            }
        }

        // Gets the selected items in the inventory.
        function getSelectedItems() {
            const ids = [];
            $('.inventory_ctn').each(function () {
                $(this).find('.inventory_page').each(function () {
                    const inventory_page = this;

                    $(inventory_page).find('.itemHolder.ui-selected:not([style*=none])').each(function () {
                        $(this).find('.item').each(function () {
                            const matches = this.id.match(/_(-?\d+)$/);
                            if (matches) {
                                ids.push(matches[1]);
                            }
                        });
                    });
                });
            });

            return ids;
        }

        // Gets the selected and marketable items in the inventory.
        function getInventorySelectedMarketableItems(callback) {
            const ids = getSelectedItems();

            loadAllInventories().then(() => {
                const items = getInventoryItems();
                const filteredItems = [];

                items.forEach((item) => {
                    if (!item.marketable) {
                        return;
                    }

                    const itemId = item.assetid || item.id;
                    if (ids.indexOf(itemId) !== -1) {
                        filteredItems.push(item);
                    }
                });

                callback(filteredItems);
            });
        }

        // Gets the selected and gemmable items in the inventory.
        function getInventorySelectedGemsItems(callback) {
            const ids = getSelectedItems();

            loadAllInventories().then(() => {
                const items = getInventoryItems();
                const filteredItems = [];

                items.forEach((item) => {
                    let canTurnIntoGems = false;
                    for (const owner_action in item.owner_actions) {
                        if (item.owner_actions[owner_action].link != null && item.owner_actions[owner_action].link.includes('GetGooValue')) {
                            canTurnIntoGems = true;
                        }
                    }

                    if (!canTurnIntoGems) {
                        return;
                    }

                    const itemId = item.assetid || item.id;
                    if (ids.indexOf(itemId) !== -1) {
                        filteredItems.push(item);
                    }
                });

                callback(filteredItems);
            });
        }

        // Gets the selected and booster pack items in the inventory.
        function getInventorySelectedBoosterPackItems(callback) {
            const ids = getSelectedItems();

            loadAllInventories().then(() => {
                const items = getInventoryItems();
                const filteredItems = [];

                items.forEach((item) => {
                    let canOpenBooster = false;
                    for (const owner_action in item.owner_actions) {
                        if (item.owner_actions[owner_action].link != null && item.owner_actions[owner_action].link.includes('OpenBooster')) {
                            canOpenBooster = true;
                        }
                    }

                    if (!canOpenBooster) {
                        return;
                    }

                    const itemId = item.assetid || item.id;
                    if (ids.indexOf(itemId) !== -1) {
                        filteredItems.push(item);
                    }
                });

                callback(filteredItems);
            });
        }

        // Updates the (selected) sell ... items button.
        function updateSellSelectedButton() {
            // Keep the mandatory action visible, including while inventory data loads.
            const manual = $('.sell_manual').show();
            manual.prop('disabled', !getSelectedItems().length);
            manual.attr('title', getSelectedItems().length ? '' : '选中至少一件进行批量销售的物品');
            getInventorySelectedMarketableItems((items) => {
                const selectedItems = items.length;
                if (items.length == 0) {
                    $('.sell_selected').hide();
                } else {
                    $('.sell_selected').show();
                    $('.sell_selected > span').text(`Sell ${selectedItems}${selectedItems == 1 ? ' Item' : ' Items'}`);
                }
            });
        }

        // Updates the (selected) turn into ... gems button.
        function updateTurnIntoGemsButton() {
            getInventorySelectedGemsItems((items) => {
                const selectedItems = items.length;
                if (items.length == 0) {
                    $('.turn_into_gems').hide();
                } else {
                    $('.turn_into_gems').show();
                    $('.turn_into_gems > span').
                        text(`Turn ${selectedItems}${selectedItems == 1 ? ' Item Into Gems' : ' Items Into Gems'}`);
                }
            });
        }

        // Updates the (selected) open ... booster packs button.
        function updateOpenBoosterPacksButton() {
            getInventorySelectedBoosterPackItems((items) => {
                const selectedItems = items.length;
                if (items.length == 0) {
                    $('.unpack_selected_booster_packs').hide();
                } else {
                    $('.unpack_selected_booster_packs').show();
                    $('.unpack_selected_booster_packs > span').
                        text(`Unpack ${selectedItems}${selectedItems == 1 ? ' Booster Pack' : ' Booster Packs'}`);
                }
            });
        }

        function updateButtons() {
            updateSellSelectedButton();
            updateTurnIntoGemsButton();
            updateOpenBoosterPacksButton();
        }

        function delay(ms) {
            return new Promise(resolve => setTimeout(resolve, ms));
        }

        async function updateInventorySelection(selectedItem) {
            if (getSettingWithDefault(SETTING_QUICK_SELL_BUTTONS) != 1) {
                return;
            }

            const item_info = $(`#iteminfo${unsafeWindow.iActiveSelectView}`);

            if (!item_info.length) {
                return;
            }

            if (item_info.html().indexOf('checkout/sendgift/') > -1) { // Gifts have no market information.
                return;
            }

            let timeDelayed = 0;

            // Wait until item_info is loaded.
            while (timeDelayed < 2500 && item_info.find('a[href^="https://steamcommunity.com/market/listings/"]').length == 0) {
                await delay(100);
                timeDelayed += 100;
            }

            const market_hash_name = getMarketHashName(selectedItem);
            if (market_hash_name == null) {
                return;
            }

            const appid = selectedItem.appid;
            const item = {
                appid: parseInt(appid),
                description: {
                    market_hash_name: market_hash_name
                }
            };

            const isBoosterPack = selectedItem.name.toLowerCase().endsWith('booster pack');
            if (isBoosterPack) {
                const tradingCardsUrl = `/market/search?q=&category_753_Game%5B%5D=tag_app_${selectedItem.market_fee_app}&category_753_item_class%5B%5D=tag_item_class_2&appid=753`;
                const communityHeader = $('h1', item_info).next().find('span').eq(0);
                communityHeader.replaceWith(`<a href="${tradingCardsUrl}"><span>${communityHeader.text()}</span></a>`);
            }

            // Skip unmarketable items
            if (!selectedItem.marketable) {
                return;
            }

            // Ignored queued items.
            if (selectedItem.queued != null) {
                return;
            }

            const marketLink = `https://steamcommunity.com/market/listings/${appid}/${encodeURIComponent(market_hash_name)}`;
            const baseLink = $(`a[href^="${marketLink}"]`, item_info);
            const ownerActions = baseLink.parent().parent();

            market.getOrderBook(
                item,
                false,
                (err, orderbook) => {
                    if (err) {
                        logConsole(`Failed to get order book for ${selectedItem.name || selectedItem.description.name}`);
                        return;
                    }

                    // Ignored queued items.
                    if (selectedItem.queued != null) {
                        return;
                    }

                    const sellRows = (orderbook.sell_order_graph || []).slice(0, 10).map(([price, qty]) =>
                        `<tr><td align="right">${formatPrice(Math.round(price * 100))}</td><td align="right">${qty}</td></tr>`
                    ).join('');

                    const buyRows = (orderbook.buy_order_graph || []).slice(0, 10).map(([price, qty]) =>
                        `<tr><td align="right">${formatPrice(Math.round(price * 100))}</td><td align="right">${qty}</td></tr>`
                    ).join('');

                    const groupMain = $(`<div id="listings_group">
                        <div>
                            <div id="listings_sell">Sell</div>
                            <table class="market_commodity_orders_table"><tr><th align="right">Price</th><th align="right">Quantity</th></tr>${sellRows}</table>
                        </div>
                        <div>
                            <div id="listings_buy">Buy</div>
                            <table class="market_commodity_orders_table"><tr><th align="right">Price</th><th align="right">Quantity</th></tr>${buyRows}</table>
                        </div>
                    </div>`);

                    baseLink.next().append(groupMain);

                    // Generate quick sell buttons.
                    let prices = [];

                    if (orderbook != null && orderbook.highest_buy_order != null) {
                        prices.push(parseInt(orderbook.highest_buy_order));
                    }

                    if (orderbook != null && orderbook.lowest_sell_order != null) {
                        // Transaction volume must be separable into three or more parts (no matter if equal): valve+publisher+seller.
                        if (parseInt(orderbook.lowest_sell_order) > 3) {
                            prices.push(parseInt(orderbook.lowest_sell_order) - 1);
                        }
                        prices.push(parseInt(orderbook.lowest_sell_order));
                    }

                    prices = prices.filter((v, i) => prices.indexOf(v) === i).sort((a, b) => a - b);

                    let buttons = '<div id="price_buttons">';
                    prices.forEach((e) => {
                        buttons += `<a class="item_market_action_button item_market_action_button_green quick_sell" id="quick_sell${e}">
                            <span class="item_market_action_button_edge item_market_action_button_left"></span>
                            <span class="item_market_action_button_contents">${formatPrice(e)}</span>
                            <span class="item_market_action_button_edge item_market_action_button_right"></span>
                            <span class="item_market_action_button_preload"></span>
                        </a>`;
                    });
                    buttons += '</div>';

                    ownerActions.append(buttons);

                    ownerActions.append(`<div id="sell_button" style="display:flex">
                        <input id="quick_sell_input" style="background-color: black;color: white;border: transparent;max-width:65px;text-align:center;" type="number" value="${((orderbook.lowest_sell_order || 0) / 100).toFixed(2)}" step="0.01" />&nbsp;
                        <a class="item_market_action_button item_market_action_button_green quick_sell_custom">
                            <span class="item_market_action_button_edge item_market_action_button_left"></span>
                            <span class="item_market_action_button_contents">➜ Sell</span>
                            <span class="item_market_action_button_edge item_market_action_button_right"></span>
                            <span class="item_market_action_button_preload"></span>
                        </a>
                    </div>`);

                    $('.quick_sell').on(
                        'click',
                        function () {
                            let price = $(this).attr('id').replace('quick_sell', '');
                            price = market.getPriceBeforeFees(price);

                            totalNumberOfQueuedItems++;

                            sellQueue.push({
                                item: selectedItem,
                                sellPrice: price
                            });
                        }
                    );

                    $('.quick_sell_custom').on(
                        'click',
                        () => {
                            let price = $('#quick_sell_input', ownerActions).val() * 100;
                            price = market.getPriceBeforeFees(price);

                            totalNumberOfQueuedItems++;

                            sellQueue.push({
                                item: selectedItem,
                                sellPrice: price
                            });
                        }
                    );
                }
            );
        }

        // Update the inventory UI.
        function updateInventoryUI(isOwnInventory) {
            // Remove previous containers (e.g., when a user changes inventory).
            $('#inventory_sell_buttons').remove();
            $('#see_settings_modal').remove();
            $('#inventory_reload_button').remove();

            $('#see_settings').remove();
            $('#global_action_menu').
                prepend('<span id="see_settings"><a href="javascript:void(0)">⬖ Steam-Economy-Enhancer-Upgraded</a></span>');
            $('#see_settings').on('click', '*', () => openSettings());

            const appId = getActiveInventory().m_appid;
            const showMiscOptions = appId == 753;
            const TF2 = appId == 440;

            let buttonsHtml = `
                <a class="btn_green_white_innerfade btn_medium_wide sell_all"><span>Sell All Items</span></a>
                <a class="btn_green_white_innerfade btn_medium_wide sell_all_duplicates"><span>Sell All Duplicate Items</span></a>
                <a class="btn_green_white_innerfade btn_medium_wide sell_selected" style="display:none"><span>Sell Selected Items</span></a>
                <button type="button" class="btn_green_white_innerfade btn_medium_wide sell_manual" disabled title="选中至少一件进行批量销售的物品"><span>批量出售物品</span></button>
            `;

            if (showMiscOptions) {
                buttonsHtml += `
                    <a class="btn_green_white_innerfade btn_medium_wide sell_all_cards"><span>Sell All Cards</span></a>
                    <div class="see_inventory_buttons">
                        <a class="btn_darkblue_white_innerfade btn_medium_wide turn_into_gems" style="display:none"><span>Turn Selected Items Into Gems</span></a>
                        <a class="btn_darkblue_white_innerfade btn_medium_wide unpack_all_booster_packs"><span>Unpack All Booster Packs</span></a>
                        <a class="btn_darkblue_white_innerfade btn_medium_wide unpack_selected_booster_packs" style="display:none"><span>Unpack Selected Booster Packs</span></a>
                        <a class="btn_darkblue_white_innerfade btn_medium_wide gem_all_duplicates"><span>Turn All Duplicate Items Into Gems</span></a>
                    </div>
                `;
            } else if (TF2) {
                buttonsHtml += '<a class="btn_green_white_innerfade btn_medium_wide sell_all_crates"><span>Sell All Crates</span></a>';
            }

            const sellButtons = $(`<div id="inventory_sell_buttons" class="see_inventory_buttons">${buttonsHtml}</div>`);

            const reloadButton =
                $('<a id="inventory_reload_button" class="btn_darkblue_white_innerfade btn_medium_wide reload_inventory" style="margin-right:12px"><span>Reload Inventory</span></a>');

            const logo = $('#inventory_logos')[0];
            logo.style.height = 'auto';
            logo.style.maxHeight = 'unset';

            $('#inventory_applogo').hide(); // Hide the Steam/game logo, we don't need to see it twice.
            $('#inventory_applogo').after(logger);


            $('#logger').on(
                'scroll',
                () => {
                    const hasUserScrolledToBottom =
                        $('#logger').prop('scrollHeight') - $('#logger').prop('clientHeight') <=
                        $('#logger').prop('scrollTop') + 1;
                    userScrolled = !hasUserScrolledToBottom;
                }
            );

            // Only add buttons on the user's inventory.
            if (isOwnInventory) {
                $('#inventory_applogo').after(sellButtons);

                // Add bindings to sell buttons.
                $('.sell_all').on(
                    'click',
                    '*',
                    () => {
                        sellAllItems();
                    }
                );
                $('.sell_selected').on('click', '*', sellSelectedItems);
                $('.sell_all_duplicates').on('click', '*', sellAllDuplicateItems);
                $('.gem_all_duplicates').on('click', '*', gemAllDuplicateItems);
                $('.sell_manual').on('click', sellSelectedItemsManually);
                $('.sell_all_cards').on('click', '*', sellAllCards);
                $('.sell_all_crates').on('click', '*', sellAllCrates);
                $('.turn_into_gems').on('click', '*', turnSelectedItemsIntoGems);
                $('.unpack_all_booster_packs').on('click', '*', unpackAllBoosterPacks);
                $('.unpack_selected_booster_packs').on('click', '*', unpackSelectedBoosterPacks);

            }

            applyInventoryButtonSettings();
            if (isOwnInventory) {
                updateButtons();
            }
            $('.inventory_rightnav').prepend(reloadButton);
            $('.reload_inventory').on(
                'click',
                '*',
                () => {
                    window.location.reload();
                }
            );

            loadAllInventories().then(() => {
                const updateInventoryPrices = function () {
                    if (getSettingWithDefault(SETTING_INVENTORY_PRICE_LABELS) == 1) {
                        setInventoryPrices(getInventoryItems());
                    }
                };

                // Load after the inventory is loaded.
                updateInventoryPrices();

                $('#pagecontrol_cur').observe(
                    'childlist',
                    () => {
                        updateInventoryPrices();
                    }
                );
            });
        }

        // Loads all inventories.
        async function loadAllInventories() {
            const main = getActiveInventory();

            const childs = Object.values(main.m_rgChildInventories);

            for (const inventory of [...childs, main]) {
                await new Promise((resolve) => inventory.LoadCompleteInventory().done(resolve));
            }
        }

        // Gets the inventory items from the active inventory.
        function getInventoryItems() {
            const arr = [];

            for (const child in getActiveInventory().m_rgChildInventories) {
                for (const key in getActiveInventory().m_rgChildInventories[child].m_rgAssets) {
                    const value = getActiveInventory().m_rgChildInventories[child].m_rgAssets[key];
                    if (typeof value === 'object') {
                        // Merges the description in the normal object, this is done to keep the layout consistent with the market page, which is also flattened.
                        Object.assign(value, value.description);
                        // Includes the id of the inventory item.
                        value['id'] = key;
                        value['assetid'] = key;
                        arr.push(value);
                    }
                }
            }

            // Some inventories (e.g. BattleBlock Theater) do not have child inventories, they have just one.
            for (const key in getActiveInventory().m_rgAssets) {
                const value = getActiveInventory().m_rgAssets[key];
                if (typeof value === 'object') {
                    // Merges the description in the normal object, this is done to keep the layout consistent with the market page, which is also flattened.
                    Object.assign(value, value.description);
                    // Includes the id of the inventory item.
                    value['id'] = key;
                    value['assetid'] = key;
                    arr.push(value);
                }
            }

            return arr;
        }
    }
    //#endregion

    //#region Inventory + Tradeoffer
    if (currentPage == PAGE_INVENTORY || currentPage == PAGE_TRADEOFFER) {

        // Gets the active inventory.
        function getActiveInventory() {
            return unsafeWindow.g_ActiveInventory;
        }

        // Sets the prices for the items.
        function setInventoryPrices(items) {
            inventoryPriceQueue.kill();

            items.forEach((item) => {
                if (!item.marketable) {
                    return;
                }

                if (!$(item.element).is(':visible')) {
                    return;
                }

                inventoryPriceQueue.push(item);
            });
        }

        const inventoryPriceQueue = async.queue(
            (item, next) => {
                inventoryPriceQueueWorker(
                    item,
                    false,
                    (success, cached) => {
                        if (success) {
                            setTimeout(() => next(), cached ? 0 : getRandomInt(1000, 1500));
                        } else {
                            if (!item.ignoreErrors) {
                                item.ignoreErrors = true;
                                inventoryPriceQueue.push(item);
                            }

                            numberOfFailedRequests++;

                            const delay = numberOfFailedRequests > 1 ? getRandomInt(30000, 45000) : getRandomInt(1000, 1500);
                            numberOfFailedRequests = numberOfFailedRequests > 3 ? 0 : numberOfFailedRequests;

                            setTimeout(() => next(), cached ? 0 : delay);
                        }
                    }
                );
            },
            1
        );

        function inventoryPriceQueueWorker(item, ignoreErrors, callback) {
            let failed = 0;
            const itemName = item.name || item.description.name;

            // Only get the market orders here, the history is not important to visualize the current prices.
            market.getOrderBook(
                item,
                true,
                (err, orderbook, cachedListings) => {
                    if (err) {
                        logConsole(`Failed to get order book for ${itemName}`);

                        if (err != ERROR_SUCCESS) {
                            failed += 1;
                        }
                    }

                    if (failed > 0 && !ignoreErrors) {
                        return callback(false, cachedListings);
                    }

                    const sellPrice = calculateSellPriceBeforeFees(null, orderbook, false, 0, 65535);

                    const itemPrice = sellPrice == 65535
                        ? '∞'
                        : formatPrice(market.getPriceIncludingFees(sellPrice));

                    const elementName = `${(currentPage == PAGE_TRADEOFFER ? '#item' : '#')}${item.appid}_${item.contextid}_${item.id}`;
                    const element = $(elementName);

                    $('.inventory_item_price', element).remove();
                    element.append(`<span class="inventory_item_price price_${sellPrice == 65535 ? 0 : market.getPriceIncludingFees(sellPrice)}">${itemPrice}</span>`);

                    return callback(true, cachedListings);
                }
            );
        }
    }
    //#endregion

    //#region Tradeoffers
    if (currentPage == PAGE_TRADEOFFER) {
        // Gets the trade offer's inventory items from the active inventory.
        function getTradeOfferInventoryItems() {
            const arr = [];
            const activeInventory = getActiveInventory();

            // We don't have an active inventory yet.
            if (!activeInventory) {
                return arr;
            }

            for (const child in activeInventory.rgChildInventories) {
                for (const key in activeInventory.rgChildInventories[child].rgInventory) {
                    const value = activeInventory.rgChildInventories[child].rgInventory[key];
                    if (typeof value === 'object') {
                        // Merges the description in the normal object, this is done to keep the layout consistent with the market page, which is also flattened.
                        Object.assign(value, value.description);
                        // Includes the id of the inventory item.
                        value['id'] = key;
                        value['assetid'] = key;
                        arr.push(value);
                    }
                }
            }

            // Some inventories (e.g. BattleBlock Theater) do not have child inventories, they have just one.
            for (const key in activeInventory.rgInventory) {
                const value = activeInventory.rgInventory[key];
                if (typeof value === 'object') {
                    // Merges the description in the normal object, this is done to keep the layout consistent with the market page, which is also flattened.
                    Object.assign(value, value.description);
                    // Includes the id of the inventory item.
                    value['id'] = key;
                    value['assetid'] = key;
                    arr.push(value);
                }
            }

            return arr;
        }

        function sumTradeOfferAssets(assets, user) {
            const total = {};
            let totalPrice = 0;
            for (let i = 0; i < assets.length; i++) {
                const rgItem = user.findAsset(assets[i].appid, assets[i].contextid, assets[i].assetid);

                let text = '';
                if (rgItem != null) {
                    if (rgItem.element) {
                        const inventoryPriceElements = $('.inventory_item_price', rgItem.element);
                        if (inventoryPriceElements.length) {
                            const firstPriceElement = inventoryPriceElements[0];
                            const classes = $(firstPriceElement).attr('class').split(' ');
                            for (const c in classes) {
                                if (classes[c].toString().includes('price_')) {
                                    const price = parseInt(classes[c].toString().replace('price_', ''));
                                    totalPrice += price;
                                }
                            }

                        }
                    }

                    if (rgItem.original_amount != null && rgItem.amount != null) {
                        const originalAmount = parseInt(rgItem.original_amount);
                        const currentAmount = parseInt(rgItem.amount);
                        const usedAmount = originalAmount - currentAmount;
                        text += `${usedAmount.toString()}x `;
                    }

                    text += rgItem.name;

                    if (rgItem.type != null && rgItem.type.length > 0) {
                        text += ` (${rgItem.type})`;
                    }
                } else {
                    text = 'Unknown Item';
                }

                if (text in total) {
                    total[text] = total[text] + 1;
                } else {
                    total[text] = 1;
                }
            }

            const sortable = [];
            for (const item in total) {
                sortable.push([
                    item,
                    total[item]
                ]);
            }

            sortable.sort((a, b) => {
                return a[1] - b[1];
            }).reverse();

            let totalText = `<strong>Number of unique items: ${sortable.length}, worth ${formatPrice(totalPrice)}<br/><br/></strong>`;
            let totalNumOfItems = 0;
            for (let i = 0; i < sortable.length; i++) {
                totalText += `${sortable[i][1]}x ${sortable[i][0]}<br/>`;
                totalNumOfItems += sortable[i][1];
            }
            totalText += `<br/><strong>Total items: ${totalNumOfItems}</strong><br/>`;

            return totalText;
        }
    }


    let lastTradeOfferSum = 0;

    function hasLoadedAllTradeOfferItems() {
        for (let i = 0; i < unsafeWindow.g_rgCurrentTradeStatus.them.assets.length; i++) {
            const asset = unsafeWindow.UserThem.findAsset(unsafeWindow.g_rgCurrentTradeStatus.them.assets[i].appid, unsafeWindow.g_rgCurrentTradeStatus.them.assets[i].contextid, unsafeWindow.g_rgCurrentTradeStatus.them.assets[i].assetid);
            if (asset == null) {
                return false;
            }
        }
        for (let i = 0; i < unsafeWindow.g_rgCurrentTradeStatus.me.assets.length; i++) {
            const asset = unsafeWindow.UserYou.findAsset(unsafeWindow.g_rgCurrentTradeStatus.me.assets[i].appid, unsafeWindow.g_rgCurrentTradeStatus.me.assets[i].contextid, unsafeWindow.g_rgCurrentTradeStatus.me.assets[i].assetid);
            if (asset == null) {
                return false;
            }
        }
        return true;

    }

    function initializeTradeOfferUI() {
        if (getSettingWithDefault(SETTING_TRADEOFFER_PRICE_LABELS) == 1) {
            const updateInventoryPrices = function () {
                setInventoryPrices(getTradeOfferInventoryItems());
            };

            const updateInventoryPricesInTrade = function () {
                const items = [];
                for (let i = 0; i < unsafeWindow.g_rgCurrentTradeStatus.them.assets.length; i++) {
                    const asset = unsafeWindow.UserThem.findAsset(unsafeWindow.g_rgCurrentTradeStatus.them.assets[i].appid, unsafeWindow.g_rgCurrentTradeStatus.them.assets[i].contextid, unsafeWindow.g_rgCurrentTradeStatus.them.assets[i].assetid);
                    items.push(asset);
                }
                for (let i = 0; i < unsafeWindow.g_rgCurrentTradeStatus.me.assets.length; i++) {
                    const asset = unsafeWindow.UserYou.findAsset(unsafeWindow.g_rgCurrentTradeStatus.me.assets[i].appid, unsafeWindow.g_rgCurrentTradeStatus.me.assets[i].contextid, unsafeWindow.g_rgCurrentTradeStatus.me.assets[i].assetid);
                    items.push(asset);
                }
                setInventoryPrices(items);
            };

            $('.trade_right > div > div > div > .trade_item_box').observe('childlist subtree', () => {
                if (!hasLoadedAllTradeOfferItems()) {
                    return;
                }

                const currentTradeOfferSum = unsafeWindow.g_rgCurrentTradeStatus.me.assets.length + unsafeWindow.g_rgCurrentTradeStatus.them.assets.length;
                if (lastTradeOfferSum != currentTradeOfferSum) {
                    updateInventoryPricesInTrade();
                }

                lastTradeOfferSum = currentTradeOfferSum;

                $('#trade_offer_your_sum').remove();
                $('#trade_offer_their_sum').remove();

                const your_sum = sumTradeOfferAssets(unsafeWindow.g_rgCurrentTradeStatus.me.assets, unsafeWindow.UserYou);
                const their_sum = sumTradeOfferAssets(unsafeWindow.g_rgCurrentTradeStatus.them.assets, unsafeWindow.UserThem);

                $('div.offerheader:nth-child(1) > div:nth-child(3)').append(`<div class="trade_offer_sum" id="trade_offer_your_sum">${your_sum}</div>`);
                $('div.offerheader:nth-child(3) > div:nth-child(3)').append(`<div class="trade_offer_sum" id="trade_offer_their_sum">${their_sum}</div>`);
            });


            // Load after the inventory is loaded.
            updateInventoryPrices();

            $('#pagecontrol_cur').observe(
                'childlist',
                () => {
                    updateInventoryPrices();
                }
            );
        }

        const appendSelectPageButton = () => {
            $('#inventory_displaycontrols').append(`<div class="trade_offer_buttons">
              <a class="item_market_action_button item_market_action_button_green select_all">
                  <span class="item_market_action_button_contents" style="text-transform:none">Select all from page</span>
              </a>
          </div>`);

            $('.select_all').on('click', '*', () => {
                $('.inventory_ctn:visible > .inventory_page:visible > .itemHolder:visible').delayedEach(250, (i, it) => {
                    const item = it.rgItem;
                    if (item.is_stackable) {
                        return;
                    }

                    if (!item.tradable) {
                        return;
                    }

                    unsafeWindow.MoveItemToTrade(it);
                });
            });
        }

        // On counter offers, we need to wait until 'Change offer' is pressed
        if (location.pathname !== '/tradeoffer/new/' && location.pathname !== '/tradeoffer/new') {
            $('.modify_trade_offer').one('click', '*', () => {
                appendSelectPageButton();
            });
        } else {
            appendSelectPageButton();
        }
    }
    //#endregion

    //#region Settings
    function openSettings() {
        const price_options = $(`<div id="see_settings_modal">
            <div>
                Calculate prices as the:&nbsp;
                <select id="${SETTING_PRICE_ALGORITHM}">
                    <option value="1"${getSettingWithDefault(SETTING_PRICE_ALGORITHM) == 1 ? 'selected="selected"' : ''}>Maximum of the average history and lowest sell listing</option>
                    <option value="2" ${getSettingWithDefault(SETTING_PRICE_ALGORITHM) == 2 ? 'selected="selected"' : ''}>Lowest sell listing</option>
                    <option value="3" ${getSettingWithDefault(SETTING_PRICE_ALGORITHM) == 3 ? 'selected="selected"' : ''}>Highest current buy order or lowest sell listing</option>
                    <option value="4" ${getSettingWithDefault(SETTING_PRICE_ALGORITHM) == 4 ? 'selected="selected"' : ''}>Average history only</option>
                </select>
            </div>
            <div style="margin-top:6px;">
                Hours to use for the average history calculated price:&nbsp;
                <input type="number" min="0" step="2" id="${SETTING_PRICE_HISTORY_HOURS}" value=${getSettingWithDefault(SETTING_PRICE_HISTORY_HOURS)}>
            </div>
            <div style="margin-top:6px;">
                The value to add to the calculated price (minimum and maximum are respected):&nbsp;
                <input type="number" step="0.01" id="${SETTING_PRICE_OFFSET}" value=${getSettingWithDefault(SETTING_PRICE_OFFSET)}>
            </div>
            <div style="margin-top:6px">
                Use the second lowest sell listing when the lowest sell listing has a low quantity:&nbsp;
                <input type="checkbox" id="${SETTING_PRICE_IGNORE_LOWEST_Q}" ${getSettingWithDefault(SETTING_PRICE_IGNORE_LOWEST_Q) == 1 ? 'checked' : ''}>
            </div>
            <div style="margin-top:6px;">
                Don't check market listings with prices of and below:&nbsp;
                <input type="number" step="0.01" id="${SETTING_PRICE_MIN_CHECK_PRICE}" value=${getSettingWithDefault(SETTING_PRICE_MIN_CHECK_PRICE)}>
            </div>
            <div style="margin-top:6px;">
                Don't list market listings with prices of and below:&nbsp;
                <input type="number" step="0.01" id="${SETTING_PRICE_MIN_LIST_PRICE}" value=${getSettingWithDefault(SETTING_PRICE_MIN_LIST_PRICE)}>
            </div>
            <div style="margin-top:24px">
                Show price labels in inventory:&nbsp;
                <input type="checkbox" id="${SETTING_INVENTORY_PRICE_LABELS}" ${getSettingWithDefault(SETTING_INVENTORY_PRICE_LABELS) == 1 ? 'checked' : ''}>
            </div>
            <div style="margin-top:6px">
                Show price labels in trade offers:&nbsp;
                <input type="checkbox" id="${SETTING_TRADEOFFER_PRICE_LABELS}" ${getSettingWithDefault(SETTING_TRADEOFFER_PRICE_LABELS) == 1 ? 'checked' : ''}>
            </div>
            <div style="margin-top:6px">
                Show quick sell info and buttons:&nbsp;
                <input type="checkbox" id="${SETTING_QUICK_SELL_BUTTONS}" ${getSettingWithDefault(SETTING_QUICK_SELL_BUTTONS) == 1 ? 'checked' : ''}>
            </div>
            <div style="margin-top:24px;">
                Minimum:&nbsp;
                <input type="number" step="0.01" id="${SETTING_MIN_NORMAL_PRICE}" value=${getSettingWithDefault(SETTING_MIN_NORMAL_PRICE)}>
                &nbsp;and maximum:&nbsp;
                <input type="number" step="0.01" id="${SETTING_MAX_NORMAL_PRICE}" value=${getSettingWithDefault(SETTING_MAX_NORMAL_PRICE)}>
                &nbsp;price for normal cards
            </div>
            <div style="margin-top:6px;">
                Minimum:&nbsp;
                <input type="number" step="0.01" id="${SETTING_MIN_FOIL_PRICE}" value=${getSettingWithDefault(SETTING_MIN_FOIL_PRICE)}>
                &nbsp;and maximum:&nbsp;
                <input type="number" step="0.01" id="${SETTING_MAX_FOIL_PRICE}" value=${getSettingWithDefault(SETTING_MAX_FOIL_PRICE)}>
                &nbsp;price for foil cards
            </div>
            <div style="margin-top:6px;">
                Minimum:&nbsp;
                <input type="number" step="0.01" id="${SETTING_MIN_MISC_PRICE}" value=${getSettingWithDefault(SETTING_MIN_MISC_PRICE)}>
                &nbsp;and maximum:&nbsp;
                <input type="number" step="0.01" id="${SETTING_MAX_MISC_PRICE}" value=${getSettingWithDefault(SETTING_MAX_MISC_PRICE)}>
                &nbsp;price for other items
            </div>
            <div style="margin-top:6px;">
                Automatically relist overpriced market listings (slow on large inventories):&nbsp;
                <input id="${SETTING_RELIST_AUTOMATICALLY}" class="market_relist_auto" type="checkbox" ${getSettingWithDefault(SETTING_RELIST_AUTOMATICALLY) == 1 ? 'checked' : ''}>
            </div>
        </div>`);

        const visibility = $('<fieldset class="see-button-settings"><legend>Inventory action buttons</legend><p>Bulk sell is always available when items are selected.</p></fieldset>');
        for (const setting of inventoryButtonSettings) {
            const label = $('<label></label>');
            $('<input type="checkbox">').attr('id', setting.key).prop('checked', getSettingWithDefault(setting.key) == 1).appendTo(label);
            label.append(document.createTextNode(` ${setting.label}`));
            visibility.append(label);
        }
        price_options.append(visibility);

        unsafeWindow.ShowConfirmDialog('Steam-Economy-Enhancer-Upgraded', price_options).done(() => {
            for (const setting of inventoryButtonSettings) {
                setSetting(setting.key, $(`#${setting.key}`, price_options).prop('checked') ? 1 : 0);
            }
            applyInventoryButtonSettings();
            setSetting(SETTING_MIN_NORMAL_PRICE, $(`#${SETTING_MIN_NORMAL_PRICE}`, price_options).val());
            setSetting(SETTING_MAX_NORMAL_PRICE, $(`#${SETTING_MAX_NORMAL_PRICE}`, price_options).val());
            setSetting(SETTING_MIN_FOIL_PRICE, $(`#${SETTING_MIN_FOIL_PRICE}`, price_options).val());
            setSetting(SETTING_MAX_FOIL_PRICE, $(`#${SETTING_MAX_FOIL_PRICE}`, price_options).val());
            setSetting(SETTING_MIN_MISC_PRICE, $(`#${SETTING_MIN_MISC_PRICE}`, price_options).val());
            setSetting(SETTING_MAX_MISC_PRICE, $(`#${SETTING_MAX_MISC_PRICE}`, price_options).val());
            setSetting(SETTING_PRICE_OFFSET, $(`#${SETTING_PRICE_OFFSET}`, price_options).val());
            setSetting(SETTING_PRICE_MIN_CHECK_PRICE, $(`#${SETTING_PRICE_MIN_CHECK_PRICE}`, price_options).val());
            setSetting(SETTING_PRICE_MIN_LIST_PRICE, $(`#${SETTING_PRICE_MIN_LIST_PRICE}`, price_options).val())
            setSetting(SETTING_PRICE_ALGORITHM, $(`#${SETTING_PRICE_ALGORITHM}`, price_options).val());
            setSetting(SETTING_PRICE_IGNORE_LOWEST_Q, $(`#${SETTING_PRICE_IGNORE_LOWEST_Q}`, price_options).prop('checked') ? 1 : 0);
            setSetting(SETTING_PRICE_HISTORY_HOURS, $(`#${SETTING_PRICE_HISTORY_HOURS}`, price_options).val());
            setSetting(SETTING_RELIST_AUTOMATICALLY, $(`#${SETTING_RELIST_AUTOMATICALLY}`, price_options).prop('checked') ? 1 : 0);
            setSetting(SETTING_INVENTORY_PRICE_LABELS, $(`#${SETTING_INVENTORY_PRICE_LABELS}`, price_options).prop('checked') ? 1 : 0);
            setSetting(SETTING_TRADEOFFER_PRICE_LABELS, $(`#${SETTING_TRADEOFFER_PRICE_LABELS}`, price_options).prop('checked') ? 1 : 0);
            setSetting(SETTING_QUICK_SELL_BUTTONS, $(`#${SETTING_QUICK_SELL_BUTTONS}`, price_options).prop('checked') ? 1 : 0);

            window.location.reload();
        });
    }
    //#endregion

    //#region UI
    injectCss(`
        .ui-selected { outline: 2px dashed #FFFFFF; }
        #logger { color: #767676; font-size: 12px;margin-top:16px; max-height: 200px; overflow-y: auto; }
        .trade_offer_sum { color: #767676; font-size: 12px; margin-top:8px; user-select: text; }
        .trade_offer_buttons { margin-top: 12px; }
        .market_commodity_orders_table { font-size:12px; font-family: "Motiva Sans", Sans-serif; font-weight: 300; }
        .market_commodity_orders_table th { padding-left: 10px; }
        #listings_group { display: flex; justify-content: space-between; margin-bottom: 8px; }
        #listings_sell { text-align: right; color: #589328; font-weight:600; }
        #listings_buy { text-align: right; color: #589328; font-weight:600; }
        .pick_and_sell_button > a { vertical-align: middle; }
        .market_relist_auto { margin-bottom: 8px;  }
        .market_relist_auto_label { margin-right: 6px; }
        .quick_sell { margin-right: 4px; }

        .spinner {margin:10px auto;width:50px;height:40px;text-align:center;font-size:10px;}
        .spinner > div {background-color:#ccc;height:100%;width:6px;display:inline-block;animation:sk-stretchdelay 1.2s infinite ease-in-out}
        .spinner .rect2 {animation-delay:-1.1s}
        .spinner .rect3 {animation-delay:-1s}
        .spinner .rect4 {animation-delay:-.9s}
        .spinner .rect5 {animation-delay:-.8s}
        @keyframes sk-stretchdelay {
            0%,40%,100% {transform:scaleY(0.4);}
            20% {transform:scaleY(1.0);}
        }

        .price_option_price { width: 100px }
        .inventory_item_price { top: 0px;position: absolute;right: 0;background: #3571a5;padding: 2px;color: white; font-size:11px; border: 1px solid #666666;}

        .see_inventory_buttons {display:flex;flex-wrap:wrap;gap:10px;align-items:start;}
        [data-see-inventory-hidden] { display:none !important; }
        .sell_manual { border:0; padding:0; font:inherit; text-align:center; cursor:pointer; }
        .sell_manual:disabled { opacity:.45; cursor:default; }
        .see-button-settings { margin-top:20px; }
        .see-button-settings label { display:block; margin:6px 0; }
        .see_inventory_buttons > .see_inventory_buttons, .see_inventory_buttons > #inventory_items_spinner {flex-basis: 100%;}

        #see_settings { background: #26566c; margin-right: 10px; height: 24px; line-height:24px; display:inline-block; padding: 0px 6px; }
        #see_settings_modal select, #see_settings_modal input[type="number"] { background-color: black; color: white; border: transparent; padding: 4px 8px; }
        #see_settings_modal input[type="number"] { width: 100px; }
        #see_settings_modal input[type="checkbox"] { width: 16px; height: 16px; vertical-align: middle; accent-color: #000; }

    `);

    $(document).ready(() => {
        // Make sure the user is logged in, there's not much we can do otherwise.
        if (!isLoggedIn) {
            return;
        }

        if (currentPage == PAGE_INVENTORY) {
            initializeInventoryUI();
        }

        if (currentPage == PAGE_TRADEOFFER) {
            initializeTradeOfferUI();
        }
    });

    function injectCss(css) {
        const head = document.getElementsByTagName('head')[0];
        if (!head) {
            return;
        }
        const style = document.createElement('style');
        style.type = 'text/css';
        style.innerHTML = css;
        head.appendChild(style);
    }

    function renderSpinner(text) {
        const { container, spinnerid } = getSpinnerContext();
        if (container == null || spinnerid == null) {
            return;
        }

        text = (text || '').trim();
        removeSpinner();

        container.append(`
            <div id="${spinnerid}">
                <div class="spinner">
                    <div class="rect1"></div>
                    <div class="rect2"></div>
                    <div class="rect3"></div>
                    <div class="rect4"></div>
                    <div class="rect5"></div>
                </div>
                ${text ? `<div style="text-align:center">${text}</div>` : ''}
            </div>`);
    }

    function removeSpinner() {
        const { container, spinnerid } = getSpinnerContext();
        if (container == null || spinnerid == null) {
            return;
        }

        $(`#${spinnerid}`, container).remove();
    }

    function getSpinnerContext() {
        let container = null;
        let spinnerid = null;

        switch (currentPage) {
            case PAGE_INVENTORY:
                container = $('#inventory_sell_buttons');
                spinnerid = 'inventory_items_spinner';
                break;
            default:
                break;
        }

        container = container && container.length > 0 ? container : null;
        return { container, spinnerid };
    }

    $.fn.delayedEach = function (timeout, callback, continuous) {
        const $els = this;
        const iterator = function (index) {
            if (index >= $els.length) {
                if (!continuous) {
                    return;
                }
                index = 0;
            }

            const cur = $els[index];
            callback.call(cur, index, cur);

            setTimeout(() => {
                iterator(++index);
            }, timeout);
        };

        iterator(0);
    };
    //#endregion
}(jQuery, async));
