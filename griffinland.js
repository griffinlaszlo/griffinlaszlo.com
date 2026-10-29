// griffinland's desktop toys: the menu bars, not-a-virus.exe, the parked
// spam ad, the screensaver, Tip of the Day, the hit counter, the sparkle
// trail, the horizon, the calculator and the guestbook.
//
// Loaded after main.js and built on its shell: buildWindowChrome for the title
// bars, showPopup for the fly-in, windowIcons for the taskbar, and
// syncOpenWindowClass to keep the taskbar in step. The windows here are built
// as the script runs, before main.js's $(document).ready starts watching
// .popup-window elements, so the taskbar already tracks them. The virus
// storm's windows arrive later and are watched by hand (watchWindow).
(function() {
"use strict";

var REDUCED_MOTION = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
var NO_HOVER = window.matchMedia("(hover: none)").matches;

// Where the spam ad's CLICK HERE goes - point it at whatever's new
var PROMO_URL = "https://mocial.org/";

// ===== Small helpers =========================================================

function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
}

function pick(list) {
    return list[Math.floor(Math.random() * list.length)];
}

function rand(min, max) {
    return min + Math.random() * (max - min);
}

// localStorage can throw (private windows, blocked storage), so every read
// and write falls back quietly - these are all nice-to-haves
function load(key, fallback) {
    try {
        var raw = localStorage.getItem(key);
        return raw === null ? fallback : JSON.parse(raw);
    } catch (e) {
        return fallback;
    }
}
function save(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {}
}

function isGated() {
    return document.documentElement.classList.contains("gated");
}

// Runs fn once the desktop is showing: straight away when there's no gate,
// otherwise the moment the password gate lifts
function onDesktopReady(fn) {
    var root = document.documentElement;
    if (!isGated()) {
        fn();
        return;
    }
    new MutationObserver(function(records, observer) {
        if (isGated()) return;
        observer.disconnect();
        fn();
    }).observe(root, { attributes: true, attributeFilter: ["class"] });
}

// ASCII-box button, the Strokes-style call to action:
//   ╔══════════════╗
//   ║  LISTEN NOW  ║
//   ╚══════════════╝
function asciiButton(label, onClick) {
    var inner = "  " + label + "  ";
    var bar = new Array(inner.length + 1).join("═");
    var btn = el("button", "gl-ascii-btn");
    btn.type = "button";
    btn.textContent = "╔" + bar + "╗\n║" + inner + "║\n╚" + bar + "╝";
    btn.setAttribute("aria-label", label);
    if (onClick) btn.addEventListener("click", onClick);
    return btn;
}

// ===== Window kit ============================================================
// Every griffinland window comes out of makeWindow: mocial's title bar, a
// title-bar icon, an optional menu bar, and a body to fill.

var topZ = 10100;

function bringToFront(win) {
    if (!isMobileLayout()) win.style.zIndex = ++topZ;
}

// Watch a window that was made after main.js started watching, so opening and
// closing it still updates the taskbar
function watchWindow(win) {
    new MutationObserver(syncOpenWindowClass)
        .observe(win, { attributes: true, attributeFilter: ["style", "class"] });
}

function makeWindow(opts) {
    var win = el("div", "popup-window gl-window " + (opts.className || ""));
    if (opts.id) win.id = opts.id;

    win.appendChild(buildWindowChrome(win, opts.title));

    if (opts.icon) {
        var titleEl = win.querySelector(".window-title");
        var img = el("img", "window-title-icon");
        img.src = opts.icon;
        img.alt = "";
        img.draggable = false;
        titleEl.insertBefore(img, titleEl.firstChild);
        if (opts.id) windowIcons[opts.id] = opts.icon;
    }

    if (opts.menus) win.appendChild(buildMenuBar(win, opts.menus));

    var body = el("div", "popup-inner-wrapper gl-body");
    win.appendChild(body);
    document.querySelector("main").appendChild(win);

    $(win).draggable({ handle: ".windows-header-wrapper", start: function() { bringToFront(win); } });
    win.addEventListener("mousedown", function() { bringToFront(win); });

    return { win: win, body: body };
}

// Opens a window centered on the desktop (nudged down and right for each one
// open, the way Windows cascades them) the first time, and wherever it was
// left after that
var cascade = 0;
function openWindow(win, originEl) {
    if (!isMobileLayout() && !win.getAttribute("data-placed")) {
        var width = parseFloat(getComputedStyle(win).width) || 400;
        var step = (cascade++ % 6) * 26;
        win.style.left = Math.max(12, (window.innerWidth - width) / 2 - 60 + step) + "px";
        win.style.top = (96 + step) + "px";
        win.setAttribute("data-placed", "1");
    }
    bringToFront(win);
    if ($(win).is(":hidden")) {
        showPopup(win.id, originEl);
    }
}

function closeWindow(win) {
    $(win).hide();
}

// ===== Menu bars =============================================================
// File / Edit / View / Help with the first letter underlined, on every
// griffinland window. Each menu is a list of items - {label, action}, a
// {label, checked} toggle, a {label, disabled} dud, or "-" for a divider -
// built fresh each time it opens so the checkmarks are always current.

function closeMenus() {
    [].forEach.call(document.querySelectorAll(".gl-menubar"), function(bar) {
        bar.classList.remove("active");
        [].forEach.call(bar.querySelectorAll(".gl-menubar-item"), function(item) {
            item.classList.remove("open");
        });
        [].forEach.call(bar.querySelectorAll(".gl-menu"), function(menu) {
            menu.hidden = true;
        });
    });
}

function fillMenu(drop, items) {
    drop.textContent = "";
    items.forEach(function(item) {
        if (item === "-") {
            drop.appendChild(el("div", "gl-menu-divider"));
            return;
        }
        var row = el("button", "gl-menu-row");
        row.type = "button";
        row.appendChild(el("span", "gl-menu-check", item.checked ? "✓" : ""));
        row.appendChild(el("span", "gl-menu-label", item.label));
        if (item.hint) row.appendChild(el("span", "gl-menu-hint", item.hint));
        if (item.disabled) row.disabled = true;
        row.addEventListener("click", function(e) {
            e.stopPropagation();
            closeMenus();
            if (item.action) item.action();
        });
        drop.appendChild(row);
    });
}

function buildMenuBar(win, menus) {
    var bar = el("div", "gl-menubar");

    menus.forEach(function(menu) {
        var item = el("div", "gl-menubar-item");
        item.tabIndex = 0;
        var key = el("u", null, menu.label.charAt(0));
        item.appendChild(key);
        item.appendChild(document.createTextNode(menu.label.slice(1)));

        var drop = el("div", "gl-menu");
        drop.hidden = true;
        item.appendChild(drop);

        function open() {
            closeMenus();
            fillMenu(drop, typeof menu.items === "function" ? menu.items() : menu.items);
            drop.hidden = false;
            item.classList.add("open");
            bar.classList.add("active");
        }

        item.addEventListener("click", function(e) {
            e.stopPropagation();
            if (drop.contains(e.target)) return;
            if (drop.hidden) open();
            else closeMenus();
        });
        item.addEventListener("keydown", function(e) {
            if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
                e.preventDefault();
                open();
                var first = drop.querySelector(".gl-menu-row:not([disabled])");
                if (first) first.focus();
            }
        });
        // Once one menu is open, sliding across the bar opens the others
        item.addEventListener("mouseenter", function() {
            if (bar.classList.contains("active") && drop.hidden) open();
        });

        bar.appendChild(item);
    });

    return bar;
}

document.addEventListener("click", closeMenus);

