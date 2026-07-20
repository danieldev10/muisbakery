# Receipt printing

Muis Bakery supports two receipt paths:

1. Direct ESC/POS printing through the local print bridge.
2. An 80 mm browser print dialog and downloadable HTML receipt as fallback.

Checkout always keeps the browser receipt available. When the direct bridge is
configured, checkout sends raw 48-column ESC/POS data to the printer first. If
the bridge is unavailable after three seconds, the browser print dialog opens
instead.

## Receipt content

The receipt contains the bakery identity, receipt reference, date and time,
terminal, cashier, customer or retailer, payment method, item quantities, unit
prices, line amounts, totals, amount paid, balance or change, return policy,
and thank-you message.

Set these values in the root `.env` used by Docker Compose:

```dotenv
RECEIPT_BUSINESS_NAME=Muis Bakery
RECEIPT_BUSINESS_ADDRESS=Bakery address
RECEIPT_BUSINESS_PHONE=0800 000 0000
RECEIPT_RETURN_POLICY=Please retain this receipt for returns.
```

For Docker Compose, edit that existing root `.env` and recreate the web service.

## Direct ESC/POS bridge

Run the bridge on each cashier computer that owns a receipt printer. Keeping
the default loopback binding means another LAN device cannot submit print jobs
to it.

All local and Docker settings now live in the repository's single private
`.env` file. On a fresh installation, create it once from the consolidated
template:

```bash
cp .env.example .env
```

Do not overwrite an existing `.env`, because it contains the installation's
database, backup, and application credentials. Generate a long random token,
set it as `PRINT_BRIDGE_TOKEN`, and then enable the application bridge URL in
the same file:

```dotenv
RECEIPT_PRINT_BRIDGE_URL=http://127.0.0.1:18181
PRINT_BRIDGE_TOKEN=replace-with-a-long-random-token
```

Start and check the bridge:

```bash
npm run print-bridge
curl http://127.0.0.1:18181/health
```

Keep the bridge running while the cashier uses POS. A process supervisor or
login item should start it automatically on the cashier computer after the
printer has been validated.

### USB printer on macOS or Linux

Install the printer in the operating system and list its CUPS queue:

```bash
lpstat -p
```

Set the exact queue name in `.env`:

```dotenv
PRINT_BRIDGE_TARGET=cups
THERMAL_PRINTER_QUEUE=Muis_Bakery_Receipt_Printer
```

The bridge submits raw ESC/POS bytes with `lp -o raw`. The selected printer
must support ESC/POS and the queue must not transform the job.

### Network printer

For an ESC/POS printer reachable on the network:

```dotenv
PRINT_BRIDGE_TARGET=tcp
THERMAL_PRINTER_HOST=192.168.1.50
THERMAL_PRINTER_PORT=9100
```

This sends raw ESC/POS directly to the printer's standard TCP print port.

## Browser fallback and driver setup

The fallback document is designed for 80 mm paper with a 72 mm printable
area. In the printer dialog or driver, select the actual 80 mm roll, zero or
minimum margins, 100% scale, portrait orientation, and the appropriate
darkness/density. Do not leave the driver on A4.

Run the printer's built-in self-test before adjusting application code. A
faint self-test indicates paper, print-head, heat/density, or printer hardware
rather than receipt layout.

## Security

The bridge rejects unlisted browser origins. Update
`PRINT_BRIDGE_ALLOWED_ORIGINS` in `.env` when the POS URL changes. A
non-loopback bridge binding is rejected unless `PRINT_BRIDGE_TOKEN` is
configured. Do not expose the bridge directly to the public internet.

For the Vercel-hosted web application, set `RECEIPT_PRINT_BRIDGE_URL` in
Vercel and copy the local `PRINT_BRIDGE_TOKEN` value into Vercel as
`RECEIPT_PRINT_BRIDGE_TOKEN`. Railway does not need these receipt variables.
