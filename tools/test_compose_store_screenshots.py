"""Tests for compose-store-screenshots.py. Run: python3 -m unittest discover -s tools -v

They make synthetic captures in a temporary folder and write the
screenshots there, never into the repository. Tests that set captions
need the Inter fonts and are skipped without them; CI installs them."""

import importlib.util
import os
import shutil
import tempfile
import unittest
from contextlib import redirect_stderr, redirect_stdout
from io import BytesIO, StringIO
from pathlib import Path
from unittest import mock

from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("compose", HERE / "compose-store-screenshots.py")
compose = importlib.util.module_from_spec(spec)
spec.loader.exec_module(compose)


def inter():
    """The installed Inter fonts, or None."""
    try:
        return compose.find_fonts()
    except compose.MissingRequirement:
        return None


needs_inter = unittest.skipIf(inter() is None, "Inter fonts are not installed")


def library_capture(colour):
    """A 1280 x 800 stand-in for a library capture, with some content on it."""
    image = Image.new("RGB", compose.SIZE, colour)
    ImageDraw.Draw(image).rectangle((276, 40, 990, 300), fill=(30, 60, 90))
    return image


def popup_capture():
    """A 720 x 1200 stand-in for a popup capture: content on top, empty rows below."""
    image = Image.new("RGB", (720, 1200), (255, 255, 255))
    ImageDraw.Draw(image).rectangle((40, 40, 680, 900), fill=(238, 242, 247))
    return image