// The four menus every window gets. `extra` adds window-specific items to the
// top of File, Edit or View.
function standardMenus(win, extra) {
    extra = extra || {};
    return [
        { label: "File", items: function() {
            return (extra.file || []).concat([
                { label: "Close", action: function() { closeWindow(win); } }
            ]);
        } },
        { label: "Edit", items: function() {
            return (extra.edit || []).concat([
                { label: "Undo", disabled: true, hint: "can't undo" },
                { label: "Copy good vibes", action: copyGoodVibes }
            ]);
        } },
        { label: "View", items: function() {
            return (extra.view || []).concat([
                { label: "Sparkle trail", checked: sparklesOn, action: toggleSparkles },
                { label: "Screensaver now", action: function() { startScreensaver(true); } }
            ]);
        } },
        { label: "Help", items: function() {
            return [
                { label: "Tip of the Day", action: function() { showTips(); } },
                "-",
                { label: "About griffinland", action: showAbout }
            ];
        } }
    ];
}

function copyGoodVibes() {
    var text = "✦ good vibes from griffinland ✦";
    if (navigator.clipboard) navigator.clipboard.writeText(text).catch(function() {});
}

// The welcome window is built by main.js; give it a menu bar too
(function() {
    var welcome = document.getElementById("welcome-window");
    if (!welcome) return;
    var header = welcome.querySelector(".windows-header-wrapper");
    if (header) header.parentNode.insertBefore(buildMenuBar(welcome, standardMenus(welcome)), header.nextSibling);
})();

// ===== About griffinland =====================================================

var about = makeWindow({ id: "about-window", title: "About griffinland", icon: "world_spinning.gif" });
about.body.classList.add("gl-about");
about.body.innerHTML =
    '<img src="world_spinning.gif" alt="" class="gl-about-icon" draggable="false">' +
    '<div class="gl-about-text">' +
        '<div class="gl-about-name">griffinland</div>' +
        '<div>Version 1.0 (Build 2025)</div>' +
        '<div>Copyright &copy; 2025 griffinlaszlo.com</div>' +
        '<hr>' +
        '<div>This product is licensed to:<br><b>you, specifically</b></div>' +
        '<hr>' +
        '<div>Physical memory available to griffinland: <b>plenty</b></div>' +
        '<div>System resources: <b>100% vibes</b></div>' +
    '</div>';
var aboutOk = el("button", "gl-btn", "OK");
aboutOk.type = "button";
aboutOk.addEventListener("click", function() { closeWindow(about.win); });
var aboutButtons = el("div", "gl-buttons");
aboutButtons.appendChild(aboutOk);
about.body.appendChild(aboutButtons);

function showAbout() {
    openWindow(about.win);
}

// ===== Sparkle trail =========================================================
// The cursor is a wand: sparkles pop off it, then flutter down like snow,
// swaying side to side, with snowflakes mixed in. On by default; View >
// Sparkle trail turns it off, remembered per browser. Skipped on touch
// screens and for anyone who's asked for less motion.

var sparklesOn = load("gl-sparkles", true);
var SPARKLE_GLYPHS = ["✦", "✧", "⋆", "✶"];
var SPARKLE_COLORS = ["#fff7b0", "#ffffff", "#ffb3e6", "#9ff3ff", "#ffd84a"];
var SNOW_GLYPHS = ["❄", "❅", "❆", "•"];
var SNOW_COLORS = ["#ffffff", "#eaf6ff", "#cfeaff"];
var liveSparkles = 0;
var lastSparkle = null;

function toggleSparkles() {
    sparklesOn = !sparklesOn;
    save("gl-sparkles", sparklesOn);
}

document.addEventListener("mousemove", function(e) {
    if (!sparklesOn || REDUCED_MOTION || NO_HOVER || liveSparkles > 70) return;
    if (lastSparkle && Math.abs(e.clientX - lastSparkle.x) + Math.abs(e.clientY - lastSparkle.y) < 16) return;
    lastSparkle = { x: e.clientX, y: e.clientY };

    // Mostly wand sparkles, with a snowflake every few
    var snow = Math.random() < 0.4;
    var s = el("span", "gl-sparkle", pick(snow ? SNOW_GLYPHS : SPARKLE_GLYPHS));
    s.style.left = e.clientX + "px";
    s.style.top = e.clientY + "px";
    s.style.color = pick(snow ? SNOW_COLORS : SPARKLE_COLORS);
    s.style.setProperty("--sway", rand(8, 22).toFixed(0) + "px");
    s.style.setProperty("--fall", rand(120, 230).toFixed(0) + "px");
    s.style.setProperty("--spin", (Math.random() < 0.5 ? -1 : 1) * Math.round(rand(90, 240)) + "deg");
    s.style.animationDuration = rand(2.2, 3.8).toFixed(2) + "s";
    s.style.fontSize = rand(snow ? 9 : 10, snow ? 16 : 18).toFixed(0) + "px";
    document.body.appendChild(s);
    liveSparkles++;
    s.addEventListener("animationend", function() {
        s.remove();
        liveSparkles--;
    });
});

// ===== not-a-virus.exe =======================================================
// Opening it sets off a storm of fake spam pop-ups, Strokes-style. Each ad's
// own button spawns two more. When the storm settles, griffinland AntiVirus
// turns up with a button that clears the lot (so does Escape).

var SPAM = [
    { title: "YOU'VE BEEN SELECTED!", head: "CONGRATULATIONS!!!", text: "You are the 1,000,000th visitor to griffinland!", img: "firework.gif", btn: "CLAIM PRIZE" },
    { title: "YOUR PC IS AT RISK", head: "WARNING", text: "Your computer is running dangerously low on vibes.", img: "computer.gif", btn: "FIX NOW" },
    { title: "HOT SINGLES", head: "HOT SINGLES IN GRIFFINLAND", text: "3 lava lamps within 2 miles of you want to chat.", img: "lavalamp.gif", btn: "CHAT NOW" },
    { title: "DOWNLOAD MORE RAM", head: "FREE RAM!!!", text: "Your PC only has 4 MB. Download 64 MB more, totally free.", img: "sdcard.png", btn: "DOWNLOAD" },
    { title: "FREE RINGTONES", head: "FREE RINGTONES", text: "Text DINO to 4-DINO for a free polyphonic roar.", img: "dino.png", btn: "ROAR" },
    { title: "YOU HAVE (1) NEW MESSAGE", head: "You've got mail!", text: "From: your mom. Subject: call me", img: "mail.gif", btn: "OPEN" },
    { title: "YOU WON A CRUISE", head: "FREE CRUISE", text: "...on a spaceship. Departs immediately. No refunds.", img: "spaceship.gif", btn: "BOARD" },
    { title: "DOCTORS HATE HIM", head: "ONE WEIRD TRICK", text: "Local tomato discovers one weird trick. Doctors furious.", img: "tomato.gif", btn: "LEARN MORE" },
    { title: "SYSTEM ALERT", head: "YOUR DISK IS SPINNING", text: "Too fast. Way too fast. Somebody do something.", img: "diskspin.gif", btn: "SLOW DOWN" },
    { title: "SPEED UP YOUR PC", head: "1000% FASTER", text: "Speed up your PC with this one cheetah.", img: "CHEETAH.gif", btn: "GO FAST" },
    { title: "FREE MUSIC", head: "FREE MUSIC", text: "...in your area. Right now. Act fast.", img: "cd1.png", btn: "LISTEN" },
    { title: "YOU'RE INVITED", head: "PARTY TIME", text: "You've been invited to dance. Right now. At your desk.", img: "dancing.gif", btn: "DANCE" },
    { title: "UV WARNING", head: "UV INDEX: 11", text: "Please apply sunscreen to your monitor.", img: "sun.gif", btn: "APPLY" },
    { title: "CAT.EXE", head: "meow", text: "meow meow meow. meow? meow.", img: "cat.png", btn: "MEOW" },
    { title: "WORLD UPDATE", head: "UPDATE AVAILABLE", text: "The world has been updated. Restart the planet to finish installing.", img: "earth.gif", btn: "RESTART" },
    { title: "THE MOON IS WATCHING", head: "NOT A DRILL", text: "The moon would like a word.", img: "moon.gif", btn: "WAVE" }
];
var STORM_SIZE = 14;
var STORM_CAP = 40;
var spamWindows = [];
var storming = false;

