"""Real input and screen reads on the X display the browser runs on.

    python3 x11.py key Tab
    python3 x11.py click X Y
    python3 x11.py grab FILE

Chrome's permission dialog and its toolbar are browser UI, out of reach of the
DevTools protocol, so the checks press keys and read the screen through X.
Keys and clicks go through the XTEST extension (libXtst); grab needs Pillow.
"""

import ctypes
import sys
import time


def x_input():
    x11 = ctypes.CDLL("libX11.so.6")
    xtst = ctypes.CDLL("libXtst.so.6")
    x11.XOpenDisplay.restype = ctypes.c_void_p
    x11.XStringToKeysym.restype = ctypes.c_ulong
    x11.XKeysymToKeycode.argtypes = [ctypes.c_void_p, ctypes.c_ulong]
    for name in ("XFlush", "XCloseDisplay"):
        getattr(x11, name).argtypes = [ctypes.c_void_p]
    xtst.XTestFakeMotionEvent.argtypes = [ctypes.c_void_p, ctypes.c_int, ctypes.c_int, ctypes.c_int, ctypes.c_ulong]
    xtst.XTestFakeButtonEvent.argtypes = [ctypes.c_void_p, ctypes.c_uint, ctypes.c_int, ctypes.c_ulong]
    xtst.XTestFakeKeyEvent.argtypes = [ctypes.c_void_p, ctypes.c_uint, ctypes.c_int, ctypes.c_ulong]
    display = x11.XOpenDisplay(None)
    if not display:
        sys.exit("x11.py: no X display; run the checks under xvfb-run")
    return x11, xtst, display


def main(argv):
    command = argv[1]
    if command == "grab":
        from PIL import ImageGrab

        ImageGrab.grab().save(argv[2])
        return
    x11, xtst, display = x_input()
    if command == "click":
        x, y = int(argv[2]), int(argv[3])
        xtst.XTestFakeMotionEvent(display, -1, x, y, 0)
        x11.XFlush(display)
        time.sleep(0.15)
        xtst.XTestFakeButtonEvent(display, 1, 1, 0)
        x11.XFlush(display)
        time.sleep(0.05)
        xtst.XTestFakeButtonEvent(display, 1, 0, 0)
    elif command == "key":
        code = x11.XKeysymToKeycode(display, x11.XStringToKeysym(argv[2].encode()))
        xtst.XTestFakeKeyEvent(display, code, 1, 0)
        x11.XFlush(display)
        time.sleep(0.05)
        xtst.XTestFakeKeyEvent(display, code, 0, 0)
    else:
        sys.exit(f"x11.py: unknown command {command}")
    x11.XFlush(display)
    x11.XCloseDisplay(display)


if __name__ == "__main__":
    main(sys.argv)
