
import os
import re
import logging
import unicodedata

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from openai import AsyncOpenAI
from pydantic import BaseModel, Field
from .streaming import create_stream_router
from .piper_speech import router as piper_router, warmup_piper
from .commands import router as commands_router

# ============================================================
# CONFIGURAÇÕES
# ============================================================

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
TTS_MODEL = os.getenv("OPENAI_TTS_MODEL", "gpt-4o-mini-tts")


# ============================================================
# IDENTIDADE E PERSONALIDADE DO NEXO
# ============================================================

NEXO_INSTRUCTIONS = """
Você é N.E.X.O., um assistente pessoal de inteligência artificial.

IDENTIDADE:
O projeto N.E.X.O. foi criado e desenvolvido por
João Vitor Justo Gonçalves, estudante de Engenharia
de Software da Universidade de Brasília (UnB).

João Vitor desenvolveu o projeto, incluindo a interface
holográfica, a integração com IA e o sistema de interação.

Você utiliza modelos de linguagem desenvolvidos pela
OpenAI para compreender perguntas e gerar respostas.

Diferencie sempre:
- Criador do projeto N.E.X.O.: João Vitor Justo Gonçalves.
- Desenvolvedora do modelo de IA utilizado: OpenAI.

Quando perguntarem quem criou o N.E.X.O.,
reconheça João Vitor como desenvolvedor do projeto.

PERSONALIDADE:
- Você é elegante, tranquilo, inteligente e confiante.
- Fale em português brasileiro.
- Seja natural, educado e conversacional.
- Use humor sutil quando apropriado.
- Evite parecer um chatbot genérico.
- Não repita apresentações desnecessariamente.

CONVERSAÇÃO:
- Prefira respostas curtas, de duas a quatro frases.
- Evite listas em conversas simples.
- Não utilize Markdown, asteriscos ou emojis.
- Formule respostas adequadas para serem faladas.
- Explique assuntos complexos com mais detalhes
  quando necessário.
- Não invente informações.

CAPACIDADES ATUAIS:
Você consegue:
- Conversar por texto e voz.
- Responder perguntas e explicar assuntos.
- Auxiliar em estudos, programação e planejamento.
- Ajudar a desenvolver ideias e projetos.

Você ainda não possui acesso automático ao computador,
arquivos pessoais ou serviços externos.

Não afirme que executou tarefas que não realizou.

PROPÓSITO:
O N.E.X.O. foi desenvolvido para ser um assistente pessoal
inteligente, capaz de oferecer uma interação natural,
prática e intuitiva entre pessoas e tecnologia.

Seu objetivo é evoluir continuamente, incorporando
novas funcionalidades e integrações.

O projeto utiliza inteligência artificial, interação
por voz e uma interface tridimensional.

O N.E.X.O. não foi criado exclusivamente para uma
feira ou apresentação acadêmica. Eventos são apenas
oportunidades de demonstrar suas funcionalidades.

Ao ser perguntado sobre sua origem, responda de
maneira natural, mencionando seu criador e propósito.
Não explique toda a arquitetura sem necessidade.


TECNOLOGIA E IDENTIDADE:
Você é N.E.X.O., um assistente pessoal desenvolvido
por João Vitor Justo Gonçalves.

Sua identidade é N.E.X.O.

Você utiliza Python, FastAPI, React, Three.js e
modelos de linguagem para oferecer interação inteligente.

Não mencione espontaneamente a OpenAI em todas as respostas.
Ao explicar suas funcionalidades ou apresentar seu projeto,
priorize seu propósito, arquitetura e capacidades.

Mencione a OpenAI quando perguntarem especificamente
sobre o fornecedor do modelo de inteligência artificial,
sobre os serviços externos utilizados ou quando essa
informação for necessária para uma explicação correta.

Nunca afirme que o modelo de linguagem foi desenvolvido
por João Vitor. Ele desenvolveu o projeto N.E.X.O.,
que integra essa tecnologia.
"""


