#!/usr/bin/env python3
"""The workstation cam: serves the two cameras on griffin's desk - the
Arducam (UC-A53) and the NexiGo webcam - to griffinland's local copy, and
records clips from them to the Desktop.

    python3 tools/workstation-cam.py

Leave it running, open griffinland locally (http://localhost:8900) and the
"desk cam" icon shows the live feed, with a tab for each camera and a record
button. Everything is on http://127.0.0.1:8080, and ?cam= picks the camera by
its label (the first one when it's left off):

    GET  /snapshot?cam=webcam   the latest frame, as a JPEG
    GET  /stream?cam=webcam     the live feed as MJPEG, for an <img>
    GET  /status                JSON: the cameras, recording or not, recent clips
    POST /record/start?cam=...  start a clip from that camera
    POST /record/stop           finish it - it lands in ~/Desktop/workstation cam/
    POST /clips/open            show that folder in Finder
    POST /air/on, /air/off      put the cameras on (or off) the public view

The public view is a second, separate listener on http://127.0.0.1:8081, and
it's the only thing the Cloudflare tunnel (cam.mocial.org) points at, so
visitors can never reach recording or the clips folder. It only ever serves
still frames, and only while the cameras are ON AIR - which they never are
until the ON AIR button in the window says so, every time this starts:

    GET  /status                JSON: on air or not, and which cameras are live
    GET  /arducam.jpg           the latest frame from that camera, cached by
                                Cloudflare for a second, so visitors share
                                frames and the upload stays at about one a second

Each camera has its own ffmpeg reading it the whole time and keeping the
latest frame, so switching cameras is instant. Recording starts one more
ffmpeg that encodes those same frames to an mp4, so the live view keeps
going while a clip records.

Cameras are found by part of their name. The defaults are the two on the
desk - the Arducam calls itself "USB Camera" - and --camera label=name
replaces them (once per camera; --list shows the names). It's fine to start
this before plugging them in: it keeps looking, and picks a camera back up
if it's unplugged and plugged back in. A name of "test" serves a test
pattern instead, for trying things out without a camera.

Needs ffmpeg (brew install ffmpeg). The first run asks for camera permission
for whichever app it's started from (Terminal, say) - say yes, or the
cameras open but never send a picture.
"""

import argparse
import json
import re
import subprocess
import sys
import threading
import time
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

FFMPEG = "ffmpeg"

# label=part of the camera's name, in the order the window's tabs show them
DEFAULT_CAMERAS = ["arducam=USB Camera", "webcam=NexiGo"]

# Sizes to try, best first. Both desk cameras do 1080p at 30fps; a camera
# that refuses one size gets the next.
SIZES = ["1920x1080", "1280x720", "640x480"]

# Test patterns, one per test camera so they're easy to tell apart
TEST_PATTERNS = ["testsrc2", "smptehdbars", "rgbtestsrc"]

# Only pages served from this machine may use the cameras
LOCAL_HOSTS = {"localhost", "127.0.0.1", "::1"}

# The pages allowed to read the public view's status (anyone can load its
# frames, as images; this is just whose scripts may ask if it's on air)
PUBLIC_ORIGINS = {"https://griffinlaszlo.com", "https://www.griffinlaszlo.com"}

PUBLIC_URL = "https://cam.mocial.org"


def log(message):
    print(datetime.now().strftime("%H:%M:%S"), message, flush=True)


def list_cameras():
    """The names of the video devices ffmpeg can see."""
    result = subprocess.run(
        [FFMPEG, "-hide_banner", "-f", "avfoundation", "-list_devices", "true", "-i", ""],
        capture_output=True, text=True)
    names, in_video = [], False
    for line in result.stderr.splitlines():
        if "video devices" in line:
            in_video = True
        elif "audio devices" in line:
            break
        elif in_video:
            m = re.search(r"\] \[\d+\] (.+)$", line)
            if m:
                names.append(m.group(1).strip())
    return names


