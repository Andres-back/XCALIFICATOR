import { useState, useRef, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import api from '../../api';
import toast from 'react-hot-toast';
import { Send, Bot, User, Loader2, RefreshCw } from 'lucide-react';

export default function EstudianteChat() {
  const { notaId } = useParams();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const messagesEnd = useRef(null);

  // Load persistent chat history on mount
  useEffect(() => {
    const loadHistory = async () => {
      try {
        const res = await api.get(`/chat/${notaId}/history`);
        if (res.data.length > 0) {
          setMessages(res.data.map(m => ({ role: m.role, content: m.content })));
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
    loadHistory();
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
    } catch (err) {
      toast.error('Error en el chatbot');
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Lo siento, ocurrió un error. Intenta de nuevo.',
      }]);
    } finally {
      setLoading(false);
    }
  };

  // Simple markdown-like rendering (bold, lists, line breaks)
  const renderContent = (text) => {
    const parts = text.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={i} className="font-semibold">{part.slice(2, -2)}</strong>;
      }
      return <span key={i}>{part}</span>;
    });
  };

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
        <div>
          <h1 className="text-lg font-bold text-gray-900">Asistente de Estudio - Xali</h1>
          <p className="text-xs text-gray-500">Te explico paso a paso • Tu historial se guarda automáticamente</p>
        </div>
      </div>

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
              {renderContent(msg.content)}
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
      <form onSubmit={sendMessage} className="flex gap-2">
        <input
          type="text"
          className="input-field flex-1"
          placeholder="Pregúntame sobre cualquier pregunta del examen..."
          value={input}
          onChange={e => setInput(e.target.value)}
          disabled={loading}
        />
        <button type="submit" disabled={loading || !input.trim()}
          className="btn-primary px-4">
          <Send className="w-5 h-5" />
        </button>
      </form>

      <p className="text-xs text-gray-400 text-center mt-2">
        Xali te explica el proceso correcto y por qué estuvieron mal o bien tus respuestas.
      </p>
    </div>
  );
}