function spawnSpam(ad, x, y) {
    if (spamWindows.length >= STORM_CAP) return;
    ad = ad || pick(SPAM);

    // No id, on purpose: the taskbar only lists windows with one, and forty
    // taskbar buttons would bury the real ones
    var w = makeWindow({ title: ad.title, icon: "icons/virus.svg", className: "gl-spam" });
    w.body.innerHTML =
        '<div class="gl-spam-head"></div>' +
        '<img class="gl-spam-img" alt="" draggable="false">' +
        '<div class="gl-spam-text"></div>';
    w.body.querySelector(".gl-spam-head").textContent = ad.head;
    w.body.querySelector(".gl-spam-img").src = "gifs/" + ad.img;
    w.body.querySelector(".gl-spam-text").textContent = ad.text;

    var btn = el("button", "gl-spam-btn", ad.btn || "CLICK HERE");
    btn.type = "button";
    btn.addEventListener("click", function() {
        // Classic: clicking the ad gets you more ads
        var r = w.win.getBoundingClientRect();
        spawnSpam(null, r.left + 30, r.top + 30);
        setTimeout(function() { spawnSpam(null, r.left - 40, r.top + 60); }, 120);
    });
    w.body.appendChild(btn);

    var width = Math.min(260, window.innerWidth - 24);
    if (x == null) x = rand(8, Math.max(8, window.innerWidth - width - 8));
    if (y == null) y = rand(40, Math.max(40, window.innerHeight - 340));
    w.win.style.left = Math.max(4, Math.min(x, window.innerWidth - width - 4)) + "px";
    w.win.style.top = Math.max(4, Math.min(y, window.innerHeight - 300)) + "px";

    watchWindow(w.win);
    bringToFront(w.win);
    $(w.win).show();
    spamWindows.push(w.win);
}

var antivirus = makeWindow({ id: "antivirus-window", title: "griffinland AntiVirus", icon: "icons/virus.svg" });
antivirus.body.classList.add("gl-antivirus");
antivirus.body.innerHTML =
    '<svg class="gl-shield" viewBox="0 0 40 46" aria-hidden="true">' +
        '<path d="M20 2 L37 8 V22 C37 34 29 41 20 44 C11 41 3 34 3 22 V8 Z" fill="#2a8a3e" stroke="#000" stroke-width="2"/>' +
        '<path d="M12 23 L18 29 L29 16" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="square"/>' +
    '</svg>' +
    '<div class="gl-antivirus-text">' +
        '<div class="gl-antivirus-head">Scan complete.</div>' +
        '<div class="gl-antivirus-detail"></div>' +
    '</div>';
var antivirusDetail = antivirus.body.querySelector(".gl-antivirus-detail");
var antivirusButtons = el("div", "gl-antivirus-buttons");
antivirus.body.appendChild(antivirusButtons);

function showAntivirus() {
    antivirus.body.querySelector(".gl-antivirus-head").textContent = "Scan complete.";
    antivirusDetail.innerHTML = "<b>" + spamWindows.length + " threats</b> found on this PC.<br>Threat level: <b>vibes</b>.";
    antivirusButtons.textContent = "";
    antivirusButtons.appendChild(asciiButton("REMOVE ALL THREATS", clearStorm));
    antivirus.win.removeAttribute("data-placed");
    openWindow(antivirus.win);
}

function clearStorm() {
    var wins = spamWindows.slice();
    spamWindows = [];
    wins.reverse().forEach(function(win, i) {
        setTimeout(function() { win.remove(); syncOpenWindowClass(); }, i * 35);
    });
    setTimeout(function() {
        antivirus.body.querySelector(".gl-antivirus-head").textContent = "All clear.";
        antivirusDetail.innerHTML = "Your PC is clean.*<br><small>*ish</small>";
        antivirusButtons.textContent = "";
        var ok = el("button", "gl-btn", "OK");
        ok.type = "button";
        ok.addEventListener("click", function() { closeWindow(antivirus.win); });
        antivirusButtons.appendChild(ok);
        storming = false;
    }, wins.length * 35 + 50);
}

function startStorm() {
    if (storming) return;
    storming = true;
    var order = SPAM.slice().sort(function() { return Math.random() - 0.5; });
    for (var i = 0; i < STORM_SIZE; i++) {
        (function(i) {
            setTimeout(function() { spawnSpam(order[i % order.length]); }, i * 140);
        })(i);
    }
    setTimeout(showAntivirus, STORM_SIZE * 140 + 600);
}

document.addEventListener("keydown", function(e) {
    if (e.key === "Escape" && spamWindows.length) clearStorm();
});

makeElementDraggable("virus-icon-group", startStorm);

// ===== The parked spam ad ====================================================
// One ad that lives on the desktop for real: a joke and a promo at once.

var promo = makeWindow({ id: "promo-window", title: "!!! FREE MUSIC !!!", icon: "gifs/cd1.png", className: "gl-promo" });
promo.body.innerHTML =
    '<div class="gl-promo-marquee"><span>&#9733; FREE MUSIC IN YOUR AREA &#9733; NO CREDIT CARD NEEDED &#9733; ACT NOW &#9733; FREE MUSIC IN YOUR AREA &#9733; NO CREDIT CARD NEEDED &#9733; ACT NOW</span></div>' +
    '<img src="gifs/music_fire.gif" alt="" class="gl-promo-fire" draggable="false">' +
    '<div class="gl-promo-text">Have good music and want to blow up as an artist?</div>';
var promoBtn = el("button", "gl-promo-btn", "CLICK HERE!");
promoBtn.type = "button";
promoBtn.addEventListener("click", function() {
    window.open(PROMO_URL, "_blank", "noopener");
});
promo.body.appendChild(promoBtn);

// ===== Screensaver ===========================================================
// Leave the mouse alone for two minutes (or open the screensaver icon) and the
// screen fills with mocial's gifs bouncing around a starfield, with a
// griffinland logo doing the DVD bounce. Any key, click or nudge of the mouse
// brings the desktop back.

var IDLE_MS = 2 * 60 * 1000;
var SAVER_SPRITES = [
    { src: "sun.gif", size: 90 }, { src: "moon.gif", size: 80 }, { src: "earth.gif", size: 90 },
    { src: "lavalamp.gif", size: 70 }, { src: "dancing.gif", size: 80 }, { src: "tomato.gif", size: 70 },
    { src: "diskspin.gif", size: 80 }, { src: "firework.gif", size: 150 }, { src: "cat.png", size: 80 },
    { src: "mail.gif", size: 70 }, { src: "pixelated_music_notes.gif", size: 120 }, { src: "cd1.png", size: 80 },
    { src: "computer.gif", size: 80 }, { src: "music_fire.gif", size: 130 }, { src: "piano.gif", size: 120 }
];
var DRIFTERS = [
    { src: "spaceship.gif", size: 260, y: 0.18, speed: 140 },
    { src: "CHEETAH.gif", size: 150, y: 0.78, speed: 260 }
];
var LOGO_COLORS = ["#ff4f4f", "#ffd84a", "#4fff8a", "#4fd2ff", "#c77dff", "#ff8ad8", "#ffffff"];

var saver = null;
var idleTimer = null;

