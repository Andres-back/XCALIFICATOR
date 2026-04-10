import { useState, useRef, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import api from '../../api';
import toast from 'react-hot-toast';
import { Send, Bot, User, Loader2, RefreshCw, Clock, AlertCircle } from 'lucide-react';
import MathText from '../../components/MathText';

export default function EstudianteChat() {
  const { notaId } = useParams();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [session, setSession] = useState(null);
  const messagesEnd = useRef(null);

  // Load persistent chat history + session status on mount
  useEffect(() => {
    const loadData = async () => {
      try {
        const [histRes, sessRes] = await Promise.all([
          api.get(`/chat/${notaId}/history`),
          api.get(`/chat/session/${notaId}`).catch(() => ({ data: null })),
        ]);
        if (sessRes.data) setSession(sessRes.data);
        if (histRes.data.length > 0) {
          setMessages(histRes.data.map(m => ({ role: m.role, content: m.content })));
        } else {
          setMessages([{
            role: 'assistant',
            content: '¡Hola! Soy **Xali**, tu asistente pedagógico. 🎓\n\nPuedo ayudarte a entender:\n- **Por qué** tus respuestas estuvieron bien o mal\n- **Cuál era el proceso correcto** para resolver cada pregunta\n- **Conceptos clave** que necesitas reforzar\n\n¿Sobre qué pregunta del examen te gustaría hablar?',
          }]);
        }
      } catch {
        setMessages([{
          role: 'assistant',
          content: '¡Hola! Soy tu asistente pedagógico. ¿En qué pregunta te gustaría profundizar?',
        }]);
      } finally {
        setHistoryLoaded(true);
      }
    };
    loadData();
  }, [notaId]);

  useEffect(() => {
    messagesEnd.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userMsg = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setLoading(true);

    try {
      const res = await api.post('/chat/', {
        message: userMsg,
        nota_id: notaId,
      });
      setMessages(prev => [...prev, { role: 'assistant', content: res.data.response }]);
      // Update session info from response
      if (res.data.preguntas_restantes != null) {
        setSession(prev => ({
          ...prev,
          preguntas_restantes: res.data.preguntas_restantes,
          minutos_restantes: res.data.minutos_restantes,
        }));
      }
    } catch (err) {
      if (err.response?.status === 429) {
        const detail = err.response.data?.detail || '';
        setSession(prev => prev ? { ...prev, cerrada: true, preguntas_restantes: 0 } : prev);
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: `⏰ ${detail || 'Sesión agotada. Inicia una nueva sesión para continuar.'}`,
        }]);
      } else {
        toast.error('Error en el chatbot');
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: 'Lo siento, ocurrió un error. Intenta de nuevo.',
        }]);
      }
    } finally {
      setLoading(false);
    }
  };

  const startNewSession = async () => {
    try {
      const res = await api.post(`/chat/session/${notaId}/new`);
      setSession(res.data);
      toast.success('Nueva sesión iniciada');
    } catch {
      toast.error('Error al iniciar nueva sesión');
    }
  };

  const sessionExpired = session && (session.cerrada || session.preguntas_restantes === 0);
  const inputDisabled = loading || sessionExpired;

  if (!historyLoaded) return (
    <div className="flex justify-center py-20">
      <div className="animate-spin h-8 w-8 border-4 border-primary-500 border-t-transparent rounded-full"></div>
    </div>
  );

  return (
    <div className="max-w-2xl mx-auto flex flex-col h-[calc(100vh-140px)]">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl bg-primary-100 flex items-center justify-center">
          <Bot className="w-6 h-6 text-primary-700" />
        </div>
        <div className="flex-1">
          <h1 className="text-lg font-bold text-gray-900">Asistente de Estudio - Xali</h1>
          <p className="text-xs text-gray-500">Te explico paso a paso • Tu historial se guarda automáticamente</p>
        </div>
      </div>

      {/* Session status bar */}
      {session && (
        <div className={`flex items-center justify-between px-4 py-2 rounded-xl text-sm mb-3 ${
          sessionExpired 
            ? 'bg-red-50 text-red-700 border border-red-200' 
            : 'bg-blue-50 text-blue-700 border border-blue-200'
        }`}>
          <div className="flex items-center gap-2">
            {sessionExpired ? <AlertCircle className="w-4 h-4" /> : <Clock className="w-4 h-4" />}
            <span>
              {sessionExpired
                ? 'Sesión finalizada'
                : `${session.preguntas_restantes} pregunta${session.preguntas_restantes !== 1 ? 's' : ''} restante${session.preguntas_restantes !== 1 ? 's' : ''} • ${Math.ceil(session.minutos_restantes || 0)} min`}
            </span>
          </div>
          {sessionExpired && (
            <button onClick={startNewSession} className="flex items-center gap-1 text-xs font-medium bg-red-100 hover:bg-red-200 px-3 py-1 rounded-lg transition-colors">
              <RefreshCw className="w-3 h-3" /> Nueva sesión
            </button>
          )}
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-3 mb-4">
        {messages.map((msg, i) => (
          <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0
              ${msg.role === 'user' ? 'bg-primary-100' : 'bg-gray-100'}`}>
              {msg.role === 'user' ? (
                <User className="w-4 h-4 text-primary-700" />
              ) : (
                <Bot className="w-4 h-4 text-gray-700" />
              )}
            </div>
            <div className={`max-w-[80%] px-4 py-3 rounded-2xl text-sm whitespace-pre-line
              ${msg.role === 'user'
                ? 'bg-primary-600 text-white rounded-br-md'
                : 'bg-gray-100 text-gray-800 rounded-bl-md'
              }`}>
              <MathText text={msg.content} />
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
              <Bot className="w-4 h-4 text-gray-700" />
            </div>
            <div className="bg-gray-100 px-4 py-3 rounded-2xl rounded-bl-md">
              <Loader2 className="w-4 h-4 animate-spin text-gray-500" />
            </div>
          </div>
        )}
        <div ref={messagesEnd} />
      </div>

      {/* Input */}
      {sessionExpired ? (
        <div className="flex flex-col items-center gap-2 py-3">
          <p className="text-sm text-gray-500">Tu sesión ha terminado. Inicia una nueva para seguir aprendiendo.</p>
          <button onClick={startNewSession} className="btn-primary flex items-center gap-2">
            <RefreshCw className="w-4 h-4" /> Iniciar nueva sesión
          </button>
        </div>
      ) : (
        <form onSubmit={sendMessage} className="flex gap-2">
          <input
            type="text"
            className="input-field flex-1"
            placeholder="Pregúntame sobre cualquier pregunta del examen..."
            value={input}
            onChange={e => setInput(e.target.value)}
            disabled={inputDisabled}
          />
          <button type="submit" disabled={inputDisabled || !input.trim()}
            className="btn-primary px-4">
            <Send className="w-5 h-5" />
          </button>
        </form>
      )}

      <p className="text-xs text-gray-400 text-center mt-2">
        Xali te explica el proceso correcto y por qué estuvieron mal o bien tus respuestas.
      </p>
    </div>
  );
}
