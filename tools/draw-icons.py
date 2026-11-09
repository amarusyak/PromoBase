#!/usr/bin/env python3
"""Draws PromoBase's icons and its Chrome Web Store tile (D-044, D-105).

    python3 tools/draw-icons.py [--bold Lato-Bold.ttf --regular Lato-Regular.ttf] [--out DIR]

Writes public/icons/icon-{16,32,48,128}.png and store/promo-tile-440x280.png,
under the repository or under --out. Tests: tools/test_draw_icons.py.
Needs Python 3.8 or later and Pillow (pip install -r tools/requirements.txt).
The tile needs the Lato fonts (SIL Open Font License): pass them, or have them
installed where the script looks; without them only the icons are drawn.

Every shape is drawn here at 8x and scaled down, so nothing comes from a third
party, and the files carry no metadata: each one is checked after it is written.
Nothing is written until every image has been drawn, so a failure while
drawing leaves the files as they were, and each file is replaced in one step,
so none is ever left half-written.

Exit codes: 0 done, 1 drawing or writing failed, 2 a missing requirement.
"""

import argparse
import os
import struct
import sys
import tempfile

from pathlib import Path

if sys.version_info < (3, 8):
    sys.exit("draw-icons.py needs Python 3.8 or later; this is " + sys.version.split()[0] + ".")

try:
    from PIL import Image, ImageDraw, ImageFont, __version__ as PILLOW_VERSION
except ImportError:
    print("Pillow is not installed for " + sys.executable + ".", file=sys.stderr)
    print("Install it with: python3 -m pip install -r tools/requirements.txt", file=sys.stderr)
    sys.exit(2)

if not hasattr(ImageDraw.ImageDraw, "rounded_rectangle"):
    print(f"Pillow {PILLOW_VERSION} is too old: rounded rectangles need 8.2 or later.", file=sys.stderr)
    sys.exit(2)


NAVY = (20, 33, 61, 255)  # --ink, #14213d
YELLOW = (255, 221, 51, 255)  # --marker, #ffdd33
CLEAR = (0, 0, 0, 0)
SCALE = 8
ROOT = Path(__file__).resolve().parent.parent
ICONS = ((16, 0), (32, 0), (48, 0), (128, 16))
TILE = Path("store") / "promo-tile-440x280.png"

# Where the Lato fonts usually are, if no paths are given.
FONT_DIRS = (
    Path("/usr/share/fonts/truetype/lato"),
    Path.home() / "Library" / "Fonts",
    Path("/Library/Fonts"),
    Path.home() / ".local" / "share" / "fonts",
)


class DrawError(Exception):
    """A step that failed, said in a way the person running the script can act on."""


def ticket(draw, box, colour, hole):
    """The PromoBase ticket: a rounded rectangle with a bite out of each side.
    The same shape as the brand mark in the interface and the highlighted
    toolbar icon (src/platform/highlight.ts)."""
    left, top, right, bottom = box
    height = bottom - top
    draw.rounded_rectangle(box, radius=height * 0.14, fill=colour)
    bite = height * 0.25
    middle = top + height / 2
    for x in (left, right):
        draw.ellipse((x - bite, middle - bite, x + bite, middle + bite), fill=hole)


def icon(size, padding=0):
    """The navy tile with the yellow ticket. `padding` is transparent space on
    each side, as the store asks for in the 128 px icon (96 px of artwork)."""
    big = size * SCALE
    pad = padding * SCALE
    image = Image.new("RGBA", (big, big), CLEAR)
    draw = ImageDraw.Draw(image)
    tile = big - 2 * pad
    draw.rounded_rectangle((pad, pad, pad + tile - 1, pad + tile - 1), radius=tile * 0.22, fill=NAVY)
    width, height = tile * 0.72, tile * 0.44
    left = pad + (tile - width) / 2
    top = pad + (tile - height) / 2
    ticket(draw, (left, top, left + width, top + height), YELLOW, NAVY)
    return image.resize((size, size), Image.LANCZOS)


