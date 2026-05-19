# PKP Health Monitor · ReDi service

**A tool to detect routing and redirection issues in OJS/OMP installations behind reverse proxies, especially in single‑tenant or “no‑slug” configurations.**

## Motivation

OJS (Open Journal Systems) and OMP work well out‑of‑the‑box, but when placed behind a reverse proxy (e.g., Traefik, Nginx, Apache) or when using non‑standard URL layouts (single‑journal root, RESTful URLs, hidden context), the behaviour of internal redirections can become unpredictable.

Common problems we encountered:

- **Mixed content** (HTTP resources on HTTPS pages) after proxy redirections.
- **Double `/index.php`** in admin or API paths.
- **404 errors** for `/index/admin` or `/index/login` when `restful_urls = On` is combined with `domain‑noslug`.
- **Redirect loops** caused by Apache rewrite rules that don’t respect the proxy’s `X-Forwarded-*` headers.
- **Inconsistent behaviour** between production (under a reverse proxy) and a test environment (direct container).

This project provides a **dashboard** that tests a comprehensive set of OJS endpoints in three environments:

- **Production** – real domain with its actual redirection rules.
- **Test** – shadow domain (`cory‑*.precarietat.net`) that mimics the same path structure.
- **PKP Demo** – official OJS 3.3 demo, used as a reference (optional).

The tests cover three URL modes:

- `basic` – traditional URLs with `index.php` and journal context (e.g. `/index.php/athenea/about`).
- `cleanUrls` – RESTful URLs without `index.php` (requires `restful_urls = On`).
- `hideContext` – single‑journal mode where the journal slug is hidden (e.g. `/about`).

The dashboard helps you quickly see **which endpoints work, which redirect, and which return errors**, and compares the three environments side by side.

## How it works

1. A **proxy script** (`proxy.php`) runs on your server. It receives a URL, fetches it via cURL (respecting redirections), and returns the final HTTP status and destination URL – **bypassing browser CORS restrictions**.
2. The **dashboard** (`index.html`) sends requests to the proxy and displays the results in a sortable, filterable table.
3. You can **select any journal** from a dropdown list (pre‑defined in `journals.csv`). The dashboard automatically builds the production and test URLs based on the alias.
4. Results are summarised per endpoint mode, and you can **hide/show columns** (PROD, TEST, DEMO), **collapse/expand categories**, and **filter to show only errors**.
5. All data stays in your browser – no external database.

## Installation & Usage

### 🐳 Using Docker (recommended)

1. **Clone or download** this repository.
2. **Build the Docker image**:

        docker build -t pkp-health-monitor .

3. **Run the container**:

        docker run -d -p 8080:80 --name health-monitor pkp-health-monitor

4. **Open your browser** at `http://localhost:8080`

The container runs an Apache server with PHP and serves the dashboard on port 8080 (you can change the host port if needed).

### 📦 Manual installation (without Docker)

#### Requirements

- A web server with **PHP** (7.4 or later) and **cURL** enabled.
- The server must be able to reach:
  - Your production domains (via HTTPS/HTTP)
  - Your test domains (e.g. `cory‑*.precarietat.net`)
  - `ojs33.testdrive.publicknowledgeproject.org` (PKP demo)

#### Steps

1. **Place the files** in a directory accessible via HTTP.
2. **Configure the allowed domains** in `proxy.php` – edit the `$allowedDomains` array and add **all domains** your dashboard will call.
3. **(Optional) Serve the dashboard via HTTPS** – the proxy works with both HTTP and HTTPS, but to avoid mixed‑content warnings, use HTTPS for the dashboard itself.
4. **Open `index.html`** in your browser.

## Usage

1. Select a journal from the dropdown.
2. The table will automatically start testing all endpoints for **PROD**, **TEST**, and (optionally) **PKP Demo**.
3. Use the checkboxes to show/hide columns.
4. Click **“Show errors”** to hide all rows that are fully successful (no error in any column).
5. Click on any **category header** (e.g., “🏠 Home & index”) to collapse/expand that block.
6. The **summary panel** at the top shows aggregated results per URL mode and compares the three environments.

### External base (optional)

- You can test against any external OJS installation by providing a **base URL (without `http://`)** and a **context name**.
- Click the 🛟 button to load the PKP demo (`ojs33.testdrive.publicknowledgeproject.org` with context `testdrive-journal`) as a reference.
- If you leave the external base empty, only PROD and TEST columns are shown.

## Customisation

- To add or edit journals, modify the `journals` array inside `index.html` (or the `journals.csv` for reference). The mapping logic for test URLs is:
  - If `prodUrl` contains `revistes.uab.cat/alias` → test URL = `https://cory-revistes.precarietat.net/alias`
  - Otherwise (domain journal) → test URL = `https://cory-{alias}.precarietat.net`
- To change the demo reference, edit `DEMO_BASE` and `DEMO_BASE_HTTP` in `index.html` and the allowed domains in `proxy.php`.
- To adjust the list of tested endpoints, edit the `defaultGroups` array in `index.html`.

## Troubleshooting

- **403 Forbidden** from `proxy.php` → domain not in allowed list. Add it.
- **Timeout errors** → increase `$timeout` in `proxy.php`.
- **CORS errors** → ensure `proxy.php` is on the same origin as the dashboard, or configure CORS headers.
- **Redirect loops** → check your Apache/Nginx reverse proxy settings, especially `X-Forwarded-Proto` and `X-Forwarded-Host`.

## License

GPL – feel free to use, modify, and distribute.
