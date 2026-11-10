#!/usr/bin/env python3
"""Frames the captures of tools/store-screenshots.mjs as 1280 x 800 store screenshots (D-117).

    python3 tools/compose-store-screenshots.py RAW_DIR OUT_DIR [--fonts DIR]

The popup captures go on a navy page with a short caption; the library
captures are used as they are. Captions are set in Inter (SIL Open Font
License): from --fonts, or from where Inter is usually installed.
Needs Python 3.11 or later and Pillow 13 (pip install -r tools/requirements.txt).

It stops with a clear message rather than make a screenshot that would
mislead: a capture that is missing, not an image, of the wrong size or a
single colour (a browser window that was never drawn), a caption that does
not fit, or fonts it cannot find. The set is replaced whole or not at all:
every screenshot is made, saved to a temporary file beside its target and
checked for metadata before any existing file is replaced, so a failure up
to then (a full disk, say) leaves the previous screenshots as they were.
Replacing is then a rename in the same folder, which needs no disk space; if
one still fails, the message names the files already replaced.
Tests: tools/test_compose_store_screenshots.py.

Exit codes: 0 done, 1 a capture or a file failed, 2 a missing requirement.
"""

import argparse
import io
import os
import struct
import sys
import tempfile
from pathlib import Path

if sys.version_info < (3, 11):
    this = sys.version.split()[0]
    print(f"compose-store-screenshots.py needs Python 3.11 or later (for Pillow 13); this is {this}.", file=sys.stderr)
    sys.exit(2)

try:
    from PIL import Image, ImageDraw, ImageFilter, ImageFont, UnidentifiedImageError, __version__ as PILLOW_VERSION
except ImportError:
    print("Pillow is not installed for " + sys.executable + ".", file=sys.stderr)
    print("Install it with: python3 -m pip install -r tools/requirements.txt", file=sys.stderr)
    sys.exit(2)

if int(PILLOW_VERSION.split(".")[0]) < 13:
    print(f"Pillow {PILLOW_VERSION} is too old: these tools need 13 or later (tools/requirements.txt).", file=sys.stderr)
    sys.exit(2)

NAVY = (20, 33, 61)
YELLOW = (255, 221, 51)
WHITE = (243, 246, 251)
MUTED = (179, 191, 212)
SHADOW = (5, 10, 24)
SIZE = (1280, 800)  # what the Chrome Web Store asks for
S = 2  # drawn at twice the size, then scaled down

# Where Inter is usually installed, if --fonts is not given.
FONT_DIRS = (
    Path("/usr/share/fonts/opentype/inter"),
    Path("/usr/share/fonts/truetype/inter"),
    Path.home() / "Library" / "Fonts",
    Path("/Library/Fonts"),
    Path.home() / ".local" / "share" / "fonts",
)
FONT_NAMES = (("Inter-Bold.otf", "Inter-Regular.otf"), ("Inter-Bold.ttf", "Inter-Regular.ttf"))

# The four screenshots, in the order the store shows them.
SHOTS = (
    (
        "screenshot-1-reminder.png",
        "popup-reminder.png",
        "Your codes, on the shop's site",
        (
            "Turn on reminders for a shop, and PromoBase opens by itself when you visit it, "
            "with the codes you saved for it.",
            "Chrome asks before reminders start.",
        ),
    ),
    ("screenshot-2-library.png", "library-light.png", None, ()),
    (
        "screenshot-3-add.png",
        "popup-add.png",
        "Save a code in seconds",
        (
            "Only the code is needed. Add the shop, dates and a note if you like.",
            "Your codes stay in this Chrome profile. Nothing is uploaded.",
        ),
    ),
    ("screenshot-4-library-dark.png", "library-dark.png", None, ()),
)


def load_font(path, size):
    """The font in exactly this file. Pillow, given a path, would quietly fall
    back to a system font of the same name; given the bytes, it cannot."""
    return ImageFont.truetype(io.BytesIO(Path(path).read_bytes()), size)