def promo_tile(bold, regular):
    """The 440 x 280 small promo tile for the store listing. The layout is
    worked out from the text's measured size: the ticket is as tall as the
    text block, both share one vertical centre, and the group is centred."""
    width, height = 440, 280
    s = SCALE
    image = Image.new("RGBA", (width * s, height * s), NAVY)
    draw = ImageDraw.Draw(image)
    title_font = ImageFont.truetype(str(bold), 40 * s)
    line_font = ImageFont.truetype(str(regular), 17 * s)
    # The text block at the origin: (text, font, top), tops as in the design.
    texts = [("PromoBase", title_font, 0, YELLOW)] + [
        (line, line_font, (56 + i * 24) * s, (243, 246, 251, 255))
        for i, line in enumerate(("Save promo codes.", "See them on the shop's site."))
    ]
    boxes = [draw.textbbox((0, top), text, font=font) for text, font, top, _ in texts]
    ink_left = min(box[0] for box in boxes)
    ink_top = min(box[1] for box in boxes)
    ink_right = max(box[2] for box in boxes)
    ink_bottom = max(box[3] for box in boxes)
    block_height = ink_bottom - ink_top
    ticket_height = block_height
    ticket_width = ticket_height * 136 / 96  # the tile's ticket proportions
    gap = 26 * s
    group = ticket_width + gap + (ink_right - ink_left)
    left = (width * s - group) / 2
    top = (height * s - block_height) / 2
    ticket(draw, (left, top, left + ticket_width, top + ticket_height), YELLOW, NAVY)
    text_x = left + ticket_width + gap - ink_left
    text_y = top - ink_top
    for text, font, line_top, colour in texts:
        draw.text((text_x, text_y + line_top), text, font=font, fill=colour)
    return image.resize((width, height), Image.LANCZOS).convert("RGB")


def find_fonts(bold, regular):
    """The two font files to use, or None when the tile is to be skipped.
    Fonts that were asked for must work; found ones are only a convenience."""
    if (bold is None) != (regular is None):
        raise DrawError("Pass both --bold and --regular, or neither.")
    if bold is not None:
        for path in (bold, regular):
            if not path.is_file():
                raise DrawError(f"Font not found: {path}")
            try:
                ImageFont.truetype(str(path), 12)
            except OSError as error:
                raise DrawError(f"Font cannot be read: {path} ({error})") from error
        return bold, regular
    for folder in FONT_DIRS:
        pair = folder / "Lato-Bold.ttf", folder / "Lato-Regular.ttf"
        if all(p.is_file() for p in pair):
            try:
                for p in pair:
                    ImageFont.truetype(str(p), 12)
            except OSError:
                continue
            return pair
    return None


def chunks(path):
    """The chunk types in a PNG file, in order."""
    data = path.read_bytes()
    if data[:8] != b"\x89PNG\r\n\x1a\n":
        raise DrawError(f"{path} is not a PNG file.")
    found, at = [], 8
    while at < len(data):
        (length,) = struct.unpack(">I", data[at : at + 4])
        found.append(data[at + 4 : at + 8].decode("latin-1"))
        at += 12 + length
    return found


def check_no_metadata(path):
    """Raises DrawError when the PNG holds anything besides image data."""
    extra = sorted(set(chunks(path)) - {"IHDR", "IDAT", "IEND"})
    if extra:
        raise DrawError(f"{path} carries chunks other than image data: {', '.join(extra)}")


def write(image, path):
    """Saves `image` to `path` in one step, then checks it carries no metadata."""
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        handle, temporary = tempfile.mkstemp(suffix=".png", dir=path.parent)
        os.close(handle)
        try:
            image.save(temporary, format="PNG", optimize=True)
            os.replace(temporary, path)
        finally:
            if os.path.exists(temporary):
                os.remove(temporary)
    except OSError as error:
        raise DrawError(f"Could not write {path}: {error}") from error
    check_no_metadata(path)


def main(argv=None):
    parser = argparse.ArgumentParser(description="Draw PromoBase's icons and store tile.")
    parser.add_argument("--bold", type=Path, help="Lato-Bold.ttf, for the store tile")
    parser.add_argument("--regular", type=Path, help="Lato-Regular.ttf, for the store tile")
    parser.add_argument("--out", type=Path, default=ROOT, help="folder to write into (default: the repository)")
    args = parser.parse_args(argv)
    out = args.out.resolve()
    try:
        fonts = find_fonts(args.bold, args.regular)
        # Draw everything first, so a failure here writes nothing.
        images = [(icon(size, padding), out / "public" / "icons" / f"icon-{size}.png") for size, padding in ICONS]
        if fonts is not None:
            images.append((promo_tile(*fonts), out / TILE))
        for image, path in images:
            write(image, path)
            print(f"wrote {path.relative_to(out)}")
    except DrawError as error:
        print(f"draw-icons.py: {error}", file=sys.stderr)
        return 1
    if fonts is None:
        print("Lato fonts not found: icons drawn, store tile left as it was. Pass --bold and --regular to draw it.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
