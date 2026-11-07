"""Rota de streaming de texto do N.E.X.O. (JSON Lines, UTF-8)."""
import json
import logging
import os
from typing import Callable

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from openai import AsyncOpenAI
from pydantic import BaseModel, Field

log = logging.getLogger(__name__)


class StreamMessage(BaseModel):
    role: str
    content: str = Field(min_length=1, max_length=10000)


class StreamRequest(BaseModel):
    messages: list[StreamMessage] = Field(min_length=1, max_length=30)


def create_stream_router(
    instructions: str,
    identity_answer: Callable[[str], str | None],
    default_model: str = "gpt-4o-mini",
) -> APIRouter:
    router = APIRouter()

    @router.post("/api/chat/stream")
    async def chat_stream(payload: StreamRequest):
        history = [
            {"role": msg.role, "content": msg.content}
            for msg in payload.messages
            if msg.role in {"user", "assistant"}
        ]
        if not history or history[-1]["role"] != "user":
            raise HTTPException(status_code=400, detail="A última mensagem deve ser do usuário.")

        local_answer = identity_answer(history[-1]["content"])
        if not local_answer and not os.getenv("OPENAI_API_KEY"):
            raise HTTPException(status_code=503, detail="OPENAI_API_KEY não configurada.")

        def line(event: dict) -> str:
            return json.dumps(event, ensure_ascii=False) + "\n"

        async def generate():
            if local_answer:
                yield line({"type": "delta", "text": local_answer})
                yield line({"type": "done"})
                return
            try:
                client = AsyncOpenAI(
                    api_key=os.environ["OPENAI_API_KEY"],
                    timeout=35.0,
                )
                stream = await client.responses.create(
                    model=os.getenv("OPENAI_MODEL") or default_model,
                    instructions=instructions,
                    input=history,
                    max_output_tokens=600,
                    store=False,
                    stream=True,
                )
                async for event in stream:
                    if event.type == "response.output_text.delta":
                        yield line({"type": "delta", "text": event.delta})
                    elif event.type == "response.failed":
                        raise RuntimeError("O modelo não concluiu a resposta.")
                yield line({"type": "done"})
            except Exception:
                log.exception("Falha no streaming de texto do NEXO")
                yield line({"type": "error", "message": "Não foi possível completar a resposta."})

        return StreamingResponse(
            generate(),
            media_type="application/x-ndjson; charset=utf-8",
            headers={"Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no"},
        )

    return router