class ComposeTest(unittest.TestCase):
    """compose-store-screenshots.py: what it makes, and what it refuses."""

    def setUp(self):
        """Gives each test a folder of good captures and an empty output folder."""
        self.root = Path(tempfile.mkdtemp())
        self.raw, self.out = self.root / "raw", self.root / "out"
        self.raw.mkdir()
        library_capture((255, 255, 255)).save(self.raw / "library-light.png")
        library_capture((24, 33, 61)).save(self.raw / "library-dark.png")
        for name in ("popup-reminder.png", "popup-add.png"):
            popup_capture().save(self.raw / name)

    def tearDown(self):
        """Removes the temporary folder."""
        shutil.rmtree(self.root, ignore_errors=True)

    def run_script(self, *extra):
        """Runs the script on the captures; returns exit code, stdout and stderr."""
        stdout, stderr = StringIO(), StringIO()
        with redirect_stdout(stdout), redirect_stderr(stderr):
            code = compose.main([str(self.raw), str(self.out), *extra])
        return code, stdout.getvalue(), stderr.getvalue()

    def written(self):
        """The files in the output folder, sorted; empty if it was never made."""
        return sorted(p.name for p in self.out.iterdir()) if self.out.exists() else []

    @needs_inter
    def test_writes_the_four_screenshots_at_1280x800_with_image_data_only(self):
        """All four screenshots are written, at the store's size, with no metadata."""
        code, _, err = self.run_script()
        self.assertEqual(code, 0, err)
        self.assertEqual(self.written(), sorted(name for name, _, _, _ in compose.SHOTS))
        for name in self.written():
            self.assertEqual(Image.open(self.out / name).size, (1280, 800), name)
            self.assertEqual(compose.chunks(self.out / name), {"IHDR", "IDAT", "IEND"}, name)

    @needs_inter
    def test_a_popup_is_framed_on_the_right_with_its_caption_on_the_left(self):
        """Navy page, the popup on the right half, light caption text on the left half."""
        self.run_script()
        image = Image.open(self.out / "screenshot-1-reminder.png").convert("RGB")
        self.assertEqual(image.getpixel((5, 5)), compose.NAVY)
        self.assertEqual(image.getpixel((1275, 795)), compose.NAVY)
        self.assertEqual(image.getpixel((930, 400)), (238, 242, 247), "popup content on the right")
        caption = image.crop((100, 240, 640, 560)).convert("L")
        self.assertGreater(caption.getextrema()[1], 200, "no light caption text on the left")

    @needs_inter
    def test_library_captures_are_used_as_they_are(self):
        """A library capture comes out pixel for pixel as it went in."""
        self.run_script()
        given = Image.open(self.raw / "library-dark.png").convert("RGB")
        made = Image.open(self.out / "screenshot-4-library-dark.png").convert("RGB")
        self.assertEqual(list(given.getdata()), list(made.getdata()))

    def test_a_missing_capture_is_named_and_nothing_is_written(self):
        """Exit 1, the missing file named, no screenshot written."""
        (self.raw / "popup-add.png").unlink()
        code, _, err = self.run_script()
        self.assertEqual(code, 1)
        self.assertIn("capture missing", err)
        self.assertIn("popup-add.png", err)
        self.assertEqual(self.written(), [])

    def test_a_single_colour_capture_is_refused(self):
        """A capture of a window that was never drawn stops the script (D-126)."""
        Image.new("RGB", compose.SIZE, (245, 244, 242)).save(self.raw / "library-light.png")
        code, _, err = self.run_script()
        self.assertEqual(code, 1)
        self.assertIn("single colour", err)
        self.assertEqual(self.written(), [])

    def test_a_file_that_is_not_an_image_is_refused(self):
        """A capture that cannot be opened as an image stops the script."""
        (self.raw / "popup-reminder.png").write_text("not a picture")
        code, _, err = self.run_script()
        self.assertEqual(code, 1)
        self.assertIn("not an image", err)
        self.assertEqual(self.written(), [])

    @needs_inter
    def test_a_library_capture_of_the_wrong_size_is_refused(self):
        """The library is used as it is, so it must already be 1280 x 800."""
        library_capture((255, 255, 255)).resize((1000, 760)).save(self.raw / "library-light.png")
        code, _, err = self.run_script()
        self.assertEqual(code, 1)
        self.assertIn("1000 x 760, not 1280 x 800", err)
        self.assertEqual(self.written(), [])

    def test_fonts_that_are_not_there_stop_it_with_exit_2(self):
        """A missing requirement exits 2 and says how to fix it; nothing is written."""
        code, _, err = self.run_script("--fonts", str(self.root / "no-fonts"))
        self.assertEqual(code, 2)
        self.assertIn("Inter fonts not found", err)
        self.assertEqual(self.written(), [])

    def test_a_font_folder_with_unreadable_fonts_exits_2(self):
        """Files named like Inter that are not fonts are reported, not used."""
        fonts = self.root / "fake-fonts"
        fonts.mkdir()
        for name in ("Inter-Bold.otf", "Inter-Regular.otf"):
            (fonts / name).write_text("not a font")
        code, _, err = self.run_script("--fonts", str(fonts))
        self.assertEqual(code, 2)
        self.assertIn("cannot be read", err)

    @needs_inter
    def test_a_caption_too_long_for_the_page_is_refused(self):
        """A caption that would run off the page stops the script instead of being cut."""
        with self.assertRaisesRegex(compose.ComposeError, "too long"):
            compose.framed(popup_capture(), "Title", ("A long line of caption text. " * 60,), inter())

    @needs_inter
    def test_screenshots_are_replaced_and_no_temporary_files_are_left(self):
        """A second run replaces the files in place and leaves only the four screenshots."""
        self.run_script()
        first = (self.out / "screenshot-2-library.png").stat().st_mtime_ns
        library_capture((250, 250, 250)).save(self.raw / "library-light.png")
        code, _, _ = self.run_script()
        self.assertEqual(code, 0)
        self.assertEqual(len(self.written()), 4)
        self.assertNotEqual((self.out / "screenshot-2-library.png").stat().st_mtime_ns, first)

    @unittest.skipIf(hasattr(os, "geteuid") and os.geteuid() == 0, "root can write anywhere")
    @needs_inter
    def test_a_folder_it_cannot_write_to_is_reported(self):
        """Exit 1 with the path when the output folder is read-only."""
        self.out.mkdir()
        os.chmod(self.out, 0o500)
        try:
            code, _, err = self.run_script()
        finally:
            os.chmod(self.out, 0o700)
        self.assertEqual(code, 1)
        self.assertIn("could not write", err)
        self.assertEqual(self.written(), [])


    def previous_set(self):
        """Puts a previous set of screenshots in the output folder; returns name -> bytes."""
        self.out.mkdir()
        previous = {}
        for index, (name, _, _, _) in enumerate(compose.SHOTS):
            buffer = BytesIO()
            Image.new("RGB", (8, 8), (index, 0, 0)).save(buffer, format="PNG")
            (self.out / name).write_bytes(buffer.getvalue())
            previous[name] = buffer.getvalue()
        return previous

    def unchanged(self, previous):
        """The names whose bytes in the output folder are still the previous ones."""
        return sorted(name for name, data in previous.items() if (self.out / name).read_bytes() == data)

    @needs_inter
    def test_a_disk_that_fills_after_two_files_replaces_none_of_the_previous_set(self):
        """A save that fails on the third screenshot leaves all four previous files, and no temporary ones."""
        previous = self.previous_set()
        save, calls = Image.Image.save, []

        def full_disk(image, *args, **kwargs):
            calls.append(1)
            if len(calls) == 3:
                raise OSError(28, "No space left on device")
            return save(image, *args, **kwargs)

        with mock.patch.object(Image.Image, "save", full_disk):
            code, _, err = self.run_script()
        self.assertEqual(code, 1)
        self.assertIn("No space left on device", err)
        self.assertIn("no screenshot was replaced", err)
        self.assertEqual(self.unchanged(previous), sorted(previous))
        self.assertEqual(self.written(), sorted(previous))

    @needs_inter
    def test_a_screenshot_that_would_carry_metadata_replaces_none_of_the_previous_set(self):
        """Metadata found in the last staged file stops the run before any file is replaced."""
        previous = self.previous_set()
        real, calls = compose.chunks, []

        def tagged(path):
            calls.append(1)
            return real(path) | ({"tEXt"} if len(calls) == 4 else set())

        with mock.patch.object(compose, "chunks", tagged):
            code, _, err = self.run_script()
        self.assertEqual(code, 1)
        self.assertIn("tEXt", err)
        self.assertEqual(self.unchanged(previous), sorted(previous))
        self.assertEqual(self.written(), sorted(previous))

    @needs_inter
    def test_a_rename_that_fails_part_way_names_the_files_already_replaced(self):
        """If the third rename fails, the message names the two replaced files and the rest are kept."""
        previous = self.previous_set()
        replace, calls = os.replace, []

        def failing(source, target):
            calls.append(1)
            if len(calls) == 3:
                raise OSError(13, "Permission denied")
            return replace(source, target)

        with mock.patch.object(compose.os, "replace", failing):
            code, _, err = self.run_script()
        first, second, third, fourth = (name for name, _, _, _ in compose.SHOTS)
        self.assertEqual(code, 1)
        self.assertIn(f"Already replaced: {first}, {second}", err)
        self.assertEqual(self.unchanged(previous), sorted([third, fourth]))
        self.assertEqual(self.written(), sorted(previous))