function startScreensaver(manual) {
    if (saver || isGated()) return;

    var overlay = el("div", "gl-saver");
    overlay.setAttribute("aria-hidden", "true");
    document.body.appendChild(overlay);

    var W = window.innerWidth, H = window.innerHeight;
    var things = [];

    SAVER_SPRITES.forEach(function(s) {
        var img = el("img", "gl-saver-sprite");
        img.src = "gifs/" + s.src;
        img.style.width = s.size + "px";
        overlay.appendChild(img);
        var speed = rand(50, 120);
        var angle = rand(0, Math.PI * 2);
        things.push({ node: img, w: s.size, h: s.size, x: rand(0, W - s.size), y: rand(0, H - s.size),
                      vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed });
    });

    var drifters = DRIFTERS.map(function(d) {
        var img = el("img", "gl-saver-sprite");
        img.src = "gifs/" + d.src;
        img.style.width = d.size + "px";
        overlay.appendChild(img);
        return { node: img, w: d.size, x: rand(-d.size, W), y: H * d.y, speed: d.speed };
    });

    var logo = el("div", "gl-saver-logo", "griffinland");
    overlay.appendChild(logo);
    var corner = el("div", "gl-saver-corner", "CORNER!!!");
    overlay.appendChild(corner);
    var logoState = { x: rand(0, W / 2), y: rand(0, H / 2), vx: 110, vy: 80, color: 0 };

    saver = { overlay: overlay, frame: null, started: Date.now(), grace: manual ? 1200 : 400 };

    if (REDUCED_MOTION) {
        things.concat(drifters).forEach(function(t) {
            t.node.style.transform = "translate(" + t.x + "px," + (t.y || 0) + "px)";
        });
        logo.style.transform = "translate(" + logoState.x + "px," + logoState.y + "px)";
        return;
    }

    var last = performance.now();
    function tick(now) {
        var dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        W = window.innerWidth;
        H = window.innerHeight;

        things.forEach(function(t) {
            t.x += t.vx * dt;
            t.y += t.vy * dt;
            if (t.x < 0) { t.x = 0; t.vx = Math.abs(t.vx); }
            if (t.x > W - t.w) { t.x = W - t.w; t.vx = -Math.abs(t.vx); }
            if (t.y < 0) { t.y = 0; t.vy = Math.abs(t.vy); }
            if (t.y > H - t.h) { t.y = H - t.h; t.vy = -Math.abs(t.vy); }
            t.node.style.transform = "translate(" + t.x + "px," + t.y + "px)";
        });

        drifters.forEach(function(d) {
            d.x += d.speed * dt;
            if (d.x > W + 20) d.x = -d.w;
            d.node.style.transform = "translate(" + d.x + "px," + d.y + "px)";
        });

        // The DVD logo: bounces off the walls, changing colour each time, and
        // makes a fuss when it nails a corner
        var lw = logo.offsetWidth, lh = logo.offsetHeight;
        var hitX = false, hitY = false;
        logoState.x += logoState.vx * dt;
        logoState.y += logoState.vy * dt;
        if (logoState.x < 0 || logoState.x > W - lw) {
            logoState.vx = -logoState.vx;
            logoState.x = Math.max(0, Math.min(logoState.x, W - lw));
            hitX = true;
        }
        if (logoState.y < 0 || logoState.y > H - lh) {
            logoState.vy = -logoState.vy;
            logoState.y = Math.max(0, Math.min(logoState.y, H - lh));
            hitY = true;
        }
        if (hitX || hitY) {
            logoState.color = (logoState.color + 1) % LOGO_COLORS.length;
            logo.style.color = LOGO_COLORS[logoState.color];
        }
        if (hitX && hitY) {
            corner.classList.remove("show");
            void corner.offsetWidth;
            corner.classList.add("show");
        }
        logo.style.transform = "translate(" + logoState.x + "px," + logoState.y + "px)";

        saver.frame = requestAnimationFrame(tick);
    }
    saver.frame = requestAnimationFrame(tick);
}

function stopScreensaver() {
    if (!saver) return;
    cancelAnimationFrame(saver.frame);
    saver.overlay.remove();
    saver = null;
}

function onActivity() {
    if (saver) {
        if (Date.now() - saver.started < saver.grace) return;
        stopScreensaver();
    }
    clearTimeout(idleTimer);
    idleTimer = setTimeout(function() { startScreensaver(false); }, IDLE_MS);
}

["mousemove", "mousedown", "keydown", "wheel", "touchstart"].forEach(function(type) {
    window.addEventListener(type, onActivity, { capture: true, passive: true });
});
onActivity();

makeElementDraggable("screensaver-icon-group", function() { startScreensaver(true); });

// ===== Tip of the Day ========================================================
// Pops up after the welcome window closes, unless "Show tips at startup" has
// been unticked. Help > Tip of the Day brings it back any time.

var TIPS = [
    "To open a window, click its icon. To close a window, click the X. To close all windows, go outside.",
    "The dino on the horizon has been walking since 1998. He has not arrived yet. Please do not tell him.",
    "If you stare at the lava lamp long enough, it stares back. This is normal.",
    "Remember to drink water. Your monitor cannot do it for you.",
    "Pressing Escape will not help you escape griffinland. Nothing will. Welcome home.",
    "Every time someone opens not-a-virus.exe, a lava lamp gets its wings.",
    "Sign the guestbook! It's the law. (It is not the law.)",
    "The calculator is 100% accurate about everything except feelings.",
    "Leave your mouse alone for two minutes and something beautiful happens.",
    "Your visitor number is special. So are you. Mostly you.",
    "griffinland is best viewed at 800×600. You are best viewed at any size.",
    "Sparkles can be turned off under View > Sparkle trail. But why would you.",
    "The sun and the moon have never met. Please do not bring it up.",
    "If you can read this, you're too close to the screen. Just kidding. Come closer.",
    "Every window here was hand-made by tiny digital elves. Tip them in compliments.",
    "Today's lucky number is the one on the hit counter. Go look. We'll wait."
];
var tipIndex = Math.floor(Math.random() * TIPS.length);

var tips = makeWindow({ id: "tips-window", title: "Tip of the Day", icon: "gifs/tips.png", className: "gl-tips" });
tips.body.innerHTML =
    '<div class="gl-tips-main">' +
        '<img src="gifs/tips.png" alt="" class="gl-tips-bulb" draggable="false">' +
        '<div class="gl-tips-card">' +
            '<div class="gl-tips-heading">Did you know...</div>' +
            '<div class="gl-tips-text" aria-live="polite"></div>' +
        '</div>' +
    '</div>' +
    '<div class="gl-tips-footer">' +
        '<label class="gl-tips-startup"><input type="checkbox"> Show tips at startup</label>' +
        '<div class="gl-buttons"></div>' +
    '</div>';
var tipText = tips.body.querySelector(".gl-tips-text");
var tipStartup = tips.body.querySelector(".gl-tips-startup input");
tipStartup.checked = load("gl-tips-startup", true);
tipStartup.addEventListener("change", function() { save("gl-tips-startup", tipStartup.checked); });

var nextTip = el("button", "gl-btn", "Next Tip");
nextTip.type = "button";
nextTip.addEventListener("click", function() {
    tipIndex = (tipIndex + 1) % TIPS.length;
    tipText.textContent = TIPS[tipIndex];
});
var closeTips = el("button", "gl-btn", "Close");
closeTips.type = "button";
closeTips.addEventListener("click", function() { closeWindow(tips.win); });
tips.body.querySelector(".gl-buttons").appendChild(nextTip);
tips.body.querySelector(".gl-buttons").appendChild(closeTips);

