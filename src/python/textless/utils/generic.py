"""
Generic utilities for the textless pipeline.

Provides model download helpers, hash verification, and image resize utilities
used by the ModelWrapper base class and inpainting models.
"""

import hashlib
import os
import re
import sys

import cv2
import numpy as np
import requests
import tqdm


# Base path for locating model files (parent of the textless package).
MODULE_PATH = os.path.dirname(os.path.dirname(os.path.realpath(__file__)))
BASE_PATH = os.path.dirname(MODULE_PATH)


def replace_prefix(s: str, old: str, new: str) -> str:
    """Replace a string prefix if it matches."""
    if s.startswith(old):
        s = new + s[len(old):]
    return s


def get_digest(file_path: str) -> str:
    """Compute the SHA-256 hex digest of a file."""
    h = hashlib.sha256()
    buf_size = 65536

    with open(file_path, "rb") as file:
        while True:
            chunk = file.read(buf_size)
            if not chunk:
                break
            h.update(chunk)
    return h.hexdigest()


def get_filename_from_url(url: str, default: str = "") -> str:
    """Extract the filename component from a URL path."""
    m = re.search(r"/([^/?]+)[^/]*$", url)
    if m:
        return m.group(1)
    return default


def download_url_with_progressbar(url: str, path: str) -> None:
    """Download a file from *url* to *path* with console progress bar."""
    if os.path.basename(path) in (".", "") or os.path.isdir(path):
        new_filename = get_filename_from_url(url)
        if not new_filename:
            raise RuntimeError("Could not determine filename from URL")
        path = os.path.join(path, new_filename)

    headers: dict[str, str] = {}
    downloaded_size = 0
    if os.path.isfile(path):
        downloaded_size = os.path.getsize(path)
        headers["Range"] = f"bytes={downloaded_size}-"
        headers["Accept-Encoding"] = "deflate"

    r = requests.get(url, stream=True, allow_redirects=True, headers=headers, timeout=60)
    if downloaded_size and r.headers.get("Accept-Ranges") != "bytes":
        print("Warning: Server does not support partial downloads. Restarting from the beginning.", file=sys.stderr)
        r = requests.get(url, stream=True, allow_redirects=True, timeout=60)
        downloaded_size = 0
    total = int(r.headers.get("content-length", 0))
    chunk_size = 1024

    if r.ok:
        with tqdm.tqdm(
            desc=os.path.basename(path),
            initial=downloaded_size,
            total=total + downloaded_size,
            unit="iB",
            unit_scale=True,
            unit_divisor=chunk_size,
        ) as bar:
            with open(path, "ab" if downloaded_size else "wb") as f:
                is_tty = sys.stdout.isatty()
                downloaded_chunks = 0
                for data in r.iter_content(chunk_size=chunk_size):
                    size = f.write(data)
                    bar.update(size)
                    downloaded_chunks += 1
                    if not is_tty and downloaded_chunks % 1000 == 0:
                        print(bar, file=sys.stderr)
    else:
        raise RuntimeError(f'Could not download from URL: "{url}" (HTTP {r.status_code})')


def prompt_yes_no(query: str, default: bool | None = None) -> bool:
    """Interactive yes/no prompt (used during model download verification)."""
    suffix = "(%s/%s): " % ("Y" if default is True else "y", "N" if default is False else "n")
    while True:
        inp = input(query + " " + suffix).lower()
        if inp in ("yes", "y"):
            return True
        if inp in ("no", "n"):
            return False
        if not inp and default is not None:
            return default


def resize_keep_aspect(img: np.ndarray, size: int) -> np.ndarray:
    """Resize an image to fit within *size* pixels on the longer side, preserving aspect ratio."""
    ratio = float(size) / max(img.shape[0], img.shape[1])
    new_width = round(img.shape[1] * ratio)
    new_height = round(img.shape[0] * ratio)
    return cv2.resize(img, (new_width, new_height), interpolation=cv2.INTER_LINEAR_EXACT)