class HelpersTest(unittest.TestCase):
    """The small pieces the frames are built from."""

    def test_trim_cuts_the_empty_rows_under_the_content(self):
        """Rows below the content go, keeping a 40-pixel margin."""
        trimmed = compose.trim(popup_capture())
        self.assertEqual(trimmed.size, (720, 941))

    def test_trim_leaves_an_image_with_content_to_the_bottom_alone(self):
        """Nothing to cut, nothing cut."""
        image = Image.new("RGB", (100, 100), (255, 255, 255))
        ImageDraw.Draw(image).rectangle((0, 0, 99, 99), outline=(0, 0, 0))
        self.assertEqual(compose.trim(image).size, (100, 100))

    def test_wrap_keeps_every_line_within_the_width(self):
        """Each line fits; the words come back in order."""
        draw = ImageDraw.Draw(Image.new("RGB", (10, 10)))
        font = ImageFont.load_default()
        text = "Turn on reminders for a shop, and PromoBase opens by itself when you visit it."
        lines = compose.wrap(draw, text, font, 120)
        self.assertGreater(len(lines), 1)
        for line in lines:
            self.assertLessEqual(draw.textlength(line, font=font), 120, line)
        self.assertEqual(" ".join(lines), text)

    def test_wrap_gives_a_word_longer_than_the_width_its_own_line(self):
        """No empty lines, and an overlong word is kept whole."""
        draw = ImageDraw.Draw(Image.new("RGB", (10, 10)))
        font = ImageFont.load_default()
        self.assertEqual(compose.wrap(draw, "a supercalifragilistic b", font, 20), ["a", "supercalifragilistic", "b"])


if __name__ == "__main__":
    unittest.main()
