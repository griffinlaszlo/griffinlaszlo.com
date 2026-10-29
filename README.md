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
| `main.js` | mocial's shell, lifted word for word: icon dragging, the password gate, window fly-in/out, the taskbar, the world-clock tray, `buildWindowChrome`, the typed title. Comments starting `griffinland:` mark what's its own (the gate's games, and their windows being left off the taskbar) - keep those when copying the shell over again. |
| `griffinland.css` | Styles for griffinland's own desktop. Anything new goes here, not in `main.css`. |
| `griffinland.js` | griffinland's own desktop toys (below), built on main.js's shell. Loaded after it. |
| `gifs/` | mocial's own gifs, copied over for the toys to use. |
| `icons/` | Pixel desktop icons, drawn as SVG. |
| `supabase/guestbook.sql` | Sets up the guestbook's table in Supabase. |
| `tools/griffin-rig.py` | Cuts griffin's chairlift art into the animation layers in `gifs/griffin/`. |

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

## Password gate and its games

Same doorman as mocial, with griffinland's own password: `SITE_PASSWORD_HASH`
in `index.html` is the hash of it. Two games flank the dialog, and both win
the password:

- **Hangman** (right) - the word is the password. Guess it before the figure
  is drawn.
- **Dice** (left) - every double six gives away the next letter. That's 1 in
  36 a roll, so the whole word takes a couple of hundred rolls on average.
  Letters won are kept for the tab session, so a reload doesn't lose them.

Finishing either game fills the password into the dialog, so the visitor only
has to hit OK. Changing the password means changing both the hash and
`GATE_WORD` in main.js (`hashPassword("...")` in the console gives the new
hash).

Since the games give the password to anyone who plays, the gate is a toy, not
a lock, and the two sites don't carry an unlock across to each other: mocial
asks for its own password.

## Welcome pop-up

Once a visitor is through the gate (or straight away, when there's no gate),
a "YOU HAVE ASCENDED" window opens: griffinland as the far side of the pearly
gates. The gates swing open, the spinning world rises out of them as an angel
and the WordArt waves, over a single centered "Enter paradise" button that
closes it. It's all CSS and SVG in `griffinland.css` and `index.html`; main.js
only adds the title bar, splits the WordArt into letters and opens it.

## The desktop toys

All in `griffinland.js`, each in its own section, with styles under matching
headings in `griffinland.css`. The desktop is forest green (`--gl-forest`).

- **Menu bars** - File / Edit / View / Help, first letters underlined, on the
  welcome window, the calculator and the guestbook. `standardMenus()` builds
  them; a window can add its own items to File, Edit or View.
- **not-a-virus.exe** - sets off a storm of fake spam pop-ups (the `SPAM`
  list). Each ad's button spawns two more. griffinland AntiVirus turns up
  afterwards to clear them; Escape works too.
- **The spam ad** - one ad parked on the desktop for real, with a blinking
  CLICK HERE that opens `PROMO_URL`. Point that at whatever's new.
- **Screensaver** - after two idle minutes, or from its icon or View >
  Screensaver now: the gifs bounce around a starfield and the logo does the
  DVD bounce. Any input ends it.
- **Tip of the Day** - opens after the welcome window closes unless "Show tips
  at startup" is unticked. The tips are the `TIPS` list.
- **Hit counter** - real visits, counted on Abacus (abacus.jasoncameron.dev), a
  free hit-counter service; each browser session counts once. Local copies
  count on a separate `griffinlaszlo-dev` key so testing never pads it. If the
  service can't be reached, the counter hides.
- **Badges** - 88x31 "best viewed at 800x600", under construction, and a
  webring badge. (A webring was the 90s way sites found each other: a loop of
  sites linking prev / next / random around the ring. Ours links mocial.)
- **Snow trail** - white snowflakes drift down off the cursor, swaying as they
  fall. On by default, toggled in View.
- **The horizon** - a white treeline drawn to fit the window, with a
  chairlift running over it, the dino walking along the ground and birds
  going over.
- **griffin, on the lift** - one chair carries griffin, animated from his own
  chairlift art; the other chairs are the same chair, empty.
  `tools/griffin-rig.py` cuts the drawing into layers - chair and body, each
  leg and ski, head, shaka arm, beer hand - and makes the empty chair. He
  rests by default (arm on the chair back, skis dangling); every few seconds
  griffinland.js picks one thing for him to do - a sip, a shaka, sometimes
  both, or a look around (the `ACTIONS` list) - and griffinland.css eases
  each pose in and back out. Hover and he raises the beer in a cheers.
- **Calculator** - works like the Windows one, plus a lucky key.
- **Guestbook** - sign it, pick a mood gif, see everyone's notes. Entries live
  in a Supabase table: `supabase/guestbook.sql` creates it (run it once in the
  project's SQL Editor), and `SUPABASE_URL` / `SUPABASE_KEY` at the top of the
  guestbook section in griffinland.js point the site at it. The key is the
  project's publishable key, which is public by design - row-level security
  limits it to reading and signing. To delete an entry, use the Supabase
  dashboard (Table Editor > guestbook). With the two left blank, entries stay
  in each visitor's own browser instead. A hidden form field catches bots.

Everything that moves holds still for visitors who've asked their system for
reduced motion. Below 960px the horizon steps aside and the badges move to
the end of the page.

## Deploying

GitHub Pages serves `main`, and `CNAME` points it at griffinlaszlo.com.
Pushing `main` publishes immediately.

DNS lives at GoDaddy: four `@` A records to GitHub Pages (`185.199.108.153`,
`185.199.109.153`, `185.199.110.153`, `185.199.111.153`) and `www` as a CNAME
to `griffinlaszlo.github.io`.