class ComposeError(Exception):
    """A capture or file problem, said in a way the person running the script can act on."""


class MissingRequirement(Exception):
    """Something the script needs from the machine, such as the fonts."""


def find_fonts(folder=None):
    """The Inter bold and regular font files: from `folder` if given, else the usual places."""
    folders = (folder,) if folder is not None else FONT_DIRS
    for candidate in folders:
        for names in FONT_NAMES:
            pair = tuple(candidate / name for name in names)
            if all(path.is_file() for path in pair):
                try:
                    for path in pair:
                        load_font(path, 12)
                except OSError as error:
                    raise MissingRequirement(f"Inter cannot be read in {candidate}: {error}") from error
                return pair
    where = str(folder) if folder is not None else ", ".join(str(f) for f in FONT_DIRS)
    raise MissingRequirement(f"Inter fonts not found in {where}; install fonts-inter or pass --fonts DIR")


def load_capture(raw, name):
    """Opens one capture, refusing a missing file, a non-image or a single-colour image."""
    path = raw / name
    if not path.is_file():
        raise ComposeError(f"capture missing: {path} (make it with npm run screenshots)")
    try:
        with Image.open(path) as opened:
            image = opened.convert("RGB")
    except (UnidentifiedImageError, OSError) as error:
        raise ComposeError(f"{path} is not an image: {error}") from error
    if all(low == high for low, high in image.getextrema()):
        raise ComposeError(f"{path} is a single colour: the browser window was probably not drawn")
    return image


def trim(image):
    """Cuts the empty rows under the popup's content, keeping a 40-pixel margin."""
    width, height = image.size
    background = image.getpixel((width - 2, height - 2))
    for y in range(height - 1, 0, -1):
        if any(image.getpixel((x, y)) != background for x in range(0, width, 3)):
            # Row y is the last with content; keep the 40 rows after it.
            return image.crop((0, 0, width, min(height, y + 41)))
    return image


def wrap(draw, text, font, width):
    """Splits `text` into lines no wider than `width`; a single longer word gets a line of its own."""
    lines, line = [], ""
    for word in text.split():
        candidate = (line + " " + word).strip()
        if line and draw.textlength(candidate, font=font) > width:
            lines.append(line)
            line = word
        else:
            line = candidate
    if line:
        lines.append(line)
    return lines


def framed(popup, title, body, fonts):
    """The popup on the right of a navy page, with the title and body as a caption on the left."""
    bold, regular = fonts
    width, height = SIZE[0] * S, SIZE[1] * S
    image = Image.new("RGB", (width, height), NAVY)
    draw = ImageDraw.Draw(image)
    popup = trim(popup)
    scale = min(700 * S / popup.height, 480 * S / popup.width)
    popup = popup.resize((round(popup.width * scale), round(popup.height * scale)), Image.LANCZOS)
    px, py = width - popup.width - 110 * S, (height - popup.height) // 2
    shadow = Image.new("L", (width, height), 0)
    ImageDraw.Draw(shadow).rounded_rectangle(
        (px, py + 12 * S, px + popup.width, py + popup.height + 12 * S), radius=16 * S, fill=150
    )
    image.paste(SHADOW, (0, 0), shadow.filter(ImageFilter.GaussianBlur(24 * S)))
    mask = Image.new("L", popup.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, popup.width - 1, popup.height - 1), radius=14 * S, fill=255)
    image.paste(popup, (px, py), mask)
    x, text_width, y = 110 * S, px - 200 * S, 250 * S
    # The ticket mark, as in the icon.
    draw.rounded_rectangle((x, y - 70 * S, x + 56 * S, y - 36 * S), radius=5 * S, fill=YELLOW)
    for cx in (x, x + 56 * S):
        draw.ellipse((cx - 8 * S, y - 61 * S, cx + 8 * S, y - 45 * S), fill=NAVY)
    title_font = load_font(bold, 46 * S)
    for line in wrap(draw, title, title_font, text_width):
        draw.text((x, y), line, font=title_font, fill=WHITE)
        y += 58 * S
    y += 18 * S
    body_font = load_font(regular, 24 * S)
    for paragraph in body:
        for line in wrap(draw, paragraph, body_font, text_width):
            draw.text((x, y), line, font=body_font, fill=MUTED)
            y += 35 * S
        y += 16 * S
    if y > height - 40 * S:
        raise ComposeError(f'the caption "{title}" is too long for the page; shorten it')
    return image.resize(SIZE, Image.LANCZOS)