function showTips() {
    tipText.textContent = TIPS[tipIndex];
    openWindow(tips.win);
}

// Startup: once the welcome window has come and gone
(function() {
    var welcome = document.getElementById("welcome-window");
    if (!welcome) return;
    var seen = false, done = false;
    new MutationObserver(function() {
        var shown = welcome.getClientRects().length > 0;
        if (shown) seen = true;
        if (seen && !shown && !done) {
            done = true;
            if (tipStartup.checked) setTimeout(showTips, 350);
        }
    }).observe(welcome, { attributes: true, attributeFilter: ["style"] });
})();

// ===== Hit counter ===========================================================
// A fake odometer that only ever goes up: a base number, plus a bit for every
// day since launch, plus every visit from this browser. The digits roll into
// place like a slot machine.

var COUNTER_BASE = 3807;
var COUNTER_LAUNCH = Date.UTC(2025, 0, 1);
var visits = load("gl-visits", 0) + 1;
save("gl-visits", visits);
var visitorNumber = COUNTER_BASE + Math.floor((Date.now() - COUNTER_LAUNCH) / 86400000) * 13 + visits;

(function() {
    var box = document.getElementById("gl-counter-digits");
    var digits = String(visitorNumber).padStart(6, "0").slice(-6).split("");
    var strips = digits.map(function() {
        var cell = el("span", "gl-digit");
        var strip = el("span", "gl-digit-strip", "0\n1\n2\n3\n4\n5\n6\n7\n8\n9");
        cell.appendChild(strip);
        box.appendChild(cell);
        return strip;
    });
    box.setAttribute("aria-label", String(visitorNumber));
    onDesktopReady(function() {
        setTimeout(function() {
            strips.forEach(function(strip, i) {
                strip.style.transitionDelay = (i * 0.12) + "s";
                strip.style.transform = "translateY(" + (-Number(digits[i])) + "em)";
            });
        }, 600);
    });
})();

document.getElementById("gl-webring-random").addEventListener("click", function(e) {
    e.preventDefault();
    window.location.href = Math.random() < 0.5 ? "https://mocial.org/" : "https://griffinlaszlo.com/";
});

// ===== The horizon ===========================================================
// A white line-drawn treeline across the bottom of the desktop, with a
// chairlift running over it: the cable and its towers are drawn in with the
// trees, and the chairs (one of them carrying griffin) ride along on top.
// Redrawn to fit whenever the window changes size.

var GROUND_Y = 160;              // the ground line, in the horizon's 170px
var CABLE_LEFT = 34;             // the cable's height at the left edge...
var CABLE_RIGHT = 16;            // ...and the right, so it climbs a little
var LIFT_SECONDS = 70;           // one chair's trip across the screen

function cableY(x, W) {
    return CABLE_LEFT + (CABLE_RIGHT - CABLE_LEFT) * (x / W);
}

function drawTrees() {
    var holder = document.querySelector("#gl-horizon .gl-trees");
    if (!holder) return;
    var W = Math.max(320, window.innerWidth);
    var base = GROUND_Y;
    var d = "";

    var x = rand(10, 40);
    while (x < W) {
        var h = rand(26, 62), w = h * 0.36;
        var top = base - h;
        // A three-tier pine in outline, then its trunk
        d += "M" + x + " " + top +
             " L" + (x - w * 0.55) + " " + (top + h * 0.38) + " L" + (x - w * 0.25) + " " + (top + h * 0.38) +
             " L" + (x - w * 0.8) + " " + (top + h * 0.7) + " L" + (x - w * 0.4) + " " + (top + h * 0.7) +
             " L" + (x - w) + " " + (base - 6) + " L" + (x + w) + " " + (base - 6) +
             " L" + (x + w * 0.4) + " " + (top + h * 0.7) + " L" + (x + w * 0.8) + " " + (top + h * 0.7) +
             " L" + (x + w * 0.25) + " " + (top + h * 0.38) + " L" + (x + w * 0.55) + " " + (top + h * 0.38) + " Z" +
             " M" + x + " " + (base - 6) + " V" + base;
        // and now and then a tuft of grass
        if (Math.random() < 0.5) {
            var g = x + w + rand(10, 30);
            d += " M" + g + " " + base + " l3 -7 l3 7 M" + (g + 4) + " " + base + " l3 -5 l3 5";
        }
        x += rand(70, 190);
    }

    // The lift: one cable climbing gently left to right...
    d += " M0 " + cableY(0, W) + " L" + W + " " + cableY(W, W);
    // ...held up by towers - a tapered pole, a cross-arm and two sheaves
    for (var t = 170; t < W; t += 380) {
        var cy = cableY(t, W);
        d += " M" + (t - 5) + " " + base + " L" + (t - 2) + " " + (cy + 6) +
             " M" + (t + 5) + " " + base + " L" + (t + 2) + " " + (cy + 6) +
             " M" + (t - 4) + " " + (base - 30) + " H" + (t + 4) +
             " M" + (t - 3) + " " + (base - 70) + " H" + (t + 3) +
             " M" + (t - 16) + " " + (cy + 6) + " H" + (t + 16) +
             " M" + (t - 11) + " " + (cy + 6) + " V" + (cy + 2) + " M" + (t + 11) + " " + (cy + 6) + " V" + (cy + 2);
    }

    holder.innerHTML = '<svg viewBox="0 0 ' + W + ' 170" width="' + W + '" height="170"><path d="' + d + '"/></svg>';
}

// An empty chair in the same white line art as the trees: the hanger, the
// bar, the seat and a footrest
var EMPTY_CHAIR_SVG =
    '<svg viewBox="0 0 40 52" width="34" height="44">' +
        '<path d="M20 1 V16 M9 16 H31 M9 16 V36 M31 16 V36 M5 36 H35 M5 36 V41 H35 V36 M11 41 V49 H29 V41"/>' +
    '</svg>';
var LIFT_CHAIRS = 6;
var riderChair = null;   // griffin's chair - see "griffin, on the lift"

function buildLift() {
    var lift = document.querySelector("#gl-horizon .gl-lift");
    if (!lift) return;
    for (var i = 0; i < LIFT_CHAIRS; i++) {
        var chair = el("div", "gl-chair");
        var swing = el("div", "gl-chair-swing");
        if (i === 0) {
            // griffin, riding up with a drink
            chair.classList.add("gl-chair-griffin");
            var img = el("img", "gl-rider");
            img.src = "gifs/chairlift.png";
            img.alt = "griffin";
            img.title = "griffin";
            img.draggable = false;
            swing.appendChild(img);
            riderChair = chair;
        } else {
            swing.innerHTML = EMPTY_CHAIR_SVG;
        }
        // Spread evenly along the cable, each a slice of the trip ahead
        chair.style.animationDelay = (-LIFT_SECONDS * i / LIFT_CHAIRS) + "s";
        swing.style.animationDelay = (-i * 0.7) + "s";
        if (REDUCED_MOTION) {
            var x = (i + 0.5) / LIFT_CHAIRS * window.innerWidth;
            chair.style.left = x + "px";
            chair.style.top = (cableY(x, window.innerWidth) - 3) + "px";
        }
        chair.appendChild(swing);
        lift.appendChild(chair);
    }
}

drawTrees();
buildLift();
var treeTimer = null;
window.addEventListener("resize", function() {
    clearTimeout(treeTimer);
    treeTimer = setTimeout(drawTrees, 200);
});

// ===== griffin, on the lift ==================================================
// The rider on the chairlift is a character. Left alone he chats, hums and
// sips his beer. Hover and he says hi. Click and he does something - talks,
// throws a snowball at your screen, takes a sip, yodels, throws a shaka, or
// stops the whole lift so everyone's left dangling. He calls first chair on
// the way in and says goodbye on the way out.

