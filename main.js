// griffinland - griffinlaszlo.com, mocial's sister desktop.
//
// The shell below (dragging, the password gate, windows flying in and out,
// the Win95 taskbar and its world-clock tray, the typed title) is lifted
// word for word from mocial's main.js, so moving between the two sites feels
// like the desktop changed under you rather than that you went somewhere
// else. When the shell changes on mocial, copy the change here too - see the
// README. Only the desktop itself (the icons and what they open) belongs to
// griffinland.

function makeElementDraggable(elementId, onClick, onDragEnd, onDragMove) {
    var element = document.getElementById(elementId);
    var posX = 0, posY = 0, offsetX = 0, offsetY = 0;
    var startX = 0, startY = 0, dragged = false;

    element.onmousedown = dragMouseDown;

    function dragMouseDown(e) {
        e.preventDefault();
        offsetX = e.clientX;
        offsetY = e.clientY;
        startX = e.clientX;
        startY = e.clientY;
        dragged = false;
        document.onmouseup = closeDragElement;
        document.onmousemove = elementDrag;
    }

    function elementDrag(e) {
        e.preventDefault();
        if (Math.abs(e.clientX - startX) > 3 || Math.abs(e.clientY - startY) > 3) {
            dragged = true;
        }
        posX = offsetX - e.clientX;
        posY = offsetY - e.clientY;
        offsetX = e.clientX;
        offsetY = e.clientY;
        element.style.top = (element.offsetTop - posY) + "px";
        element.style.left = (element.offsetLeft - posX) + "px";
        if (dragged && typeof onDragMove === 'function') {
            onDragMove();
        }
    }

    function closeDragElement() {
        document.onmouseup = null;
        document.onmousemove = null;
        if (!dragged && typeof onClick === 'function') {
            onClick();
        } else if (dragged && typeof onDragEnd === 'function') {
            onDragEnd();
        }
    }
}

// ===== Password gate ========================================================
// The flag and the hash live in index.html's <head> so the gate can hide the
// page before it paints. This is only the dialog's behaviour.
//
// Worth being clear about what this is: the site is a static file, so its
// markup reaches every visitor regardless of the dialog. Someone who opens
// View Source can read straight past it. This keeps casual visitors out while
// the site is being built - it is not protection for anything secret.
//
// The hash isn't security either, just a way to keep the literal password out
// of a public repo so it can't be read at a glance (or harvested, if you reuse
// it somewhere that matters). Generate a new one from the console with
// hashPassword("...").
function hashPassword(str) {
    var h = 5381;
    for (var i = 0; i < str.length; i++) {
        h = ((h << 5) + h + str.charCodeAt(i)) >>> 0;
    }
    return h.toString(16);
}

(function setUpPasswordGate() {
    if (!document.documentElement.classList.contains("gated")) return;

    var input = document.getElementById("site-password");
    var error = document.getElementById("password-error");

    function unlock() {
        if (hashPassword(input.value) !== window.SITE_PASSWORD_HASH) {
            error.textContent = "The password is incorrect. Try again.";
            input.select();
            return;
        }
        // sessionStorage, not localStorage: unlocked for this tab session, so
        // closing the browser asks again rather than remembering forever
        sessionStorage.setItem("griffinland-unlocked", "1");
        document.documentElement.classList.remove("gated");

        // Drop ?lock off the URL, or reloading would re-lock immediately and
        // leave you unable to get in without editing the address bar
        if (window.FORCE_LOCK && window.history.replaceState) {
            window.history.replaceState({}, "", window.location.pathname);
        }
    }

    document.getElementById("password-ok").addEventListener("click", unlock);
    input.addEventListener("keydown", function(e) {
        if (e.key === "Enter") unlock();
        else error.textContent = "";
    });
    document.getElementById("password-cancel").addEventListener("click", function() {
        input.value = "";
        error.textContent = "";
        input.focus();
    });

    input.focus();
})();

