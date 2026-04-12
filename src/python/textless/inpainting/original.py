"""No-op inpainter — returns the original image unchanged."""

import numpy as np

from .base import CommonInpainter
from ..config import InpainterConfig


class OriginalInpainter(CommonInpainter):

    async def _inpaint(
        self,
        image: np.ndarray,
        mask: np.ndarray,
        config: InpainterConfig,
        inpainting_size: int = 1024,
        verbose: bool = False,
    ) -> np.ndarray:
        return np.copy(image)
