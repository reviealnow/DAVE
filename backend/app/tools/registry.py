from __future__ import annotations

import functools
import inspect
from dataclasses import dataclass, field
from typing import Any, Callable, get_type_hints

from pydantic import create_model
from pydantic.fields import FieldInfo


@dataclass
class ToolEntry:
    name: str
    fn: Callable[..., Any]
    description: str
    tags: list[str]
    input_schema: dict[str, Any]


_REGISTRY: dict[str, ToolEntry] = {}


def _build_input_schema(fn: Callable[..., Any]) -> dict[str, Any]:
    try:
        hints = get_type_hints(fn)
    except Exception:
        hints = {}

    sig = inspect.signature(fn)
    fields: dict[str, Any] = {}
    for param_name, param in sig.parameters.items():
        if param_name == "ctx":
            continue
        annotation = hints.get(param_name, Any)
        default = param.default if param.default is not inspect.Parameter.empty else ...
        fields[param_name] = (annotation, FieldInfo(default=default))

    if not fields:
        return {"type": "object", "properties": {}}

    model = create_model(f"_{fn.__name__}_Input", **fields)
    return model.model_json_schema()


def tool(name: str, description: str = "", tags: list[str] | None = None) -> Callable:
    def decorator(fn: Callable[..., Any]) -> Callable[..., Any]:
        _REGISTRY[name] = ToolEntry(
            name=name,
            fn=fn,
            description=description,
            tags=tags or [],
            input_schema=_build_input_schema(fn),
        )

        @functools.wraps(fn)
        def wrapper(*args: Any, **kwargs: Any) -> Any:
            return fn(*args, **kwargs)

        return wrapper

    return decorator


def dispatch(name: str, params: dict[str, Any], ctx: Any) -> Any:
    if name not in _REGISTRY:
        raise KeyError(f"unknown tool: {name!r}")
    return _REGISTRY[name].fn(ctx=ctx, **params)


def list_tools() -> list[dict[str, Any]]:
    return [
        {
            "name": e.name,
            "description": e.description,
            "tags": e.tags,
            "input_schema": e.input_schema,
        }
        for e in _REGISTRY.values()
    ]
