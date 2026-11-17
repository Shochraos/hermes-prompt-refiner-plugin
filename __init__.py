import contextvars
import secrets
import threading
import time

from .refiner import RefinerService


def _route():
    from hermes_cli.config import load_config_readonly

    config = load_config_readonly()
    task = config.get("auxiliary", {}).get("prompt_refinement", {})
    result = {key: task.get(key) for key in ("provider", "model", "inherit_from")}
    del task, config
    return result


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
    )
    ctx.register_auxiliary_task("prompt_refinement", display_name="Prompt refiner", description="Independent conversational prompt refinement")
    for name in ("describe", "prepare", "start", "status", "release", "cancel"):
        ctx.register_rpc(name, getattr(service, name))
    ctx.on_unload(service.unload)
    service.start_expiry()