// ===== Hangman ==============================================================
// griffinland: the window beside the password dialog. The word is the
// password, so winning fills it into the dialog and the visitor just hits OK.
// Writing it here in the clear gives nothing away - the game hands it to
// anyone who plays well enough.
(function setUpHangman() {
    if (!document.documentElement.classList.contains("gated")) return;

    var WORD = "CREATE";
    var MAX_MISSES = 6;   // one per .hm-part: head, body, two arms, two legs

    var drawing = document.getElementById("hangman-drawing");
    var parts = drawing.querySelectorAll(".hm-part");
    var wordEl = document.getElementById("hangman-word");
    var lettersEl = document.getElementById("hangman-letters");
    var statusEl = document.getElementById("hangman-status");
    var guessed, misses, over;

    function render() {
        wordEl.textContent = WORD.split("").map(function(ch) {
            return guessed[ch] ? ch : "_";
        }).join(" ");

        [].forEach.call(parts, function(part, i) {
            part.classList.toggle("shown", i < misses);
        });
        drawing.classList.toggle("lost", misses >= MAX_MISSES);

        var left = MAX_MISSES - misses;
        statusEl.textContent = over === "won" ? "You got it! The password is in the box - hit OK."
            : over === "lost" ? "Out of guesses. Try a new game."
            : left + (left === 1 ? " guess left" : " guesses left");
    }

    function guess(ch) {
        if (over || guessed[ch]) return;
        guessed[ch] = true;

        var btn = lettersEl.querySelector('[data-letter="' + ch + '"]');
        btn.disabled = true;
        btn.classList.add(WORD.indexOf(ch) !== -1 ? "hit" : "miss");
        if (WORD.indexOf(ch) === -1) misses++;

        if (WORD.split("").every(function(c) { return guessed[c]; })) {
            over = "won";
            var input = document.getElementById("site-password");
            input.value = WORD.toLowerCase();
            document.getElementById("password-error").textContent = "";
            document.getElementById("password-ok").focus();
        } else if (misses >= MAX_MISSES) {
            over = "lost";
        }
        render();
    }

    function newGame() {
        guessed = {};
        misses = 0;
        over = null;
        lettersEl.innerHTML = "";
        "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").forEach(function(ch) {
            var btn = document.createElement("button");
            btn.type = "button";
            btn.textContent = ch;
            btn.setAttribute("data-letter", ch);
            btn.addEventListener("click", function() { guess(ch); });
            lettersEl.appendChild(btn);
        });
        render();
    }

    // Typing a letter plays it too, unless the password field has focus -
    // there the keys belong to the password
    document.addEventListener("keydown", function(e) {
        if (e.target.tagName === "INPUT" || e.metaKey || e.ctrlKey || e.altKey) return;
        if (/^[a-z]$/i.test(e.key)) guess(e.key.toUpperCase());
    });

    // The title bar's ? opens a "What's This?" tip; clicking it again, or
    // anywhere else, closes it
    var help = document.getElementById("hangman-help");
    var tip = document.getElementById("hangman-tip");
    function setTip(open) {
        tip.hidden = !open;
        help.setAttribute("aria-expanded", open ? "true" : "false");
    }
    help.addEventListener("click", function(e) {
        e.stopPropagation();
        setTip(tip.hidden);
    });
    help.addEventListener("keydown", function(e) {
        if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setTip(tip.hidden);
        }
    });
    document.addEventListener("click", function() { setTip(false); });

    document.getElementById("hangman-reset").addEventListener("click", newGame);
    newGame();
})();

// The icon each window carries at the left of its own title bar, and on its
// taskbar button. Empty until griffinland has windows of its own.
var windowIcons = {};

// The taskbar still wants an icon on every button - a real taskbar never has a
// bare one - so windows with no title-bar icon fall back to the file icon there.
var TASKBAR_FALLBACK_ICON = "fileicon.png";

// Title-bar icon heights, keyed to the artwork - see mocial's main.js.
var iconSizes = {};

$(document).ready(function() {
    Object.keys(windowIcons).forEach(function(windowId) {
        var win = document.getElementById(windowId);
        if (!win) return;
        var title = win.querySelector(".window-title");
        if (!title || title.querySelector(".window-title-icon")) return;

        var src = windowIcons[windowId];
        var img = document.createElement("img");
        img.src = src;
        img.className = "window-title-icon";
        if (iconSizes[src]) img.style.height = iconSizes[src];
        img.draggable = false;
        img.alt = "";
        title.insertBefore(img, title.firstChild);
    });
});

// Popup fly-in animation: when a popup opens from an icon click, it
// animates in from that icon's position instead of just snapping into view.
var POPUP_FLY_IN = true;

