import { useEffect, useRef, useState } from 'react';
import {
  Activity, ArrowLeft, ArrowUpRight, AudioLines, BrainCircuit, Check,
  ChevronRight, CircleDot, Command, Cpu, Fingerprint, Layers3,
  MessageSquare, Mic, MicOff, Plus, Radio, Send, ShieldCheck, Volume2, VolumeX, Waves,
} from 'lucide-react';
import NexoCore from './components/NexoCore/NexoCore';
import './App.css';

const STATES = {
  idle: { label: 'EM REPOUSO', subtitle: 'Aguardando sua próxima interação.', code: 'STANDBY' },
  listening: { label: 'ESCUTANDO', subtitle: 'Microfone ativo — fale seu comando.', code: 'LISTENING' },
  followup: { label: 'CONVERSA ATIVA', subtitle: 'Você pode continuar sem dizer Nexo.', code: 'FOLLOW-UP' },
  thinking: { label: 'PROCESSANDO', subtitle: 'NEXO está elaborando uma resposta.', code: 'ANALYZING' },
  speaking: { label: 'RESPONDENDO', subtitle: 'NEXO está falando.', code: 'RESPONDING' },
};
const MODES = [
  { id: 'idle', label: 'Repouso', icon: CircleDot },
  { id: 'listening', label: 'Escuta', icon: Waves },
  { id: 'thinking', label: 'Análise', icon: BrainCircuit },
  { id: 'speaking', label: 'Resposta', icon: AudioLines },
];
const INITIAL_MESSAGES = [{
  id: 'welcome', role: 'assistant',
  content: 'Olá. Sou o N.E.X.O., seu assistente pessoal. O que vamos fazer hoje?',
}];

function Clock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  return <span>{now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>;
}


// A ativação funciona com "Nexo" sozinho ou no início da frase.
// Alguns reconhecedores transcrevem o nome como "Nexus", "Nexu" ou "Nexxus".
function normalizarComando(texto) {
  return texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function detectarAtivacao(transcricao) {
  const frase = normalizarComando(transcricao);
  const match = /^(?:(?:ei|hey|oi|ola|rei)\s+)?(?:nexo|nexus|nexu|nexxus|nexos|n\s*e\s*x\s*o)(?:\s+|$)/.exec(frase);
  if (!match) return { ativou: false, comando: '' };
  // Preserva a forma original do comando quando possível; sem acentos também funciona.
  return { ativou: true, comando: frase.slice(match[0].length).trim() };
}

// Comandos locais. Não dão ao navegador acesso ao sistema operacional.
// As tarefas são armazenadas exclusivamente no localStorage deste navegador.
const TAREFAS_KEY = 'nexo_tarefas_v1';
const CONVERSA_CONTINUACAO_MS = 45000; // 45 segundos de acompanhamento por voz.
const NEXO_API_BASE = import.meta.env.VITE_NEXO_API_URL || 'http://127.0.0.1:8000';
const SITES_AUTORIZADOS = {
  youtube: { nome: 'YouTube', url: 'https://www.youtube.com/' },
  google: { nome: 'Google', url: 'https://www.google.com/' },
  github: { nome: 'GitHub', url: 'https://github.com/' },
  wikipedia: { nome: 'Wikipédia', url: 'https://pt.wikipedia.org/' },
};

function carregarTarefas() {
  try {
    const tarefas = JSON.parse(window.localStorage.getItem(TAREFAS_KEY) || '[]');
    return Array.isArray(tarefas) ? tarefas.filter(t => typeof t.texto === 'string') : [];
  } catch { return []; }
}

function salvarTarefas(tarefas) {
  try { window.localStorage.setItem(TAREFAS_KEY, JSON.stringify(tarefas)); return true; }
  catch { return false; }
}

function interpretarComandoLocal(entrada) {
  let comando = normalizarComando(entrada);
  // Remove somente a palavra de ativação no começo da frase.
  comando = comando.replace(/^(?:(?:ei|hey|oi|ola|rei)\s+)?(?:nexo|nexus|nexu|nexxus|nexos)(?:\s+|$)/, '');
  comando = comando.replace(/^(?:por favor|pode|poderia|voce pode|voce poderia)\s+/, '');
  // Complementos opcionais comuns: "para mim", "por favor", "agora".
  comando = comando.replace(/\s+(?:por favor|pra mim|para mim)$/, '').trim();

  // Consultas rápidas sem API — tolera variações comuns da fala.
  if (/^(?:que horas(?: sao)?(?: agora)?|qual (?:e )?(?:a |o )?(?:hora|horario)(?: atual| agora)?|me (?:diga|fala|fale|informe) (?:as horas|a hora|o horario)(?: atual| agora)?|horas|horario atual)$/.test(comando)) {
    const horario = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    return { reply: `Agora são ${horario}.` };
  }
  if (/^(?:que\s+dia\s+e\s+hoje|qual\s+(?:e\s+)?a\s+data\s+de\s+hoje|data\s+de\s+hoje|hoje\s+e\s+que\s+dia|qual\s+e\s+o\s+dia\s+de\s+hoje)$/.test(comando)) {
    const data = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    return { reply: `Hoje é ${data}.` };
  }

  const tarefa = /^(?:anote|anota|adicione|adicionar|crie|criar|registre|registrar)(?: uma)? tarefa(?: para mim)?(?: de)?\s+(.+)$/.exec(comando);
  if (tarefa) {
    const texto = tarefa[1].trim().slice(0, 250);
    const tarefas = carregarTarefas();
    tarefas.push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), texto, concluida: false });
    if (!salvarTarefas(tarefas)) return { reply: 'Não consegui salvar a tarefa neste navegador. Verifique as permissões de armazenamento.' };
    return { reply: `Tarefa anotada: ${texto}.` };
  }

  if (/^(?:(?:listar|liste|mostrar|mostre|ver)(?: as| minhas)?|quais sao (?:as|minhas)|minhas) tarefas(?: pendentes)?$/.test(comando)) {
    const tarefas = carregarTarefas().filter(t => !t.concluida);
    if (!tarefas.length) return { reply: 'Você não tem tarefas pendentes anotadas neste navegador.' };
    return { reply: `Suas tarefas pendentes são: ${tarefas.map((t, i) => `${i + 1}: ${t.texto}`).join('; ')}.` };
  }

  const concluir = /^(?:concluir|conclua|marcar como concluida|finalizar|finalize)(?: a)? tarefa(?: numero)?\s+(\d+)$/.exec(comando);
  if (concluir) {
    const tarefas = carregarTarefas();
    const pendentes = tarefas.filter(t => !t.concluida);
    const alvo = pendentes[Number(concluir[1]) - 1];
    if (!alvo) return { reply: 'Não encontrei uma tarefa pendente com esse número. Peça para listar as tarefas.' };
    alvo.concluida = true;
    if (!salvarTarefas(tarefas)) return { reply: 'Não consegui salvar a alteração nesta sessão.' };
    return { reply: `Tarefa concluída: ${alvo.texto}.` };
  }

  // Reconhece "abre o YouTube para mim", "pode abrir o Google", etc.
  const site = /^(?:abra|abrir|abre|acesse|acessar|abrindo)\s+(?:o\s+|a\s+)?(youtube|google|github|wikipedia)$/.exec(comando);
  if (site) {
    const destino = SITES_AUTORIZADOS[site[1]];
    return {
      reply: `Vou abrir o ${destino.nome}. Caso o navegador bloqueie a nova aba, use o link na conversa.`,
      link: destino.url, label: `Abrir ${destino.nome}`, abrir: true,
    };
  }

  const busca = /^(?:pesquise|pesquisar|procure|procurar|busque|buscar)(?: no google)?(?: sobre| por)?\s+(.+)$/.exec(comando);
  if (busca) {
    const termo = busca[1].trim().slice(0, 200);
    if (termo) return {
      reply: `Preparei uma pesquisa sobre ${termo}. Abra o resultado no link abaixo.`,
      link: `https://www.google.com/search?q=${encodeURIComponent(termo)}`,
      label: 'Abrir pesquisa', abrir: true,
    };
  }
  return null;
}