(function setUpRider() {
    if (!riderChair) return;
    var chair = riderChair;
    var rider = chair.querySelector(".gl-rider");

    var LINES = [
        "first chair, baby!",
        "pow day!!!",
        "this lift is sooo slow",
        "want a sip? ...too bad",
        "is it après yet? it's always après.",
        "don't look down. i looked down.",
        "welcome to griffinland!",
        "nice cursor. very sparkly.",
        "i've been on this lift since 2025",
        "have you signed my guestbook?",
        "that dino is SO slow",
        "send it.",
        "my goggles are fogging up",
        "who keeps opening not-a-virus.exe",
        "the calculator says i'm 100% vibes",
        "if this lift stops i'm NOT jumping",
        "you look great today btw",
        "ski bum? i prefer ski professional"
    ];
    var HELLOS = ["yo!", "oh hey!", "sup", "hiii", "oh! didn't see you there"];

    // ----- Speech bubble: rides along with the chair -----
    var bubble = el("div", "gl-bubble");
    bubble.hidden = true;
    chair.appendChild(bubble);
    var bubbleTimer = null;
    var spoken = 0;   // counts every line, so a delayed follow-up can tell if he's moved on

    function say(text, ms) {
        spoken++;
        bubble.textContent = text;
        bubble.hidden = false;
        // Near the right edge the bubble opens to the left, to stay on screen
        bubble.classList.toggle("gl-bubble-left", chair.getBoundingClientRect().left > window.innerWidth - 220);
        bubble.classList.remove("pop");
        void bubble.offsetWidth;
        bubble.classList.add("pop");
        clearTimeout(bubbleTimer);
        bubbleTimer = setTimeout(function() { bubble.hidden = true; }, ms || 2800);
    }

    // Lines without repeats until they've all been said
    var lineDeck = [];
    function nextLine() {
        if (!lineDeck.length) lineDeck = LINES.slice().sort(function() { return Math.random() - 0.5; });
        return lineDeck.pop();
    }

    // A point on his drawing, as fractions of the picture: 0.74, 0.3 is his
    // raised hand, 0.45, 0.22 his head
    function spot(fx, fy) {
        var r = rider.getBoundingClientRect();
        return { x: r.left + r.width * fx, y: r.top + r.height * fy };
    }

    function isOnScreen() {
        var r = chair.getBoundingClientRect();
        return r.right > 40 && r.left < window.innerWidth - 40;
    }

    // ----- What he does -----

    function talk() {
        say(nextLine());
    }

    function sip() {
        say(pick(["*sip*", "*gulp*", "*slurp*"]), 1400);
        rider.classList.remove("gl-sip");
        void rider.offsetWidth;
        rider.classList.add("gl-sip");
        var said = spoken;
        setTimeout(function() {
            if (spoken === said) say(pick(["ahh.", "refreshing.", "that's the stuff"]), 1600);
        }, 1500);
    }

    function hum() {
        say(pick(["yodel-ay-ee-hoo ♪", "♪ la la laaa ♪", "♪ do do doo ♪"]), 2400);
        var head = spot(0.45, 0.2);
        for (var i = 0; i < 4; i++) {
            (function(i) {
                setTimeout(function() {
                    var note = el("span", "gl-note", pick(["♪", "♫", "♬"]));
                    note.style.left = (head.x + rand(-8, 8)) + "px";
                    note.style.top = head.y + "px";
                    note.style.setProperty("--nx", rand(-30, 30).toFixed(0) + "px");
                    document.body.appendChild(note);
                    note.addEventListener("animationend", function() { note.remove(); });
                }, i * 260);
            })(i);
        }
    }

    function shaka() {
        say(pick(["shaka, brah", "hang loose", "stay rad"]), 1800);
        var hand = spot(0.74, 0.3);
        for (var i = 0; i < 10; i++) {
            var angle = (i / 10) * Math.PI * 2;
            var dist = rand(20, 36);
            var spark = el("span", "gl-burst", pick(["✦", "✧", "✶"]));
            spark.style.left = hand.x + "px";
            spark.style.top = hand.y + "px";
            spark.style.color = pick(SPARKLE_COLORS);
            spark.style.setProperty("--bx", (Math.cos(angle) * dist).toFixed(0) + "px");
            spark.style.setProperty("--by", (Math.sin(angle) * dist).toFixed(0) + "px");
            document.body.appendChild(spark);
            spark.addEventListener("animationend", function() { this.remove(); });
        }
    }

    // A snowball from his raised hand, arcing up and getting bigger as it
    // comes at you, until it splats on the glass
    function throwSnowball() {
        say(pick(["snowball fight!", "incoming!", "heads up!"]), 1600);
        var from = spot(0.74, 0.3);
        var to = { x: rand(window.innerWidth * 0.2, window.innerWidth * 0.8), y: rand(90, window.innerHeight * 0.45) };
        if (REDUCED_MOTION) {
            splat(to);
            return;
        }
        var ball = el("div", "gl-snowball");
        document.body.appendChild(ball);
        var start = performance.now();
        var DURATION = 850;
        function fly(now) {
            var t = Math.min(1, (now - start) / DURATION);
            var x = from.x + (to.x - from.x) * t;
            var y = from.y + (to.y - from.y) * t - Math.sin(Math.PI * t) * 160;
            var scale = 0.6 + t * 1.6;
            ball.style.transform = "translate(" + x + "px," + y + "px) translate(-50%, -50%) scale(" + scale + ")";
            if (t < 1) {
                requestAnimationFrame(fly);
            } else {
                ball.remove();
                splat(to);
            }
        }
        requestAnimationFrame(fly);
    }

    function splat(at) {
        var mark = el("div", "gl-splat");
        mark.style.left = at.x + "px";
        mark.style.top = at.y + "px";
        mark.appendChild(el("span", "gl-splat-blob"));
        for (var i = 0; i < 9; i++) {
            var angle = rand(0, Math.PI * 2);
            var dist = rand(55, 90);
            var fleck = el("span", "gl-fleck");
            fleck.style.setProperty("--fx", (Math.cos(angle) * dist).toFixed(0) + "px");
            fleck.style.setProperty("--fy", (Math.sin(angle) * dist).toFixed(0) + "px");
            fleck.style.width = fleck.style.height = rand(6, 14).toFixed(0) + "px";
            mark.appendChild(fleck);
        }
        mark.appendChild(el("span", "gl-splat-word", "SPLAT!"));
        document.body.appendChild(mark);
        setTimeout(function() { mark.classList.add("melt"); }, 1900);
        setTimeout(function() { mark.remove(); }, 3400);
    }

    // Every chair stops dead and swings; then the lift lurches back into life
    var liftStopped = false;
    function stopLift() {
        if (liftStopped) return talk();
        liftStopped = true;
        say("uh oh... lift's stopped", 3200);
        var chairs = document.querySelectorAll(".gl-chair");
        var swings = document.querySelectorAll(".gl-chair-swing");
        [].forEach.call(chairs, function(c) { c.style.animationPlayState = "paused"; });
        [].forEach.call(swings, function(s) { s.classList.add("gl-swing-hard"); });
        setTimeout(function() {
            [].forEach.call(chairs, function(c) { c.style.animationPlayState = ""; });
            say("and we're moving!", 2000);
            setTimeout(function() {
                [].forEach.call(swings, function(s) { s.classList.remove("gl-swing-hard"); });
                liftStopped = false;
            }, 1600);
        }, 4500);
    }

    // ----- Clicks: a different thing each time, never the same twice running -----
    var ACTIONS = [talk, talk, throwSnowball, throwSnowball, sip, hum, shaka, stopLift];
    var lastAction = null;
    rider.addEventListener("click", function() {
        var action;
        do { action = pick(ACTIONS); } while (action === lastAction);
        lastAction = action;
        action();
    });

    // ----- Hover: he notices you -----
    var lastHello = 0;
    rider.addEventListener("mouseenter", function() {
        rider.classList.add("gl-noticed");
        if (Date.now() - lastHello > 8000 && bubble.hidden) {
            lastHello = Date.now();
            say(pick(HELLOS), 1500);
        }
    });
    rider.addEventListener("mouseleave", function() {
        rider.classList.remove("gl-noticed");
    });

    // ----- Left alone: every so often he chats, hums or sips -----
    function idle() {
        if (!document.hidden && !isGated() && !saver && isOnScreen() && bubble.hidden) {
            var roll = Math.random();
            if (roll < 0.6) talk();
            else if (roll < 0.8) hum();
            else sip();
        }
        setTimeout(idle, rand(12000, 24000));
    }
    setTimeout(idle, rand(6000, 12000));

    // ----- The ride: first chair on the way in, goodbye on the way out -----
    if (!REDUCED_MOTION) {
        var lap = { arrived: false, leaving: false };
        setInterval(function() {
            if (document.hidden || isGated()) return;
            var x = chair.getBoundingClientRect().left;
            if (x < 0) {
                lap.arrived = lap.leaving = false;
            } else if (x > 30 && !lap.arrived) {
                lap.arrived = true;
                if (bubble.hidden) say(pick(["first chair, baby!", "here we go!", "weeee"]), 2200);
            } else if (x > window.innerWidth - 170 && !lap.leaving) {
                lap.leaving = true;
                if (bubble.hidden) say(pick(["see ya!", "catch you next lap", "bye bye!"]), 2200);
            }
        }, 700);
    }
})();

