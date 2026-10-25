# griffinland

[griffinlaszlo.com](https://griffinlaszlo.com) — mocial's sister desktop. The
`griffinland` icon on [mocial.org](https://mocial.org) brings you here in the
same tab, and the `mocial` icon here takes you back, from the same spot on the
desktop. The idea is that it feels like you never left: the windows, taskbar,
tray clock and fonts are mocial's, and only the desktop changes.

## How it shares mocial's look

| File | Where it comes from |
|---|---|
| `main.css` | mocial's stylesheet, copied as-is. Rules for mocial's own windows come along unused. |
| `main.js` | mocial's shell, lifted word for word: icon dragging, the password gate, window fly-in/out, the taskbar, the world-clock tray, `buildWindowChrome`, the typed title. |
| `griffinland.css` | Styles for griffinland's own desktop. Anything new goes here, not in `main.css`. |

Because these are copies, a fix to the shell on mocial has to be copied here
too. Keep `main.css` an exact copy and put griffinland's own styling in
`griffinland.css` - then updating is just copying the file over. If the two
desktops grow a lot, the next step is moving the shell into one shared file
both sites load.

New windows: build them with `buildWindowChrome(win, "TITLE")`, add their
title-bar icon to `windowIcons`, and open them with `showPopup(id, iconEl)` -
the same calls mocial uses.

## Running it locally

```bash
python3 -m http.server 8900
```

Then open `http://localhost:8900`. The password gate is skipped on localhost;
add `?lock` to see it.

## Password gate

Same doorman and same password as mocial: `SITE_PASSWORD_HASH` in
`index.html` must match mocial's. Crossing between the sites, an unlocked
visitor carries `#pass=<hash>` on the URL so they aren't asked twice; it's
wiped from the address bar on arrival. The hash is readable in the page source
anyway, so this gives nothing away - like mocial's, the gate keeps casual
visitors out while the site is built and protects nothing secret.

## Deploying

GitHub Pages serves `main`, and `CNAME` points it at griffinlaszlo.com.
Pushing `main` publishes immediately.

DNS lives at GoDaddy: four `@` A records to GitHub Pages (`185.199.108.153`,
`185.199.109.153`, `185.199.110.153`, `185.199.111.153`) and `www` as a CNAME
to `griffinlaszlo.github.io`.
