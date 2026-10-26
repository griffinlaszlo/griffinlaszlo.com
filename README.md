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
| `main.js` | mocial's shell, lifted word for word: icon dragging, the password gate, window fly-in/out, the taskbar, the world-clock tray, `buildWindowChrome`, the typed title. Comments starting `griffinland:` mark what's its own (the hangman, and the gate's two windows being left off the taskbar) - keep those when copying the shell over again. |
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

## Password gate and hangman

Same doorman as mocial, with griffinland's own password: `SITE_PASSWORD_HASH`
in `index.html` is the hash of it. Beside the dialog, a hangman window lets
visitors guess it - the word is the password, and winning fills it into the
dialog so they only have to hit OK. Changing the password means changing both
the hash and `WORD` in main.js's hangman section (`hashPassword("...")` in the
console gives the new hash).

Since the game gives the password to anyone who plays, the gate is a toy, not
a lock, and the two sites no longer carry an unlock across to each other:
mocial asks for its own password.

## Deploying

GitHub Pages serves `main`, and `CNAME` points it at griffinlaszlo.com.
Pushing `main` publishes immediately.

DNS lives at GoDaddy: four `@` A records to GitHub Pages (`185.199.108.153`,
`185.199.109.153`, `185.199.110.153`, `185.199.111.153`) and `www` as a CNAME
to `griffinlaszlo.github.io`.