// ===== Calculator ============================================================
// Works like the Windows one (each operator applies to the running total), with
// a ✦ key for luck and some opinions about dividing by zero.

var calc = makeWindow({ id: "calculator-window", title: "Calculator", icon: "icons/calculator.svg", className: "gl-calc" });
var calcState = { display: "0", acc: null, op: null, fresh: true, error: false };
var calcDisplay = el("div", "gl-calc-display", "0");
calc.body.appendChild(calcDisplay);

var CALC_KEYS = [
    ["C", "clear", "red"], ["CE", "clearEntry", "red"], ["←", "back", "red"], ["÷", "op"], ["√", "sqrt"],
    ["7"], ["8"], ["9"], ["×", "op"], ["%", "percent"],
    ["4"], ["5"], ["6"], ["−", "op"], ["1/x", "inverse"],
    ["1"], ["2"], ["3"], ["+", "op"], ["✦", "luck", "gold"],
    ["±", "negate"], ["0"], [".", "dot"], ["=", "equals", "wide"]
];
var calcKeys = el("div", "gl-calc-keys");
CALC_KEYS.forEach(function(k) {
    var key = el("button", "gl-calc-key" + (k[2] ? " gl-calc-" + k[2] : ""), k[0]);
    key.type = "button";
    key.addEventListener("click", function() { calcPress(k[0], k[1] || "digit"); });
    calcKeys.appendChild(key);
});
calc.body.appendChild(calcKeys);

function calcShow(text) {
    calcState.display = text;
    calcDisplay.textContent = text;
}

function calcValue() {
    return parseFloat(calcState.display) || 0;
}

function calcFormat(n) {
    if (!isFinite(n)) return null;
    var s = String(parseFloat(n.toPrecision(12)));
    return s.length > 16 ? n.toExponential(8) : s;
}

function calcFail(message) {
    calcState.error = true;
    calcState.acc = null;
    calcState.op = null;
    calcState.fresh = true;
    calcShow(message);
}

function calcApply(a, b, op) {
    if (op === "÷" && b === 0) return null;
    if (op === "+") return a + b;
    if (op === "−") return a - b;
    if (op === "×") return a * b;
    return a / b;
}

function calcPress(label, kind) {
    if (calcState.error && kind !== "digit" && kind !== "clear" && kind !== "dot") return;
    if (calcState.error) {
        calcState.error = false;
        calcState.fresh = true;
    }

    if (kind === "digit") {
        if (calcState.fresh) {
            calcShow(label);
            calcState.fresh = false;
        } else if (calcState.display.length < 16) {
            calcShow(calcState.display === "0" ? label : calcState.display + label);
        }
    } else if (kind === "dot") {
        if (calcState.fresh) {
            calcShow("0.");
            calcState.fresh = false;
        } else if (calcState.display.indexOf(".") === -1) {
            calcShow(calcState.display + ".");
        }
    } else if (kind === "op" || kind === "equals") {
        if (calcState.op && !calcState.fresh) {
            var result = calcApply(calcState.acc, calcValue(), calcState.op);
            if (result === null) return calcFail("nice try.");
            var shown = calcFormat(result);
            if (shown === null) return calcFail("too big. wow.");
            calcShow(shown);
        }
        calcState.acc = kind === "op" ? calcValue() : null;
        calcState.op = kind === "op" ? label : null;
        calcState.fresh = true;
    } else if (kind === "clear") {
        calcState.acc = null;
        calcState.op = null;
        calcState.fresh = true;
        calcShow("0");
    } else if (kind === "clearEntry") {
        calcState.fresh = true;
        calcShow("0");
    } else if (kind === "back") {
        if (!calcState.fresh) calcShow(calcState.display.length > 1 ? calcState.display.slice(0, -1) : "0");
    } else if (kind === "negate") {
        calcShow(calcFormat(-calcValue()));
    } else if (kind === "sqrt") {
        if (calcValue() < 0) return calcFail("imaginary vibes");
        calcShow(calcFormat(Math.sqrt(calcValue())));
        calcState.fresh = true;
    } else if (kind === "percent") {
        calcShow(calcFormat(calcState.acc !== null ? calcState.acc * calcValue() / 100 : calcValue() / 100));
        calcState.fresh = true;
    } else if (kind === "inverse") {
        if (calcValue() === 0) return calcFail("nice try.");
        calcShow(calcFormat(1 / calcValue()));
        calcState.fresh = true;
    } else if (kind === "luck") {
        calcShow(pick(["7", "777", "11.11", "1000000", String(visitorNumber)]));
        calcState.fresh = true;
        calcDisplay.classList.remove("lucky");
        void calcDisplay.offsetWidth;
        calcDisplay.classList.add("lucky");
    }
}

// Typing works while the calculator was the last window clicked
var calcActive = false;
document.addEventListener("mousedown", function(e) {
    calcActive = calc.win.contains(e.target);
});
document.addEventListener("keydown", function(e) {
    if (!calcActive || $(calc.win).is(":hidden") || /INPUT|TEXTAREA/.test(e.target.tagName)) return;
    var map = { "+": ["+", "op"], "-": ["−", "op"], "*": ["×", "op"], "/": ["÷", "op"],
                "Enter": ["=", "equals"], "=": ["=", "equals"], "Backspace": ["←", "back"],
                "Escape": ["C", "clear"], ".": [".", "dot"], "%": ["%", "percent"] };
    if (/^[0-9]$/.test(e.key)) calcPress(e.key, "digit");
    else if (map[e.key]) calcPress(map[e.key][0], map[e.key][1]);
    else return;
    e.preventDefault();
});

calc.win.insertBefore(buildMenuBar(calc.win, standardMenus(calc.win, {
    edit: [{ label: "Copy", action: function() {
        if (navigator.clipboard) navigator.clipboard.writeText(calcState.display).catch(function() {});
    } }, "-"],
    view: [{ label: "Standard", checked: true }, { label: "Scientific", disabled: true, hint: "v2" }, "-"]
})), calc.body);

