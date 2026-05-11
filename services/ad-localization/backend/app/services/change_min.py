"""Change-minimization verifier — perceptual hash outside the edit mask.

The AI adapters produce an edited image/frame. This service verifies that
pixels OUTSIDE the edit mask are ~bit-identical to the source using a block-
based perceptual hash. Failure → retry / escalate per Change Minimization
policy in CLAUDE.md.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass
class VerificationResult:
    passed: bool
    score: float  # 0..1 higher is closer; 1.0 = identical
    failed_regions: list[dict]
    reason: str | None = None


DEFAULT_THRESHOLD = 0.98


def _lazy_imports():
    try:
        from PIL import Image  # noqa: F401
        import imagehash  # noqa: F401
    except ImportError as e:
        raise RuntimeError(
            "Change minimization requires Pillow + imagehash. `pip install -e .[parsing]`"
        ) from e


def verify_image_minimization(
    source_png: bytes,
    output_png: bytes,
    mask_bbox: tuple[int, int, int, int] | None,
    threshold: float = DEFAULT_THRESHOLD,
) -> VerificationResult:
    """Compare source vs output outside `mask_bbox` using phash of tile grid.

    If `mask_bbox` is None (no-op edit), verifies the whole image.
    """
    _lazy_imports()
    import io

    import imagehash
    from PIL import Image

    src = Image.open(io.BytesIO(source_png)).convert("RGB")
    out = Image.open(io.BytesIO(output_png)).convert("RGB")
    if src.size != out.size:
        return VerificationResult(
            passed=False,
            score=0.0,
            failed_regions=[{"type": "size_mismatch", "source": src.size, "output": out.size}],
            reason="ChangeBleed: resolution changed",
        )

    width, height = src.size
    tile = 32
    mismatches: list[dict] = []
    max_dist = 0
    total_hashes = 0

    for y in range(0, height, tile):
        for x in range(0, width, tile):
            if mask_bbox and _overlaps((x, y, tile, tile), mask_bbox):
                continue
            box = (x, y, min(x + tile, width), min(y + tile, height))
            h1 = imagehash.phash(src.crop(box))
            h2 = imagehash.phash(out.crop(box))
            dist = h1 - h2
            total_hashes += 1
            max_dist = max(max_dist, dist)
            if dist > 4:  # 4 bits difference on a 64-bit phash → perceptible
                mismatches.append({"bbox": [x, y, tile, tile], "phash_dist": dist})

    score = 1.0 if total_hashes == 0 else max(0.0, 1.0 - (max_dist / 64.0))
    passed = score >= threshold and not mismatches
    return VerificationResult(
        passed=passed,
        score=score,
        failed_regions=mismatches,
        reason=None if passed else "ChangeBleed: AI edit exceeded mask",
    )


def _overlaps(a: tuple[int, int, int, int], b: tuple[int, int, int, int]) -> bool:
    ax, ay, aw, ah = a
    bx, by, bw, bh = b
    return not (ax + aw <= bx or bx + bw <= ax or ay + ah <= by or by + bh <= ay)
