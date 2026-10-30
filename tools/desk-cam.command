#!/bin/zsh
# Double-click to start the desk cam: the camera server, the Cloudflare
# tunnel that carries its public view to cam.mocial.org, and griffinland's
# local copy if it isn't running yet - then griffinland opens with both
# camera windows up. If the desk cam's already running, it just opens them.
# Close this window (or press Ctrl-C) to stop the cameras and the tunnel.
# Nothing's public until the ON AIR button is switched on.

cd "${0:A:h}/.."

listening() { lsof -nP -iTCP:$1 -sTCP:LISTEN >/dev/null 2>&1 }

# griffinland's local copy carries on after this window closes
listening 8900 || (nohup python3 -m http.server 8900 >/dev/null 2>&1 &)

if listening 8080; then
    echo "The desk cam's already running - opening it."
    open "http://localhost:8900/?cams"
    exit
fi

(sleep 4; open "http://localhost:8900/?cams") &

cloudflared tunnel --no-autoupdate --config ~/.cloudflared/desk-cam.yml run desk-cam \
    2>> ~/Library/Logs/desk-cam-tunnel.log &
tunnel=$!
trap 'kill $tunnel 2>/dev/null' EXIT HUP INT TERM

python3 tools/workstation-cam.py