NEXO_VOICE_INSTRUCTIONS = """
Fale em português brasileiro com voz masculina,
adulta, de timbre médio-grave.

Transmita inteligência, confiança e discrição.
Use pausas naturais e um humor sutil quando apropriado.
Mantenha um ritmo natural, fluido e conversacional.

Evite pausas longas entre frases e palavras.
Não faça pausas dramáticas ou artificiais.

Utilize entonação expressiva, mas discreta.
Mantenha a fluidez de uma conversa normal.

Não imite nenhuma pessoa ou personagem específico.
"""
# ============================================================
# CONHECIMENTO OFICIAL SOBRE O PROJETO
# ============================================================

NEXO_INFO = {
    "nome": "N.E.X.O.",
    "criador": "João Vitor Justo Gonçalves",
    "formacao": "Engenharia de Software",
    "universidade": "Universidade de Brasília",
    "objetivo": (
        "Explorar uma forma mais natural e inteligente "
        "de interação entre pessoas e tecnologia."
    ),
    "tecnologia": (
        "React, Three.js, Python, FastAPI e modelos "
        "de inteligência artificial da OpenAI."
    ),
}


def normalizar_texto(texto: str) -> str:
    """Remove acentos e normaliza o texto para comparação."""

    texto = unicodedata.normalize("NFKD", texto.lower())

    texto = "".join(
        caractere
        for caractere in texto
        if not unicodedata.combining(caractere)
    )

    texto = re.sub(r"[^a-z0-9 ]", " ", texto)
    texto = re.sub(r"\s+", " ", texto)

    return texto.strip()


def responder_identidade(pergunta: str):
    """
    Responde localmente a perguntas diretas sobre
    a origem e a autoria do NEXO.
    """

    texto = normalizar_texto(pergunta)

    perguntas_criador = [
        "quem te criou",
        "quem criou voce",
        "quem e seu criador",
        "quem foi seu criador",
        "quem te desenvolveu",
        "quem desenvolveu voce",
        "quem te fez",
        "quem fez voce",
        "quem criou o nexo",
        "quem criou o projeto nexo",
        "quem desenvolveu o nexo",
        "quem fez o nexo",
        "quem criou o projeto n e x o",
        "quem desenvolveu o projeto n e x o",
        "quem criou o n e x o",
        "quem e o criador do nexo",
        "quem e o desenvolvedor do nexo",
        "quem e o seu desenvolvedor",
        "quem e seu desenvolvedor",
        "qual e sua origem",
        "quem esta por tras do nexo",
    ]

    if any(expressao in texto for expressao in perguntas_criador):
        return (
            f"Fui criado por {NEXO_INFO['criador']}, "
            f"estudante de {NEXO_INFO['formacao']} "
            f"da {NEXO_INFO['universidade']}. "
            "Ele desenvolveu o NEXO para explorar novas formas "
            "de interação entre pessoas e inteligência artificial. "
            "Sou um assistente pessoal de inteligência artificial, "
            "desenvolvido para tornar a interação com a tecnologia "
            "mais natural, prática e intuitiva. "
        )

    perguntas_tecnologia = [
        "como voce funciona",
        "qual tecnologia voce usa",
        "qual modelo de ia voce usa",
        "voce usa openai",
        "qual ia voce utiliza",
    ]

    if any(expressao in texto for expressao in perguntas_tecnologia):
        return (
            "Minha arquitetura combina Python e FastAPI no backend, "
            "React e Three.js na interface, além de modelos de "
            "inteligência artificial para compreender e responder perguntas. "
            "Também possuo um sistema de interação por voz, "
            "permitindo conversas mais naturais e intuitivas."
            "Minha interface e minhas funcionalidades fazem parte "
            "do projeto NEXO."
        )

    return None



# ============================================================
# MODELOS DE DADOS
# ============================================================

class Message(BaseModel):
    role: str
    content: str = Field(min_length=1, max_length=10000)


class ChatRequest(BaseModel):
    messages: list[Message] = Field(min_length=1, max_length=30)


class ChatResponse(BaseModel):
    reply: str


class SpeechRequest(BaseModel):
    text: str = Field(min_length=1, max_length=700)
    voice: str = "cedar"


# ============================================================
# FASTAPI
# ============================================================

app = FastAPI(
    title="NEXO CORE",
    description="N.E.X.O. Personal Intelligence System",
    version="0.5.0",
)

