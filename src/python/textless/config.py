"""
Textless pipeline configuration — inpainting model selection and parameters.

Trimmed from the original manga-image-translator config to include only
the models and settings used in our text-removal workflow.
"""

from enum import Enum

from pydantic import BaseModel


class InpaintPrecision(str, Enum):
    fp32 = "fp32"
    fp16 = "fp16"
    bf16 = "bf16"

    def __str__(self) -> str:
        return self.name


class Inpainter(str, Enum):
    default = "default"
    lama_large = "lama_large"
    lama_mpe = "lama_mpe"
    sd = "sd"
    none = "none"
    original = "original"


class InpainterConfig(BaseModel):
    """Runtime configuration for the inpainting model."""
    inpainter: Inpainter = Inpainter.lama_large
    """Inpainting model to use"""
    inpainting_size: int = 2048
    """Size of image used for inpainting (too large will result in OOM)"""
    inpainting_precision: InpaintPrecision = InpaintPrecision.bf16
    """Inpainting precision for lama, use bf16 while you can."""