def as_is(capture, name):
    """A library capture, used as it is, which must already be 1280 x 800."""
    if capture.size != SIZE:
        raise ComposeError(f"{name} is {capture.size[0]} x {capture.size[1]}, not {SIZE[0]} x {SIZE[1]}")
    return capture


def chunks(path):
    """The chunk types in a PNG file."""
    data = path.read_bytes()
    found, at = set(), 8
    while at < len(data):
        (length,) = struct.unpack(">I", data[at : at + 4])
        found.add(data[at + 4 : at + 8].decode("latin-1"))
        at += 12 + length
    return found


def stage(image, path):
    """Saves `image` to a temporary file beside `path`, checks it holds image data only, and returns its path."""
    path.parent.mkdir(parents=True, exist_ok=True)
    handle, temporary = tempfile.mkstemp(prefix="." + path.stem + "-", suffix=".png", dir=path.parent)
    os.close(handle)
    temporary = Path(temporary)
    try:
        image.save(temporary, format="PNG", optimize=True)
        extra = sorted(chunks(temporary) - {"IHDR", "IDAT", "IEND"})
        if extra:
            raise ComposeError(f"{path} would carry chunks other than image data: {', '.join(extra)}")
    except BaseException:
        temporary.unlink()
        raise
    return temporary


def write_all(images):
    """Writes every (image, path) pair, replacing nothing until all of them are saved and checked."""
    staged = []
    try:
        for image, path in images:
            try:
                staged.append((stage(image, path), path))
            except OSError as error:
                raise ComposeError(f"could not write {path}: {error}; no screenshot was replaced") from error
        replaced = []
        for temporary, path in staged:
            try:
                os.replace(temporary, path)
            except OSError as error:
                done = ", ".join(p.name for p in replaced) or "none"
                raise ComposeError(
                    f"could not replace {path}: {error}. Already replaced: {done}; the rest are as they were. Run it again."
                ) from error
            replaced.append(path)
    finally:
        for temporary, _ in staged:
            if temporary.exists():
                temporary.unlink()


def compose(raw, out, fonts_dir=None):
    """Makes all four screenshots from the captures in `raw`, then writes them to `out`."""
    captures = {capture: load_capture(raw, capture) for _, capture, _, _ in SHOTS}
    fonts = find_fonts(fonts_dir)
    images = []
    for name, capture, title, body in SHOTS:
        image = framed(captures[capture], title, body, fonts) if title else as_is(captures[capture], capture)
        images.append((image, out / name))
    write_all(images)
    for _, path in images:
        print(f"wrote {path}")


def main(argv=None):
    """The command line: returns the exit code."""
    parser = argparse.ArgumentParser(description="Frame PromoBase's captures as store screenshots.")
    parser.add_argument("raw", type=Path, help="folder with the captures from tools/store-screenshots.mjs")
    parser.add_argument("out", type=Path, help="folder to write the screenshots into")
    parser.add_argument("--fonts", type=Path, help="folder with Inter-Bold and Inter-Regular (.otf or .ttf)")
    args = parser.parse_args(argv)
    try:
        compose(args.raw, args.out, args.fonts)
    except MissingRequirement as error:
        print(f"compose-store-screenshots.py: {error}", file=sys.stderr)
        return 2
    except ComposeError as error:
        print(f"compose-store-screenshots.py: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
