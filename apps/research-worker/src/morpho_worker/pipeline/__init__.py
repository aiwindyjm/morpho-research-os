"""Research pipeline package: prompts registry and the structured output
gate (Parse -> Validate -> Normalize)."""

from morpho_worker.pipeline.prompts import PromptAsset, PromptRegistry, render_template
from morpho_worker.pipeline.structured import (
    StructuredOutputPipeline,
    parse_llm_json,
    validate_llm_payload,
)

__all__ = [
    "PromptAsset",
    "PromptRegistry",
    "StructuredOutputPipeline",
    "parse_llm_json",
    "render_template",
    "validate_llm_payload",
]