makeElementDraggable("calculator-icon-group", function() {
    openWindow(calc.win, document.getElementById("calculator-icon-group"));
});

// ===== Guestbook =============================================================
// Sign My Guestbook!! Entries are kept in this browser's localStorage for now -
// the site is static files on GitHub Pages, with nowhere to keep everyone's
// entries. guestbookStore is the one place that would change to make it
// shared: swap its two functions for calls to a real backend.

var GUESTBOOK_SEED = [
    { name: "the sun", from: "everywhere, basically", message: "tell the moon i said nothing", mood: "sun.gif", date: "2000-01-01" },
    { name: "tomato", from: "the produce aisle", message: "doctors hate me!!! sign my guestbook too!!!", mood: "tomato.gif", date: "2000-06-17" },
    { name: "dino", from: "the horizon", message: "still walking. will report back when i get there", mood: "dino.png", date: "2001-03-02" },
    { name: "lava lamp #3", from: "hot singles chat", message: "anyone else here just vibing", mood: "lavalamp.gif", date: "1998-12-24" },
    { name: "the moon", from: "the sky (night shift)", message: "love what you've done with the place. very bright. too bright honestly", mood: "moon.gif", date: "1999-08-11" }
];
var GUESTBOOK_MOODS = ["dancing.gif", "cat.png", "sun.gif", "moon.gif", "tomato.gif", "lavalamp.gif", "earth.gif", "cd1.png"];

var guestbookStore = {
    list: function() {
        return load("gl-guestbook", []).concat(GUESTBOOK_SEED);
    },
    add: function(entry) {
        var mine = load("gl-guestbook", []);
        mine.unshift(entry);
        save("gl-guestbook", mine.slice(0, 200));
    }
};

var gb = makeWindow({ id: "guestbook-window", title: "Guestbook", icon: "icons/guestbook.svg", className: "gl-guestbook" });
gb.body.innerHTML =
    '<div class="gl-gb-hero">' +
        '<div class="gl-gb-title-row">' +
            '<img src="gifs/mail.gif" alt="" draggable="false">' +
            '<div class="gl-gb-title">Sign My Guestbook!!</div>' +
            '<img src="gifs/diskspin.gif" alt="" draggable="false">' +
        '</div>' +
        '<div class="gl-gb-sub">Thanks for stopping by griffinland! Leave a little note before you go.</div>' +
        '<div class="gl-gb-cta"></div>' +
    '</div>' +
    '<form class="gl-gb-form" hidden>' +
        '<label>Your name <input name="name" maxlength="40" required autocomplete="off"></label>' +
        '<label>Where are you from? <input name="from" maxlength="60" autocomplete="off"></label>' +
        '<label>Your homepage <input name="homepage" maxlength="200" placeholder="http://" autocomplete="off"></label>' +
        '<label>Your message <textarea name="message" maxlength="300" rows="4" required></textarea></label>' +
        '<fieldset class="gl-gb-moods"><legend>Your mood today</legend></fieldset>' +
        '<div class="gl-gb-error" aria-live="polite"></div>' +
        '<div class="gl-buttons"><button type="submit" class="gl-btn">Sign it!</button><button type="button" class="gl-btn gl-gb-cancel">Cancel</button></div>' +
    '</form>' +
    '<div class="gl-gb-count"></div>' +
    '<ol class="gl-gb-entries"></ol>';

var gbForm = gb.body.querySelector(".gl-gb-form");
var gbMoods = gb.body.querySelector(".gl-gb-moods");
GUESTBOOK_MOODS.forEach(function(mood, i) {
    var label = el("label", "gl-gb-mood-pick");
    var radio = el("input");
    radio.type = "radio";
    radio.name = "mood";
    radio.value = mood;
    if (i === 0) radio.checked = true;
    var img = el("img");
    img.src = "gifs/" + mood;
    img.alt = mood.split(".")[0];
    img.draggable = false;
    label.appendChild(radio);
    label.appendChild(img);
    gbMoods.appendChild(label);
});

function openGuestbookForm() {
    gbForm.hidden = false;
    gbForm.elements.name.focus();
}

gb.body.querySelector(".gl-gb-cta").appendChild(asciiButton("SIGN THE GUESTBOOK", openGuestbookForm));
gb.body.querySelector(".gl-gb-cancel").addEventListener("click", function() {
    gbForm.reset();
    gbForm.hidden = true;
});

function formatGuestbookDate(iso) {
    var d = new Date(iso + (iso.length === 10 ? "T12:00:00" : ""));
    return d.toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });
}

function renderGuestbook() {
    var list = gb.body.querySelector(".gl-gb-entries");
    var entries = guestbookStore.list();
    list.textContent = "";
    gb.body.querySelector(".gl-gb-count").textContent =
        entries.length + " lovely people have signed the guestbook";

    entries.forEach(function(entry) {
        var li = el("li", "gl-gb-entry");
        var mood = el("img", "gl-gb-mood");
        mood.src = "gifs/" + (GUESTBOOK_MOODS.indexOf(entry.mood) !== -1 || entry.mood === "dino.png" ? entry.mood : "dancing.gif");
        mood.alt = "";
        mood.draggable = false;
        li.appendChild(mood);

        var text = el("div", "gl-gb-entry-text");
        var head = el("div", "gl-gb-name", entry.name);
        if (entry.from) head.appendChild(el("span", "gl-gb-from", " from " + entry.from));
        text.appendChild(head);
        text.appendChild(el("div", "gl-gb-date", formatGuestbookDate(entry.date)));
        text.appendChild(el("p", "gl-gb-msg", entry.message));
        if (entry.homepage) {
            var a = el("a", "gl-gb-home", entry.homepage);
            a.href = entry.homepage;
            a.target = "_blank";
            a.rel = "nofollow noopener";
            text.appendChild(a);
        }
        li.appendChild(text);
        list.appendChild(li);
    });
}

gbForm.addEventListener("submit", function(e) {
    e.preventDefault();
    var f = gbForm.elements;
    var name = f.name.value.trim();
    var message = f.message.value.trim();
    var homepage = f.homepage.value.trim();
    var error = gb.body.querySelector(".gl-gb-error");

    if (!name || !message) {
        error.textContent = "Please fill in your name and a message!";
        return;
    }
    // Only real web links - anything else (javascript: and friends) is dropped
    if (homepage && !/^https?:\/\/[^\s]+\.[^\s]+$/i.test(homepage)) {
        if (/^[^\s:]+\.[^\s]+$/.test(homepage)) homepage = "http://" + homepage;
        else homepage = "";
    }
    error.textContent = "";

    guestbookStore.add({
        name: name,
        from: f.from.value.trim(),
        homepage: homepage,
        message: message,
        mood: gbForm.querySelector("input[name=mood]:checked").value,
        date: new Date().toISOString().slice(0, 10)
    });
    gbForm.reset();
    gbForm.hidden = true;
    renderGuestbook();
    gb.body.scrollTop = 0;
});

gb.win.insertBefore(buildMenuBar(gb.win, standardMenus(gb.win, {
    file: [{ label: "Sign the guestbook...", action: openGuestbookForm }, "-"]
})), gb.body);

renderGuestbook();

makeElementDraggable("guestbook-icon-group", function() {
    openWindow(gb.win, document.getElementById("guestbook-icon-group"));
});

// ===== Startup ===============================================================
// The parked ad slides onto the desktop shortly after it appears

onDesktopReady(function() {
    setTimeout(function() {
        if (!isMobileLayout()) {
            promo.win.style.left = "24px";
            promo.win.style.top = "110px";
            promo.win.setAttribute("data-placed", "1");
        }
        openWindow(promo.win);
    }, 1600);
});

})();
