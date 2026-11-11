"""Génère les icônes PNG du jeu (pur Python : struct + zlib, aucune dépendance)."""
from __future__ import annotations

import struct
import zlib
from pathlib import Path

OUT = Path(__file__).parent / "icons"
OUT.mkdir(exist_ok=True)

BG_TOP = (15, 18, 32)
BG_BOTTOM = (26, 31, 58)
BLOCKS = [(108, 92, 231), (0, 206, 201), (253, 203, 110), (253, 121, 168)]


def write_png(path: Path, w: int, h: int, rows) -> None:
    def chunk(tag: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + tag + data + struct.pack(
            ">I", zlib.crc32(tag + data) & 0xFFFFFFFF
        )

    raw = b"".join(
        b"\x00" + b"".join(struct.pack("4B", *px) for px in row) for row in rows
    )
    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(raw, 9))
    png += chunk(b"IEND", b"")
    path.write_bytes(png)


def rounded_rect(x0, y0, x1, y1, r, color, rows, w, h):
    """Dessine un rectangle arrondi (rayon r) dans les lignes RGBA."""
    for y in range(max(0, y0), min(h, y1)):
        for x in range(max(0, x0), min(w, x1)):
            # coins arrondis : distance au coin le plus proche
            cx = x0 + r if x < x0 + r else (x1 - 1 - r if x >= x1 - r else x)
            cy = y0 + r if y < y0 + r else (y1 - 1 - r if y >= y1 - r else y)
            if (x - cx) ** 2 + (y - cy) ** 2 > r * r and (
                x < x0 + r or x >= x1 - r
            ) and (y < y0 + r or y >= y1 - r):
                continue
            rows[y][x] = (*color, 255)


def make_icon(size: int) -> list:
    rows = [[(*_lerp(BG_TOP, BG_BOTTOM, y / size), 255) for _ in range(size)] for y in range(size)]

    # 4 blocs 2x2 avec espacement
    margin = int(size * 0.16)
    gap = int(size * 0.06)
    cell = (size - 2 * margin - gap) // 2
    radius = max(4, int(cell * 0.18))

    for i, color in enumerate(BLOCKS):
        bx = margin + (i % 2) * (cell + gap)
        by = margin + (i // 2) * (cell + gap)
        rounded_rect(bx, by, bx + cell, by + cell, radius, color, rows, size, size)
        # reflet supérieur (bordure plus claire)
        for x in range(bx + radius, bx + cell - radius):
            rows[by + max(1, size // 80)][x] = (*tuple(min(255, c + 60) for c in color), 255)
    return rows


def _lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


for name, size in (("icon-192.png", 192), ("icon-512.png", 512), ("apple-touch-icon.png", 180)):
    write_png(OUT / name, size, size, make_icon(size))
    print(f"genere: icons/{name} ({size}x{size})")