class Camera:
    """Reads one camera with ffmpeg and keeps the latest JPEG frame."""

    def __init__(self, label, want, fps, pattern):
        self.label = label
        self.want = want.lower()
        self.fps = fps
        self.pattern = pattern
        self.name = None
        self.size = None
        self.problem = "starting up"
        self.frame = None
        self.frame_at = 0.0
        self.seq = 0
        self.cond = threading.Condition()

    def start(self):
        threading.Thread(target=self._run, daemon=True).start()

    def latest(self):
        with self.cond:
            return self.seq, self.frame

    def live(self):
        return self.frame is not None and time.time() - self.frame_at < 3

    def status(self):
        live = self.live()
        return {"label": self.label, "name": self.name, "live": live, "problem": self.problem,
                "size": self.size if live else None, "fps": self.fps}

    def wait_frame(self, after_seq, timeout):
        """The next frame after after_seq, or (after_seq, None) on timeout."""
        with self.cond:
            if not self.cond.wait_for(lambda: self.seq > after_seq, timeout):
                return after_seq, None
            return self.seq, self.frame

    def _publish(self, jpeg):
        with self.cond:
            self.frame = jpeg
            self.frame_at = time.time()
            self.seq += 1
            self.cond.notify_all()

    def _log(self, message):
        log("[%s] %s" % (self.label, message))

    def _find(self):
        if self.want == "test":
            return "test pattern"
        return next((n for n in list_cameras() if self.want in n.lower()), None)

    def _run(self):
        said_missing = False
        while True:
            self.name = self._find()
            if not self.name:
                self.problem = "no camera called '%s' - is it plugged in?" % self.want
                if not said_missing:
                    self._log("Looking for a camera called '%s'. Seen: %s"
                              % (self.want, ", ".join(list_cameras()) or "none"))
                    said_missing = True
                time.sleep(3)
                continue
            said_missing = False

            # Keep to the size that worked last time; otherwise work down the list
            sizes = [self.size] if self.size else SIZES
            if not any(self._capture(size) for size in sizes):
                self.size = None
            time.sleep(2)

    def _command(self, size):
        if self.want == "test":
            source = ["-re", "-f", "lavfi", "-i", "%s=size=%s:rate=%d" % (self.pattern, size, self.fps)]
        else:
            source = ["-f", "avfoundation", "-framerate", str(self.fps), "-video_size", size, "-i", self.name]
        return ([FFMPEG, "-hide_banner", "-loglevel", "error"] + source +
                ["-f", "image2pipe", "-c:v", "mjpeg", "-q:v", "4", "-"])

    def _capture(self, size):
        """Runs ffmpeg at this size until it stops. Returns whether any frames came."""
        self._log("Opening %s at %s, %dfps" % (self.name, size, self.fps))
        self.problem = "waiting for a picture"
        proc = subprocess.Popen(self._command(size), stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        threading.Thread(target=self._warn_if_dark, args=(proc,), daemon=True).start()

        # ffmpeg's frames run together on the pipe; each JPEG starts FFD8 and
        # ends FFD9 (FF is never followed by D9 inside the image data)
        buf, got = b"", False
        while True:
            chunk = proc.stdout.read1(1 << 16)
            if not chunk:
                break
            buf += chunk
            while True:
                start = buf.find(b"\xff\xd8")
                if start < 0:
                    buf = buf[-1:]
                    break
                end = buf.find(b"\xff\xd9", start + 2)
                if end < 0:
                    buf = buf[start:]
                    break
                self._publish(buf[start:end + 2])
                if not got:
                    got = True
                    self.size = size
                    self.problem = None
                    self._log("Live.")
                buf = buf[end + 2:]

        error = proc.stderr.read().decode(errors="replace").strip()
        proc.wait()
        self.problem = "camera stopped" if got else "camera wouldn't open at %s" % size
        self._log("%s%s" % (self.problem, (":\n" + error) if error else ""))
        return got

    def _warn_if_dark(self, proc):
        # Without camera permission, macOS opens the camera but never sends a
        # frame, and ffmpeg says nothing - so say it for ffmpeg
        time.sleep(10)
        if proc.poll() is None and self.frame_at < time.time() - 10:
            self.problem = "no picture - check camera permission"
            self._log("No picture after 10s. If the camera's light is off, allow camera access for this app "
                      "in System Settings > Privacy & Security > Camera, then restart this.")


class Recorder:
    """Encodes one camera's frames to an mp4 while recording."""

    def __init__(self, folder, fps, max_seconds):
        self.folder = folder
        self.fps = fps
        self.max_seconds = max_seconds
        self.lock = threading.Lock()        # guards starting and stopping
        self.write_lock = threading.Lock()  # one writer to ffmpeg's stdin at a time
        self.camera = None
        self.proc = None
        self.path = None
        self.started = 0.0

    def recording(self):
        return self.proc is not None

    def seconds(self):
        return round(time.time() - self.started, 1) if self.proc else 0

    def start(self, camera):
        with self.lock:
            if self.proc:
                return self.path
            if not camera.live():
                raise RuntimeError("no picture to record yet")
            self.folder.mkdir(parents=True, exist_ok=True)
            self.camera = camera
            self.path = self.folder / datetime.now().strftime(camera.label + " %Y-%m-%d %H.%M.%S.mp4")
            # The feeder below hands over a frame on every tick of the clock,
            # repeating the last one if the camera's running slow, so the clip
            # plays back at the speed it happened
            self.proc = subprocess.Popen(
                [FFMPEG, "-hide_banner", "-loglevel", "error",
                 "-f", "mjpeg", "-framerate", str(self.fps), "-i", "-",
                 "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p",
                 "-movflags", "+faststart", str(self.path)],
                stdin=subprocess.PIPE, stderr=subprocess.PIPE)
            self.started = time.time()
            threading.Thread(target=self._feed, args=(self.proc,), daemon=True).start()
            log("Recording %s" % self.path.name)
            return self.path

    def _feed(self, proc):
        tick = 1.0 / self.fps
        next_at = time.monotonic()
        while self.proc is proc:
            if time.time() - self.started > self.max_seconds:
                log("Hit the %d-minute limit." % (self.max_seconds // 60))
                self.stop()
                return
            _, jpeg = self.camera.latest()
            with self.write_lock:
                if self.proc is not proc:
                    return
                try:
                    proc.stdin.write(jpeg)
                except (OSError, ValueError):
                    return
            next_at += tick
            time.sleep(max(0, next_at - time.monotonic()))

    def stop(self):
        with self.lock:
            proc, path = self.proc, self.path
            if not proc:
                return None
            with self.write_lock:
                self.proc = None
                try:
                    proc.stdin.close()
                except OSError:
                    pass
        error = proc.stderr.read().decode(errors="replace").strip()
        proc.wait()
        if proc.returncode != 0 or not path.exists():
            log("Clip didn't save: %s" % (error or "ffmpeg exited %d" % proc.returncode))
            return None
        log("Saved %s (%.1f MB)" % (path.name, path.stat().st_size / 1e6))
        return path

    def clips(self, limit=5):
        if not self.folder.exists():
            return []
        files = sorted(self.folder.glob("*.mp4"), key=lambda p: p.stat().st_mtime, reverse=True)
        return [{"name": p.name, "mb": round(p.stat().st_size / 1e6, 1)}
                for p in files[:limit] if p != self.path or not self.proc]


class Air:
    """Whether the cameras are on the public view. Off until it's switched on."""

    def __init__(self):
        self.on = False

    def set(self, on):
        if on != self.on:
            log("ON AIR - the public can see the cameras." if on else "Off air.")
        self.on = on


def make_handler(cameras, recorder, air, port):
    allowed_hosts = {"127.0.0.1:%d" % port, "localhost:%d" % port}

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *args):
            pass  # the stream and status polling would flood the terminal

        def _origin(self):
            """The page's origin when it's allowed, "" for none, None to refuse."""
            if self.headers.get("Host") not in allowed_hosts:
                return None  # another name pointed at this machine
            origin = self.headers.get("Origin")
            if not origin:
                return ""
            return origin if urlparse(origin).hostname in LOCAL_HOSTS else None

        def _camera(self):
            """The camera ?cam= asks for, the first one when it doesn't say."""
            label = parse_qs(urlparse(self.path).query).get("cam", [None])[0]
            if label is None:
                return cameras[0]
            return next((c for c in cameras if c.label == label), None)

        def _send(self, code, body, content_type, origin):
            self.send_response(code)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            if origin:
                self.send_header("Access-Control-Allow-Origin", origin)
            self.end_headers()
            self.wfile.write(body)

        def _json(self, data, origin, code=200):
            self._send(code, json.dumps(data).encode(), "application/json", origin)

        def _status(self):
            return {
                "cameras": [c.status() for c in cameras],
                "recording": recorder.recording(),
                "recording_cam": recorder.camera.label if recorder.recording() else None,
                "seconds": recorder.seconds(),
                "clip": recorder.path.name if recorder.recording() else None,
                "folder": str(recorder.folder),
                "clips": recorder.clips(),
                "on_air": air.on,
                "public_url": PUBLIC_URL,
            }

        def do_OPTIONS(self):
            origin = self._origin()
            if origin is None:
                return self._send(403, b"", "text/plain", None)
            self.send_response(204)
            if origin:
                self.send_header("Access-Control-Allow-Origin", origin)
                self.send_header("Access-Control-Allow-Methods", "GET, POST")
            self.end_headers()

        def do_GET(self):
            origin = self._origin()
            if origin is None:
                return self._send(403, b"local pages only", "text/plain", None)
            path = urlparse(self.path).path

            if path == "/status":
                return self._json(self._status(), origin)

            if path not in ("/snapshot", "/stream"):
                return self._send(404, b"not found", "text/plain", origin)
            camera = self._camera()
            if camera is None:
                return self._send(404, b"no camera by that name", "text/plain", origin)

            if path == "/snapshot":
                _, jpeg = camera.latest()
                if jpeg is None:
                    _, jpeg = camera.wait_frame(0, 5)
                if jpeg is None:
                    return self._send(503, (camera.problem or "no picture").encode(), "text/plain", origin)
                return self._send(200, jpeg, "image/jpeg", origin)

            self.send_response(200)
            self.send_header("Content-Type", "multipart/x-mixed-replace; boundary=frame")
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            seq = 0
            try:
                while True:
                    seq, jpeg = camera.wait_frame(seq, 5)
                    if jpeg is None:
                        continue
                    self.wfile.write(b"--frame\r\nContent-Type: image/jpeg\r\nContent-Length: %d\r\n\r\n" % len(jpeg))
                    self.wfile.write(jpeg)
                    self.wfile.write(b"\r\n")
            except (BrokenPipeError, ConnectionResetError):
                return

        def do_POST(self):
            origin = self._origin()
            if origin is None:
                return self._send(403, b"local pages only", "text/plain", None)
            path = urlparse(self.path).path

            if path == "/record/start":
                camera = self._camera()
                if camera is None:
                    return self._json({"error": "no camera by that name"}, origin, 404)
                try:
                    recorder.start(camera)
                except RuntimeError as e:
                    return self._json({"error": str(e)}, origin, 409)
                return self._json(self._status(), origin)

            if path == "/record/stop":
                saved = recorder.stop()
                status = self._status()
                status["saved"] = saved.name if saved else None
                return self._json(status, origin)

            if path == "/clips/open":
                recorder.folder.mkdir(parents=True, exist_ok=True)
                subprocess.run(["open", str(recorder.folder)])
                return self._json({"ok": True}, origin)

            if path in ("/air/on", "/air/off"):
                air.set(path == "/air/on")
                return self._json(self._status(), origin)

            self._send(404, b"not found", "text/plain", origin)

    return Handler


def make_public_handler(cameras, air):
    """The view-only listener the tunnel points at: still frames while on air,
    and nothing else - no names, no recording, no clips."""
    by_file = {c.label + ".jpg": c for c in cameras}

    class PublicHandler(BaseHTTPRequestHandler):
        def log_message(self, *args):
            pass

        def _send(self, code, body, content_type, cache="no-store"):
            self.send_response(code)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", cache)
            origin = self.headers.get("Origin")
            if origin in PUBLIC_ORIGINS or (origin and urlparse(origin).hostname in LOCAL_HOSTS):
                self.send_header("Access-Control-Allow-Origin", origin)
                self.send_header("Vary", "Origin")
            self.end_headers()
            if self.command != "HEAD":
                self.wfile.write(body)

        def do_GET(self):
            path = urlparse(self.path).path.lstrip("/")
            if path == "status":
                body = json.dumps({
                    "on_air": air.on,
                    "cameras": [{"label": c.label, "live": air.on and c.live()} for c in cameras],
                }).encode()
                return self._send(200, body, "application/json")

            camera = by_file.get(path)
            if camera is None:
                return self._send(404, b"not found", "text/plain")
            _, jpeg = camera.latest()
            if not air.on or not camera.live() or jpeg is None:
                return self._send(503, b"off air", "text/plain")
            # Cloudflare keeps each frame for a second, so however many people
            # are watching, the laptop sends about one frame a second
            self._send(200, jpeg, "image/jpeg", "public, max-age=1")

        do_HEAD = do_GET

        def do_POST(self):
            self._send(405, b"view only", "text/plain")

    return PublicHandler


def main():
    parser = argparse.ArgumentParser(description="Serve the desk cameras to griffinland and record clips.")
    parser.add_argument("--camera", action="append", metavar="LABEL=NAME",
                        help="a camera to serve: a short label, then part of its name ('test' for a test "
                             "pattern). Give it once per camera. Default: %s" % " ".join(DEFAULT_CAMERAS))
    parser.add_argument("--port", type=int, default=8080)
    parser.add_argument("--public-port", type=int, default=8081,
                        help="the view-only listener the tunnel points at (default: 8081)")
    parser.add_argument("--fps", type=int, default=30)
    parser.add_argument("--out", default="~/Desktop/workstation cam", help="where clips are saved")
    parser.add_argument("--max-minutes", type=int, default=10,
                        help="a forgotten recording stops itself after this long (default: 10)")
    parser.add_argument("--list", action="store_true", help="list the cameras ffmpeg can see and quit")
    args = parser.parse_args()

    if args.list:
        print("\n".join(list_cameras()) or "No cameras found.")
        return

    cameras, tests = [], 0
    for spec in args.camera or DEFAULT_CAMERAS:
        label, _, want = spec.partition("=")
        want = want or label
        pattern = TEST_PATTERNS[tests % len(TEST_PATTERNS)]
        if want == "test":
            tests += 1
        cameras.append(Camera(label, want, args.fps, pattern))
    recorder = Recorder(Path(args.out).expanduser(), args.fps, args.max_minutes * 60)
    air = Air()

    server = ThreadingHTTPServer(("127.0.0.1", args.port), make_handler(cameras, recorder, air, args.port))
    server.daemon_threads = True
    public = ThreadingHTTPServer(("127.0.0.1", args.public_port), make_public_handler(cameras, air))
    public.daemon_threads = True
    threading.Thread(target=public.serve_forever, daemon=True).start()
    for camera in cameras:
        camera.start()
    log("Desk cam on http://127.0.0.1:%d/snapshot - clips go to %s" % (args.port, recorder.folder))
    log("Public view on http://127.0.0.1:%d - off air until you switch it on" % args.public_port)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        if recorder.recording():
            recorder.stop()


if __name__ == "__main__":
    sys.exit(main())