// Below 960px the floating-window layout can't work - windows stack in
// document flow and the icon column sits on top of them. Two treatments are
// built so they can be compared on a real phone:
//
//   "stacked"    - icon column stays as the desktop, windows stack below it,
//                  opening one scrolls you to it
//   "fullscreen" - one window at a time covering the viewport, close to return
//
// Override per visit with ?mobile=stacked or ?mobile=fullscreen.
var MOBILE_TREATMENT = "stacked";
(function() {
    var choice = new URLSearchParams(window.location.search).get("mobile");
    if (choice === "stacked" || choice === "fullscreen") MOBILE_TREATMENT = choice;
    document.body.classList.add("mobile-" + MOBILE_TREATMENT);
})();

function isMobileLayout() {
    return window.matchMedia("(max-width: 960px)").matches;
}

// Stacked mode reserves room for the icon column, but only while a window is
// actually open - otherwise an untouched page carries a screenful of dead
// scroll. Windows are hidden through several paths (hidePopup, the title-bar
// close buttons' inline onclick, applyPopupChoices), so rather than routing
// them all through one function, watch the elements themselves.
// A window counts as on screen only if it's actually rendered. Testing its own
// computed display isn't enough: the password dialog is display:block inside a
// hidden gate wrapper, so it reads as open when the gate is down. getClientRects
// comes back empty whenever the element or any ancestor is hidden.
// griffinland: the gate holds two windows (the dialog and the hangman), so
// anything inside it is skipped, where mocial only skips the dialog by id.
function isWindowOnScreen(el) {
    return !el.closest("#password-gate") && el.getClientRects().length > 0;
}

function syncOpenWindowClass() {
    var anyOpen = [].some.call(document.querySelectorAll(".popup-window"), isWindowOnScreen);
    document.body.classList.toggle("has-open-window", anyOpen);
    renderTaskbar();
}

// The footer is a Win95 taskbar. Every open window gets a button carrying the
// same icon its title bar does; clicking one minimises or restores it. The
// page's own button sits at the left and stays pressed.
//
// Rebuilt from scratch on every change rather than diffed - there are only
// ever a handful of windows, and the same MutationObserver that tracks
// has-open-window drives it, so every path that opens or closes a window is
// already covered without routing them through one function.
function renderTaskbar() {
    var tasks = document.getElementById("taskbar-tasks");
    if (!tasks) return;

    [].slice.call(tasks.querySelectorAll(".task-button-window")).forEach(function(btn) {
        btn.parentNode.removeChild(btn);
    });

    [].slice.call(document.querySelectorAll(".popup-window")).forEach(function(win) {
        if (!win.id || !isWindowOnScreen(win)) return;
        var titleEl = win.querySelector(".window-title");
        if (!titleEl) return;

        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "task-button task-button-window" +
                        (win.classList.contains("iconize") ? " is-minimised" : "");

        var img = document.createElement("img");
        img.src = windowIcons[win.id] || TASKBAR_FALLBACK_ICON;
        img.alt = "";
        img.draggable = false;
        btn.appendChild(img);

        var label = document.createElement("span");
        label.textContent = titleEl.textContent.trim();
        btn.appendChild(label);

        btn.addEventListener("click", function() {
            $(win).toggleClass("iconize").removeClass("resize");
        });

        tasks.appendChild(btn);
    });
}

// The tray clock reads 24-hour; the flyout it opens reads 12-hour per city,
// which is the split in the Win95 tray it's modelled on.
//
// Named zones rather than fixed offsets so the rows stay right through both
// countries' DST changes - the US and EU don't switch on the same dates, so
// hardcoded offsets would be wrong for a couple of weeks twice a year.
var WORLD_CLOCKS = [
    { id: "clock-us", zone: "America/Los_Angeles" },
    { id: "clock-uk", zone: "Europe/London" },
    { id: "clock-de", zone: "Europe/Berlin" }
];

// Intl.DateTimeFormat is the only thing here that can throw on an old browser,
// so each formatter is built once behind a try and a null formatter just leaves
// that row at its placeholder rather than breaking the tray clock with it.
function makeZoneFormatter(zone) {
    try {
        return new Intl.DateTimeFormat("en-US", {
            timeZone: zone, hour: "2-digit", minute: "2-digit", hour12: true
        });
    } catch (e) {
        return null;
    }
}

