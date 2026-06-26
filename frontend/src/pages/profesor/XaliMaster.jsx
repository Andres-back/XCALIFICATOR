import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import DOMPurify from 'dompurify';
import { Bot, Loader2, Send, Sparkles, ArrowRight, Wrench, BookOpen, Presentation, ClipboardCheck } from 'lucide-react';
import api from '../../api';

function inlineFmt(text) {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong class="font-semibold text-gray-900 dark:text-gray-100">$1</strong>')
    .replace(/\*(.+?)\*/g, '<em class="italic">$1</em>')
    .replace(/`([^`]+)`/g, '$1');
}

function normalizeTeacherText(text) {
  return String(text || '')
    .replace(/^\s*#{1,6}\s*/gm, '')
    .replace(/\s*\([^)]*\/(?:profesor|admin|estudiante|api|perfil)[^)]*\)/g, '')
    .replace(/\/(?:profesor|admin|estudiante|api|perfil)[\w/-]*/g, '')
    .replace(/\b(?:RAG|API|endpoint|URL|localhost|HTTP)\b/gi, 'IA')
    .replace(/\bslides?\b/gi, 'diapositivas')
    .replace(/[\u{1F300}-\u{1FAFF}]/gu, '');
}

function parseMarkdown(text) {
  if (!text) return '';
  const lines = normalizeTeacherText(text).split('\n');
  const parts = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // Heading ## or ###
    if (/^#{1,3} /.test(trimmed)) {
      const txt = inlineFmt(trimmed.replace(/^#{1,3} /, ''));
      parts.push(`<p class="font-bold text-gray-900 dark:text-gray-100 mt-3 mb-0.5 text-[13px]">${txt}</p>`);
      i++;
      continue;
    }

    // Bullet list block
    if (/^[-*] /.test(trimmed)) {
      const items = [];
      while (i < lines.length && /^[-*] /.test(lines[i].trim())) {
        items.push(`<li>${inlineFmt(lines[i].trim().replace(/^[-*] /, ''))}</li>`);
        i++;
      }
      parts.push(`<ul class="list-disc pl-5 space-y-1 my-2 text-gray-700 dark:text-gray-200">${items.join('')}</ul>`);
      continue;
    }

    // Numbered list block
    if (/^\d+\. /.test(trimmed)) {
      const items = [];
      while (i < lines.length && /^\d+\. /.test(lines[i].trim())) {
        items.push(`<li>${inlineFmt(lines[i].trim().replace(/^\d+\. /, ''))}</li>`);
        i++;
      }
      parts.push(`<ol class="list-decimal pl-5 space-y-1 my-2 text-gray-700 dark:text-gray-200">${items.join('')}</ol>`);
      continue;
    }

    // Horizontal rule
    if (/^---+$/.test(trimmed)) {
      parts.push('<hr class="my-2 border-gray-200 dark:border-gray-700"/>');
      i++;
      continue;
    }

    // Empty line — paragraph break (skip, let spacing between parts handle it)
    if (!trimmed) {
      i++;
      continue;
    }

    // Regular paragraph line — collect until blank/list/heading
    const paraLines = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^#{1,3} /.test(lines[i].trim()) &&
      !/^[-*] /.test(lines[i].trim()) &&
      !/^\d+\. /.test(lines[i].trim()) &&
      !/^---+$/.test(lines[i].trim())
    ) {
      paraLines.push(inlineFmt(lines[i].trim()));
      i++;
    }
    if (paraLines.length) {
      parts.push(`<p class="text-gray-700 dark:text-gray-200 leading-relaxed">${paraLines.join('<br/>')}</p>`);
    }
  }

  return DOMPurify.sanitize(
    `<div class="space-y-1.5">${parts.join('')}</div>`,
    { ADD_ATTR: ['class'] }
  );
}

const QUICK_PROMPTS = [
  {
    label: 'Diseñar con IA',
    icon: Sparkles,
    prompt: null,
    route: '/profesor/crear-examen-chat',
  },
  {
    label: 'Evaluación rápida',
    icon: ClipboardCheck,
    prompt: 'Tengo un examen hecho a mano y quiero digitalizarlo rapidamente para calificar.',
  },
  {
    label: 'Crear diapositivas',
    icon: Presentation,
    prompt: 'Necesito hacer una presentacion para una clase. Que debo hacer?',
  },
  {
    label: 'Subir DBA',
    icon: BookOpen,
    prompt: 'Quiero subir DBA o plan curricular para que la IA lo use.',
  },
];

const initialMessages = [
  {
    role: 'assistant',
    content: 'Soy Xali Master. Dime que quieres hacer y te llevo a la herramienta correcta.',
    actions: [
      { label: 'Herramientas', route: '/profesor/herramientas', reason: 'Crear examenes, digitalizar fotos y usar generadores.' },
      { label: 'Materias', route: '/profesor/materias', reason: 'Administrar materias, estudiantes y DBA.' },
    ],
  },
];

function AssistantAvatar({ mascotUrl, size = 'sm' }) {
  const sizeClass = size === 'lg' ? 'w-12 h-12' : 'w-7 h-7';
  const iconClass = size === 'lg' ? 'w-6 h-6' : 'w-4 h-4';
  return (
    <div className={`flex-shrink-0 ${sizeClass} rounded-full bg-profesor-100 dark:bg-profesor-900/40 flex items-center justify-center overflow-hidden ring-1 ring-profesor-100 dark:ring-profesor-800`}>
      {mascotUrl ? (
        <img src={mascotUrl} alt="" className="w-full h-full object-cover" />
      ) : (
        <Bot className={`${iconClass} text-profesor-600 dark:text-profesor-400`} />
      )}
    </div>
  );
}

function MessageBubble({ message, mascotUrl }) {
  const isUser = message.role === 'user';
  return (
    <div className={`flex gap-2 ${isUser ? 'justify-end' : 'justify-start'}`}>
      {!isUser && (
        <div className="mt-1">
          <AssistantAvatar mascotUrl={mascotUrl} />
        </div>
      )}
      <div className={`max-w-[84%] rounded-2xl shadow-sm ${
        isUser
          ? 'bg-profesor-600 text-white px-4 py-3'
          : 'bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 px-4 py-3.5'
      }`}>
        {!isUser && (
          <p className="text-[11px] font-semibold text-profesor-600 dark:text-profesor-400 uppercase tracking-wide mb-2">
            Xali Master
          </p>
        )}
        {isUser ? (
          <p className="text-sm leading-relaxed">{message.content}</p>
        ) : (
          <div
            className="text-sm"
            dangerouslySetInnerHTML={{ __html: parseMarkdown(message.content) }}
          />
        )}
        {!isUser && message.actions?.length > 0 && (
          <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-800 flex flex-wrap gap-2">
            {message.actions.map((action, index) => (
              <Link
                key={`${action.route}-${index}`}
                to={action.route}
                className="inline-flex items-center gap-1.5 rounded-lg bg-profesor-50 dark:bg-profesor-900/30 text-profesor-700 dark:text-profesor-300 hover:bg-profesor-100 dark:hover:bg-profesor-900/50 border border-profesor-100 dark:border-profesor-800/50 px-3 py-1.5 text-xs font-semibold transition-colors"
                title={action.reason}
              >
                {action.label}
                <ArrowRight className="w-3 h-3" />
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function XaliMaster() {
  const location = useLocation();
  const navigate = useNavigate();
  const inputRef = useRef(null);
  const [messages, setMessages] = useState(initialMessages);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [mascotUrl, setMascotUrl] = useState('/xali/mascota-principal.png');

  const history = useMemo(
    () => messages
      .filter((msg) => msg.role === 'user' || msg.role === 'assistant')
      .slice(-8)
      .map(({ role, content }) => ({ role, content })),
    [messages],
  );

  useEffect(() => {
    let alive = true;
    api.get('/xali/settings')
      .then((res) => {
        if (alive) setMascotUrl(res.data?.profesor_mascot_url || '/xali/mascota-principal.png');
      })
      .catch(() => {
        if (alive) setMascotUrl('/xali/mascota-principal.png');
      });
    return () => {
      alive = false;
    };
  }, []);

  const sendMessage = async (text = input) => {
    const clean = String(text || '').trim();
    if (!clean || loading) return;

    const userMessage = { role: 'user', content: clean };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setLoading(true);
    try {
      const { data } = await api.post('/xali-master/chat', {
        message: clean,
        history,
        current_path: location.pathname,
      });
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: data.response,
          actions: data.actions || [],
        },
      ]);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Xali no pudo responder');
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: 'No pude conectarme con la IA en este momento. Puedes entrar a Herramientas para crear examenes, digitalizar fotos o generar presentaciones.',
          actions: [{ label: 'Herramientas', route: '/profesor/herramientas', reason: 'Acceso principal a herramientas docentes.' }],
        },
      ]);
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  };

  return (
    <div className="min-h-full bg-gray-50 dark:bg-gray-950">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8 space-y-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-profesor-50 px-3 py-1 text-xs font-semibold text-profesor-700 ring-1 ring-profesor-100">
              <Sparkles className="w-3.5 h-3.5" />
              Asistente docente
            </div>
            <div className="mt-2 flex items-center gap-3">
              <AssistantAvatar mascotUrl={mascotUrl} size="lg" />
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Xali Master</h1>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Te orienta dentro de XCalificator con el conocimiento de las funciones del sistema.
            </p>
          </div>
          <button
            type="button"
            onClick={() => navigate('/profesor/herramientas')}
            className="btn-primary inline-flex items-center justify-center gap-2"
          >
            <Wrench className="w-4 h-4" />
            Herramientas
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-5">
          <section className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white/70 dark:bg-gray-900/70 overflow-hidden">
            <div className="h-[62vh] min-h-[460px] overflow-y-auto px-4 py-5 space-y-4">
              {messages.map((msg, index) => (
                <MessageBubble key={index} message={msg} mascotUrl={mascotUrl} />
              ))}
              {loading && (
                <div className="flex justify-start">
                  <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-4 py-3 text-sm text-gray-600 dark:text-gray-300 inline-flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin text-profesor-600" />
                    Xali esta pensando...
                  </div>
                </div>
              )}
            </div>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                sendMessage();
              }}
              className="border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3"
            >
              <div className="flex gap-2">
                <input
                  ref={inputRef}
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  className="input-field text-base"
                  placeholder="Ej: quiero calificar fotos de un examen..."
                  maxLength={2500}
                />
                <button
                  type="submit"
                  disabled={loading || !input.trim()}
                  className="btn-primary inline-flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  Enviar
                </button>
              </div>
            </form>
          </section>

          <aside className="space-y-3">
            <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
              <p className="text-sm font-bold text-gray-900 dark:text-white mb-3">Acciones rapidas</p>
              <div className="space-y-2">
                {QUICK_PROMPTS.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.label}
                      type="button"
                      onClick={() => item.route ? navigate(item.route) : sendMessage(item.prompt)}
                      className="w-full flex items-center gap-3 rounded-xl border border-gray-200 dark:border-gray-800 px-3 py-3 text-left hover:border-profesor-300 hover:bg-profesor-50 dark:hover:bg-profesor-900/20 transition"
                    >
                      <Icon className="w-5 h-5 text-profesor-600" />
                      <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">{item.label}</span>
                      {item.route && <ArrowRight className="w-3.5 h-3.5 text-gray-400 ml-auto" />}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="rounded-2xl border border-profesor-100 bg-profesor-50 p-4 text-sm text-profesor-900">
              Xali responde usando la ayuda interna de XCalificator para orientarte paso a paso.
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
