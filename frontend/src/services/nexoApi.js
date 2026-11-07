const API_URL = import.meta.env.VITE_NEXO_API_URL || 'http://127.0.0.1:8000';

export async function sendToNexo(messages, signal) {
  let response;
  try {
    response = await fetch(`${API_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: messages.map(({role,content})=>({role,content})) }),
      signal,
    });
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new Error('Não foi possível conectar ao backend. Verifique se o FastAPI está rodando na porta 8000.');
  }
  let result = {};
  try { result = await response.json(); } catch { /* resposta inválida */ }
  if (!response.ok) throw new Error(result.detail || `Falha no servidor (${response.status}).`);
  if (typeof result.reply !== 'string' || !result.reply.trim()) {
    throw new Error('O servidor retornou uma resposta vazia.');
  }
  return result.reply;
}