// A IA apenas escolhe uma ação aprovada; o navegador valida e executa.
function executarComandoInterpretado(acao) {
  if (!acao || typeof acao !== 'object') return null;
  const args = acao.arguments || {};
  switch (acao.name) {
    case 'consultar_horario': {
      const horario = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      return { reply: `Agora são ${horario}.` };
    }
    case 'consultar_data': {
      const data = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
      return { reply: `Hoje é ${data}.` };
    }
    case 'criar_tarefa': {
      const titulo = typeof args.titulo === 'string' ? args.titulo.trim().slice(0, 250) : '';
      if (!titulo) return null;
      const tarefas = carregarTarefas();
      tarefas.push({ id: crypto.randomUUID(), texto: titulo, concluida: false });
      return salvarTarefas(tarefas)
        ? { reply: `Tarefa anotada: ${titulo}.` }
        : { reply: 'Não consegui salvar a tarefa neste navegador.' };
    }
    case 'listar_tarefas': {
      const tarefas = carregarTarefas().filter(t => !t.concluida);
      return { reply: tarefas.length
        ? `Suas tarefas pendentes são: ${tarefas.map((t,i) => `${i+1}: ${t.texto}`).join('; ')}.`
        : 'Você não tem tarefas pendentes neste navegador.' };
    }
    case 'concluir_tarefa': {
      const numero = Number(args.numero);
      if (!Number.isInteger(numero) || numero < 1) return null;
      const tarefas = carregarTarefas();
      const alvo = tarefas.filter(t => !t.concluida)[numero-1];
      if (!alvo) return { reply: 'Não encontrei a tarefa. Peça para listar as tarefas primeiro.' };
      alvo.concluida = true;
      return { reply: salvarTarefas(tarefas) ? `Tarefa concluída: ${alvo.texto}.` : 'Não consegui salvar a alteração.' };
    }
    case 'abrir_site': {
      const site = typeof args.site === 'string' ? args.site.toLowerCase() : '';
      const destino = SITES_AUTORIZADOS[site];
      if (!destino) return null;
      return { reply: `Preparei o ${destino.nome}. Caso a aba seja bloqueada, use o link abaixo.`,
        link: destino.url, label: `Abrir ${destino.nome}`, abrir: true };
    }
    case 'pesquisar_google': {
      const termo = typeof args.termo === 'string' ? args.termo.trim().slice(0, 200) : '';
      if (!termo) return null;
      return { reply: `Preparei a pesquisa sobre ${termo}. Use o link para abrir os resultados.`,
        link: `https://www.google.com/search?q=${encodeURIComponent(termo)}`,
        label: 'Abrir pesquisa', abrir: true };
    }
    default: return null;
  }
}

// Demonstração local: sem chamadas extras à IA, respostas verificáveis e previsíveis.
const DESAFIOS = {
  tecnologia: { titulo: 'TECNOLOGIA', pergunta: 'Qual componente executa as instruções de um programa?',
    alternativas: ['Memória RAM', 'Processador', 'SSD'], correta: 1,
    explicacao: 'O processador executa as instruções dos programas. A memória RAM guarda dados em uso.' },
  ciencia: { titulo: 'CIÊNCIA', pergunta: 'Qual planeta é conhecido como planeta vermelho?',
    alternativas: ['Vênus', 'Marte', 'Saturno'], correta: 1,
    explicacao: 'Marte é conhecido como planeta vermelho por causa de compostos de ferro em sua superfície.' },
  logica: { titulo: 'RACIOCÍNIO', pergunta: 'Qual número completa a sequência: dois, quatro, oito, dezesseis?',
    alternativas: ['Vinte', 'Vinte e quatro', 'Trinta e dois'], correta: 2,
    explicacao: 'A sequência dobra a cada passo, portanto o próximo número é trinta e dois.' },
};

function identificarTema(texto) {
  const value = normalizarComando(texto);
  if (/tecnologia|computador|informatica|programacao/.test(value)) return 'tecnologia';
  if (/ciencia|cientifico|planeta|astronomia/.test(value)) return 'ciencia';
  if (/logica|raciocinio|matematica/.test(value)) return 'logica';
  return null;
}
function identificarAlternativa(texto, desafio) {
  const value = normalizarComando(texto);
  const palavras = ['primeira', 'segunda', 'terceira'];
  const numeros = ['um', 'dois', 'tres'];
  for (let i = 0; i < 3; i++) {
    const n = i + 1;
    if (value === String(n) || value === numeros[i] || value === `opcao ${n}` || value === `opcao ${numeros[i]}` ||
        value === `alternativa ${n}` || value === `alternativa ${numeros[i]}` || value === palavras[i] || value.includes(normalizarComando(desafio.alternativas[i]))) return i;
  }
  return -1;
}