// Tray clock. setInterval rather than an animation-frame loop, so it keeps
// ticking in webviews that throttle frames.
$(document).ready(function() {
    var clock = document.getElementById("tray-clock");
    if (!clock) return;

    // The clock span only carries the text; the surrounding button is the
    // control, so the whole tray - speaker icon included - is the hit area.
    var trayButton = document.getElementById("tray-button");

    var rows = WORLD_CLOCKS.map(function(spec) {
        return {
            el: document.getElementById(spec.id),
            format: makeZoneFormatter(spec.zone)
        };
    });

    function tick() {
        var now = new Date();
        var hours = now.getHours();
        var minutes = now.getMinutes();
        // Military time: zero-padded, no suffix. 16:37, 09:05, 00:12.
        clock.textContent = (hours < 10 ? "0" : "") + hours + ":" +
                            (minutes < 10 ? "0" : "") + minutes;

        rows.forEach(function(row) {
            if (!row.el || !row.format) return;
            row.el.textContent = row.format.format(now);
        });
    }
    tick();
    // 20s is fine for a minute display, but it can leave a row up to 20s stale
    // the moment the flyout opens - so open() ticks as well.
    setInterval(tick, 20000);

    var flyout = document.getElementById("clock-flyout");
    if (!flyout || !trayButton) return;

    // The tray doubles as a music box. Every way the flyout opens or closes -
    // the button, a click away, Escape - runs through setOpen, so hanging the
    // audio off it covers all of them without a second set of handlers.
    var trayAudio = document.getElementById("tray-audio");

    function setOpen(open) {
        if (open) tick();
        flyout.hidden = !open;
        trayButton.setAttribute("aria-expanded", open ? "true" : "false");
        document.body.classList.toggle("clock-open", open);

        if (!trayAudio) return;
        if (open) {
            // pause() leaves currentTime alone, so this picks the track back up
            // where it stopped rather than restarting it - the dance icon
            // behaves the same way. Opening always follows a click, so autoplay
            // policy is satisfied; the promise only rejects when a play is
            // interrupted by an immediate close, which isn't worth surfacing.
            var started = trayAudio.play();
            if (started) started.catch(function() {});
        } else {
            trayAudio.pause();
        }
    }

    trayButton.addEventListener("click", function(e) {
        e.stopPropagation();   // otherwise the document handler closes it again
        setOpen(flyout.hidden);
    });

    // Click-away and Escape, the way a real tray flyout dismisses.
    document.addEventListener("click", function(e) {
        if (!flyout.hidden && !flyout.contains(e.target)) setOpen(false);
    });
    document.addEventListener("keydown", function(e) {
        if (e.key === "Escape" && !flyout.hidden) setOpen(false);
    });
});
$(document).ready(function() {
    var observer = new MutationObserver(syncOpenWindowClass);
    document.querySelectorAll(".popup-window").forEach(function(el) {
        observer.observe(el, { attributes: true, attributeFilter: ["style", "class"] });
    });
    syncOpenWindowClass();
});

// Rising z-index so the most recently opened fullscreen window sits on top,
// and closing it reveals whatever was under it
var mobileTopZ = 20000;

// Stacked windows are laid out in a flex column so they can be ordered by when
// they were opened rather than by their order in the HTML - otherwise opening
// the random folder and then Tech Crunch would put Tech Crunch above it, since
// that's how they sit in index.html. Each newly opened window gets the next
// order value, so it lands at the bottom of the stack.
var stackedOrder = 0;

function flyPopupIn(popupEl, originEl) {
    if (!POPUP_FLY_IN || !originEl) return;
    // Stacked windows can land a thousand-plus pixels from the icon, which
    // makes the fly-in a long meaningless swoop. Fullscreen keeps it - zooming
    // out of the tapped icon to fill the screen reads well.
    if (isMobileLayout() && MOBILE_TREATMENT === "stacked") return;
    var popupRect = popupEl.getBoundingClientRect();
    var originRect = originEl.getBoundingClientRect();
    var dx = (originRect.left + originRect.width / 2) - (popupRect.left + popupRect.width / 2);
    var dy = (originRect.top + originRect.height / 2) - (popupRect.top + popupRect.height / 2);

    popupEl.style.transition = "none";
    popupEl.style.transform = "translate(" + dx + "px, " + dy + "px) scale(0.15)";
    popupEl.style.opacity = "0";
    // force a reflow so the browser registers the start state before animating
    void popupEl.offsetHeight;
    popupEl.style.transition = "transform 0.35s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.25s ease";
    popupEl.style.transform = "translate(0, 0) scale(1)";
    popupEl.style.opacity = "1";

    setTimeout(function() {
        popupEl.style.transition = "";
        popupEl.style.transform = "";
    }, 400);
}

