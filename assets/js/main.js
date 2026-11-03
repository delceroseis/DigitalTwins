"use strict";

/* ==========================================================================
   DigiTwin — behaviour layer
   1. Scroll reveal
   2. Scroll progress and header state
   3. Language switch (EN/ES)
   4. Twin data
   5. Twin canvas
   6. Telemetry simulation
   7. Boot
   ========================================================================== */

(() => {
    const $ = (selector, root = document) => root.querySelector(selector);
    const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
    const pad2 = (value) => String(value).padStart(2, "0");
    const normalize = (value) => String(value).replace(/\s+/g, " ").trim();

    /* ----------------------------------------------------------------------
       1. Scroll reveal
       [data-reveal] fades in the first time it enters the viewport. The .js
       class comes from the inline script in <head>, so the page stays
       readable when JavaScript is off.
       ---------------------------------------------------------------------- */
    const revealItems = $$("[data-reveal]");

    if ("IntersectionObserver" in window) {
        const revealObserver = new IntersectionObserver(
            (entries, observer) => {
                entries.forEach((entry) => {
                    if (!entry.isIntersecting) return;
                    entry.target.classList.add("is-visible");
                    observer.unobserve(entry.target);
                });
            },
            { threshold: 0.12, rootMargin: "0px 0px -8% 0px" }
        );

        revealItems.forEach((item) => revealObserver.observe(item));
    } else {
        revealItems.forEach((item) => item.classList.add("is-visible"));
    }

    /* ----------------------------------------------------------------------
       2. Scroll progress and header state
       ---------------------------------------------------------------------- */
    const progress = document.createElement("div");
    progress.className = "scroll-progress";
    progress.setAttribute("aria-hidden", "true");
    document.body.append(progress);

    const header = $(".site-header");
    let ticking = false;

    function updateScrollUI() {
        const doc = document.documentElement;
        const max = doc.scrollHeight - doc.clientHeight;
        const ratio = max > 0 ? doc.scrollTop / max : 0;

        progress.style.transform = `scaleX(${ratio})`;

        if (header) {
            header.classList.toggle("is-scrolled", doc.scrollTop > 8);
        }

        ticking = false;
    }

    window.addEventListener(
        "scroll",
        () => {
            if (ticking) return;
            ticking = true;
            requestAnimationFrame(updateScrollUI);
        },
        { passive: true }
    );

    updateScrollUI();

    /* ----------------------------------------------------------------------
       3. Language switch
       English stays in the markup and Spanish lives in data-es. On the first
       switch the current English text is cached in data-en, so there is only
       one source for each language.
       ---------------------------------------------------------------------- */
    const STORAGE_KEY = "digitwin:lang";
    const metaTag = $('meta[name="description"]');
    const metaText = {
        en: normalize(metaTag ? metaTag.getAttribute("content") : ""),
        es: normalize(metaTag ? metaTag.dataset.es : "")
    };
    const titles = {
        en: "Digital Twins in the Engineering Lab",
        es: "Gemelos Digitales en el Laboratorio de Ingeniería"
    };

    const textNodes = $$("[data-es]:not(meta)");
    const ariaNodes = $$("[data-es-aria]");
    const altNodes = $$("[data-es-alt]");
    const langButtons = $$(".lang-switch button");

    let currentLang = "en";

    function readStoredLang() {
        try {
            return localStorage.getItem(STORAGE_KEY) === "es" ? "es" : "en";
        } catch (error) {
            return "en";
        }
    }

    function applyLanguage(lang, persist = true) {
        const next = lang === "es" ? "es" : "en";
        currentLang = next;
        document.documentElement.lang = next;

        textNodes.forEach((el) => {
            if (el.dataset.en === undefined) el.dataset.en = el.textContent.trim();
            el.textContent = next === "es" ? el.dataset.es : el.dataset.en;
        });

        ariaNodes.forEach((el) => {
            if (el.dataset.enAria === undefined) el.dataset.enAria = el.getAttribute("aria-label") || "";
            el.setAttribute("aria-label", next === "es" ? el.dataset.esAria : el.dataset.enAria);
        });

        altNodes.forEach((el) => {
            if (el.dataset.enAlt === undefined) el.dataset.enAlt = el.getAttribute("alt") || "";
            el.setAttribute("alt", next === "es" ? el.dataset.esAlt : el.dataset.enAlt);
        });

        langButtons.forEach((button) => {
            button.setAttribute("aria-pressed", String(button.lang === next));
        });

        document.title = titles[next];

        if (metaTag) {
            metaTag.setAttribute("content", metaText[next]);
        }

        if (persist) {
            try {
                localStorage.setItem(STORAGE_KEY, next);
            } catch (error) {
                /* private mode or storage full: the switch still works, it just won't persist */
            }
        }

        renderPanel();
        renderLog();
        drawScene();
    }

    langButtons.forEach((button) => {
        button.addEventListener("click", () => applyLanguage(button.lang));
    });

    window.addEventListener("storage", (event) => {
        if (event.key === STORAGE_KEY && event.newValue) {
            applyLanguage(event.newValue, false);
        }
    });

    /* ----------------------------------------------------------------------
       4. Twin data
       Six assets, each with its own live values. `base` is the resting point,
       `noise` is how far a single reading can drift per tick.
       ---------------------------------------------------------------------- */
    const ASSETS = [
        {
            short: { en: "Robot cell", es: "Célula robótica" },
            name: { en: "Six-axis robot", es: "Robot de seis ejes" },
            x: -2.2, z: -1.3, w: 1.4, d: 1.4, h: 1.7,
            metrics: {
                temp: { base: 42.6, noise: 0.6, min: 36, max: 58, decimals: 1, unit: "°C" },
                vib: { base: 0.82, noise: 0.05, min: 0.3, max: 3.4, decimals: 2, unit: "mm/s" },
                power: { base: 1.8, noise: 0.08, min: 0.6, max: 3.4, decimals: 2, unit: "kW" },
                life: { base: 128, decimals: 1, unit: "h" }
            },
            limits: { tempWarn: 46, tempCrit: 48.5, vibWarn: 1.6, vibCrit: 2.1 }
        },
        {
            short: { en: "Conveyor", es: "Transportador" },
            name: { en: "Belt conveyor", es: "Cinta transportadora" },
            x: 0.2, z: -1.8, w: 2.4, d: 0.7, h: 0.8,
            metrics: {
                temp: { base: 36.2, noise: 0.5, min: 30, max: 52, decimals: 1, unit: "°C" },
                vib: { base: 1.1, noise: 0.06, min: 0.4, max: 3.4, decimals: 2, unit: "mm/s" },
                power: { base: 0.9, noise: 0.05, min: 0.3, max: 2, decimals: 2, unit: "kW" },
                life: { base: 210, decimals: 1, unit: "h" }
            },
            limits: { tempWarn: 40, tempCrit: 44, vibWarn: 1.8, vibCrit: 2.4 }
        },
        {
            short: { en: "PLC cabinet", es: "Armario PLC" },
            name: { en: "Control cabinet", es: "Armario de control" },
            x: 2.6, z: -1.6, w: 0.9, d: 0.6, h: 1.6,
            metrics: {
                temp: { base: 31.4, noise: 0.4, min: 26, max: 46, decimals: 1, unit: "°C" },
                vib: { base: 0.2, noise: 0.02, min: 0.05, max: 1.4, decimals: 2, unit: "mm/s" },
                power: { base: 0.4, noise: 0.03, min: 0.1, max: 1.1, decimals: 2, unit: "kW" },
                life: { base: 340, decimals: 1, unit: "h" }
            },
            limits: { tempWarn: 38, tempCrit: 42, vibWarn: 0.8, vibCrit: 1.2 }
        },
        {
            short: { en: "CNC mill", es: "Fresadora CNC" },
            name: { en: "CNC milling bench", es: "Banco de fresado CNC" },
            x: -2, z: 1.3, w: 1.7, d: 1.2, h: 1.2,
            metrics: {
                temp: { base: 47.8, noise: 0.7, min: 40, max: 64, decimals: 1, unit: "°C" },
                vib: { base: 1.3, noise: 0.07, min: 0.5, max: 3.6, decimals: 2, unit: "mm/s" },
                power: { base: 4.2, noise: 0.12, min: 2.2, max: 6, decimals: 2, unit: "kW" },
                life: { base: 96, decimals: 1, unit: "h" }
            },
            limits: { tempWarn: 52, tempCrit: 56, vibWarn: 2, vibCrit: 2.6 }
        },
        {
            short: { en: "Electronics bench", es: "Banco de electrónica" },
            name: { en: "Soldering station", es: "Puesto de soldadura" },
            x: 0.6, z: 1.4, w: 1.8, d: 0.9, h: 0.9,
            metrics: {
                temp: { base: 28.9, noise: 0.4, min: 24, max: 42, decimals: 1, unit: "°C" },
                vib: { base: 0.1, noise: 0.01, min: 0.02, max: 1, decimals: 2, unit: "mm/s" },
                power: { base: 0.6, noise: 0.04, min: 0.2, max: 1.6, decimals: 2, unit: "kW" },
                life: { base: 420, decimals: 1, unit: "h" }
            },
            limits: { tempWarn: 34, tempCrit: 38, vibWarn: 0.6, vibCrit: 0.9 }
        },
        {
            short: { en: "Test rig", es: "Banco de pruebas" },
            name: { en: "Motor test rig", es: "Banco de motores" },
            x: 2.6, z: 1.2, w: 1.1, d: 1.1, h: 1,
            metrics: {
                temp: { base: 55.1, noise: 0.8, min: 46, max: 72, decimals: 1, unit: "°C" },
                vib: { base: 1.9, noise: 0.09, min: 0.9, max: 4, decimals: 2, unit: "mm/s" },
                power: { base: 2.6, noise: 0.09, min: 1.2, max: 4, decimals: 2, unit: "kW" },
                life: { base: 64, decimals: 1, unit: "h" }
            },
            limits: { tempWarn: 60, tempCrit: 64, vibWarn: 2.4, vibCrit: 3 }
        }
    ];

    ASSETS.forEach((asset) => {
        asset.values = {};
        Object.keys(asset.metrics).forEach((key) => {
            asset.values[key] = asset.metrics[key].base;
        });
        asset.status = "nominal";
    });

    let selectedIndex = 0;
    const assetTabs = $$(".asset-tab");

    const panel = {
        kicker: $('[data-live="kicker"]'),
        name: $('[data-live="name"]'),
        status: $('[data-live="status"]'),
        sync: $('[data-live="sync"]'),
        metrics: {}
    };

    $$("[data-metric]").forEach((el) => {
        panel.metrics[el.dataset.metric] = el;
    });

    const STATUS = {
        nominal: { en: "Nominal", es: "Nominal" },
        warning: { en: "Warning", es: "Advertencia" },
        critical: { en: "Critical", es: "Crítico" }
    };

    const STATUS_COLOR = {
        nominal: "#3de8c5",
        warning: "#ffb547",
        critical: "#ff5c7a"
    };

    function fmt(value, decimals, lang = currentLang) {
        const text = Number(value).toFixed(decimals);
        return lang === "es" ? text.replace(".", ",") : text;
    }

    function clockTime(date) {
        return `${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`;
    }

    function metricText(asset, key, lang = currentLang) {
        const spec = asset.metrics[key];
        return `${fmt(asset.values[key], spec.decimals, lang)} ${spec.unit}`;
    }

    function renderPanel(now = new Date()) {
        const asset = ASSETS[selectedIndex];
        if (!asset) return;

        if (panel.kicker) {
            const label = currentLang === "es" ? "ACTIVO" : "ASSET";
            panel.kicker.textContent =
                `${label} ${pad2(selectedIndex + 1)} · ${asset.short[currentLang].toUpperCase()}`;
        }

        if (panel.name) {
            panel.name.textContent = asset.name[currentLang];
        }

        if (panel.status) {
            const status = asset.status || "nominal";
            panel.status.textContent = STATUS[status][currentLang];
            panel.status.className = `panel-status is-${status}`;
        }

        ["temp", "vib", "power", "life"].forEach((key) => {
            if (panel.metrics[key]) {
                panel.metrics[key].textContent = metricText(asset, key);
            }
        });

        if (panel.sync) {
            const label = currentLang === "es" ? "Última sincronización" : "Last sync";
            panel.sync.textContent = `${label} · ${clockTime(now)}`;
        }
    }

    /* ----------------------------------------------------------------------
       Live log
       ---------------------------------------------------------------------- */
    const logEl = $(".twin-log");
    const MAX_LOG_ITEMS = 5;
    const MAX_LOG_STORED = 40;
    let logEntries = [];

    function seedLog() {
        if (!logEl) return;

        const now = Date.now();
        const items = $$("li", logEl);

        logEntries = items
            .map((item, index) => {
                const text = $("span", item);
                return {
                    at: new Date(now - (items.length - index) * 60000),
                    en: normalize(text ? text.textContent : ""),
                    es: normalize(text ? text.dataset.es || text.textContent : "")
                };
            })
            .filter((entry) => entry.en);
    }

    function renderLog() {
        if (!logEl) return;

        logEl.replaceChildren(
            ...logEntries.slice(0, MAX_LOG_ITEMS).map((entry) => {
                const item = document.createElement("li");
                if (entry.alert) item.classList.add("is-alert");

                const time = document.createElement("time");
                time.textContent = clockTime(entry.at);

                const text = document.createElement("span");
                text.textContent = entry[currentLang] || entry.en;

                item.append(time, text);
                return item;
            })
        );
    }

    function pushLog(entry) {
        logEntries.unshift(entry);
        if (logEntries.length > MAX_LOG_STORED) logEntries.length = MAX_LOG_STORED;
        renderLog();
    }

    function infoLine(asset) {
        const temps = {
            en: `${fmt(asset.values.temp, 1, "en")} °C`,
            es: `${fmt(asset.values.temp, 1, "es")} °C`
        };
        const vibs = {
            en: `${fmt(asset.values.vib, 2, "en")} mm/s`,
            es: `${fmt(asset.values.vib, 2, "es")} mm/s`
        };
        const powers = {
            en: `${fmt(asset.values.power, 1, "en")} kW`,
            es: `${fmt(asset.values.power, 1, "es")} kW`
        };
        const lifes = {
            en: `${fmt(asset.values.life, 1, "en")} h`,
            es: `${fmt(asset.values.life, 1, "es")} h`
        };
        const nameEn = asset.name.en;
        const nameEs = asset.name.es;

        const options = [
            {
                en: `${nameEn}: ${temps.en}, above the 24 h baseline.`,
                es: `${nameEs}: ${temps.es}, por encima de la línea base de 24 h.`
            },
            {
                en: `${nameEn}: vibration at ${vibs.en}.`,
                es: `${nameEs}: vibración en ${vibs.es}.`
            },
            {
                en: `${nameEn}: drawing ${powers.en}.`,
                es: `${nameEs}: consumiendo ${powers.es}.`
            },
            {
                en: `${nameEn}: remaining life updated to ${lifes.en}.`,
                es: `${nameEs}: vida útil actualizada a ${lifes.es}.`
            },
            {
                en: `${nameEn}: state synchronised with the edge gateway.`,
                es: `${nameEs}: estado sincronizado con la pasarela edge.`
            }
        ];

        return options[Math.floor(Math.random() * options.length)];
    }

    function alertLine(asset) {
        return {
            en: `ALERT ${asset.name.en}: temperature spike at ${fmt(asset.values.temp, 1, "en")} °C.`,
            es: `ALERTA ${asset.name.es}: pico de temperatura a ${fmt(asset.values.temp, 1, "es")} °C.`
        };
    }

    /* ----------------------------------------------------------------------
       5. Twin canvas
       A small isometric renderer: no libraries, no external 3D files. Each
       asset is a box on the floor; drag to rotate, click a label to select.
       ---------------------------------------------------------------------- */
    const canvas = $(".twin-view canvas");
    const view = canvas ? canvas.closest(".twin-view") : null;
    const ROOM = { w: 7.2, d: 5.2 };
    const ISO_C = Math.cos(Math.PI / 6);
    const ISO_S = 0.5;

    let ctx = null;
    let sceneW = 0;
    let sceneH = 0;
    let yaw = -0.55;
    let dragging = false;
    let dragMoved = 0;
    let lastPointerX = 0;

    function roundRect(context, x, y, width, height, radius) {
        const r = Math.min(radius, width / 2, height / 2);
        context.beginPath();
        context.moveTo(x + r, y);
        context.arcTo(x + width, y, x + width, y + height, r);
        context.arcTo(x + width, y + height, x, y + height, r);
        context.arcTo(x, y + height, x, y, r);
        context.arcTo(x, y, x + width, y, r);
        context.closePath();
    }

    function drawScene() {
        if (!ctx || !sceneW || !sceneH) return;

        const width = sceneW;
        const height = sceneH;
        ctx.clearRect(0, 0, width, height);

        const maxHeight = Math.max(...ASSETS.map((asset) => asset.h));
        const span = ROOM.w + ROOM.d;
        const scale = Math.min(
            (width - 56) / (span * ISO_C),
            (height - 44) / (span * ISO_S + maxHeight)
        );
        const ox = width / 2;
        const oy = height / 2 + (maxHeight * scale) / 2;
        const cos = Math.cos(yaw);
        const sin = Math.sin(yaw);

        function project(x, y, z) {
            const rx = x * cos - z * sin;
            const rz = x * sin + z * cos;
            return {
                x: ox + (rx - rz) * ISO_C * scale,
                y: oy + (rx + rz) * ISO_S * scale - y * scale,
                depth: rx + rz
            };
        }

        const halfW = ROOM.w / 2;
        const halfD = ROOM.d / 2;
        const floor = [
            project(-halfW, 0, -halfD),
            project(halfW, 0, -halfD),
            project(halfW, 0, halfD),
            project(-halfW, 0, halfD)
        ];

        // Floor
        ctx.beginPath();
        ctx.moveTo(floor[0].x, floor[0].y);
        for (let i = 1; i < floor.length; i += 1) ctx.lineTo(floor[i].x, floor[i].y);
        ctx.closePath();
        ctx.fillStyle = "rgba(61, 123, 255, 0.06)";
        ctx.fill();

        // Grid
        ctx.beginPath();
        for (let x = -halfW + 1; x < halfW; x += 1) {
            const a = project(x, 0, -halfD);
            const b = project(x, 0, halfD);
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
        }
        for (let z = -halfD + 1; z < halfD; z += 1) {
            const a = project(-halfW, 0, z);
            const b = project(halfW, 0, z);
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
        }
        ctx.strokeStyle = "rgba(120, 170, 255, 0.1)";
        ctx.lineWidth = 1;
        ctx.stroke();

        // Border
        ctx.beginPath();
        ctx.moveTo(floor[0].x, floor[0].y);
        for (let i = 1; i < floor.length; i += 1) ctx.lineTo(floor[i].x, floor[i].y);
        ctx.closePath();
        ctx.strokeStyle = "rgba(120, 170, 255, 0.28)";
        ctx.stroke();

        // Far to near, so the nearest boxes overlap the ones behind
        const ordered = ASSETS.map((asset, index) => ({
            asset,
            index,
            depth: project(asset.x, 0, asset.z).depth
        })).sort((a, b) => a.depth - b.depth);

        // Shadows first, so no shadow paints over a box
        ordered.forEach(({ asset }) => {
            const center = project(asset.x, 0, asset.z);
            ctx.beginPath();
            ctx.ellipse(
                center.x,
                center.y,
                (asset.w / 2) * scale * ISO_C * 1.3,
                (asset.w / 2) * scale * ISO_S * 1.3,
                0,
                0,
                Math.PI * 2
            );
            ctx.fillStyle = "rgba(0, 0, 0, 0.28)";
            ctx.fill();
        });

        ordered.forEach(({ asset, index }) => {
            const selected = index === selectedIndex;
            const hw = asset.w / 2;
            const hd = asset.d / 2;
            const footprint = [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]];
            const bottom = footprint.map(([dx, dz]) => project(asset.x + dx, 0, asset.z + dz));
            const top = footprint.map(([dx, dz]) => project(asset.x + dx, asset.h, asset.z + dz));

            const faces = [0, 1, 2, 3]
                .map((i) => ({
                    i,
                    depth: (bottom[i].depth + bottom[(i + 1) % 4].depth) / 2
                }))
                .sort((a, b) => a.depth - b.depth);

            faces.forEach(({ i }) => {
                const j = (i + 1) % 4;
                ctx.beginPath();
                ctx.moveTo(bottom[i].x, bottom[i].y);
                ctx.lineTo(bottom[j].x, bottom[j].y);
                ctx.lineTo(top[j].x, top[j].y);
                ctx.lineTo(top[i].x, top[i].y);
                ctx.closePath();
                ctx.fillStyle = selected ? "rgba(61, 232, 197, 0.16)" : "rgba(61, 123, 255, 0.12)";
                ctx.fill();
                ctx.strokeStyle = selected ? "rgba(61, 232, 197, 0.6)" : "rgba(120, 170, 255, 0.35)";
                ctx.lineWidth = 1;
                ctx.stroke();
            });

            // Top face
            ctx.beginPath();
            ctx.moveTo(top[0].x, top[0].y);
            for (let i = 1; i < top.length; i += 1) ctx.lineTo(top[i].x, top[i].y);
            ctx.closePath();
            ctx.fillStyle = selected ? "rgba(61, 232, 197, 0.3)" : "rgba(61, 123, 255, 0.22)";
            ctx.fill();
            ctx.strokeStyle = selected ? "#3de8c5" : "rgba(120, 170, 255, 0.5)";
            ctx.stroke();

            // Status LED on the top face
            const anchor = project(asset.x, asset.h, asset.z);
            const color = STATUS_COLOR[asset.status] || STATUS_COLOR.nominal;
            ctx.beginPath();
            ctx.arc(anchor.x, anchor.y - 5, 3, 0, Math.PI * 2);
            ctx.fillStyle = color;
            ctx.shadowColor = color;
            ctx.shadowBlur = 10;
            ctx.fill();
            ctx.shadowBlur = 0;

            asset.anchor = anchor;
        });

        // Labels, drawn last so they stay readable
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.font = '600 11px "JetBrains Mono", ui-monospace, monospace';

        ordered.forEach(({ asset, index }) => {
            const selected = index === selectedIndex;
            const label = project(asset.x, asset.h + 0.22, asset.z);
            const text = selected
                ? `${pad2(index + 1)} · ${asset.short[currentLang]}`
                : pad2(index + 1);

            const textWidth = ctx.measureText(text).width;
            const pillWidth = textWidth + 16;
            const pillHeight = 20;
            const pillX = Math.min(Math.max(label.x - pillWidth / 2, 6), width - pillWidth - 6);
            const pillY = label.y - pillHeight - 6;

            roundRect(ctx, pillX, pillY, pillWidth, pillHeight, 10);
            ctx.fillStyle = "rgba(4, 7, 14, 0.82)";
            ctx.fill();
            ctx.strokeStyle = selected
                ? STATUS_COLOR[asset.status] || STATUS_COLOR.nominal
                : "rgba(120, 170, 255, 0.3)";
            ctx.lineWidth = 1;
            ctx.stroke();

            ctx.fillStyle = selected ? "#e8edf7" : "rgba(232, 237, 247, 0.7)";
            ctx.fillText(text, pillX + pillWidth / 2, pillY + pillHeight / 2 + 0.5);

            asset.hotspot = {
                x: pillX + pillWidth / 2,
                y: pillY + pillHeight / 2,
                r: pillHeight / 2 + 6
            };
        });
    }

    function resizeScene() {
        if (!canvas) return;

        const rect = canvas.getBoundingClientRect();
        if (rect.width < 2 || rect.height < 2) return;

        const ratio = Math.min(window.devicePixelRatio || 1, 2);
        sceneW = rect.width;
        sceneH = rect.height;
        canvas.width = Math.round(sceneW * ratio);
        canvas.height = Math.round(sceneH * ratio);

        ctx = canvas.getContext("2d");
        if (!ctx) return;

        ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
        drawScene();
    }

    function pickAsset(clientX, clientY) {
        if (!canvas) return -1;

        const rect = canvas.getBoundingClientRect();
        const x = clientX - rect.left;
        const y = clientY - rect.top;

        let best = -1;
        let bestDistance = Infinity;

        ASSETS.forEach((asset, index) => {
            if (asset.hotspot) {
                const distance = Math.hypot(x - asset.hotspot.x, y - asset.hotspot.y);
                if (distance < asset.hotspot.r && distance < bestDistance) {
                    best = index;
                    bestDistance = distance;
                }
            }

            if (asset.anchor) {
                const distance = Math.hypot(x - asset.anchor.x, y - (asset.anchor.y - 6));
                if (distance < 24 && distance < bestDistance) {
                    best = index;
                    bestDistance = distance;
                }
            }
        });

        return best;
    }

    function selectAsset(index) {
        if (index < 0 || index >= ASSETS.length) return;

        selectedIndex = index;

        assetTabs.forEach((tab) => {
            const active = Number(tab.dataset.asset) === index;
            tab.classList.toggle("is-active", active);
            tab.setAttribute("aria-pressed", String(active));
        });

        renderPanel();
        drawScene();
    }

    assetTabs.forEach((tab) => {
        tab.addEventListener("click", () => selectAsset(Number(tab.dataset.asset)));
    });

    function renderTabStatus() {
        assetTabs.forEach((tab, index) => {
            tab.dataset.status = (ASSETS[index] && ASSETS[index].status) || "nominal";
        });
    }

    if (canvas) {
        canvas.addEventListener("pointerdown", (event) => {
            dragging = true;
            dragMoved = 0;
            lastPointerX = event.clientX;
            canvas.classList.add("is-dragging");
            try {
                canvas.setPointerCapture(event.pointerId);
            } catch (error) {
                /* pointer capture is best-effort */
            }
        });

        canvas.addEventListener("pointermove", (event) => {
            if (!dragging) return;

            const delta = event.clientX - lastPointerX;
            lastPointerX = event.clientX;
            dragMoved += Math.abs(delta);
            yaw += delta * 0.008;
            drawScene();
        });

        const endDrag = (event) => {
            if (!dragging) return;

            dragging = false;
            canvas.classList.remove("is-dragging");

            if (canvas.hasPointerCapture(event.pointerId)) {
                canvas.releasePointerCapture(event.pointerId);
            }
            // A click, not a drag: select whatever is under the pointer
            if (dragMoved < 8) {
                const hit = pickAsset(event.clientX, event.clientY);
                if (hit >= 0) selectAsset(hit);
            }
        };

        canvas.addEventListener("pointerup", endDrag);
        canvas.addEventListener("pointercancel", () => {
            dragging = false;
            canvas.classList.remove("is-dragging");
        });
    }

    let resizeFrame = 0;

    function queueResize() {
        window.cancelAnimationFrame(resizeFrame);
        resizeFrame = window.requestAnimationFrame(resizeScene);
    }

    if (view && "ResizeObserver" in window) {
        new ResizeObserver(queueResize).observe(view);
    }

    window.addEventListener("resize", queueResize);

    /* ----------------------------------------------------------------------
       6. Telemetry simulation
       ---------------------------------------------------------------------- */
    let simulationTimer = 0;

    function drift(value, spec) {
        const pull = (spec.base - value) * 0.12;
        const noise = (Math.random() - 0.5) * spec.noise;
        return Math.min(spec.max, Math.max(spec.min, value + noise + pull));
    }

    function statusOf(asset) {
        const { temp, vib } = asset.values;
        const limits = asset.limits;

        if (temp >= limits.tempCrit || vib >= limits.vibCrit) return "critical";
        if (temp >= limits.tempWarn || vib >= limits.vibWarn) return "warning";
        return "nominal";
    }

    function injectFaults() {
        ASSETS.forEach((asset) => {
            if (Math.random() > 0.012) return;

            const tempSpec = asset.metrics.temp;
            const vibSpec = asset.metrics.vib;

            asset.values.temp = Math.min(
                tempSpec.max,
                asset.values.temp + 4.5 + Math.random() * 1.5
            );
            asset.values.vib = Math.min(vibSpec.max, asset.values.vib + 0.35);

            pushLog({ at: new Date(), alert: true, ...alertLine(asset) });
        });
    }

    function maybeLog(now) {
        if (Math.random() > 0.32) return;
        const asset = ASSETS[Math.floor(Math.random() * ASSETS.length)];
        pushLog({ at: now, ...infoLine(asset) });
    }

    function tick() {
        const now = new Date();

        ASSETS.forEach((asset) => {
            asset.values.temp = drift(asset.values.temp, asset.metrics.temp);
            asset.values.vib = drift(asset.values.vib, asset.metrics.vib);
            asset.values.power = drift(asset.values.power, asset.metrics.power);
            asset.values.life = Math.max(1, asset.values.life - (0.03 + Math.random() * 0.09));
        });

        injectFaults();

        ASSETS.forEach((asset) => {
            asset.status = statusOf(asset);
        });

        renderTabStatus();
        renderPanel(now);
        maybeLog(now);
        drawScene();
    }

    function startSimulation() {
        stopSimulation();
        simulationTimer = window.setInterval(tick, 900);
    }

    function stopSimulation() {
        if (!simulationTimer) return;
        window.clearInterval(simulationTimer);
        simulationTimer = 0;
    }

    document.addEventListener("visibilitychange", () => {
        if (document.hidden) {
            stopSimulation();
        } else {
            tick();
            startSimulation();
        }
    });

    /* ----------------------------------------------------------------------
       7. Boot
       ---------------------------------------------------------------------- */
    seedLog();
    applyLanguage(readStoredLang(), false);
    resizeScene();
    tick();
    startSimulation();
})();
