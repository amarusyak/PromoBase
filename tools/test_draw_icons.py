"""Tests for draw-icons.py. Run: python3 -m unittest discover -s tools -v

They draw into a temporary folder, never into the repository."""

import importlib.util
import os
import subprocess
import sys
import tempfile
import unittest
from contextlib import redirect_stderr, redirect_stdout
from io import BytesIO, StringIO
from pathlib import Path
from unittest import mock

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

    def test_a_non_font_named_like_lato_is_not_replaced_by_the_installed_lato(self):
        """Pillow would load a system font of the same name; the script must read the file it was given."""
        folder = self.out / "fonts"
        folder.mkdir()
        for name in ("Lato-Bold.ttf", "Lato-Regular.ttf"):
            (folder / name).write_text("not a font")
        code, _, err = self.run_script("--bold", str(folder / "Lato-Bold.ttf"), "--regular", str(folder / "Lato-Regular.ttf"))
        self.assertEqual(code, 1)
        self.assertIn("cannot be read", err)

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

    def previous_icons(self):
        """Puts a previous set of icons in the output folder; returns path -> bytes."""
        draw_icons.FONT_DIRS = ()
        icons = self.out / "public" / "icons"
        icons.mkdir(parents=True)
        previous = {}
        for size in ICON_SIZES:
            buffer = BytesIO()
            Image.new("RGB", (4, 4), (size, 0, 0)).save(buffer, format="PNG")
            (icons / f"icon-{size}.png").write_bytes(buffer.getvalue())
            previous[f"public/icons/icon-{size}.png"] = buffer.getvalue()
        return previous

    def unchanged(self, previous):
        """The paths whose bytes in the output folder are still the previous ones."""
        return sorted(name for name, data in previous.items() if (self.out / name).read_bytes() == data)

    def test_a_disk_that_fills_after_two_files_replaces_none_of_the_previous_icons(self):
        """A save that fails on the third icon leaves all four previous files, and no temporary ones."""
        previous = self.previous_icons()
        save, calls = Image.Image.save, []

        def full_disk(image, *args, **kwargs):
            calls.append(1)
            if len(calls) == 3:
                raise OSError(28, "No space left on device")
            return save(image, *args, **kwargs)

        with mock.patch.object(Image.Image, "save", full_disk):
            code, _, err = self.run_script()
        self.assertEqual(code, 1)
        self.assertIn("No file was replaced", err)
        self.assertEqual(self.unchanged(previous), sorted(previous))
        self.assertEqual(self.written(), sorted(previous))

    def test_a_rename_that_fails_part_way_names_the_icons_already_replaced(self):
        """If the third rename fails, the message names the two replaced icons and the rest are kept."""
        previous = self.previous_icons()
        replace, calls = os.replace, []

        def failing(source, target):
            calls.append(1)
            if len(calls) == 3:
                raise OSError(13, "Permission denied")
            return replace(source, target)

        with mock.patch.object(draw_icons.os, "replace", failing):
            code, _, err = self.run_script()
        self.assertEqual(code, 1)
        self.assertIn("Already replaced: icon-16.png, icon-32.png", err)
        self.assertEqual(self.unchanged(previous), ["public/icons/icon-128.png", "public/icons/icon-48.png"])
        self.assertEqual(self.written(), sorted(previous))

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


SCRIPT = HERE / "draw-icons.py"


def script_args(root, out):
    """The command line that runs the script on `root`, writing into `out`."""
    return ["--out", str(out)]


class RequirementsTest(unittest.TestCase):
    """The script refuses to run with a Pillow older than tools/requirements.txt asks for."""

    def test_an_old_pillow_stops_it_with_exit_2_and_writes_nothing(self):
        """A stand-in Pillow 12.3.0 on the path makes the script exit 2 before it draws anything."""
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            fake = root / "PIL"
            fake.mkdir()
            (fake / "__init__.py").write_text('__version__ = "12.3.0"\nclass UnidentifiedImageError(OSError):\n    pass\n')
            for name in ("Image", "ImageDraw", "ImageFilter", "ImageFont"):
                (fake / f"{name}.py").write_text("")
            out = root / "out"
            out.mkdir()
            result = subprocess.run(
                [sys.executable, str(SCRIPT), *script_args(root, out)],
                env={**os.environ, "PYTHONPATH": str(root)},
                capture_output=True,
                text=True,
                timeout=60,
            )
            self.assertEqual(result.returncode, 2, result.stderr)
            self.assertIn("Pillow 12.3.0 is too old", result.stderr)
            self.assertEqual(list(out.iterdir()), [])


if __name__ == "__main__":
    unittest.main()
