"""Tests for draw-icons.py. Run: python3 -m unittest discover -s tools -v

They draw into a temporary folder, never into the repository."""

import importlib.util
import os
import tempfile
import unittest
from contextlib import redirect_stderr, redirect_stdout
from io import StringIO
from pathlib import Path

from PIL import Image
from PIL.PngImagePlugin import PngInfo

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("draw_icons", HERE / "draw-icons.py")
draw_icons = importlib.util.module_from_spec(spec)
spec.loader.exec_module(draw_icons)

ICON_SIZES = (16, 32, 48, 128)


def lato():
    """The installed Lato pair, or None."""
    for folder in draw_icons.FONT_DIRS:
        pair = folder / "Lato-Bold.ttf", folder / "Lato-Regular.ttf"
        if all(p.is_file() for p in pair):
            return pair
    return None


class DrawIconsTest(unittest.TestCase):
    """draw-icons.py end to end: what it draws, and how it fails."""

    def setUp(self):
        """Gives each test an empty output folder."""
        self.out = Path(tempfile.mkdtemp())
        self.font_dirs = draw_icons.FONT_DIRS

    def tearDown(self):
        """Restores the font search list and removes the output folder."""
        draw_icons.FONT_DIRS = self.font_dirs
        for root, dirs, files in os.walk(self.out, topdown=False):
            for name in files:
                os.remove(Path(root) / name)
            for name in dirs:
                os.chmod(Path(root) / name, 0o700)
                os.rmdir(Path(root) / name)
        os.rmdir(self.out)

    def run_script(self, *args):
        """Runs the script into the output folder; returns exit code, stdout and stderr."""
        stdout, stderr = StringIO(), StringIO()
        with redirect_stdout(stdout), redirect_stderr(stderr):
            code = draw_icons.main([*args, "--out", str(self.out)])
        return code, stdout.getvalue(), stderr.getvalue()

    def written(self):
        """Lists the files under the output folder, relative and sorted."""
        return sorted(str(p.relative_to(self.out)) for p in self.out.rglob("*") if p.is_file())

    def icon(self, size):
        """Opens the icon of the given size from the output folder."""
        return Image.open(self.out / "public" / "icons" / f"icon-{size}.png")

    def test_draws_every_icon_at_its_size_with_no_metadata(self):
        """Every icon is written at its size with image data only; no fonts means no tile."""
        draw_icons.FONT_DIRS = ()
        code, out, _ = self.run_script()
        self.assertEqual(code, 0)
        self.assertEqual(self.written(), sorted(f"public/icons/icon-{s}.png" for s in ICON_SIZES))
        for size in ICON_SIZES:
            path = self.out / "public" / "icons" / f"icon-{size}.png"
            self.assertEqual(self.icon(size).size, (size, size))
            self.assertEqual(set(draw_icons.chunks(path)), {"IHDR", "IDAT", "IEND"})
        self.assertIn("store tile left as it was", out)

    def test_icons_are_the_navy_tile_with_the_yellow_ticket(self):
        """Every icon is the navy tile with the yellow ticket in its middle."""
        draw_icons.FONT_DIRS = ()
        self.run_script()
        for size in ICON_SIZES:
            image = self.icon(size).convert("RGBA")
            middle = image.getpixel((size // 2, size // 2))
            self.assertEqual(middle[:3], draw_icons.YELLOW[:3], f"centre of {size}")
            edge = image.getpixel((size // 2, size // 16 + (16 if size == 128 else 0)))
            self.assertEqual(edge[:3], draw_icons.NAVY[:3], f"top of the tile at {size}")

    def test_the_128_icon_keeps_16_px_of_transparent_space(self):
        """The 128 px icon keeps the 16 px transparent margin the store asks for."""
        draw_icons.FONT_DIRS = ()
        self.run_script()
        image = self.icon(128).convert("RGBA")
        for point in ((0, 0), (64, 8), (8, 64), (127, 127), (64, 120)):
            self.assertEqual(image.getpixel(point)[3], 0, point)
        self.assertEqual(image.getpixel((64, 20))[3], 255)

    def test_the_ticket_has_no_tear_line(self):
        """The ticket is solid yellow between its bites: no tear line (D-114)."""
        draw_icons.FONT_DIRS = ()
        self.run_script()
        image = self.icon(128).convert("RGB")
        # Across the ticket's middle, between the bites, it is yellow throughout.
        row = [image.getpixel((x, 64)) for x in range(44, 85)]
        self.assertTrue(all(p == draw_icons.YELLOW[:3] for p in row))

    @unittest.skipIf(lato() is None, "Lato fonts are not installed")
    def test_the_tile_centres_the_ticket_and_the_text(self):
        """The tile's ticket and text line up top and bottom, and the group is centred (D-114)."""
        bold, regular = lato()
        code, _, _ = self.run_script("--bold", str(bold), "--regular", str(regular))
        self.assertEqual(code, 0)
        path = self.out / "store" / "promo-tile-440x280.png"
        self.assertEqual(set(draw_icons.chunks(path)), {"IHDR", "IDAT", "IEND"})
        image = Image.open(path).convert("RGB")
        self.assertEqual(image.size, (440, 280))
        light = [[sum(image.getpixel((x, y))) > 300 for x in range(440)] for y in range(280)]
        columns = [x for x in range(440) if any(light[y][x] for y in range(280))]
        split = next(columns[i + 1] for i in range(len(columns) - 1) if columns[i + 1] - columns[i] > 5)

        def rows(x0, x1):
            ys = [y for y in range(280) if any(light[y][x0:x1])]
            return ys[0], ys[-1]

        ticket, text = rows(columns[0], split), rows(split, columns[-1] + 1)
        self.assertLessEqual(abs(ticket[0] - text[0]), 1, "tops line up")
        self.assertLessEqual(abs(ticket[1] - text[1]), 1, "bottoms line up")
        self.assertLessEqual(abs(columns[0] - (439 - columns[-1])), 2, "centred across")
        self.assertLessEqual(abs(ticket[0] - (279 - ticket[1])), 2, "centred down")

    def test_both_fonts_or_neither(self):
        """Passing only one of the two fonts fails with exit 1 and writes nothing."""
        code, _, err = self.run_script("--bold", "Lato-Bold.ttf")
        self.assertEqual(code, 1)
        self.assertIn("both --bold and --regular", err)
        self.assertEqual(self.written(), [])

    def test_a_missing_font_writes_nothing(self):
        """A font path that does not exist fails with exit 1 and writes nothing."""
        code, _, err = self.run_script("--bold", "/nonexistent/B.ttf", "--regular", "/nonexistent/R.ttf")
        self.assertEqual(code, 1)
        self.assertIn("Font not found", err)
        self.assertEqual(self.written(), [])

    def test_an_unreadable_font_writes_nothing(self):
        """A file that is not a font fails with exit 1 and writes nothing."""
        junk = self.out / "junk.ttf"
        junk.write_text("not a font")
        code, _, err = self.run_script("--bold", str(junk), "--regular", str(junk))
        self.assertEqual(code, 1)
        self.assertIn("cannot be read", err)
        self.assertEqual(self.written(), ["junk.ttf"])

    @unittest.skipIf(hasattr(os, "geteuid") and os.geteuid() == 0, "root can write anywhere")
    def test_a_folder_it_cannot_write_to_is_reported_and_leaves_no_temporary_files(self):
        """An unwritable folder is reported with exit 1 and leaves no temporary files."""
        draw_icons.FONT_DIRS = ()
        icons = self.out / "public" / "icons"
        icons.mkdir(parents=True)
        os.chmod(icons, 0o500)
        code, _, err = self.run_script()
        self.assertEqual(code, 1)
        self.assertIn("Could not write", err)
        self.assertEqual(self.written(), [])

    def test_a_file_with_metadata_is_rejected(self):
        """check_no_metadata rejects a PNG with a text chunk and accepts a plain one."""
        path = self.out / "tagged.png"
        info = PngInfo()
        info.add_text("Software", "something")
        Image.new("RGB", (4, 4)).save(path, pnginfo=info)
        with self.assertRaisesRegex(draw_icons.DrawError, "tEXt"):
            draw_icons.check_no_metadata(path)
        Image.new("RGB", (4, 4)).save(path)
        draw_icons.check_no_metadata(path)


if __name__ == "__main__":
    unittest.main()
