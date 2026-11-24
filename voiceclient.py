
import socket
import subprocess
import base64
import threading
from urllib.parse import unquote

HOST = "127.0.0.1"
PORT = 7073

LOGIN = "googman"
PASSWD = "goog..."

sock = socket.create_connection((HOST, PORT))

player = subprocess.Popen(
    ["aplay", "-f", "S16_LE", "-r", "48000", "-c", "1"],
    stdin=subprocess.PIPE
)

def send_audio():
    mic = subprocess.Popen(
        ["arecord", "-f", "S16_LE", "-r", "48000", "-c", "1", "-t", "raw"],
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL
    )

    while True:
        audio = mic.stdout.read(1920)
        if not audio:
            break
        sock.sendall(b"voice|audio|" + base64.b64encode(audio) + b"|\n")

sock.sendall(f"login|{LOGIN}|{PASSWD}|\n".encode())

buffer = b""

while True:
    data = sock.recv(4096)
    if not data:
        break

    buffer += data

    while b"\n" in buffer:
        line, buffer = buffer.split(b"\n", 1)
        parts = [unquote(p) for p in line.decode().split("|")]

        if parts[0] != "voice":
            continue

        if parts[1] == "ready":
            sock.sendall(b"voice|join|general|\n")
            threading.Thread(target=send_audio, daemon=True).start()

        elif parts[1] == "audio":
            player.stdin.write(base64.b64decode(parts[3]))
            player.stdin.flush()