export default function App() {
  const [status, setStatus] = useState('idle');
  const [voiceNotice, setVoiceNotice] = useState('');
  const [view, setView] = useState('core');
  const [demo, setDemo] = useState({ fase: 'idle', tema: null, resultado: null });
  const demoRef = useRef({ fase: 'idle', tema: null, resultado: null });
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState(INITIAL_MESSAGES);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const endOfChatRef = useRef(null);
  const pendingRef = useRef(null);
  const resetTimerRef = useRef(null);
  const recognitionRef = useRef(null);
  const wakeRef = useRef(null);
  const wakeTimerRef = useRef(null);
  const wakeEnabledRef = useRef(false);
  const wakePendingRef = useRef(false);
  const wakeRestartCountRef = useRef(0);
  const conversationActiveRef = useRef(false);
  const conversationDeadlineRef = useRef(0);
  const conversationTimerRef = useRef(null);
  const conversationRestartRef = useRef(null);
  const [wakeEnabled, setWakeEnabled] = useState(false);
  const listeningRef = useRef(false);
  const busyRef = useRef(false);
  const messagesRef = useRef(INITIAL_MESSAGES);
  const voiceEnabledRef = useRef(true);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [listening, setListening] = useState(false);
  const [selectedVoice, setSelectedVoice] = useState('cedar');
  const audioRef = useRef(null);
  const audioUrlRef = useRef(null);
  const audioControllerRef = useRef(null);
  const playbackIdRef = useRef(0);
  const audioFinishRef = useRef(null);
  const speechControllersRef = useRef(new Set());
  const recognitionAvailable = typeof window !== 'undefined' &&
    !!(window.SpeechRecognition || window.webkitSpeechRecognition);


  // Tenta ativar o modo de voz ao entrar; se o navegador exigir interação, o botão continua disponível.
  // Carrega o Piper em segundo plano enquanto a interface aparece.
  useEffect(() => {
    fetch(`${NEXO_API_BASE}/api/piper/warmup`, { method: 'POST' }).catch(() => {});
  }, []);

  useEffect(() => {
    if (recognitionAvailable) {
      wakeEnabledRef.current = true;
      setWakeEnabled(true);
    }
  }, []);

  useEffect(() => {
    if (view === 'chat') endOfChatRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, view, busy]);

  useEffect(() => () => {
    pendingRef.current?.abort();
    clearTimeout(resetTimerRef.current);
    recognitionRef.current?.abort();
    wakeEnabledRef.current = false;
    clearTimeout(wakeTimerRef.current);
    clearTimeout(conversationTimerRef.current);
    clearTimeout(conversationRestartRef.current);
    wakeRef.current?.abort();
    playbackIdRef.current += 1;
    audioControllerRef.current?.abort();
    for (const controller of speechControllersRef.current) controller.abort();
    speechControllersRef.current.clear();
    audioRef.current?.pause();
    if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
  }, []);

  function stopSpeaking() {
    playbackIdRef.current += 1;
    audioFinishRef.current?.();
    audioFinishRef.current = null;
    audioControllerRef.current?.abort();
    for (const controller of speechControllersRef.current) controller.abort();
    speechControllersRef.current.clear();
    audioControllerRef.current = null;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
      audioRef.current = null;
    }
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }
  }

  // Remove a marcação Markdown somente da fala (a resposta escrita permanece completa).
  function cleanForSpeech(value) {
    return value
      .replace(/```[\s\S]*?```/g, 'Trecho de código omitido.')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/[*_#`~]/g, '')
      .replace(/^\s*[-•]\s+/gm, '')
      .replace(/^\s*\d+[.)]\s+/gm, '')
      .replace(/\n{2,}/g, '. ')
      .replace(/\n/g, '. ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 700);
  }

  function clearConversationMode() {
    conversationActiveRef.current = false;
    conversationDeadlineRef.current = 0;
    clearTimeout(conversationTimerRef.current);
    clearTimeout(conversationRestartRef.current);
    conversationTimerRef.current = null;
    conversationRestartRef.current = null;
  }

  // Agenda a escuta de continuação; se o Chrome ainda estiver encerrando
  // uma sessão anterior, tenta novamente dentro dos 20 segundos.
  function scheduleFollowupListening(delay = 250) {
    clearTimeout(conversationRestartRef.current);
    if (!conversationActiveRef.current || Date.now() >= conversationDeadlineRef.current) return;
    conversationRestartRef.current = setTimeout(() => {
      conversationRestartRef.current = null;
      if (!conversationActiveRef.current || Date.now() >= conversationDeadlineRef.current) return;
      if (busyRef.current || recognitionRef.current || listeningRef.current || wakeRef.current) {
        scheduleFollowupListening(350);
        return;
      }
      startCommandListening(true);
    }, delay);
  }

  // A janela de conversa começa quando o áudio TERMINA, nunca durante a fala.
  function armConversationMode() {
    if (!conversationActiveRef.current || !recognitionAvailable) {
      setStatus('idle');
      return;
    }
    clearTimeout(conversationTimerRef.current);
    clearTimeout(conversationRestartRef.current);
    conversationDeadlineRef.current = Date.now() + CONVERSA_CONTINUACAO_MS;
    setStatus('followup');
    setVoiceNotice('Conversa ativa: continue falando sem dizer “Nexo”. Aguardando microfone…');
    conversationTimerRef.current = setTimeout(() => {
      if (!conversationActiveRef.current) return;
      clearConversationMode();
      // Somente a escuta de continuação pode estar ativa aqui.
      recognitionRef.current?.abort();
      setListening(false);
      setVoiceNotice('Conversa encerrada. Para voltar, diga “Nexo”.');
      setStatus('idle');
      if (wakeEnabledRef.current) {
        clearTimeout(wakeTimerRef.current);
        wakeTimerRef.current = setTimeout(() => startWakeListening(), 850);
      }
    }, CONVERSA_CONTINUACAO_MS);
    scheduleFollowupListening(250);
  }

  async function speakReply(reply) {
    if (!voiceEnabledRef.current) {
      armConversationMode();
      return;
    }
    stopSpeaking();
    const playbackId = playbackIdRef.current;
    const text = cleanForSpeech(reply);
    if (!text) { armConversationMode(); return; }
    const controller = new AbortController();
    audioControllerRef.current = controller;
    setStatus('thinking');
    try {
      const response = await fetch(`${import.meta.env.VITE_NEXO_API_URL || 'http://127.0.0.1:8000'}/api/piper/speech`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voice: selectedVoice }),
        signal: controller.signal,
      });
      if (!response.ok) {
        let message = 'Não foi possível gerar o áudio.';
        try { const body = await response.json(); message = body.detail || message; } catch { /* sem JSON */ }
        throw new Error(message);
      }
      const blob = await response.blob();
      if (playbackId !== playbackIdRef.current || !voiceEnabledRef.current) return;
      const url = URL.createObjectURL(blob);
      audioUrlRef.current = url;
      const audio = new Audio(url);
      audioRef.current = audio;
      const finish = () => {
        if (playbackId !== playbackIdRef.current) return;
        stopSpeaking();
        armConversationMode();
      };
      audio.onended = finish;
      audio.onerror = () => {
        setVoiceNotice('Não foi possível reproduzir a voz neural.');
        finish();
      };
      await audio.play();
      if (playbackId === playbackIdRef.current) setStatus('speaking');
    } catch (err) {
      if (playbackId !== playbackIdRef.current || err.name === 'AbortError') return;
      setVoiceNotice(`Voz neural: ${err.message}. A resposta escrita continua disponível.`);
      armConversationMode();
    }
  }

