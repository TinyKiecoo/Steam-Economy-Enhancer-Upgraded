# <img src="assets/icon.svg" width="32" align="center"> Steam Economy Enhancer

### Upgraded fork: the new Steam Market

This fork supports Steam's React market while retaining the legacy inventory and trade-offer implementation. All enhanced market controls, dialogs, messages and date formatting use English; item names and descriptions retain the text supplied by Steam.

* [Sell listings](https://steamcommunity.com/market/activelistings), [buy orders](https://steamcommunity.com/market/buyorders) and [market history](https://steamcommunity.com/market/history) use compact tables with **32 × 32 px item thumbnails**. Images fit within the existing row height and load lazily.
* Sell listings and buy orders support ascending/descending sorting by name, date (remaining quantity for buy orders), asking/bid price and typical price.
* Every order has a checkbox. `Select All` selects the matching items currently loaded; `Deselect All` clears every selection. Search, sorting and selection persist as new batches arrive.
* Results appear immediately from Steam's initial data, then update after each request. Subsequent buy-order requests load 25 items at a time. Searching and selecting already loaded items work while loading continues; cancellation and modification become available when loading completes.
* Search covers names, games, types, descriptions, dates, quantities and prices, including `Trading Card`, `Booster Pack`, `Steam` and `3.29`. Matching new items appear automatically as they arrive.
* Sell listings retain a `Modify` dialog for changing the amount received per item after fees, using Steam's `UpdateSellListingPrice` action. Mobile/email confirmation requirements are displayed. Buy orders retain individual cancellation controls.
* Bulk cancellation confirms any selections hidden by the current search, processes orders sequentially and stops on error without automatically retrying a submission.
* Market history defaults to **500 records per page**, with numbered pages, previous/next controls, direct page entry and 25/50/100/500 records per page. Changing page size preserves the current browsing position.
* `Show original Steam list` restores Steam's interface. Navigation between the three market sections automatically remounts the enhanced table.

Read-only checks on 2026-11-26 confirmed that the new history action accepts 50 records initially but rejects 51/100/500 with HTTP 400 / EResult 8. Buy orders accept 50 initially, then 25 on subsequent requests. The compatibility history endpoint `/market/myhistory/render/` still returns 500 records at once and supports direct offsets into older records. History pagination uses this endpoint; dates are displayed as supplied by Steam and may omit the year. If Steam reduces the number of records returned, the script fills each display page using actual batch lengths without skipping records.

Typical prices are shown when supplied by Steam, otherwise `—`. Failed new order queries fall back to the compatibility endpoint while retaining available metadata from batches already loaded. Development tests do not modify real prices, remove listings or cancel buy orders.

#### Installation and validation

1. Install or enable [Violentmonkey](https://violentmonkey.github.io/) in Edge.
2. Use this fork's installation link below, or replace the installed script with the complete contents of this project's `code.user.js`. Enable only one copy of SEE.
3. Refresh the Steam market page. Editing the cloned file does not automatically update the installed userscript.

Update URLs point to this fork.

Development: use Node.js 22.13 or 24+, then run `npm install` and `npm test`. Tests cover compact thumbnails, progressive loading, English controls, sorting, search, selection, pagination/fallback, submission failures, price-change requests, 500-row history pages, direct jumps, partial final pages, retry and navigation. Tests use synthetic data and do not read account cookies.

A free userscript to enhance your Steam Inventory, Steam Market and Steam Tradeoffers.

It adds the following features to the Steam Market:

*    Detect overpriced and underpriced items.
*    Select 5/25/all (overpriced) items and remove them at once.
*    (Automatically) relist overpriced items.
*    Sort and search items by name, price or date.
*    Total price for listings, as seller and buyer.

It adds the following features to the Steam Inventory:

*    Sell all (selected) items or trading cards automatically.
*    Select multiple items simultaneously with *Shift* or *Ctrl*.
*    Market sell and buy listings added to the item details.
*    Quick sell buttons to sell an item without confirmations.
*    Shows the lowest listed price for each item.
*    Turn selected items into gems.
*    Unpack selected booster packs.

It adds the following features to the Steam Tradeoffers:

*    A summary of all items from both parties that includes total number of items, number of unique items and item count breakdown (how many of each item there are)
*    Select all items of the current page.
*    Shows the lowest listed price for each inventory item.

The pricing can be based on the lowest listed price, the price history and your own minimum and maximum prices.
This can be defined in Steam Economy Enhancer's settings, which you can find at the top of the page near the *Install Steam* button.

> [!NOTE]  
> It is free but there is **NO** support. If you want to add functionality, feel free to submit a PR.

### Download

[Install Steam Economy Enhancer Upgraded](https://raw.githubusercontent.com/TinyKiecoo/Steam-Economy-Enhancer-Upgraded/master/code.user.js)

*[Violentmonkey](https://violentmonkey.github.io/) is required to install.*

### Screenshots


*Market*

![Market](assets/market.png)


*Inventory*

![Inventory](assets/inventory.png)


*Options*

![Options](assets/settings.png)


*Trade offers*

![Tradeoffers](assets/tradeoffer.png)


### License

[MIT](LICENSE)
