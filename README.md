# RJG Builders — apps

This repo hosts two independent single-page web apps:

| File | App |
|------|-----|
| `index.html` | Last Man Standing (NRL tipping — unrelated) |
| `rjg-pricing.html` | **RJG Builders — Site Pricing & Takeoff** |

## RJG Builders — Site Pricing & Takeoff

An offline-first, install-to-home-screen web app for on-site pricing and drawings.

**Features**
- **Pricing database** — create items (code, description, category, unit, rate ex-GST, supplier); search/filter; export to Excel.
- **Import cost register** — upload an `.xlsx`/`.csv`, map your columns, import in bulk. Blank template included.
- **Digital takeoffs** — load a PDF plan or a site photo, set the scale off a known dimension, then measure lengths and areas and count items. Link any measurement to a price item and push it straight to the quote.
- **Markups** — arrows, boxes, freehand pen and text notes on drawings; save a marked-up view onto the quote.
- **Scaled floor plans** — draw rooms/walls on a metric grid; auto area, perimeter and edge dimensions; feed room areas into the quote.
- **Quick quote report** — branded RJG letterhead, ex-GST line items, margin, GST and total inc GST; print or Save-as-PDF. Marked-up drawings/plans attach automatically.
- **Offline & private** — everything is stored on the device (IndexedDB). No login, no server. Back up / restore or move to another device via a JSON export.

**Branding** — set your logo, company/ABN/contact details and exact brand colours under **Settings**. The primary/accent colours in Settings re-skin the whole app and the quote letterhead.

**Run it**
- Open `rjg-pricing.html` from a web server (e.g. GitHub Pages) so the service worker can register for offline use, then "Add to Home Screen" on your phone/tablet.
- All libraries are vendored locally in `vendor/` — no internet needed after first load.

**Defaults** — prices are treated as **ex-GST**; GST (10%) is shown as a separate line and added to the total.
