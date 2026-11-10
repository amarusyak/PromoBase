"""Frames the captures of tools/store-screenshots.mjs as 1280 x 800 store screenshots.

    python3 tools/compose-store-screenshots.py RAW_DIR OUT_DIR [INTER_DIR]

The popup captures go on a navy page with a short caption; the library
captures are used as they are. Captions are set in Inter (SIL Open Font
License), by default from /usr/share/fonts/opentype/inter. Every file is
written without metadata and checked afterwards.
"""

import struct
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

NAVY = (20, 33, 61)
YELLOW = (255, 221, 51)
WHITE = (243, 246, 251)
MUTED = (179, 191, 212)
SHADOW = (5, 10, 24)
S = 2  # drawn at twice the size, then scaled down


def trim(image):
    """Cuts the empty rows under the popup's content."""
    rgb = image.convert("RGB")
    width, height = rgb.size
    background = rgb.getpixel((width - 2, height - 2))
    for y in range(height - 1, 0, -1):
        if any(rgb.getpixel((x, y)) != background for x in range(0, width, 3)):
            return image.crop((0, 0, width, min(height, y + 40)))
    return image


def wrap(draw, text, font, width):
    lines, line = [], ""
    for word in text.split():
        candidate = (line + " " + word).strip()
        if draw.textlength(candidate, font=font) <= width:
            line = candidate
        else:
            lines.append(line)
            line = word
    lines.append(line)
    return lines


def framed(popup_path, title, body, fonts):
    bold, regular = fonts
    width, height = 1280 * S, 800 * S
    image = Image.new("RGB", (width, height), NAVY)
    draw = ImageDraw.Draw(image)
    popup = trim(Image.open(popup_path).convert("RGB"))
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
    title_font = ImageFont.truetype(str(bold), 46 * S)
    for line in wrap(draw, title, title_font, text_width):
        draw.text((x, y), line, font=title_font, fill=WHITE)
        y += 58 * S
    y += 18 * S
    body_font = ImageFont.truetype(str(regular), 24 * S)
    for paragraph in body:
        for line in wrap(draw, paragraph, body_font, text_width):
            draw.text((x, y), line, font=body_font, fill=MUTED)
            y += 35 * S
        y += 16 * S
    return image.resize((1280, 800), Image.LANCZOS)


def save(image, path):
    if image.size != (1280, 800):
        sys.exit(f"{path.name} is {image.size}, not 1280 x 800")
    image.convert("RGB").save(path, format="PNG", optimize=True)
    data = path.read_bytes()
    chunks, at = set(), 8
    while at < len(data):
        (length,) = struct.unpack(">I", data[at : at + 4])
        chunks.add(data[at + 4 : at + 8].decode("latin-1"))
        at += 12 + length
    if chunks != {"IHDR", "IDAT", "IEND"}:
        sys.exit(f"{path.name} carries chunks other than image data: {sorted(chunks)}")
    print(f"wrote {path}")


def main(argv):
    raw, out = Path(argv[1]), Path(argv[2])
    inter = Path(argv[3]) if len(argv) > 3 else Path("/usr/share/fonts/opentype/inter")
    fonts = (inter / "Inter-Bold.otf", inter / "Inter-Regular.otf")
    for font in fonts:
        if not font.is_file():
            sys.exit(f"Inter font not found: {font}")
    out.mkdir(parents=True, exist_ok=True)
    save(
        framed(
            raw / "popup-reminder.png",
            "Your codes, on the shop's site",
            [
                "Turn on reminders for a shop, and PromoBase opens by itself when you visit it, with the codes you saved for it.",
                "Chrome asks you first, one shop at a time.",
            ],
            fonts,
        ),
        out / "screenshot-1-reminder.png",
    )
    save(Image.open(raw / "library-light.png"), out / "screenshot-2-library.png")
    save(
        framed(
            raw / "popup-add.png",
            "Save a code in seconds",
            [
                "Only the code is needed. Add the shop, dates and a note if you like.",
                "Your codes stay in this Chrome profile. Nothing is uploaded.",
            ],
            fonts,
        ),
        out / "screenshot-3-add.png",
    )
    save(Image.open(raw / "library-dark.png"), out / "screenshot-4-library-dark.png")


if __name__ == "__main__":
    main(sys.argv)
