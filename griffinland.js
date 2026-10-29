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
                { label: "Snow trail", checked: sparklesOn, action: toggleSparkles },
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

// ===== Snow trail ============================================================
// Snowflakes drift down off the cursor, swaying gently as they fall. On by
// default; View > Snow trail turns it off, remembered per browser. Skipped on
// touch screens and for anyone who's asked for less motion.

var sparklesOn = load("gl-sparkles", true);
var SNOW_GLYPHS = ["❄", "❅", "❆", "•", "•"];
var liveSparkles = 0;
var lastSparkle = null;

function toggleSparkles() {
    sparklesOn = !sparklesOn;
    save("gl-sparkles", sparklesOn);
}

document.addEventListener("mousemove", function(e) {
    if (!sparklesOn || REDUCED_MOTION || NO_HOVER || liveSparkles > 50) return;
    if (lastSparkle && Math.abs(e.clientX - lastSparkle.x) + Math.abs(e.clientY - lastSparkle.y) < 22) return;
    lastSparkle = { x: e.clientX, y: e.clientY };

    // An outer span falls, an inner one sways - two smooth motions rather
    // than one many-stepped one, which is what made the old trail jitter
    var flake = el("span", "gl-sparkle");
    var drift = el("span", null, pick(SNOW_GLYPHS));
    flake.appendChild(drift);
    flake.style.left = (e.clientX + rand(-6, 6)) + "px";
    flake.style.top = e.clientY + "px";
    flake.style.fontSize = rand(8, 15).toFixed(0) + "px";
    flake.style.setProperty("--fall", rand(140, 260).toFixed(0) + "px");
    flake.style.setProperty("--alpha", rand(0.6, 1).toFixed(2));
    flake.style.animationDuration = rand(3, 4.6).toFixed(2) + "s";
    drift.style.setProperty("--sway", rand(5, 12).toFixed(0) + "px");
    drift.style.animationDuration = rand(1.1, 1.8).toFixed(2) + "s";
    document.body.appendChild(flake);
    liveSparkles++;
    flake.addEventListener("animationend", function(ev) {
        if (ev.target !== flake) return;
        flake.remove();
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
// A real one: every visit is counted on Abacus (abacus.jasoncameron.dev), a
// free hit-counter service - griffinland is static files, with nowhere of its
// own to keep a count. Each browser session counts once, so reloading doesn't
// pad the number. The digits roll into place like an odometer once the
// desktop's showing; if the service can't be reached the counter just hides
// rather than show a made-up number.

var COUNTER_URL = "https://abacus.jasoncameron.dev/";
// Local copies count on a separate test key, so testing never pads the real one
var COUNTER_KEY = window.IS_LOCAL ? "griffinlaszlo-dev/visitors" : "griffinlaszlo/visitors";
var visitorNumber = null;

(function() {
    var box = document.getElementById("gl-counter-digits");
    var counter = box.closest(".gl-counter");
    var strips = [];
    for (var i = 0; i < 6; i++) {
        var cell = el("span", "gl-digit");
        var strip = el("span", "gl-digit-strip", "0\n1\n2\n3\n4\n5\n6\n7\n8\n9");
        cell.appendChild(strip);
        box.appendChild(cell);
        strips.push(strip);
    }

    function roll(value) {
        var digits = String(value).padStart(6, "0").slice(-6).split("");
        box.setAttribute("aria-label", String(value));
        strips.forEach(function(strip, i) {
            strip.style.transitionDelay = (i * 0.12) + "s";
            strip.style.transform = "translateY(" + (-Number(digits[i])) + "em)";
        });
    }

    var counted = false;
    try { counted = sessionStorage.getItem("gl-counted") === "1"; } catch (e) {}

    fetch(COUNTER_URL + (counted ? "get/" : "hit/") + COUNTER_KEY)
        .then(function(res) {
            if (!res.ok) throw new Error(res.status);
            return res.json();
        })
        .then(function(data) {
            if (typeof data.value !== "number") throw new Error("no count");
            try { sessionStorage.setItem("gl-counted", "1"); } catch (e) {}
            visitorNumber = data.value;
            onDesktopReady(function() {
                setTimeout(function() { roll(visitorNumber); }, 600);
            });
        })
        .catch(function() {
            counter.hidden = true;
        });
})();

document.getElementById("gl-webring-random").addEventListener("click", function(e) {
    e.preventDefault();
    window.location.href = Math.random() < 0.5 ? "https://mocial.org/" : "https://griffinlaszlo.com/";
});

// ===== The horizon ===========================================================
// A white line-drawn treeline across the bottom of the desktop, with a
// chairlift running over it: the cable is drawn in with the trees, the
// towers are doodled in colour on their own layer, and the chairs (one of
// them carrying griffin) ride along on top.
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

    holder.innerHTML = '<svg viewBox="0 0 ' + W + ' 170" width="' + W + '" height="170"><path d="' + d + '"/></svg>';

    // The lift's towers, drawn in their own layer so they can be coloured...
    var towers = document.querySelector("#gl-horizon .gl-towers");
    if (towers) {
        var art = "";
        for (var t = 170; t < W; t += 380) art += towerSVG(t, cableY(t, W), base);
        // ...and the cable, climbing gently left to right over their wheels
        art += '<path d="M0 ' + cableY(0, W) + ' L' + W + ' ' + cableY(W, W) + '" stroke="#fff" stroke-width="2" fill="none"/>';
        towers.innerHTML =
            '<svg viewBox="0 0 ' + W + ' 170" width="' + W + '" height="170">' +
                // A touch of wobble on every line, so they look hand-drawn
                '<filter id="gl-doodle"><feTurbulence type="fractalNoise" baseFrequency="0.06" numOctaves="2" seed="7"/>' +
                '<feDisplacementMap in="SourceGraphic" scale="1.8"/></filter>' +
                '<g filter="url(#gl-doodle)">' + art + '</g>' +
            '</svg>';
    }
}

// One lift tower, doodled to sit with the chair art: a blue pole in black ink
// with a highlight and a ladder up its side, a yellow pad and a concrete
// footing at the bottom, and at the top a braced cross-arm carrying the train
// of wheels the cable rides over. t is the tower's x, cy the cable's height
// there and base the ground line.
var TOWER_INK = "#1d1b1b";
var TOWER_BLUE = "#2b74b3";
function towerSVG(t, cy, base) {
    var poleTop = cy + 12;
    var armY = cy + 10;
    var wide = 7, narrow = 4.5;      // half-widths: the pole tapers as it rises
    var ink = ' stroke="' + TOWER_INK + '" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"';
    var svg = "";

    // footing and the yellow safety pad round the base
    svg += '<rect x="' + (t - 11) + '" y="' + (base - 6) + '" width="22" height="7" fill="#c9c2b2"' + ink + '/>';
    // the pole
    svg += '<path d="M' + (t - narrow) + ' ' + poleTop + ' L' + (t + narrow) + ' ' + poleTop +
           ' L' + (t + wide) + ' ' + (base - 6) + ' L' + (t - wide) + ' ' + (base - 6) + ' Z" fill="' + TOWER_BLUE + '"' + ink + '/>';
    svg += '<path d="M' + (t - narrow + 2) + ' ' + (poleTop + 5) + ' L' + (t - wide + 2.5) + ' ' + (base - 28) + '" stroke="#8cc3ea" stroke-width="1.6" stroke-linecap="round"/>';
    svg += '<rect x="' + (t - wide - 1.5) + '" y="' + (base - 26) + '" width="' + (wide * 2 + 3) + '" height="18" rx="2" fill="#f2c230"' + ink + '/>';
    // the ladder up its right side
    var lx = t + wide + 3;
    svg += '<path d="M' + (lx - 1) + ' ' + (poleTop + 18) + ' L' + (lx + 0.5) + ' ' + (base - 28) +
           ' M' + (lx + 4) + ' ' + (poleTop + 18) + ' L' + (lx + 5.5) + ' ' + (base - 28) + '" stroke="' + TOWER_INK + '" stroke-width="1" fill="none"/>';
    var rungs = "";
    for (var y = poleTop + 22; y < base - 30; y += 7) {
        var f = (y - poleTop) / (base - poleTop);
        rungs += ' M' + (lx - 1 + 1.5 * f) + ' ' + y + ' H' + (lx + 4 + 1.5 * f);
    }
    svg += '<path d="' + rungs + '" stroke="' + TOWER_INK + '" stroke-width="1"/>';
    // braces from the pole out to the ends of the cross-arm: ink under blue
    var braces = 'M' + (t - 2) + ' ' + (poleTop + 14) + ' L' + (t - 19) + ' ' + (armY + 2) +
                 ' M' + (t + 2) + ' ' + (poleTop + 14) + ' L' + (t + 19) + ' ' + (armY + 2);
    svg += '<path d="' + braces + '" stroke="' + TOWER_INK + '" stroke-width="5" stroke-linecap="round" fill="none"/>';
    svg += '<path d="' + braces + '" stroke="' + TOWER_BLUE + '" stroke-width="2.4" stroke-linecap="round" fill="none"/>';
    // the cross-arm
    svg += '<rect x="' + (t - 26) + '" y="' + (armY - 3) + '" width="52" height="6" rx="1.5" fill="' + TOWER_BLUE + '"' + ink + '/>';
    // the wheel train: a grey bar, and four wheels whose tops carry the cable
    svg += '<rect x="' + (t - 21) + '" y="' + (cy + 4) + '" width="42" height="4" rx="1" fill="#cfcfcf"' + ink + '/>';
    for (var k = -1.5; k <= 1.5; k++) {
        svg += '<circle cx="' + (t + k * 10) + '" cy="' + (cy + 3.2) + '" r="3.4" fill="#f4f4f4"' + ink + '/>' +
               '<circle cx="' + (t + k * 10) + '" cy="' + (cy + 3.2) + '" r="0.9" fill="' + TOWER_INK + '"/>';
    }
    return svg;
}

var LIFT_CHAIRS = 6;

// griffin's chair is his chairlift art cut into layers (gifs/griffin/, made
// by tools/griffin-rig.py), all the same size so they stack exactly, back to
// front. The base doesn't move; each other part sits in its own wrapper,
// which holds his pose for the moment, around an image that can wiggle on
// top of it (a shaka being shaken, a gulp). The other chairs are the same
// chair with him lifted out.
var RIDER_PARTS = ["leg-right", "leg-left", "head", "arm", "beer"];

// Bump whenever tools/griffin-rig.py rewrites the art. The images keep their
// names, so without this a browser that already has the old ones (GitHub
// Pages says keep them 10 minutes) carries on showing them.
var ART_VERSION = 2;
function art(file) {
    return "gifs/griffin/" + file + "?v=" + ART_VERSION;
}

function buildRider() {
    var rider = el("div", "gl-rider");
    rider.title = "griffin";
    var base = el("img", "glr-base");
    base.src = art("base.png");
    base.alt = "";
    base.draggable = false;
    rider.appendChild(base);
    RIDER_PARTS.forEach(function(part) {
        var wrap = el("div", "glr-part glr-" + part);
        var img = el("img");
        img.src = art(part + ".png");
        img.alt = "";
        img.draggable = false;
        wrap.appendChild(img);
        rider.appendChild(wrap);
    });
    return rider;
}

function buildLift() {
    var lift = document.querySelector("#gl-horizon .gl-lift");
    if (!lift) return;
    for (var i = 0; i < LIFT_CHAIRS; i++) {
        var chair = el("div", "gl-chair");
        var swing = el("div", "gl-chair-swing");
        if (i === 0) {
            chair.classList.add("gl-chair-griffin");
            swing.appendChild(buildRider());
        } else {
            var empty = el("img", "gl-chair-empty");
            empty.src = art("empty-chair.png");
            empty.alt = "";
            empty.draggable = false;
            swing.appendChild(empty);
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
// Most of the time he's resting: arm draped on the chair back, beer in hand,
// skis dangling. Every few seconds he does one thing - a sip, a shaka, now
// and then both at once, or a look around - and then settles back. Hover and
// he raises the beer to you; move away and he eases back to resting. The
// poses themselves are in griffinland.css; this only picks which one.
(function setUpRider() {
    var rider = document.querySelector(".gl-rider");
    if (!rider) return;

    var ACTIONS = [
        { classes: ["sip"], ms: 3000, weight: 3 },
        { classes: ["shaka"], ms: 2800, weight: 3 },
        { classes: ["sip", "shaka"], ms: 3300, weight: 1 },
        { classes: ["look-left"], ms: 2400, weight: 2 },
        { classes: ["look-right"], ms: 2400, weight: 2 }
    ];
    var current = [];
    var last = null;
    var hovering = false;
    var timer = null;

    function settle() {
        current.forEach(function(c) { rider.classList.remove(c); });
        current = [];
    }

    // Weighted, and never the same thing twice running
    function pickAction() {
        var total = 0;
        ACTIONS.forEach(function(a) { if (a !== last) total += a.weight; });
        var roll = Math.random() * total;
        for (var i = 0; i < ACTIONS.length; i++) {
            if (ACTIONS[i] === last) continue;
            roll -= ACTIONS[i].weight;
            if (roll < 0) return ACTIONS[i];
        }
        return ACTIONS[0];
    }

    function next() {
        if (hovering || document.hidden || isGated()) {
            timer = setTimeout(next, 2000);
            return;
        }
        var action = last = pickAction();
        current = action.classes.slice();
        current.forEach(function(c) { rider.classList.add(c); });
        timer = setTimeout(function() {
            settle();
            timer = setTimeout(next, rand(2500, 5500));
        }, action.ms);
    }

    rider.addEventListener("mouseenter", function() {
        hovering = true;
        clearTimeout(timer);
        settle();
        rider.classList.add("cheers");
    });
    rider.addEventListener("mouseleave", function() {
        hovering = false;
        rider.classList.remove("cheers");
        timer = setTimeout(next, 3000);
    });

    // Holding still for anyone who's asked for less motion: he rests, and
    // only the hover cheers (a pose, not an animation) still happens
    if (!REDUCED_MOTION) timer = setTimeout(next, rand(1500, 4000));
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
        calcShow(pick(["7", "777", "11.11", "1000000"].concat(visitorNumber ? [String(visitorNumber)] : [])));
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
// Sign My Guestbook!! Entries live in a Supabase table (supabase/guestbook.sql
// sets it up), so everyone sees everyone's. The site talks to Supabase's REST
// API directly - no library to load.
//
// SUPABASE_URL and SUPABASE_KEY come from the project's settings: its URL and
// its publishable key. Both are meant to be public; the table's row-level
// security is what limits that key to reading and signing - never editing or
// deleting. Left blank, the guestbook falls back to keeping entries in this
// browser only.

var SUPABASE_URL = "https://fsoqmwwiypftcbgcczju.supabase.co";
var SUPABASE_KEY = "sb_publishable_OUk0e74Xl963XQ1vL452UA_ITeX2JbU";

var GUESTBOOK_MOODS = ["dancing.gif", "cat.png", "sun.gif", "moon.gif", "tomato.gif", "lavalamp.gif", "earth.gif", "cd1.png"];

function supabaseHeaders(extra) {
    var headers = { apikey: SUPABASE_KEY };
    // Older projects' anon keys are JWTs and go in Authorization too; the
    // newer sb_publishable_ keys only go in apikey
    if (SUPABASE_KEY.indexOf("sb_") !== 0) headers.Authorization = "Bearer " + SUPABASE_KEY;
    for (var k in extra) headers[k] = extra[k];
    return headers;
}

function okOrThrow(res) {
    if (!res.ok) throw new Error("guestbook " + res.status);
    return res;
}

// Both versions return promises, so the rest of the guestbook doesn't care
// which one it's talking to
var guestbookStore = SUPABASE_URL && SUPABASE_KEY ? {
    list: function() {
        return fetch(SUPABASE_URL + "/rest/v1/guestbook" +
                     "?select=name,from_place,homepage,message,mood,created_at" +
                     "&order=created_at.desc&limit=200",
                     { headers: supabaseHeaders() })
            .then(okOrThrow)
            .then(function(res) { return res.json(); })
            .then(function(rows) {
                return rows.map(function(r) {
                    return { name: r.name, from: r.from_place, homepage: r.homepage,
                             message: r.message, mood: r.mood, date: r.created_at };
                });
            });
    },
    add: function(entry) {
        return fetch(SUPABASE_URL + "/rest/v1/guestbook", {
            method: "POST",
            headers: supabaseHeaders({ "Content-Type": "application/json", "Prefer": "return=minimal" }),
            body: JSON.stringify({
                name: entry.name,
                from_place: entry.from || null,
                homepage: entry.homepage || null,
                message: entry.message,
                mood: entry.mood
            })
        }).then(okOrThrow);
    }
} : {
    list: function() {
        return Promise.resolve(load("gl-guestbook", []));
    },
    add: function(entry) {
        var mine = load("gl-guestbook", []);
        mine.unshift(entry);
        save("gl-guestbook", mine.slice(0, 200));
        return Promise.resolve();
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
        // Hidden from people; bots that fill in every field fill this one too
        '<input name="website" class="gl-gb-honey" tabindex="-1" autocomplete="off" aria-hidden="true">' +
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

var gbCount = gb.body.querySelector(".gl-gb-count");

function renderGuestbook() {
    var list = gb.body.querySelector(".gl-gb-entries");
    gbCount.textContent = "Loading the guestbook...";

    return guestbookStore.list().then(function(entries) {
        list.textContent = "";
        gbCount.textContent =
            entries.length === 0 ? "Nobody's signed yet - be the first!" :
            entries.length === 1 ? "1 lovely person has signed the guestbook" :
            entries.length + " lovely people have signed the guestbook";

        entries.forEach(function(entry) {
            var li = el("li", "gl-gb-entry");
            var mood = el("img", "gl-gb-mood");
            mood.src = "gifs/" + (GUESTBOOK_MOODS.indexOf(entry.mood) !== -1 ? entry.mood : "dancing.gif");
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
    }).catch(function() {
        gbCount.textContent = "Couldn't reach the guestbook right now - try again in a bit.";
    });
}

gbForm.addEventListener("submit", function(e) {
    e.preventDefault();
    var f = gbForm.elements;
    var name = f.name.value.trim();
    var message = f.message.value.trim();
    var homepage = f.homepage.value.trim();
    var error = gb.body.querySelector(".gl-gb-error");
    var submit = gbForm.querySelector("button[type=submit]");

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

    function done() {
        gbForm.reset();
        gbForm.hidden = true;
        submit.disabled = false;
        submit.textContent = "Sign it!";
        renderGuestbook();
        gb.body.scrollTop = 0;
    }

    // A bot filled in the hidden field: thank it and keep nothing
    if (f.website.value) {
        done();
        return;
    }

    submit.disabled = true;
    submit.textContent = "Signing...";
    guestbookStore.add({
        name: name,
        from: f.from.value.trim(),
        homepage: homepage,
        message: message,
        mood: gbForm.querySelector("input[name=mood]:checked").value,
        date: new Date().toISOString().slice(0, 10)
    }).then(done).catch(function() {
        submit.disabled = false;
        submit.textContent = "Sign it!";
        error.textContent = "Couldn't save that - try again in a bit.";
    });
});

gb.win.insertBefore(buildMenuBar(gb.win, standardMenus(gb.win, {
    file: [{ label: "Sign the guestbook...", action: openGuestbookForm }, "-"]
})), gb.body);

// Fresh entries every time it's opened, since other people sign it too
makeElementDraggable("guestbook-icon-group", function() {
    if ($(gb.win).is(":hidden")) renderGuestbook();
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
