"""Voz Piper local para NEXO. Substitui backend/app/piper_speech.py.

Instale: pip install piper-tts
Modelo padrão: backend/vozes/pt_BR-faber-medium.onnx (+ .onnx.json)
Configure PIPER_VOICE_MODEL, PIPER_LENGTH_SCALE no .env, se desejar.
"""

import asyncio
import io
import json
import logging
import os
import re
import threading
import time
import wave
from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv
from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, Field

load_dotenv()
log = logging.getLogger(__name__)
router = APIRouter()
BACKEND_DIR = Path(__file__).resolve().parent.parent
DEFAULT_MODEL = BACKEND_DIR / 'vozes' / 'pt_BR-faber-medium.onnx'
LOCK = threading.Lock()


class PiperSpeechRequest(BaseModel):
    text: str = Field(min_length=1, max_length=700)
    voice: str = 'cedar'  # compatibilidade com seletor antigo do React


def model_path() -> Path:
    value = os.getenv('PIPER_VOICE_MODEL', '').strip()
    if not value:
        return DEFAULT_MODEL
    path = Path(value).expanduser()
    if not path.is_absolute():
        path = BACKEND_DIR / path
    return path.resolve()


def speech_settings() -> float:
    value = float(os.getenv('PIPER_LENGTH_SCALE', '1.0'))
    if not 0.85 <= value <= 1.20:
        raise ValueError('PIPER_LENGTH_SCALE deve ficar entre 0.85 e 1.20')
    return value


@lru_cache(maxsize=1)
def load_voice(path: str):
    voice_path = Path(path)
    if not voice_path.is_file() or not Path(path + '.json').is_file():
        raise FileNotFoundError(f'Arquivos de voz não encontrados: {path} e {path}.json')
    from piper import PiperVoice
    log.info('Carregando modelo Piper: %s', voice_path.name)
    return PiperVoice.load(str(voice_path), use_cuda=False)


def pronunciation_rules() -> dict[str, str]:
    """Regras opcionais, exclusivamente para pronúncias comprovadamente ruins.

    backend/vozes/pronuncias.json, ex.: {"sigla": "sígla"}
    Evite alterar palavras comuns sem antes testar outra voz.
    """
    path = BACKEND_DIR / 'vozes' / 'pronuncias.json'
    if not path.is_file():
        return {}
    try:
        data = json.loads(path.read_text(encoding='utf-8'))
    except (json.JSONDecodeError, UnicodeDecodeError, OSError) as error:
        log.warning('pronuncias.json ignorado: %s', error)
        return {}
    if not isinstance(data, dict):
        raise ValueError('pronuncias.json deve conter um objeto JSON')
    return {str(k): str(v) for k, v in data.items() if k and v}


def prepare_text(text: str) -> str:
    text = re.sub(
        r'\bN\.?\s*E\.?\s*X\.?\s*O\.?(?=\W|$)',
        'Néxo', text, flags=re.IGNORECASE,
    )
    # Não remova acentos nem altere ortografia de palavras brasileiras.
    text = re.sub(r'\s+', ' ', text).strip()
    for original, falado in pronunciation_rules().items():
        text = re.sub(r'(?<!\w)' + re.escape(original) + r'(?!\w)',
                      lambda _: falado, text, flags=re.IGNORECASE)
    return text


def synthesize_wav(text: str) -> bytes:
    """Síntese em CPU e WAV válido; voz permanece em cache entre solicitações."""
    from piper.config import SynthesisConfig
    with LOCK:
        voice = load_voice(str(model_path()))
        cleaned = prepare_text(text)
        if not cleaned or not any(c.isalnum() for c in cleaned):
            raise ValueError('Trecho sem conteúdo pronunciável.')
        stream = io.BytesIO()
        config = SynthesisConfig(length_scale=speech_settings())
        generated = False
        with wave.open(stream, 'wb') as writer:
            for chunk in voice.synthesize(cleaned, syn_config=config):
                if not chunk.audio_int16_bytes:
                    continue
                if not generated:
                    writer.setnchannels(chunk.sample_channels)
                    writer.setsampwidth(chunk.sample_width)
                    writer.setframerate(chunk.sample_rate)
                    generated = True
                writer.writeframes(chunk.audio_int16_bytes)
            if not generated:
                writer.setnchannels(1)
                writer.setsampwidth(2)
                writer.setframerate(voice.config.sample_rate)
        if not generated:
            raise ValueError('Modelo não gerou áudio para o trecho recebido.')
        return stream.getvalue()


def warmup_voice() -> None:
    """Carrega o modelo; opcionalmente executado no startup, fora das requisições."""
    with LOCK:
        load_voice(str(model_path()))


async def warmup_piper() -> None:
    try:
        await asyncio.to_thread(warmup_voice)
        log.info('Modelo Piper pronto para a primeira interação')
    except Exception:
        log.exception('Não foi possível pré-carregar o Piper')


@router.post('/api/piper/warmup')
async def piper_warmup():
    """Carrega o modelo uma vez em segundo plano antes da primeira fala."""
    await warmup_piper()
    return {'ready': load_voice.cache_info().currsize > 0}


@router.get('/api/piper/status')
async def piper_status():
    path = model_path()
    return {
        'engine': 'piper',
        'model': path.name,
        'model_present': path.is_file(),
        'config_present': Path(str(path) + '.json').is_file(),
        'loaded': load_voice.cache_info().currsize > 0,
        'length_scale': speech_settings(),
    }


@router.post('/api/piper/speech')
async def piper_speech(payload: PiperSpeechRequest):
    path = model_path()
    if not path.is_file() or not Path(str(path) + '.json').is_file():
        raise HTTPException(status_code=503,
                            detail=f'Modelo Piper ou JSON ausente: {path}')
    start = time.perf_counter()
    try:
        wav = await asyncio.to_thread(synthesize_wav, payload.text)
        log.info('Piper: %s caracteres, %.2f segundos, %s bytes',
                 len(payload.text), time.perf_counter() - start, len(wav))
        return Response(content=wav, media_type='audio/wav',
                        headers={'Cache-Control': 'no-store'})
    except Exception as exc:
        log.exception('Falha ao sintetizar Piper')
        raise HTTPException(status_code=502,
                            detail=f'Erro no Piper: {type(exc).__name__}. Veja o terminal.') from exc
