"""Prompt Assembly core — composes layer contributions into a final prompt
ready for an AI adapter, plus an auditable trace.

Token-budget rule per PROMPT_ASSEMBLY.md:
  - Never truncate layers with non_truncatable=True.
  - Truncate in order: FewShotLayer → SourceContextLayer non-critical parts.
"""

from __future__ import annotations

from dataclasses import asdict
from typing import Iterable

from app.prompt_assembly.base import BaseLayerImpl
from app.prompt_assembly.context import PromptContext
from app.prompt_assembly.layers import ALL_LAYERS
from app.prompt_assembly.trace import (
    AssembledPrompt,
    AssemblyTrace,
    LayerContribution,
    LayerTraceEntry,
)
from app.prompt_assembly.use_cases import UseCase

DEFAULT_TOKEN_BUDGET = 60_000


def _applicable(layers: Iterable[BaseLayerImpl], use_case: UseCase) -> list[BaseLayerImpl]:
    return [l for l in layers if use_case in l.applies_to]


def _merge(contributions: list[tuple[BaseLayerImpl, LayerContribution]]) -> dict:
    merged = {
        "system_additions": [],
        "user_additions": [],
        "positive_additions": [],
        "negative_additions": [],
        "preservation_directives": [],
        "mask_constraints": [],
        "audio_prompt_additions": [],
        "motion_prompt_additions": [],
        "reference_assets": [],
        "few_shot_examples": [],
        "forced_params": {},
    }
    for _, c in contributions:
        merged["system_additions"].extend(c.system_additions)
        merged["user_additions"].extend(c.user_additions)
        merged["positive_additions"].extend(c.positive_additions)
        merged["negative_additions"].extend(c.negative_additions)
        merged["preservation_directives"].extend(c.preservation_directives)
        merged["mask_constraints"].extend(c.mask_constraints)
        merged["audio_prompt_additions"].extend(c.audio_prompt_additions)
        merged["motion_prompt_additions"].extend(c.motion_prompt_additions)
        merged["reference_assets"].extend(c.reference_assets)
        merged["few_shot_examples"].extend(c.few_shot_examples)
        merged["forced_params"].update(c.forced_params)
    return merged


def _build_final(merged: dict) -> AssembledPrompt:
    system = "\n".join([p for p in merged["system_additions"] if p])
    user_parts: list[str] = []
    if merged["positive_additions"]:
        user_parts.append("INSTRUCTIONS:\n- " + "\n- ".join(merged["positive_additions"]))
    if merged["user_additions"]:
        user_parts.append("\n\n".join(merged["user_additions"]))
    user = "\n\n".join(user_parts)

    negative = (
        "Avoid: " + "; ".join(merged["negative_additions"])
        if merged["negative_additions"]
        else None
    )
    audio = (
        "\n".join(merged["audio_prompt_additions"])
        if merged["audio_prompt_additions"]
        else None
    )
    motion = (
        "\n".join(merged["motion_prompt_additions"])
        if merged["motion_prompt_additions"]
        else None
    )
    return AssembledPrompt(
        system_prompt=system,
        user_prompt=user,
        negative_prompt=negative,
        preservation_directives=list(dict.fromkeys(merged["preservation_directives"])),
        mask_constraints=merged["mask_constraints"],
        audio_prompt=audio,
        motion_prompt=motion,
        reference_assets=merged["reference_assets"],
        few_shot_examples=merged["few_shot_examples"],
        forced_params=merged["forced_params"],
    )


def assemble(
    context: PromptContext,
    *,
    layers: list[BaseLayerImpl] | None = None,
    token_budget: int = DEFAULT_TOKEN_BUDGET,
) -> tuple[AssembledPrompt, AssemblyTrace]:
    layers = layers or ALL_LAYERS
    selected = _applicable(layers, context.use_case)
    selected.sort(key=lambda l: l.priority)

    contributions: list[tuple[BaseLayerImpl, LayerContribution]] = []
    for layer in selected:
        contributions.append((layer, layer.apply(context)))

    merged = _merge(contributions)
    final = _build_final(merged)

    # Token-budget pass: trim FewShot, then SourceContext non-critical pieces.
    if final.estimated_tokens() > token_budget:
        final = _truncate_for_budget(contributions, merged, token_budget)

    trace = AssemblyTrace(
        use_case=context.use_case.value,
        context_snapshot={
            "market": context.market,
            "sub_market": context.sub_market,
            "target_language": context.target_language,
            "strategy": context.strategy,
            "source_asset_id": str(context.source_asset_id) if context.source_asset_id else None,
            "source_asset_hash": context.source_asset_hash,
            "source_lu_id": str(context.source_lu_id) if context.source_lu_id else None,
            "brand_id": str(context.brand_id) if context.brand_id else None,
            "brand_version": context.brand_version,
        },
        layers_applied=[
            LayerTraceEntry(
                layer_name=l.name,
                priority=l.priority,
                version=l.version,
                contribution=asdict(c),
            )
            for l, c in contributions
        ],
        final_output={
            "system_prompt": final.system_prompt,
            "user_prompt": final.user_prompt,
            "negative_prompt": final.negative_prompt,
            "preservation_directives": final.preservation_directives,
            "mask_constraints": final.mask_constraints,
            "audio_prompt": final.audio_prompt,
            "motion_prompt": final.motion_prompt,
            "forced_params": final.forced_params,
            "reference_assets": final.reference_assets,
        },
        token_estimate=final.estimated_tokens(),
    )
    return final, trace


def _truncate_for_budget(
    contributions: list[tuple[BaseLayerImpl, LayerContribution]],
    merged: dict,
    budget: int,
) -> AssembledPrompt:
    # Drop FewShot first
    merged["few_shot_examples"] = []
    final = _build_final(merged)
    if final.estimated_tokens() <= budget:
        return final
    # Then trim source-context user additions to the last 2000 chars
    user_adds = []
    for layer, c in contributions:
        if layer.non_truncatable:
            user_adds.extend(c.user_additions)
            continue
        if layer.name == "SourceContextLayer":
            for ua in c.user_additions:
                user_adds.append(ua[:2000])
            continue
        user_adds.extend(c.user_additions)
    merged["user_additions"] = user_adds
    return _build_final(merged)
