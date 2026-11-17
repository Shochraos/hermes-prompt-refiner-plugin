import contextvars
import inspect
import secrets
import threading
import time

from .refiner import EFFORTS, RefinerService


def _route():
    from hermes_cli.config import load_config_readonly

    config = load_config_readonly()
    task = config.get("auxiliary", {}).get("prompt_refinement", {})
    result = {key: task.get(key) for key in ("provider", "model", "inherit_from", "reasoning_effort")}
    effort = result["reasoning_effort"]
    if not isinstance(effort, str) or effort not in EFFORTS:
        result["reasoning_effort"] = None
    del task, config
    return result


def _execution_policy():
    from hermes_cli.config import load_config_readonly

    value = load_config_readonly()
    for key in ("plugins", "entries", "prompt-refiner", "llm"):
        value = value.get(key) if isinstance(value, dict) else None
    if not isinstance(value, dict):
        return {}
    result = {key: value.get(key) is True for key in ("allow_provider_override", "allow_model_override")}
    for key in ("allowed_providers", "allowed_models"):
        item = value.get(key)
        if isinstance(item, list):
            result[key] = [entry for entry in item if isinstance(entry, str)]
    return result


def _reasoning_supported(complete):
    try:
        parameter = inspect.signature(complete).parameters.get("reasoning_effort")
        return parameter is not None and parameter.kind in (inspect.Parameter.POSITIONAL_OR_KEYWORD, inspect.Parameter.KEYWORD_ONLY)
    except (TypeError, ValueError):
        return False


def _redact(text):
    from agent.redact import redact_sensitive_text

    return redact_sensitive_text(text, force=True)


def _launch(callback):
    context = contextvars.copy_context()
    thread = threading.Thread(target=context.run, args=(callback,), daemon=True)
    thread.start()


def register(ctx):
    service = RefinerService(
        model_complete=ctx.llm.complete_structured,
        read_route=_route,
        read_image_attestation=lambda: ctx.get_config("image_route_attestation", {}),
        redact_text=_redact,
        monotonic=time.monotonic,
        random_bytes=secrets.token_bytes,
        launch_worker=_launch,
        read_execution_policy=_execution_policy,
        reasoning_effort_supported=_reasoning_supported(ctx.llm.complete_structured),
    )
    ctx.register_auxiliary_task("prompt_refinement", display_name="Prompt refiner", description="Independent conversational prompt refinement")
    for name in ("describe", "prepare", "start", "status", "release", "cancel"):
        ctx.register_rpc(name, getattr(service, name))
    ctx.on_unload(service.unload)
    service.start_expiry()
