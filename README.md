# BarScan – Barcode & Serial Number Scanner

A mobile-friendly web app that scans barcodes, QR codes, and serial numbers using your device camera. Built with vanilla JavaScript and the ZXing / BarcodeDetector API.

## Features

- **Manual capture** – Tap the Capture button to snap a photo and scan it (no continuous auto-scanning)
- **Dual detection engines** – Uses native `BarcodeDetector` (Chrome) with ZXing fallback
- **Hardware scanner support** – USB/Bluetooth barcode scanners work as keyboard input with debounce protection
- **Sticky model name** – Lock a model name so every scanned record is tagged with it automatically
- **Record management** – View, search, copy, edit, and delete scanned records
- **CSV export** – Export all records as a CSV file
- **Settings** – Configurable double-scan delay and keystroke grouping delay
- **Dark UI** – Glassmorphism dark theme with animated background

## Usage

1. Open `index.html` in a browser (Chrome Android recommended)
2. Tap **Start Camera** and grant camera permission
3. Align the barcode within the frame
4. Tap **Capture** – the app snaps one frame and scans it
5. Scanned records appear in the list below

### Manual Entry

Tap the keyboard icon to add a serial number manually.

### Hardware Scanner

Connect a USB/Bluetooth barcode scanner. When it types a value and presses Enter, the app captures it automatically (as long as no text input is focused).

### Sticky Model

Type a model name in the sticky model bar and lock it. Every subsequent scan will be tagged with that model name.

## Files

| File | Purpose |
|---|---|
| `index.html` | App shell, camera viewport, modals |
| `app.js` | All logic: camera, detection, records, UI |
| `styles.css` | Full dark theme with glassmorphism UI |

## Browser Support

- **Chrome / Edge Android** – Best experience with native `BarcodeDetector`
- **Chrome / Edge Desktop** – Works with ZXing fallback
- **Safari iOS** – Limited; iOS 15.4+ has `BarcodeDetector` but camera API restrictions may apply

## Detection Engines

- **BarcodeDetector API** – Native, supported on Chromium-based browsers (Android, desktop)
- **@zxing/library** – Fallback via UMD bundle loaded from CDN

## Development

No build step required. Just serve the folder with any static file server:

```bash
npx serve .
```

Or open `index.html` directly (camera access may require `https` or `localhost`).
