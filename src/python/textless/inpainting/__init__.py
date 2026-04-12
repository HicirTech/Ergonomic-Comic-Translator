"""Inpainting dispatcher — choose, prepare, and run an inpainter."""

from typing import Optional

import numpy as np

from .base import CommonInpainter, OfflineInpainter
from .lama import LamaMPEInpainter, LamaLargeInpainter
from .none import NoneInpainter
from .original import OriginalInpainter
from ..config import Inpainter, InpainterConfig

INPAINTERS: dict[Inpainter, type[CommonInpainter]] = {
    Inpainter.lama_large: LamaLargeInpainter,
    Inpainter.lama_mpe: LamaMPEInpainter,
    Inpainter.none: NoneInpainter,
    Inpainter.original: OriginalInpainter,
}

_cache: dict[Inpainter, CommonInpainter] = {}


def get_inpainter(key: Inpainter, *args, **kwargs) -> CommonInpainter:
    if key not in INPAINTERS:
        raise ValueError(f'Could not find inpainter for: "{key}". Choose from: {", ".join(str(k) for k in INPAINTERS)}')
    if not _cache.get(key):
        _cache[key] = INPAINTERS[key](*args, **kwargs)
    return _cache[key]


async def prepare(inpainter_key: Inpainter, device: str = 'cpu') -> None:
    inpainter = get_inpainter(inpainter_key)
    if isinstance(inpainter, OfflineInpainter):
        await inpainter.download()
        await inpainter.load(device)


async def dispatch(
    inpainter_key: Inpainter,
    image: np.ndarray,
    mask: np.ndarray,
    config: Optional[InpainterConfig],
    inpainting_size: int = 1024,
    device: str = 'cpu',
    verbose: bool = False,
) -> np.ndarray:
    inpainter = get_inpainter(inpainter_key)
    if isinstance(inpainter, OfflineInpainter):
        await inpainter.load(device)
    config = config or InpainterConfig()
    return await inpainter.inpaint(image, mask, config, inpainting_size, verbose)


async def unload(inpainter_key: Inpainter) -> None:
    _cache.pop(inpainter_key, None)
