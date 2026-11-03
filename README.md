# QRMake

A fast, zero-dependency, client-side web application for turning contact details (**vCard 3.0**) or any text and URL into a scannable QR code. Runs directly by opening `index.html` in any browser—online or offline.

## Live Demo

**[https://ismailisimba.github.io/qrmake/](https://ismailisimba.github.io/qrmake/)**

## Features

- **Contact details (vCard 3.0) builder:** Structured contact fields (first name, last name, organization, job title, email, work phone, mobile phone, website, and address) that automatically format into a standards-compliant `BEGIN:VCARD` (v3.0) payload recognized by iOS and Android camera apps.
- **Text or URL mode:** Encode any multi-line text, website link, or raw vCard snippet into a QR code as you type.
- **Import from existing vCard text:** Paste any `BEGIN:VCARD...END:VCARD` block to populate the structured contact fields automatically.
- **Sample contact preset:** One-click **Load sample contact** button (`Maua Mazuri — Maua Mazuri Tissue Culture Kenya`) to test and preview a full business contact card immediately.
- **Crisp exports:** Download high-resolution **PNG**, scalable vector **SVG**, or **`.vcf` contact card** files, or copy the QR image and raw payload directly to your clipboard.
- **Customizable QR settings:** Adjust error correction level (`Low 7%`, `Medium 15%`, `Quartile 25%`, `High 30%`), quiet zone margin, export dimensions (`256px` to `1,024px`), and foreground/background colors with live contrast checks.
- **100% client-side and offline-ready:** No server, no build step, no tracking, and no external CDN required. Your contact details never leave your browser.

## Quick Start

### Run locally (no server required)

1. Clone or download this repository:
   ```bash
   git clone https://github.com/ismailisimba/qrmake.git
   ```
2. Double-click **`index.html`** to open it directly in your browser (`file://`).

### Sample vCard 3.0 Format

QRMake generates standard vCard 3.0 contact payloads compatible with native phone cameras:

```vcard
BEGIN:VCARD
VERSION:3.0
N:Mazuri;Maua
FN:Maua Mazuri
ORG:Maua Mazuri Tissue Culture Kenya
EMAIL;TYPE=INTERNET:saleskenya@maua.mazuri.co.tz
TEL;TYPE=voice,work,pref:+254 700 438 954
TEL;TYPE=voice,cell,pref:+255752102645
ADR:;;;Taveta;;;Kenya
END:VCARD
```

## Project Structure

```text
qrmake/
├── index.html        # Main client-side application (open directly in browser)
├── css/
│   └── styles.css    # Material Design 3 & accessible responsive styling
├── js/
│   ├── qrcodegen.js  # Self-contained ISO/IEC 18004 QR Code engine (Versions 1-40)
│   └── app.js        # vCard 3.0 serializer, parser, renderer, and export handlers
├── .env.example      # Environment variable template
├── LICENSE           # MIT License
└── README.md         # Project documentation
```

## License

Released under the [MIT License](./LICENSE).
