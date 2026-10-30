#!/bin/zsh
# Double-click to start the desk cam: the camera server, plus the Cloudflare
# tunnel that carries its public view to cam.mocial.org. Close the window (or
# press Ctrl-C) to stop both. Nothing's public until the ON AIR button in the
# desk cam window is switched on.

cd "${0:A:h}/.."

cloudflared tunnel --no-autoupdate --config ~/.cloudflared/desk-cam.yml run desk-cam \
    2>> ~/Library/Logs/desk-cam-tunnel.log &
tunnel=$!
trap 'kill $tunnel 2>/dev/null' EXIT HUP INT TERM

python3 tools/workstation-cam.py