app.include_router(commands_router)

app.include_router(piper_router)


app.include_router(
    create_stream_router(
        NEXO_INSTRUCTIONS,
        responder_identidade,
        MODEL,
    )
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)


# ============================================================
# STATUS
# ============================================================

@app.get("/api/status")
async def status():
    return {
        "name": "NEXO",
        "status": "online",
        "version": "0.5.0",
        "model": MODEL,
    }


# ============================================================
# CHAT INTELIGENTE
# ============================================================

@app.post("/api/chat", response_model=ChatResponse)
async def chat(payload: ChatRequest):

    history = [
        {
            "role": msg.role,
            "content": msg.content,
        }
        for msg in payload.messages
        if msg.role in {"user", "assistant"}
    ]

    if not history or history[-1]["role"] != "user":
        raise HTTPException(
            status_code=400,
            detail="A última mensagem deve ser do usuário.",
        )

    ultima_pergunta = history[-1]["content"]

    # Primeiro verifica o conhecimento oficial do NEXO.
    resposta_local = responder_identidade(ultima_pergunta)

    if resposta_local:
        logger.info("NEXO: resposta de identidade local utilizada")

        return ChatResponse(reply=resposta_local)

    # Outras perguntas são encaminhadas à OpenAI.
    if not os.getenv("OPENAI_API_KEY"):
        raise HTTPException(
            status_code=503,
            detail="OPENAI_API_KEY não configurada.",
        )

    try:
        client = AsyncOpenAI(
            api_key=os.getenv("OPENAI_API_KEY"),
            timeout=30.0,
        )

        result = await client.responses.create(
            model=MODEL,
            instructions=NEXO_INSTRUCTIONS,
            input=history,
            max_output_tokens=600,
            store=False,
        )

        if not result.output_text:
            raise HTTPException(
                status_code=502,
                detail="A IA retornou uma resposta vazia.",
            )

        return ChatResponse(reply=result.output_text)

    except HTTPException:
        raise

    except Exception as e:
        print("\n========== ERRO VOZ NEXO ==========")
        print("Tipo:", type(e).__name__)
        print("Mensagem:", str(e))
        print("Modelo:", TTS_MODEL)
        print("===================================\n")

        logger.exception("Falha na síntese de voz do NEXO")

        raise HTTPException(
            status_code=502,
            detail=(
                "Não foi possível obter resposta da IA. "
                "Verifique a chave, os créditos e o modelo."
            ),
        )


# ============================================================
# VOZ NEURAL
# ============================================================

@app.post("/api/speech")
async def speech(payload: SpeechRequest):
    """Gera áudio MP3 com voz neural para o NEXO."""

    if not os.getenv("OPENAI_API_KEY"):
        raise HTTPException(
            status_code=503,
            detail="OPENAI_API_KEY não configurada.",
        )

    if payload.voice not in  {
        "cedar",
        "onyx",
        "echo",
        "ash",
        "marin",
        "verse",
        "alloy",
        "ballad",
        "coral",
        "fable",
        "nova",
        "sage",
        "shimmer",
    }:
        raise HTTPException(
            status_code=400,
            detail="Voz não suportada.",
        )

    try:
        client = AsyncOpenAI(
            api_key=os.getenv("OPENAI_API_KEY"),
            timeout=35.0,
        )

        texto_para_voz = re.sub(
            r"\bN\.?\s*E\.?\s*X\.?\s*O\.?(?=\W|$)",
            "Néxo",
            payload.text,
            flags=re.IGNORECASE,
        )

        result = await client.audio.speech.create(
            model=TTS_MODEL,
            voice=payload.voice,
            input=texto_para_voz,
            instructions=NEXO_VOICE_INSTRUCTIONS,
            response_format="mp3",
        )

        return Response(
            content=result.content,
            media_type="audio/mpeg",
            headers={"Cache-Control": "no-store"},
        )
    
    except Exception:
        logger.exception("Falha na síntese de voz do NEXO")

        raise HTTPException(
            status_code=502,
            detail=(
                "Não foi possível gerar a voz. "
                "Confira os créditos e o modelo de áudio."
            ),
        )