// Texto em streaming + voz Piper: próxima frase é sintetizada DURANTE a reprodução.
// Mantém no máximo UM áudio preparado à frente (economiza RAM no notebook).
async function respondWithStreaming(updated, signal) {
  stopSpeaking();
  const playbackId = playbackIdRef.current;
  const id = crypto.randomUUID();
  const assistantMessage = { id, role: 'assistant', content: '' };
  messagesRef.current = [...messagesRef.current, assistantMessage];
  setMessages([...messagesRef.current]);

  let completeText = '';
  let toSpeak = '';
  const soundQueue = [];
  let soundRunning = false;
  let textFinished = false;
  let audioFailed = false;
  let finalizing = false;
  let activePlayback = false;

  const valid = () => playbackIdRef.current === playbackId && !signal.aborted;

  const completeIfReady = () => {
    if (finalizing || !textFinished || soundRunning || soundQueue.length) return;
    finalizing = true;
    if (valid()) armConversationMode();
  };

  // Solicita WAV ao backend. AbortController individual para interromper
  // também as sínteses que estejam sendo antecipadas.
  const getAudio = async (entry) => {
    const controller = new AbortController();
    speechControllersRef.current.add(controller);
    const abort = () => controller.abort();
    signal.addEventListener('abort', abort, { once: true });
    try {
      const response = await fetch(`${NEXO_API_BASE}/api/piper/speech`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: entry.text, voice: selectedVoice }),
        signal: controller.signal,
      });
      if (!response.ok) {
        let detail = 'Falha ao gerar a voz local.';
        try { detail = (await response.json()).detail || detail; } catch { /* sem JSON */ }
        throw new Error(detail);
      }
      const blob = await response.blob();
      if (!valid() || controller.signal.aborted) return null;
      return blob;
    } finally {
      signal.removeEventListener('abort', abort);
      speechControllersRef.current.delete(controller);
    }
  };

  // Inicia a síntese de somente um item pendente. Chamado também quando
  // novas frases chegam enquanto o áudio anterior já está tocando.
  const prepareNext = () => {
    if (!valid() || !voiceEnabledRef.current || audioFailed) return;
    const next = soundQueue[0];
    if (next && !next.promise) {
      next.promise = getAudio(next);
      // Evita Promise rejection não tratada durante cancelamentos.
      next.promise.catch(() => {});
    }
  };

  const playBlob = async (blob) => {
    if (!blob || !valid()) return;
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audioRef.current = audio;
    audioUrlRef.current = url;
    activePlayback = true;
    try {
      await new Promise((resolve, reject) => {
        let settled = false;
        const finish = (error) => {
          if (settled) return;
          settled = true;
          audioFinishRef.current = null;
          error ? reject(error) : resolve();
        };
        audioFinishRef.current = () => finish();
        audio.onended = () => finish();
        audio.onerror = () => finish(new Error('Falha na reprodução do áudio.'));
        audio.play().then(() => {
          if (valid()) setStatus('speaking');
        }).catch(finish);
      });
    } finally {
      activePlayback = false;
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
      if (audioRef.current === audio) audioRef.current = null;
      if (audioUrlRef.current === url) audioUrlRef.current = null;
      URL.revokeObjectURL(url);
    }
  };

  const drainSound = async () => {
    if (soundRunning || !valid()) return;
    soundRunning = true;
    try {
      while (soundQueue.length && valid() && voiceEnabledRef.current && !audioFailed) {
        prepareNext();
        const entry = soundQueue.shift();
        // Enquanto este trecho toca, o seguinte já começa a ser preparado.
        prepareNext();
        try {
          const blob = await entry.promise;
          if (!valid()) break;
          // Caso a segunda frase chegue enquanto tocamos, o enqueue
          // chamará prepareNext() imediatamente.
          await playBlob(blob);
        } catch (error) {
          if (!valid() || error.name === 'AbortError') break;
          audioFailed = true;
          soundQueue.length = 0;
          setVoiceNotice(`Voz Piper: ${error.message}. O texto continua disponível.`);
        }
      }
    } finally {
      soundRunning = false;
      completeIfReady();
    }
  };

  // Só corta em ponto final, interrogação e exclamação com palavra suficiente;
  // não corta N.E.X.O., números decimais, URLs ou abreviações frequentes.
  const nextBoundary = (text, force) => {
    const minFirst = 40;
    const maxChunk = 200;
    const abbreviation = /(?:\b(?:sr|sra|dr|dra|prof|profa|etc|ex|av|art|pág|pag))\.$/i;
    const acronym = /(?:\b[A-Za-z]\.){2,}$/;
    for (let i = 0; i < text.length; i++) {
      const mark = text[i];
      if (!'.!?'.includes(mark)) continue;
      if (i + 1 < text.length && !/\s/.test(text[i + 1])) continue;
      const before = text.slice(0, i + 1);
      if (mark === '.' && (abbreviation.test(before) || acronym.test(before))) continue;
      if (i + 1 >= minFirst || force) return i + 1;
    }
    if (text.length >= maxChunk) {
      const index = text.lastIndexOf(' ', maxChunk);
      return index >= 70 ? index : maxChunk;
    }
    return force ? text.length : -1;
  };

  const queueCompletedSentences = (force = false) => {
    if (!valid() || !voiceEnabledRef.current || audioFailed) return;
    while (toSpeak.trim()) {
      const boundary = nextBoundary(toSpeak, force);
      if (boundary < 0) break;
      const text = cleanForSpeech(toSpeak.slice(0, boundary));
      toSpeak = toSpeak.slice(boundary).trimStart();
      if (text && /[\p{L}\p{N}]/u.test(text)) soundQueue.push({ text, promise: null });
    }
    if (soundQueue.length) {
      if (activePlayback) prepareNext();
      void drainSound();
    }
  };

  try {
    const response = await fetch(`${NEXO_API_BASE}/api/chat/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: updated.filter(m => m.role === 'user' || m.role === 'assistant')
        .map(m => ({ role: m.role, content: m.content })) }),
      signal,
    });
    if (!response.ok || !response.body) {
      let detail = 'O servidor não iniciou o streaming.';
      try { detail = (await response.json()).detail || detail; } catch { /* sem JSON */ }
      throw new Error(detail);
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffered = '';
    let serverError = null;
    const processLine = (line) => {
      if (!line.trim()) return;
      const event = JSON.parse(line);
      if (event.type === 'error') { serverError = event.message || 'Erro ao gerar resposta.'; return; }
      if (event.type !== 'delta' || typeof event.text !== 'string') return;
      completeText += event.text;
      toSpeak += event.text;
      assistantMessage.content = completeText;
      messagesRef.current = [...messagesRef.current.slice(0, -1), { ...assistantMessage }];
      setMessages([...messagesRef.current]);
      queueCompletedSentences();
    };
    while (valid()) {
      const { value, done } = await reader.read();
      if (done) break;
      buffered += decoder.decode(value, { stream: true });
      const lines = buffered.split('\n');
      buffered = lines.pop() || '';
      for (const line of lines) processLine(line);
      if (serverError) break;
    }
    buffered += decoder.decode();
    if (buffered.trim() && !serverError) processLine(buffered);
    if (serverError) throw new Error(serverError);
    if (!completeText.trim()) throw new Error('A IA retornou uma resposta vazia.');
    queueCompletedSentences(true);
    textFinished = true;
    completeIfReady();
    return completeText;
  } catch (error) {
    textFinished = true;
    soundQueue.length = 0;
    if (valid() && !completeText.trim()) {
      messagesRef.current = messagesRef.current.filter(m => m.id !== id);
      setMessages([...messagesRef.current]);
    }
    throw error;
  }
}

    // Reconhecimento manual, após ativação ou em uma conversa contínua.
  function startCommandListening(followUp = false) {
    if (!recognitionAvailable) return;
    if (followUp && (!conversationActiveRef.current || Date.now() >= conversationDeadlineRef.current)) return;
    if (busyRef.current || listeningRef.current || recognitionRef.current || wakeRef.current) {
      if (followUp) scheduleFollowupListening(350);
      return;
    }
    wakePendingRef.current = false;
    stopWakeListening();
    if (!followUp) stopSpeaking();
    if (!followUp) setVoiceNotice('');
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new Recognition();
    recognition.lang = 'pt-BR';
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.maxAlternatives = 1;
    recognitionRef.current = recognition;
    recognition.onstart = () => {
      listeningRef.current = true;
      setListening(true);
      setStatus('listening');
      if (followUp) setVoiceNotice('Conversa ativa: estou ouvindo sua próxima pergunta.');
    };
    recognition.onresult = event => {
      const transcript = Array.from(event.results)
        .map(result => result[0]?.transcript || '').join(' ').trim();
      if (transcript) {
        setVoiceNotice(`Comando ouvido: “${transcript}”`);
        clearTimeout(conversationTimerRef.current);
        conversationDeadlineRef.current = 0;
        void sendText(transcript, { fromVoice: true });
      }
    };
    recognition.onerror = event => {
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed' || event.error === 'audio-capture') {
        clearConversationMode();
        setVoiceNotice('Microfone indisponível ou sem permissão. Use o botão manual.');
        setStatus('idle');
      } else if (event.error !== 'aborted' && event.error !== 'no-speech') {
        setVoiceNotice(`Falha no reconhecimento de voz: ${event.error}.`);
      }
    };
    recognition.onend = () => {
      if (recognitionRef.current === recognition) recognitionRef.current = null;
      listeningRef.current = false;
      setListening(false);
      const manterConversa = followUp && conversationActiveRef.current &&
        Date.now() < conversationDeadlineRef.current;
      setStatus(previous => previous === 'listening'
        ? (manterConversa ? 'followup' : 'idle') : previous);
      // Reinicia após silêncio, em vez de ficar em repouso entre tentativas.
      if (manterConversa && !busyRef.current) scheduleFollowupListening(300);
    };
    try { recognition.start(); }
    catch (err) {
      recognitionRef.current = null;
      if (followUp && conversationActiveRef.current) {
        setVoiceNotice(`Tentando reativar o microfone… ${err.message || ''}`);
        setStatus('followup');
        scheduleFollowupListening(600);
      } else {
        setVoiceNotice('Não foi possível iniciar o microfone.');
        setStatus('idle');
      }
    }
  }

  function stopWakeListening() {
    clearTimeout(wakeTimerRef.current);
    wakeTimerRef.current = null;
    const recognition = wakeRef.current;
    wakeRef.current = null;
    if (recognition) {
      try { recognition.abort(); } catch { /* reconhecimento já encerrado */ }
    }
  }

  // Ativação por palavra-chave (limitada pelo suporte do Web Speech API no navegador).
  function startWakeListening() {
    if (!recognitionAvailable || !wakeEnabledRef.current || wakeRef.current ||
        wakePendingRef.current || conversationActiveRef.current ||
        busyRef.current || listeningRef.current || recognitionRef.current ||
        audioControllerRef.current || audioRef.current) return;

    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new Recognition();
    recognition.lang = 'pt-BR';
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    wakeRef.current = recognition;

    recognition.onstart = () => {
      if (wakeRef.current !== recognition) return;
      wakeRestartCountRef.current = 0;
      setVoiceNotice('Escuta de ativação ativa. Diga “Nexo” ou “Ei, Nexo”.');
    };

    recognition.onresult = event => {
      if (wakeRef.current !== recognition || wakePendingRef.current) return;
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const spoken = (event.results[i][0]?.transcript || '').trim();
        if (!spoken) continue;
        const ativacao = detectarAtivacao(spoken);

        if (!ativacao.ativou) {
          if (event.results[i].isFinal) {
            setVoiceNotice(`Ouvi: “${spoken}”. Aguardando “Nexo” ou “Ei, Nexo”.`);
          }
          continue;
        }

        const command = ativacao.comando;

        // Só envia um comando quando a transcrição estiver finalizada.
        if (command && event.results[i].isFinal) {
          stopWakeListening();
          setVoiceNotice(`Comando reconhecido: ${command}`);
          void sendText(command, { fromVoice: true });
          return;
        }

        // Se apenas a palavra de ativação foi dita, abre escuta de comando.
        if (!command && event.results[i].isFinal) {
          wakePendingRef.current = true;
          setVoiceNotice('Nexo ativado. Diga seu comando quando o microfone estiver escutando.');
          try { recognition.stop(); }
          catch {
            wakePendingRef.current = false;
            stopWakeListening();
            startCommandListening();
          }
          return;
        }
      }
    };

    recognition.onerror = event => {
      if (wakeRef.current !== recognition) return;
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        wakeEnabledRef.current = false;
        setWakeEnabled(false);
        setVoiceNotice('Acesso ao microfone negado. Autorize o Chrome e ative novamente.');
      } else if (event.error === 'network' || event.error === 'audio-capture') {
        wakeEnabledRef.current = false;
        setWakeEnabled(false);
        setVoiceNotice(`Reconhecimento indisponível (${event.error}). Verifique o Chrome e a conexão.`);
      } else if (event.error !== 'no-speech' && event.error !== 'aborted') {
        setVoiceNotice(`Erro na escuta de ativação: ${event.error}.`);
      }
    };

    recognition.onend = () => {
      if (wakeRef.current !== recognition) return;
      wakeRef.current = null;
      if (wakePendingRef.current) {
        wakePendingRef.current = false;
        wakeTimerRef.current = setTimeout(() => startCommandListening(), 300);
      } else if (wakeEnabledRef.current && !busyRef.current && !listeningRef.current) {
        wakeTimerRef.current = setTimeout(() => startWakeListening(), 1100);
      }
    };

    try { recognition.start(); }
    catch (err) {
      if (wakeRef.current === recognition) wakeRef.current = null;
      wakeRestartCountRef.current += 1;
      setVoiceNotice(`Não foi possível iniciar a escuta: ${err.message || 'microfone ocupado'}.`);
      if (wakeEnabledRef.current && wakeRestartCountRef.current < 3) {
        wakeTimerRef.current = setTimeout(() => startWakeListening(), 1500);
      } else {
        wakeEnabledRef.current = false;
        setWakeEnabled(false);
      }
    }
  }

  // A ativação permanece pausada durante o processamento, a fala e a escuta manual.
  useEffect(() => {
    if (wakeEnabled && status === 'idle' && !busy && !listening && !wakePendingRef.current && !conversationActiveRef.current) {
      wakeTimerRef.current = setTimeout(() => startWakeListening(), 500);
    } else {
      stopWakeListening();
    }
    return () => clearTimeout(wakeTimerRef.current);
  }, [wakeEnabled, status, busy, listening]);

  function toggleWake() {
    if (!recognitionAvailable) {
      setVoiceNotice('Ativação por voz disponível no Chrome ou Edge com microfone autorizado.');
      return;
    }
    const next = !wakeEnabledRef.current;
    wakeEnabledRef.current = next;
    setWakeEnabled(next);
    wakePendingRef.current = false;
    if (!next) {
      stopWakeListening();
      clearConversationMode();
      recognitionRef.current?.abort();
    }
    setVoiceNotice(next
      ? 'Iniciando escuta. Quando aparecer “Escuta de ativação ativa”, diga “Nexo”.'
      : 'Ativação por voz desligada.');
  }

  function toggleMicrophone() {
    if (!recognitionAvailable) {
      setVoiceNotice('Reconhecimento de voz indisponível. Teste no Chrome ou Edge e permita o microfone.');
      return;
    }
    if (listeningRef.current) {
      recognitionRef.current?.stop();
      return;
    }
    if (busyRef.current) return;
    startCommandListening();
  }


  function changeStatus(next) {
    if (busyRef.current || listeningRef.current) return;
    stopSpeaking();
    clearTimeout(resetTimerRef.current);
    setStatus(next);
  }

  function startNewConversation() {
    if (busyRef.current) return;
    recognitionRef.current?.abort();
    wakePendingRef.current = false;
    clearConversationMode();
    stopWakeListening();
    stopSpeaking();
    clearTimeout(resetTimerRef.current);
    messagesRef.current = INITIAL_MESSAGES;
    setMessages(INITIAL_MESSAGES);
    setError('');
    setMessage('');
    setStatus('idle');
    setView('chat');
  }

  function sendMessage(event) {
    event.preventDefault();
    sendText(message);
  }

  function concluirComando(local) {
    if (local.abrir && local.link) {
      // Navegadores podem bloquear abas iniciadas após o reconhecimento de voz.
      try { window.open(local.link, '_blank', 'noopener,noreferrer'); }
      catch { /* link no chat continua disponível */ }
    }
    const answer = { id: crypto.randomUUID(), role: 'assistant', content: local.reply };
    if (local.link) { answer.link = local.link; answer.linkLabel = local.label; }
    messagesRef.current = [...messagesRef.current, answer];
    setMessages([...messagesRef.current]);
    busyRef.current = false;
    setBusy(false);
    pendingRef.current = null;
    void speakReply(local.reply);
  }

  function atualizarDemo(proximo) {
    demoRef.current = proximo;
    setDemo(proximo);
  }

  // Não depende de frases pré-escritas do modelo: é uma experiência real, local e controlada.
  function responderDemonstracao(texto) {
    const cmd = normalizarComando(texto);
    const atual = demoRef.current;
    if (/^(?:nexo )?(?:iniciar|inicie|comecar|comece|abrir|abra)(?: a| uma)? (?:demonstracao|apresentacao|demo)(?: do nexo)?$/.test(cmd) ||
        /^(?:nexo )?(?:modo demonstracao|demonstrar|fazer uma demonstracao)$/.test(cmd)) {
      atualizarDemo({ fase: 'tema', tema: null, resultado: null });
      return { reply: 'Olá! Sou o Nexo, um assistente de voz desenvolvido como projeto de software. Minha interface reage enquanto conversamos. Além de responder perguntas, posso executar comandos e propor desafios. Vamos fazer uma experiência rápida? Escolha tecnologia, ciência ou raciocínio lógico.' };
    }
    if (atual.fase === 'idle') return null;
    if (/^(?:sair|cancelar|cancele|encerrar|encerre|parar|pare|finalizar|finalize)(?: a| o| da| do)?(?: demonstracao| apresentacao| desafio| demo)?(?: agora)?$/.test(cmd)) {
      atualizarDemo({ fase: 'idle', tema: null, resultado: null });
      return { reply: 'Demonstração encerrada. Continuo disponível para conversar.' };
    }
    if (atual.fase === 'tema') {
      const tema = identificarTema(cmd);
      if (!tema) return { reply: 'Escolha uma destas áreas: tecnologia, ciência ou raciocínio lógico.' };
      const desafio = DESAFIOS[tema];
      atualizarDemo({ fase: 'pergunta', tema, resultado: null });
      return { reply: `Ótima escolha! ${desafio.pergunta} Opção um: ${desafio.alternativas[0]}. Opção dois: ${desafio.alternativas[1]}. Ou opção três: ${desafio.alternativas[2]}. Você pode responder pelo nome ou pelo número da opção.` };
    }
    if (atual.fase === 'pergunta') {
      const desafio = DESAFIOS[atual.tema];
      const resposta = identificarAlternativa(cmd, desafio);
      if (resposta === -1) return { reply: 'Não consegui identificar a alternativa. Diga opção um, dois ou três, ou escolha na tela.' };
      const acertou = resposta === desafio.correta;
      atualizarDemo({ fase: 'resultado', tema: atual.tema, resultado: acertou });
      return { reply: `${acertou ? 'Resposta correta! Muito bem.' : 'Boa tentativa!'} ${desafio.explicacao} Essa foi uma demonstração de interação por voz com execução de ações reais. Diga iniciar demonstração para tentar outro tema.` };
    }
    if (atual.fase === 'resultado') return null;
    return null;
  }

  // O botão encerra a experiência sem abrir a janela de mensagens.
  // Passa pelo mesmo fluxo do comando de voz para confirmar o encerramento.
  function encerrarDemoPorBotao() {
    if (busyRef.current || demoRef.current.fase === 'idle') return;
    void sendText('Encerrar demonstração', { fromVoice: recognitionAvailable });
  }

  function iniciarDemoPorBotao() {
    if (busyRef.current) return;
    if (recognitionAvailable) {
      conversationActiveRef.current = true;
      clearTimeout(conversationTimerRef.current);
      conversationDeadlineRef.current = 0;
    }
    void sendText('Iniciar demonstração', { fromVoice: recognitionAvailable });
  }

  async function sendText(input, { fromVoice = false } = {}) {
    const text = input.trim();
    if (!text || busyRef.current) return;
    // Apenas interações por voz mantêm a conversa aberta.
    if (fromVoice) {
      conversationActiveRef.current = true;
      conversationDeadlineRef.current = 0; // suspensa até terminar a resposta
      clearTimeout(conversationTimerRef.current);
      clearTimeout(conversationRestartRef.current);
    } else {
      clearConversationMode();
    }
    busyRef.current = true;
    setBusy(true);
    recognitionRef.current?.stop();
    wakePendingRef.current = false;
    stopWakeListening();
    stopSpeaking();
    clearTimeout(resetTimerRef.current);
    setMessage('');
    setError('');
    setVoiceNotice('');
    // A resposta não abre o chat: o núcleo permanece visível.
    setStatus('thinking');
    const updated = [...messagesRef.current, { id: crypto.randomUUID(), role: 'user', content: text }];
    messagesRef.current = updated;
    setMessages(updated);
    // A demonstração tem prioridade, sem gasto adicional com a IA.
    const demoAction = responderDemonstracao(text);
    if (demoAction) { concluirComando(demoAction); return; }
    // Primeiro tentamos os comandos rápidos locais.
    const local = interpretarComandoLocal(text);
    if (local) {
      concluirComando(local);
      return;
    }

    const controller = new AbortController();
    pendingRef.current = controller;
    try {
      // Frases não reconhecidas localmente são classificadas pela IA.
      // Sem ferramenta identificada, o chat continua no streaming habitual.
      try {
        const decision = await fetch(`${NEXO_API_BASE}/api/commands/interpret`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
          signal: controller.signal,
        });
        if (decision.ok) {
          const result = await decision.json();
          const action = executarComandoInterpretado(result.action);
          if (action) {
            concluirComando(action);
            return;
          }
        }
      } catch (classificationError) {
        if (classificationError.name === 'AbortError') throw classificationError;
        // A classificação é opcional: o chat permanece disponível.
        console.warn('Classificador de comandos indisponível:', classificationError);
      }
      await respondWithStreaming(updated, controller.signal);
    } catch (err) {
      if (err.name !== 'AbortError') {
        setError(err.message || 'Não foi possível obter uma resposta.');
        clearConversationMode();
        setStatus('idle');
      }
    } finally {
      busyRef.current = false;
      setBusy(false);
      pendingRef.current = null;
    }
  }

  const current = STATES[status];
  const desafioAtual = demo.tema ? DESAFIOS[demo.tema] : null;

  return (
    <div className="nexo-app">
      {/* Navegação flutuante: nenhuma barra de cabeçalho. */}
      <nav className="nexo-mode-switch" aria-label="Modo de interação">
        <button
          type="button"
          className={view === 'core' ? 'is-active' : ''}
          aria-pressed={view === 'core'}
          onClick={() => setView('core')}
        >
          <Mic size={16} /> Voz
        </button>
        <button
          type="button"
          className={view === 'chat' ? 'is-active' : ''}
          aria-pressed={view === 'chat'}
          onClick={() => setView('chat')}
        >
          <MessageSquare size={16} /> Mensagens
        </button>
      </nav>

      <main className={`nexo-stage ${view === 'chat' ? 'nexo-stage--chat' : ''}`}>
        {view === 'core' ? (
          <>
            <div className="nexo-title-block">
              <h1 className="nexo-title" aria-label="N.E.X.O.">N.E.X.O</h1>
            </div>

            {/* Núcleo 3D original preservado. */}
            <div className="nexo-orb" aria-label="Núcleo tridimensional do NEXO">
              <NexoCore status={status} />
            </div>

            <div className="nexo-status" aria-live="polite">
              <span className={`nexo-dot nexo-dot--${status}`} />
              {current.label}
            </div>

            {demo.fase !== 'idle' ? (
              <section className="nexo-demo" aria-label="Demonstração interativa">
                {demo.fase === 'tema' && (
                  <>
                    <p>Escolha uma área para o desafio</p>
                    <div className="nexo-options">
                      <button type="button" disabled={busy} onClick={() => sendText('Tecnologia', { fromVoice: recognitionAvailable })}>Tecnologia</button>
                      <button type="button" disabled={busy} onClick={() => sendText('Ciência', { fromVoice: recognitionAvailable })}>Ciência</button>
                      <button type="button" disabled={busy} onClick={() => sendText('Raciocínio lógico', { fromVoice: recognitionAvailable })}>Raciocínio</button>
                    </div>
                  </>
                )}
                {demo.fase === 'pergunta' && desafioAtual && (
                  <>
                    <p>{desafioAtual.pergunta}</p>
                    <div className="nexo-options">
                      {desafioAtual.alternativas.map((alternativa, i) => (
                        <button type="button" key={alternativa} disabled={busy} onClick={() => sendText(`Opção ${i + 1}`, { fromVoice: recognitionAvailable })}>
                          <span>{i + 1}.</span> {alternativa}
                        </button>
                      ))}
                    </div>
                  </>
                )}
                {demo.fase === 'resultado' && (
                  <>
                    <p>{demo.resultado ? 'Resposta correta!' : 'Desafio concluído.'}</p>
                    <button type="button" className="nexo-secondary" disabled={busy} onClick={iniciarDemoPorBotao}>Novo desafio</button>
                  </>
                )}
                <div className="nexo-demo-footer">
                  <button
                    type="button"
                    className="nexo-demo-exit"
                    disabled={busy}
                    onClick={encerrarDemoPorBotao}
                    aria-label="Encerrar demonstração"
                  >
                    Encerrar demonstração
                  </button>
                </div>
              </section>
            ) : (
              <button type="button" className="nexo-demo-launch" disabled={busy} onClick={iniciarDemoPorBotao}>
                <span aria-hidden="true">✦</span> Iniciar demonstração
              </button>
            )}

            <div className="nexo-voice-actions" aria-label="Controles de voz">
              <button
                type="button"
                className={`nexo-primary ${wakeEnabled ? 'active' : ''}`}
                onClick={toggleWake}
                disabled={!recognitionAvailable}
                aria-pressed={wakeEnabled}
              >
                {wakeEnabled ? <Radio size={17} /> : <Mic size={17} />}
                {wakeEnabled ? 'Ativação por voz ligada' : 'Ativar por “Nexo”'}
              </button>
              <button
                type="button"
                className="nexo-icon-button"
                onClick={toggleMicrophone}
                disabled={!recognitionAvailable || busy}
                title="Falar agora"
                aria-label="Falar agora"
              >
                {listening ? <MicOff size={19} /> : <Mic size={19} />}
              </button>
              <button
                type="button"
                className="nexo-icon-button"
                onClick={() => {
                  const next = !voiceEnabled;
                  voiceEnabledRef.current = next;
                  setVoiceEnabled(next);
                  if (!next) {
                    stopSpeaking();
                    setStatus('idle');
                    if (conversationActiveRef.current) armConversationMode();
                  }
                }}
                title={voiceEnabled ? 'Desligar resposta falada' : 'Ligar resposta falada'}
                aria-label={voiceEnabled ? 'Desligar resposta falada' : 'Ligar resposta falada'}
              >
                {voiceEnabled ? <Volume2 size={19} /> : <VolumeX size={19} />}
              </button>
            </div>
            <p className="nexo-hint">
              {voiceNotice || (wakeEnabled ? 'Diga “Nexo” para falar' : 'Ative a voz ou use o microfone para falar')}
            </p>
            {error && <p className="nexo-error" role="alert">{error}</p>}
          </>
        ) : (
          <section className="nexo-chat" aria-label="Conversa por mensagens">
            <div className="nexo-chat-header">
              <strong>Conversa com N.E.X.O.</strong>
              <button type="button" onClick={startNewConversation} disabled={busy}>
                <Plus size={16} /> Nova conversa
              </button>
            </div>
            <div className="nexo-chat-messages" role="log" aria-live="polite">
              {messages.map(item => (
                <div key={item.id} className={`nexo-msg nexo-msg--${item.role}`}>
                  <small>{item.role === 'assistant' ? 'N.E.X.O.' : 'VOCÊ'}</small>
                  <div>
                    {item.content || '…'}
                    {item.link && <a href={item.link} target="_blank" rel="noopener noreferrer">{item.linkLabel || 'Abrir link'}</a>}
                  </div>
                </div>
              ))}
              <div ref={endOfChatRef} />
            </div>
            {error && <p className="nexo-error" role="alert">{error}</p>}
            <form onSubmit={sendMessage} className="nexo-chat-form">
              <input
                value={message}
                onChange={event => setMessage(event.target.value)}
                placeholder="Escreva sua mensagem…"
                aria-label="Mensagem"
                disabled={busy}
              />
              <button type="submit" disabled={!message.trim() || busy} aria-label="Enviar">
                <Send size={18} />
              </button>
            </form>
          </section>
        )}
      </main>
    </div>
  );
}
