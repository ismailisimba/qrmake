/**
 * QRMake — Client-Side Application Controller
 * Handles vCard 3.0 serialization/parsing, live QR rendering (Canvas + SVG),
 * contrast validation, file downloads (PNG, SVG, VCF), and clipboard actions.
 */
(function (global) {
  "use strict";

  const SAMPLE_CONTACT = {
    firstName: "Maua",
    lastName: "Mazuri",
    organization: "Maua Mazuri Tissue Culture Kenya",
    title: "",
    email: "saleskenya@maua.mazuri.co.tz",
    workPhone: "+254 700 438 954",
    cellPhone: "+255752102645",
    website: "",
    street: "",
    city: "Taveta",
    region: "",
    postalCode: "",
    country: "Kenya"
  };

  /**
   * Builds a standards-compliant vCard 3.0 payload matching the reference format.
   */
  function buildVCard(fields) {
    const first = (fields.firstName || "").trim();
    const last = (fields.lastName || "").trim();
    const org = (fields.organization || "").trim();
    const title = (fields.title || "").trim();
    const email = (fields.email || "").trim();
    const workPhone = (fields.workPhone || "").trim();
    const cellPhone = (fields.cellPhone || "").trim();
    const website = (fields.website || "").trim();
    const street = (fields.street || "").trim();
    const city = (fields.city || "").trim();
    const region = (fields.region || "").trim();
    const postalCode = (fields.postalCode || "").trim();
    const country = (fields.country || "").trim();

    const hasAnyField =
      first || last || org || title || email || workPhone ||
      cellPhone || website || street || city || region || postalCode || country;

    if (!hasAnyField) {
      return "";
    }

    const fullName = [first, last].filter(Boolean).join(" ") || org || "Contact";
    const lines = [
      "BEGIN:VCARD",
      "VERSION:3.0",
      "N:" + last + ";" + first,
      "FN:" + fullName
    ];

    if (org) {
      lines.push("ORG:" + org);
    }
    if (title) {
      lines.push("TITLE:" + title);
    }
    if (email) {
      lines.push("EMAIL;TYPE=INTERNET:" + email);
    }
    if (workPhone) {
      lines.push("TEL;TYPE=voice,work,pref:" + workPhone);
    }
    if (cellPhone) {
      lines.push("TEL;TYPE=voice,cell,pref:" + cellPhone);
    }
    if ( street || city || region || postalCode || country ) {
      lines.push("ADR:;;" + [street, city, region, postalCode, country].join(";"));
    }
    if (website) {
      lines.push("URL:" + website);
    }

    lines.push("END:VCARD");
    return lines.join("\n");
  }

  /**
   * Parses a vCard 3.0 string into structured contact fields.
   */
  function parseVCard(rawText) {
    const result = {
      firstName: "",
      lastName: "",
      organization: "",
      title: "",
      email: "",
      workPhone: "",
      cellPhone: "",
      website: "",
      street: "",
      city: "",
      region: "",
      postalCode: "",
      country: ""
    };
    if (!rawText || !/BEGIN:VCARD/i.test(rawText)) {
      return null;
    }

    const lines = rawText.replace(/\r\n/g, "\n").split("\n");
    for (const rawLine of lines) {
      const line = rawLine.trim();
      const colonIdx = line.indexOf(":");
      if (colonIdx === -1) continue;

      const keyPart = line.substring(0, colonIdx).toUpperCase();
      const valPart = line.substring(colonIdx + 1).trim();

      if (keyPart === "N" || keyPart.startsWith("N;")) {
        const parts = valPart.split(";");
        result.lastName = parts[0] || "";
        result.firstName = parts[1] || "";
      } else if ((keyPart === "FN" || keyPart.startsWith("FN;")) && !result.firstName && !result.lastName) {
        const parts = valPart.split(/\s+/);
        result.firstName = parts[0] || "";
        result.lastName = parts.slice(1).join(" ");
      } else if (keyPart === "ORG" || keyPart.startsWith("ORG;")) {
        result.organization = valPart;
      } else if (keyPart === "TITLE" || keyPart.startsWith("TITLE;")) {
        result.title = valPart;
      } else if (keyPart.startsWith("EMAIL")) {
        result.email = valPart;
      } else if (keyPart.startsWith("TEL")) {
        if (keyPart.includes("CELL") || keyPart.includes("MOBILE")) {
          result.cellPhone = valPart;
        } else if (keyPart.includes("WORK") || !result.workPhone) {
          result.workPhone = valPart;
        } else if (!result.cellPhone) {
          result.cellPhone = valPart;
        }
      } else if (keyPart === "ADR" || keyPart.startsWith("ADR;")) {
        const parts = valPart.split(";");
        result.street = parts[2] || "";
        result.city = parts[3] || "";
        result.region = parts[4] || "";
        result.postalCode = parts[5] || "";
        result.country = parts[6] || "";
      } else if (keyPart === "URL" || keyPart.startsWith("URL;")) {
        result.website = valPart;
      }
    }
    return result;
  }

  /**
   * Computes relative luminance and contrast ratio for two hex colors (#RRGGBB).
   */
  function parseHexLuminance(hex) {
    const clean = (hex || "#000000").replace("#", "");
    if (clean.length !== 6) return 0;
    const r = parseInt(clean.substring(0, 2), 16) / 255;
    const g = parseInt(clean.substring(2, 4), 16) / 255;
    const b = parseInt(clean.substring(4, 6), 16) / 255;
    const toLinear = (c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
    return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
  }

  function evaluateQrContrast(fgHex, bgHex) {
    const lumFg = parseHexLuminance(fgHex);
    const lumBg = parseHexLuminance(bgHex);
    const lighter = Math.max(lumFg, lumBg);
    const darker = Math.min(lumFg, lumBg);
    const ratio = (lighter + 0.05) / (darker + 0.05);
    const isInverted = lumFg > lumBg;
    return {
      ratio: ratio,
      isInverted: isInverted,
      hasWarning: isInverted || ratio < 4.5
    };
  }

  /**
   * Generates clean SVG markup for a QrCode instance.
   */
  function generateSvgMarkup(qr, border, fgColor, bgColor, targetSizePx) {
    const totalModules = qr.size + border * 2;
    const parts = [];
    for (let y = 0; y < qr.size; y++) {
      for (let x = 0; x < qr.size; x++) {
        if (qr.getModule(x, y)) {
          parts.push(`M${x + border},${y + border}h1v1h-1z`);
        }
      }
    }
    return [
      `<?xml version="1.0" encoding="UTF-8"?>`,
      `<svg xmlns="http://www.w3.org/2000/svg" version="1.1" viewBox="0 0 ${totalModules} ${totalModules}" width="${targetSizePx}" height="${targetSizePx}" shape-rendering="crispEdges" role="img" aria-label="Generated QR code">`,
      `  <rect width="100%" height="100%" fill="${bgColor}"/>`,
      `  <path d="${parts.join(" ")}" fill="${fgColor}"/>`,
      `</svg>`
    ].join("\n");
  }

  /**
   * Renders a QrCode instance onto an HTML5 Canvas with sharp module edges.
   */
  function renderQrToCanvas(qr, canvas, border, fgColor, bgColor, targetSizePx) {
    const totalModules = qr.size + border * 2;
    const scale = Math.max(1, Math.floor(targetSizePx / totalModules));
    const actualSize = totalModules * scale;

    canvas.width = actualSize;
    canvas.height = actualSize;

    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = false;

    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, actualSize, actualSize);

    ctx.fillStyle = fgColor;
    for (let y = 0; y < qr.size; y++) {
      for (let x = 0; x < qr.size; x++) {
        if (qr.getModule(x, y)) {
          ctx.fillRect((x + border) * scale, (y + border) * scale, scale, scale);
        }
      }
    }
  }

  /**
   * Builds a clean filename slug based on current mode and contact name.
   */
  function getExportSlug(mode, contactFields) {
    if (mode === "contact") {
      const name = [contactFields.firstName, contactFields.lastName]
        .filter(Boolean)
        .join("-")
        .toLowerCase()
        .replace(/[^a-z0-9-]+/g, "-")
        .replace(/^-+|-+$/g, "");
      if (name) return name + "-qr";
    }
    return "qrmake-code";
  }

  // Export core functions for automated testing in Node.js as well as browser initialization
  global.QRMakeApp = {
    SAMPLE_CONTACT: SAMPLE_CONTACT,
    buildVCard: buildVCard,
    parseVCard: parseVCard,
    evaluateQrContrast: evaluateQrContrast,
    generateSvgMarkup: generateSvgMarkup,
    getExportSlug: getExportSlug
  };

  if (typeof document === "undefined") {
    return;
  }

  // Browser DOM Initialization
  document.addEventListener("DOMContentLoaded", function () {
    const state = {
      mode: "contact", // "contact" | "text"
      eccKey: "MEDIUM",
      margin: 2,
      sizePx: 512,
      fgColor: "#000000",
      bgColor: "#FFFFFF",
      lastQr: null,
      lastPayload: "",
      lastSvgMarkup: ""
    };

    // DOM Elements
    const tabContact = document.getElementById("tab-contact");
    const tabText = document.getElementById("tab-text");
    const panelContact = document.getElementById("panel-contact");
    const panelText = document.getElementById("panel-text");

    const contactInputs = {
      firstName: document.getElementById("contact-first-name"),
      lastName: document.getElementById("contact-last-name"),
      organization: document.getElementById("contact-organization"),
      title: document.getElementById("contact-title"),
      email: document.getElementById("contact-email"),
      workPhone: document.getElementById("contact-work-phone"),
      cellPhone: document.getElementById("contact-cell-phone"),
      website: document.getElementById("contact-website"),
      street: document.getElementById("contact-street"),
      city: document.getElementById("contact-city"),
      region: document.getElementById("contact-region"),
      postalCode: document.getElementById("contact-postal"),
      country: document.getElementById("contact-country")
    };

    const rawVcardOutput = document.getElementById("vcard-raw-preview");
    const freeformTextarea = document.getElementById("freeform-text");
    const importVcardBtn = document.getElementById("btn-import-vcard");

    const loadSampleBtn = document.getElementById("btn-load-sample");
    const clearFormBtn = document.getElementById("btn-clear-form");
    const themeToggleBtn = document.getElementById("btn-theme-toggle");

    const eccSelect = document.getElementById("qr-ecc");
    const marginSelect = document.getElementById("qr-margin");
    const sizeSelect = document.getElementById("qr-size");
    const fgColorInput = document.getElementById("qr-fg-color");
    const bgColorInput = document.getElementById("qr-bg-color");
    const resetColorsBtn = document.getElementById("btn-reset-colors");

    const qrCanvas = document.getElementById("qr-canvas");
    const qrEmptyState = document.getElementById("qr-empty-state");
    const qrContrastBanner = document.getElementById("qr-contrast-warning");
    const qrErrorBanner = document.getElementById("qr-error-banner");

    const metaVersion = document.getElementById("meta-version");
    const metaEcc = document.getElementById("meta-ecc");
    const metaBytes = document.getElementById("meta-bytes");

    const downloadPngBtn = document.getElementById("btn-download-png");
    const downloadSvgBtn = document.getElementById("btn-download-svg");
    const downloadVcfBtn = document.getElementById("btn-download-vcf");
    const copyImageBtn = document.getElementById("btn-copy-image");
    const copyTextBtn = document.getElementById("btn-copy-text");

    const snackbar = document.getElementById("snackbar");
    let snackbarTimeout = null;

    function showSnackbar(message) {
      if (!snackbar) return;
      snackbar.textContent = message;
      snackbar.classList.add("is-visible");
      if (snackbarTimeout) {
        clearTimeout(snackbarTimeout);
      }
      snackbarTimeout = setTimeout(() => {
        snackbar.classList.remove("is-visible");
      }, 3200);
    }

    function readContactForm() {
      const data = {};
      for (const [key, input] of Object.entries(contactInputs)) {
        data[key] = input ? input.value : "";
      }
      return data;
    }

    function populateContactForm(fields) {
      for (const [key, input] of Object.entries(contactInputs)) {
        if (input) {
          input.value = fields[key] || "";
        }
      }
    }

    function switchMode(newMode) {
      state.mode = newMode;
      const isContact = newMode === "contact";

      tabContact.setAttribute("aria-selected", String(isContact));
      tabText.setAttribute("aria-selected", String(!isContact));
      tabContact.classList.toggle("is-active", isContact);
      tabText.classList.toggle("is-active", !isContact);

      panelContact.hidden = !isContact;
      panelText.hidden = isContact;

      if (downloadVcfBtn) {
        downloadVcfBtn.hidden = !isContact;
      }

      updateQrCode();
    }

    function updateQrCode() {
      const contactData = readContactForm();
      let payload = "";

      if (state.mode === "contact") {
        payload = buildVCard(contactData);
        if (rawVcardOutput) {
          rawVcardOutput.value = payload;
        }
      } else {
        payload = (freeformTextarea.value || "").replace(/\r\n/g, "\n");
        if (importVcardBtn) {
          importVcardBtn.hidden = !/BEGIN:VCARD/i.test(payload);
        }
      }

      state.lastPayload = payload;
      const byteLength = global.QRMakeEngine.toUtf8ByteArray(payload).length;
      const eccObj = global.QRMakeEngine.Ecc[state.eccKey] || global.QRMakeEngine.Ecc.MEDIUM;

      // Evaluate contrast
      const contrast = evaluateQrContrast(state.fgColor, state.bgColor);
      if (qrContrastBanner) {
        qrContrastBanner.hidden = !contrast.hasWarning;
      }

      if (!payload.trim()) {
        state.lastQr = null;
        state.lastSvgMarkup = "";
        qrCanvas.hidden = true;
        qrEmptyState.hidden = false;
        qrErrorBanner.hidden = true;

        metaVersion.textContent = "Version —";
        metaEcc.textContent = eccObj.shortLabel;
        metaBytes.textContent = "0 bytes";

        setExportButtonsEnabled(false);
        return;
      }

      try {
        const qr = global.QRMakeEngine.QrCode.encodeText(payload, eccObj);
        state.lastQr = qr;
        qrErrorBanner.hidden = true;
        qrEmptyState.hidden = true;
        qrCanvas.hidden = false;

        renderQrToCanvas(
          qr,
          qrCanvas,
          state.margin,
          state.fgColor,
          state.bgColor,
          state.sizePx
        );

        state.lastSvgMarkup = generateSvgMarkup(
          qr,
          state.margin,
          state.fgColor,
          state.bgColor,
          state.sizePx
        );

        metaVersion.textContent = `Version ${qr.version} · ${qr.size}×${qr.size}`;
        metaEcc.textContent = eccObj.shortLabel;
        metaBytes.textContent = `${byteLength.toLocaleString()} ${byteLength === 1 ? "byte" : "bytes"}`;

        setExportButtonsEnabled(true);
      } catch (err) {
        state.lastQr = null;
        qrCanvas.hidden = true;
        qrEmptyState.hidden = true;
        qrErrorBanner.hidden = false;
        qrErrorBanner.textContent = err.message || "Payload exceeds maximum QR code capacity";
        setExportButtonsEnabled(false);
      }
    }

    function setExportButtonsEnabled(enabled) {
      [downloadPngBtn, downloadSvgBtn, downloadVcfBtn, copyImageBtn, copyTextBtn].forEach((btn) => {
        if (btn) btn.disabled = !enabled;
      });
    }

    function triggerBlobDownload(blob, filename) {
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    // Event Listeners: Mode Tabs
    tabContact.addEventListener("click", () => switchMode("contact"));
    tabText.addEventListener("click", () => switchMode("text"));

    // Event Listeners: Contact Inputs
    Object.values(contactInputs).forEach((input) => {
      if (input) {
        input.addEventListener("input", updateQrCode);
      }
    });

    // Event Listener: Freeform Textarea
    freeformTextarea.addEventListener("input", updateQrCode);

    // Import vCard from freeform text into Contact form
    if (importVcardBtn) {
      importVcardBtn.addEventListener("click", () => {
        const parsed = parseVCard(freeformTextarea.value);
        if (parsed) {
          populateContactForm(parsed);
          switchMode("contact");
          showSnackbar("Contact details imported from vCard text");
        }
      });
    }

    // Load Sample Contact ("Maua Mazuri")
    loadSampleBtn.addEventListener("click", () => {
      populateContactForm(SAMPLE_CONTACT);
      if (state.mode !== "contact") {
        switchMode("contact");
      } else {
        updateQrCode();
      }
      showSnackbar("Sample contact loaded");
    });

    // Clear Form
    clearFormBtn.addEventListener("click", () => {
      if (state.mode === "contact") {
        populateContactForm({});
      } else {
        freeformTextarea.value = "";
      }
      updateQrCode();
      showSnackbar("Fields cleared");
    });

    // QR Customization Controls
    eccSelect.addEventListener("change", (e) => {
      state.eccKey = e.target.value;
      updateQrCode();
    });

    marginSelect.addEventListener("change", (e) => {
      state.margin = parseInt(e.target.value, 10) || 2;
      updateQrCode();
    });

    sizeSelect.addEventListener("change", (e) => {
      state.sizePx = parseInt(e.target.value, 10) || 512;
      updateQrCode();
    });

    fgColorInput.addEventListener("input", (e) => {
      state.fgColor = e.target.value;
      updateQrCode();
    });

    bgColorInput.addEventListener("input", (e) => {
      state.bgColor = e.target.value;
      updateQrCode();
    });

    resetColorsBtn.addEventListener("click", () => {
      state.fgColor = "#000000";
      state.bgColor = "#FFFFFF";
      fgColorInput.value = "#000000";
      bgColorInput.value = "#FFFFFF";
      updateQrCode();
      showSnackbar("Colors reset to high-contrast black and white");
    });

    // Export Actions
    downloadPngBtn.addEventListener("click", () => {
      if (!state.lastQr) return;
      const slug = getExportSlug(state.mode, readContactForm());
      qrCanvas.toBlob((blob) => {
        if (blob) {
          triggerBlobDownload(blob, `${slug}.png`);
          showSnackbar("PNG downloaded");
        }
      }, "image/png");
    });

    downloadSvgBtn.addEventListener("click", () => {
      if (!state.lastSvgMarkup) return;
      const slug = getExportSlug(state.mode, readContactForm());
      const blob = new Blob([state.lastSvgMarkup], { type: "image/svg+xml;charset=utf-8" });
      triggerBlobDownload(blob, `${slug}.svg`);
      showSnackbar("SVG downloaded");
    });

    if (downloadVcfBtn) {
      downloadVcfBtn.addEventListener("click", () => {
        if (!state.lastPayload) return;
        const slug = getExportSlug("contact", readContactForm()).replace(/-qr$/, "") || "contact";
        const blob = new Blob([state.lastPayload], { type: "text/vcard;charset=utf-8" });
        triggerBlobDownload(blob, `${slug}.vcf`);
        showSnackbar("vCard file downloaded");
      });
    }

    copyImageBtn.addEventListener("click", () => {
      if (!state.lastQr) return;
      if (!navigator.clipboard || typeof ClipboardItem === "undefined") {
        showSnackbar("Image copy isn't supported in this browser context. Use Download PNG instead");
        return;
      }
      qrCanvas.toBlob(async (blob) => {
        if (!blob) return;
        try {
          await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
          showSnackbar("QR code image copied to clipboard");
        } catch (_err) {
          showSnackbar("Couldn't copy image over local file protocol. Use Download PNG instead");
        }
      }, "image/png");
    });

    copyTextBtn.addEventListener("click", async () => {
      if (!state.lastPayload) return;
      try {
        await navigator.clipboard.writeText(state.lastPayload);
        showSnackbar("Encoded text copied to clipboard");
      } catch (_err) {
        if (rawVcardOutput && state.mode === "contact") {
          rawVcardOutput.select();
          document.execCommand("copy");
          showSnackbar("Encoded text copied to clipboard");
        }
      }
    });

    // Theme Toggle
    function applyTheme(theme) {
      document.documentElement.setAttribute("data-theme", theme);
      try {
        localStorage.setItem("qrmake-theme", theme);
      } catch (_e) {
        // Ignore storage errors in restricted file:// contexts
      }
    }

    const savedTheme = (() => {
      try {
        return localStorage.getItem("qrmake-theme");
      } catch (_e) {
        return null;
      }
    })();

    if (savedTheme === "dark" || savedTheme === "light") {
      applyTheme(savedTheme);
    } else if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) {
      applyTheme("dark");
    }

    themeToggleBtn.addEventListener("click", () => {
      const current = document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
      applyTheme(current === "dark" ? "light" : "dark");
    });

    // Populate the initial sample contact so the user sees an immediate working QR code on load
    populateContactForm(SAMPLE_CONTACT);
    updateQrCode();
  });
})(typeof window !== "undefined" ? window : globalThis);