// Reverse of flyPopupIn: shrink the popup back down into the icon it came
// from, then hide it once the animation finishes.
function flyPopupOut(popupEl, originEl) {
    if (!POPUP_FLY_IN || !originEl ||
        (isMobileLayout() && MOBILE_TREATMENT === "stacked")) {
        $(popupEl).hide();
        return;
    }
    var popupRect = popupEl.getBoundingClientRect();
    var originRect = originEl.getBoundingClientRect();
    var dx = (originRect.left + originRect.width / 2) - (popupRect.left + popupRect.width / 2);
    var dy = (originRect.top + originRect.height / 2) - (popupRect.top + popupRect.height / 2);

    popupEl.style.transition = "transform 0.3s cubic-bezier(0.64, 0, 0.78, 0), opacity 0.3s ease";
    popupEl.style.transform = "translate(" + dx + "px, " + dy + "px) scale(0.15)";
    popupEl.style.opacity = "0";

    setTimeout(function() {
        $(popupEl).hide();
        popupEl.style.transition = "";
        popupEl.style.transform = "";
        popupEl.style.opacity = "";
    }, 300);
}

// Show a popup by id, flying it in from originEl (an icon element) if enabled
function showPopup(popupId, originEl) {
    var popup = document.getElementById(popupId);
    if (!popup) return;
    $(popup).show();

    if (isMobileLayout() && MOBILE_TREATMENT === "fullscreen") {
        popup.style.zIndex = ++mobileTopZ;
        flyPopupIn(popup, originEl);
        return;
    }

    // Stacked: append to the bottom of the column. No scrolling - the stack
    // sits high enough to overlap the lower icons, so the first window is
    // already on screen and the page doesn't lurch under you.
    if (isMobileLayout()) {
        popup.style.order = ++stackedOrder;
    }

    flyPopupIn(popup, originEl);
}

// Hide a popup by id, flying it back into originEl (an icon element) if enabled
function hidePopup(popupId, originEl) {
    var popup = document.getElementById(popupId);
    if (!popup || $(popup).is(":hidden")) return;
    flyPopupOut(popup, originEl);
}

// "Show desktop": clear everything out of the way, and put it all back on a
// second click. Windows are minimised rather than closed, so they stay in the
// taskbar and nothing is lost.
makeElementDraggable("computer-icon-group", function() {
    var open = [].filter.call(document.querySelectorAll(".popup-window"), isWindowOnScreen);
    if (!open.length) return;

    var allMinimised = open.every(function(win) {
        return win.classList.contains("iconize");
    });
    open.forEach(function(win) {
        $(win).toggleClass("iconize", !allMinimised).removeClass("resize");
    });
});

// The way back to mocial, from the same spot on the desktop that griffinland
// sits on mocial's - so the two icons swap you back and forth from one place.
// The sites have different passwords, so mocial asks for its own.
makeElementDraggable("mocial-icon-group", function() {
    window.location.href = "https://mocial.org/";
});

// The Win95 title bar every window carries. Built here rather than pasted into
// each one, with real listeners instead of the inline onclick the older
// windows use - same behaviour, nothing to keep in sync by hand.
function buildWindowChrome(win, titleText) {
    var header = document.createElement("div");
    header.className = "windows-header-wrapper clearafter";

    var title = document.createElement("div");
    title.className = "window-title";
    title.textContent = titleText;
    header.appendChild(title);

    var icons = document.createElement("div");
    icons.className = "window-icons";

    function button(glyphClass, onClick) {
        var btn = document.createElement("span");
        btn.className = "win-btn";
        if (glyphClass) {
            var glyph = document.createElement("span");
            glyph.className = "glyph " + glyphClass;
            btn.appendChild(glyph);
        } else {
            btn.innerHTML = "&#10005;";
        }
        btn.addEventListener("click", onClick);
        return btn;
    }

    icons.appendChild(button("glyph-min", function() {
        $(win).toggleClass("iconize").removeClass("resize");
    }));
    icons.appendChild(button("glyph-max", function() {
        $(win).toggleClass("resize").removeClass("iconize");
    }));
    icons.appendChild(button(null, function() { $(win).hide(); }));

    header.appendChild(icons);
    return header;
}

function typeWriter(text, elementId, speed, callback) {
    let i = 0;
    const output = document.getElementById(elementId);

    function typing() {
        if (i < text.length) {
            let char = text[i];
            output.innerHTML += char;
            i++;
            setTimeout(typing, speed);
        } else if (callback) {
            callback(); // Execute the callback function after finishing typing
        }
    }
    typing();
}

const title = "griffinland"

typeWriter(title, 'title', 40);
