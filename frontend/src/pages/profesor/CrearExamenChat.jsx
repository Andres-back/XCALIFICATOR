import { useRef, useState, useCallback, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import toast from 'react-hot-toast';
import DOMPurify from 'dompurify';
import {
  Bot, Send, Sparkles, Loader2, Paperclip, X,
  FileText, CheckCircle, Save, ChevronDown, ChevronUp,
  ImageIcon, ArrowLeft,
} from 'lucide-react';
import api from '../../api';

// ── Markdown parser ───────────────────────────────────────────────────────

function inlineFmt(text) {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong class="font-semibold text-gray-900 dark:text-gray-100">$1</strong>')
    .replace(/\*(.+?)\*/g,    '<em class="italic">$1</em>')
    .replace(/`([^`]+)`/g,    '<code class="px-1 rounded bg-gray-100 dark:bg-gray-800 text-xs font-mono">$1</code>');
}

function parseMarkdown(text) {
  if (!text) return '';
  const lines = String(text).split('\n');
  const parts = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();
    if (/^#{1,3} /.test(trimmed)) {
      parts.push(`<p class="font-bold text-gray-900 dark:text-gray-100 mt-3 mb-0.5 text-[13px]">${inlineFmt(trimmed.replace(/^#{1,3} /, ''))}</p>`);
      i++; continue;
    }
    if (/^[-*] /.test(trimmed)) {
      const items = [];
      while (i < lines.length && /^[-*] /.test(lines[i].trim())) {
        items.push(`<li>${inlineFmt(lines[i].trim().replace(/^[-*] /, ''))}</li>`);
        i++;
      }
      parts.push(`<ul class="list-disc pl-5 space-y-1 my-2 text-gray-700 dark:text-gray-200">${items.join('')}</ul>`);
      continue;
    }
    if (/^\d+\. /.test(trimmed)) {
      const items = [];
      while (i < lines.length && /^\d+\. /.test(lines[i].trim())) {
        items.push(`<li>${inlineFmt(lines[i].trim().replace(/^\d+\. /, ''))}</li>`);
        i++;
      }
      parts.push(`<ol class="list-decimal pl-5 space-y-1 my-2 text-gray-700 dark:text-gray-200">${items.join('')}</ol>`);
      continue;
    }
    if (!trimmed) { i++; continue; }
    const paraLines = [];
    while (i < lines.length && lines[i].trim() && !/^#{1,3} |^[-*] |^\d+\. /.test(lines[i].trim())) {
      paraLines.push(inlineFmt(lines[i].trim()));
      i++;
    }
    if (paraLines.length) parts.push(`<p class="text-gray-700 dark:text-gray-200 leading-relaxed">${paraLines.join('<br/>')}</p>`);
  }
  return DOMPurify.sanitize(`<div class="space-y-1.5">${parts.join('')}</div>`, { ADD_ATTR: ['class'] });
}

// ── Helpers ───────────────────────────────────────────────────────────────

function readAsDataURL(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.readAsDataURL(file);
  });
}

const TIPO_BADGE = {
  seleccion_multiple: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  verdadero_falso:    'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  respuesta_corta:    'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  desarrollo:         'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
};
const TIPO_LABEL = {
  seleccion_multiple: 'Sel. Múltiple',
  verdadero_falso:    'V/F',
  respuesta_corta:    'Resp. Corta',
  desarrollo:         'Desarrollo',
};

// ── Exam draft card ───────────────────────────────────────────────────────

function ExamDraftCard({ draft, onSave, saving }) {
  const [expanded, setExpanded] = useState(false);
  const preguntas = draft?.preguntas || [];
  const shown = expanded ? preguntas : preguntas.slice(0, 4);

  return (
    <div className="mx-3 mb-3 border-2 border-green-300 dark:border-green-700 rounded-2xl bg-green-50 dark:bg-green-900/20 overflow-hidden animate-fade-up">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 bg-green-100 dark:bg-green-800/30 border-b border-green-200 dark:border-green-700">
        <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400 shrink-0" />
        <span className="text-sm font-semibold text-green-800 dark:text-green-300 flex-1 truncate">
          Examen listo — {preguntas.length} pregunta{preguntas.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Title */}
      {draft?.titulo && (
        <div className="px-4 pt-3">
          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{draft.titulo}</p>
        </div>
      )}

      {/* Questions preview */}
      <div className="px-4 py-3 space-y-1.5">
        {shown.map((p, idx) => {
          const tipo  = p.tipo || 'respuesta_corta';
          const badge = TIPO_BADGE[tipo] || 'bg-gray-100 text-gray-600';
          const label = TIPO_LABEL[tipo] || tipo;
          return (
            <div key={idx} className="flex items-start gap-2 text-xs text-gray-700 dark:text-gray-300">
              <span className="shrink-0 w-5 h-5 rounded bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 flex items-center justify-center font-bold text-[10px] text-gray-500">
                {p.numero ?? idx + 1}
              </span>
              <span className={`shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase ${badge}`}>
                {label}
              </span>
              <span className="line-clamp-1 leading-snug">{p.enunciado || p.pregunta}</span>
            </div>
          );
        })}
        {preguntas.length > 4 && (
          <button
            onClick={() => setExpanded(e => !e)}
            className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400 font-medium mt-1 hover:underline"
          >
            {expanded
              ? <><ChevronUp className="w-3 h-3" /> Ver menos</>
              : <><ChevronDown className="w-3 h-3" /> Ver {preguntas.length - 4} más</>}
          </button>
        )}
      </div>

      {/* Actions */}
      <div className="px-4 py-3 border-t border-green-200 dark:border-green-700">
        <button
          onClick={onSave}
          disabled={saving}
          className="w-full flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 active:scale-[0.98] text-white rounded-xl py-2.5 text-sm font-semibold transition-all disabled:opacity-60"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {saving ? 'Guardando…' : 'Guardar como borrador'}
        </button>
      </div>
    </div>
  );
}

// ── File chip ─────────────────────────────────────────────────────────────

function FileChip({ file, preview, onRemove }) {
  const isImg = file.type.startsWith('image/');
  return (
    <span className="inline-flex items-center gap-1.5 text-xs bg-gray-100 dark:bg-gray-800 rounded-lg overflow-hidden">
      {isImg && preview
        ? <img src={preview} alt="" className="w-8 h-7 object-cover rounded-l-lg" />
        : <FileText className="w-3.5 h-3.5 text-red-400 ml-2" />
      }
      <span className="max-w-[120px] truncate px-1">{file.name}</span>
      <button
        onClick={onRemove}
        className="mr-1 text-gray-400 hover:text-red-500 transition-colors"
      >
        <X className="w-3 h-3" />
      </button>
    </span>
  );
}

// ── Chat bubble ───────────────────────────────────────────────────────────

function Bubble({ msg }) {
  const isUser = msg.role === 'user';
  return (
    <div className={`flex gap-2 ${isUser ? 'justify-end' : 'justify-start'}`}>
      {!isUser && (
        <div className="shrink-0 w-7 h-7 rounded-full bg-profesor-100 dark:bg-profesor-900/40 flex items-center justify-center mt-1">
          <Bot className="w-4 h-4 text-profesor-600 dark:text-profesor-400" />
        </div>
      )}
      <div className={`max-w-[84%] rounded-2xl shadow-sm ${
        isUser
          ? 'bg-profesor-600 text-white px-4 py-3'
          : 'bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 px-4 py-3.5'
      }`}>
        {!isUser && (
          <p className="text-[11px] font-semibold text-profesor-600 dark:text-profesor-400 uppercase tracking-wide mb-2">
            Xali Exam Designer
          </p>
        )}
        {isUser ? (
          <div>
            <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
            {msg.files?.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {msg.files.map((f, i) => {
                  const isImg = f.type?.startsWith('image/') || /\.(jpe?g|png|webp|gif)$/i.test(f.name || '');
                  return (
                    <span key={i} className="inline-flex items-center gap-1 text-xs bg-white/20 rounded px-2 py-0.5">
                      {isImg ? <ImageIcon className="w-3 h-3" /> : <Paperclip className="w-3 h-3" />}
                      {f.name}
                    </span>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          <div className="text-sm" dangerouslySetInnerHTML={{ __html: parseMarkdown(msg.content) }} />
        )}
      </div>
    </div>
  );
}

// ── Starter prompts ───────────────────────────────────────────────────────

const STARTERS = [
  { label: 'Matemáticas 5°', icon: '🔢', prompt: 'Necesito un examen de matemáticas para 5° de primaria sobre fracciones. 10 preguntas mixtas.' },
  { label: 'Desde imagen', icon: '📷', prompt: 'Voy a subir una imagen de mi libro para que me hagas el examen basado en ese contenido.' },
  { label: 'Vocabulario inglés', icon: '🌍', prompt: 'Examen de vocabulario en inglés para 8°. 8 preguntas de selección múltiple y 4 de traducción.' },
  { label: 'Historia rápida', icon: '📜', prompt: 'Examen corto de 5 preguntas de historia de Colombia para bachillerato. Verdadero/falso.' },
];

// ── Main component ────────────────────────────────────────────────────────

export default function CrearExamenChat() {
  const navigate  = useNavigate();
  const location  = useLocation();
  const materiaId = new URLSearchParams(location.search).get('materia') || '';

  const [messages,  setMessages]  = useState([{
    role: 'assistant',
    content: 'Hola, soy **Xali Exam Designer**. Te ayudo a crear un examen paso a paso.\n\n¿Sobre qué tema es el examen? ¿Para qué grado? Puedes describirlo con palabras o subir imágenes de tu libro, notas de clase o fotos del tablero.',
  }]);
  const [input,     setInput]     = useState('');
  const [files,     setFiles]     = useState([]);
  const [previews,  setPreviews]  = useState({});
  const [loading,   setLoading]   = useState(false);
  const [examDraft, setExamDraft] = useState(null);
  const [saving,    setSaving]    = useState(false);
  const [dragging,  setDragging]  = useState(false);

  const inputRef  = useRef(null);
  const fileRef   = useRef(null);
  const bottomRef = useRef(null);
  const msgAreaRef = useRef(null);

  const scrollBottom = useCallback(() => {
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
  }, []);

  const history = messages
    .filter(m => m.role === 'user' || m.role === 'assistant')
    .slice(-10)
    .map(({ role, content }) => ({ role, content: typeof content === 'string' ? content : '' }));

  const addFiles = useCallback(async (incoming) => {
    const combined = [...files, ...Array.from(incoming)].slice(0, 3);
    setFiles(combined);
    const newPrev = { ...previews };
    await Promise.all(combined.map(async (f, i) => {
      if (f.type.startsWith('image/') && !newPrev[i]) {
        newPrev[i] = await readAsDataURL(f);
      }
    }));
    setPreviews(newPrev);
  }, [files, previews]);

  const removeFile = useCallback(async (idx) => {
    const next = files.filter((_, i) => i !== idx);
    setFiles(next);
    const nextPrev = {};
    await Promise.all(next.map(async (f, i) => {
      if (f.type.startsWith('image/')) nextPrev[i] = await readAsDataURL(f);
    }));
    setPreviews(nextPrev);
  }, [files]);

  const handleFileChange = (e) => {
    addFiles(Array.from(e.target.files || []));
    e.target.value = '';
  };

  // Drag-and-drop on messages area
  const handleDragOver = (e) => { e.preventDefault(); setDragging(true); };
  const handleDragLeave = (e) => { if (!msgAreaRef.current?.contains(e.relatedTarget)) setDragging(false); };
  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    const dropped = Array.from(e.dataTransfer.files).filter(
      f => f.type.startsWith('image/') || f.type === 'application/pdf'
    );
    if (dropped.length) addFiles(dropped);
  };

  const sendMessage = async (text = input) => {
    const clean = String(text || '').trim();
    if (!clean && files.length === 0) return;
    if (loading) return;

    const hasFiles = files.length > 0;
    const filesMeta = files.map(f => ({ name: f.name, type: f.type }));
    const userMsg  = { role: 'user', content: clean, files: filesMeta };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    const form = new FormData();
    form.append('message', clean || 'Analiza las imágenes adjuntas');
    form.append('history', JSON.stringify(history));
    if (materiaId) form.append('materia_id', materiaId);
    files.forEach(f => form.append('files', f));
    setFiles([]);
    setPreviews({});

    try {
      const { data } = await api.post('/generate/exam-chat', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setMessages(prev => [...prev, { role: 'assistant', content: data.response }]);
      if (data.exam_draft) setExamDraft(data.exam_draft);
    } catch (err) {
      const detail = err.response?.data?.detail || 'No pude conectar con la IA';
      toast.error(detail);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `Error: ${detail}. Verifica que Open Code esté configurado en tu perfil.`,
      }]);
    } finally {
      setLoading(false);
      scrollBottom();
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  };

  const saveAsDraft = async () => {
    if (!examDraft) return;
    setSaving(true);
    try {
      const contenido = { titulo: examDraft.titulo, preguntas: [] };
      const clave     = { preguntas: [] };

      for (const p of examDraft.preguntas || []) {
        const { respuesta_correcta, puntos, ...rest } = p;
        const { respuesta_correcta: _rc, ...cleanRest } = rest;
        contenido.preguntas.push(cleanRest);
        clave.preguntas.push({
          numero:             p.numero,
          tipo:               p.tipo,
          enunciado:          p.enunciado || p.pregunta || '',
          opciones:           p.opciones || [],
          respuesta_correcta: respuesta_correcta || '',
          puntos:             puntos || 1,
        });
      }

      const payload = {
        tipo:             'examen',
        titulo:           examDraft.titulo || 'Examen diseñado con IA',
        contenido_json:   contenido,
        clave_respuestas: clave,
      };

      if (materiaId) {
        try {
          const { data } = await api.post('/generate/exam', {
            ...payload,
            materia_id:     materiaId,
            contenido_base: '',
            distribucion:   {},
            grado:          '',
          });
          if (data?.id) {
            toast.success('Examen guardado en la materia');
            navigate(`/profesor/examenes/${materiaId}`);
            return;
          }
        } catch {}
      }

      await api.post('/herramientas/', payload);
      toast.success('Guardado en Herramientas como borrador');
      navigate('/profesor/herramientas');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'No se pudo guardar');
    } finally {
      setSaving(false);
    }
  };

  const canSend = (!loading) && (input.trim().length > 0 || files.length > 0);

  return (
    <div className="flex flex-col h-[calc(100vh-64px)] bg-gray-50 dark:bg-gray-950">

      {/* ── Header ── */}
      <div className="flex items-center gap-3 px-4 py-3 bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 shrink-0">
        <button
          onClick={() => navigate(-1)}
          className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="w-8 h-8 rounded-full bg-profesor-100 dark:bg-profesor-900/40 flex items-center justify-center shrink-0">
          <Sparkles className="w-4 h-4 text-profesor-600 dark:text-profesor-400" />
        </div>
        <div className="min-w-0">
          <h1 className="text-sm font-bold text-gray-900 dark:text-gray-100 leading-tight">
            Diseñar examen con IA
          </h1>
          <p className="text-xs text-gray-500 dark:text-gray-400">Chat interactivo · soporta imágenes y PDFs</p>
        </div>
        {materiaId && (
          <span className="ml-auto text-xs bg-profesor-50 dark:bg-profesor-900/30 text-profesor-700 dark:text-profesor-300 border border-profesor-100 dark:border-profesor-800 rounded-full px-3 py-1 shrink-0">
            Con contexto de materia
          </span>
        )}
      </div>

      {/* ── Messages ── */}
      <div
        ref={msgAreaRef}
        className={`flex-1 overflow-y-auto px-4 py-4 space-y-4 relative transition-colors ${
          dragging ? 'bg-profesor-50/60 dark:bg-profesor-900/10' : ''
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {/* Drag overlay hint */}
        {dragging && (
          <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
            <div className="bg-white dark:bg-gray-900 border-2 border-dashed border-profesor-400 rounded-2xl px-8 py-6 flex flex-col items-center gap-2 shadow-lg">
              <Paperclip className="w-6 h-6 text-profesor-500" />
              <p className="text-sm font-semibold text-profesor-700 dark:text-profesor-300">
                Suelta para adjuntar
              </p>
            </div>
          </div>
        )}

        {messages.map((msg, idx) => <Bubble key={idx} msg={msg} />)}

        {/* Loading typing indicator */}
        {loading && (
          <div className="flex gap-2 justify-start">
            <div className="w-7 h-7 rounded-full bg-profesor-100 dark:bg-profesor-900/40 flex items-center justify-center">
              <Bot className="w-4 h-4 text-profesor-600" />
            </div>
            <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl px-4 py-3 flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-profesor-500" />
              <span className="text-xs text-gray-500">
                {files.length > 0 ? 'Analizando imágenes…' : 'Diseñando…'}
              </span>
            </div>
          </div>
        )}

        {/* Starter prompts (first turn only) */}
        {messages.length === 1 && !loading && (
          <div className="grid grid-cols-2 gap-2 pt-2">
            {STARTERS.map(s => (
              <button
                key={s.label}
                onClick={() => sendMessage(s.prompt)}
                className="text-left p-3 rounded-xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 hover:border-profesor-200 dark:hover:border-profesor-700 hover:shadow-sm transition-all group"
              >
                <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 group-hover:text-profesor-600 dark:group-hover:text-profesor-400 flex items-center gap-1.5">
                  <span>{s.icon}</span> {s.label}
                </p>
                <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5 line-clamp-2">{s.prompt}</p>
              </button>
            ))}
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* ── Exam draft banner ── */}
      {examDraft && (
        <ExamDraftCard draft={examDraft} onSave={saveAsDraft} saving={saving} />
      )}

      {/* ── Attached files ── */}
      {files.length > 0 && (
        <div className="px-4 py-2 flex flex-wrap gap-2 border-t border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900">
          {files.map((f, i) => (
            <FileChip
              key={i}
              file={f}
              preview={previews[i]}
              onRemove={() => removeFile(i)}
            />
          ))}
        </div>
      )}

      {/* ── Input bar ── */}
      <div className="px-4 py-3 bg-white dark:bg-gray-900 border-t border-gray-100 dark:border-gray-800 shrink-0">
        <div className="flex items-end gap-2 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 shadow-sm focus-within:border-profesor-400 dark:focus-within:border-profesor-600 transition-colors">
          <button
            onClick={() => fileRef.current?.click()}
            className="shrink-0 p-1 rounded-lg text-gray-400 hover:text-profesor-500 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            title="Adjuntar imagen o PDF (máx. 3)"
          >
            <Paperclip className="w-4 h-4" />
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*,.pdf"
            multiple
            className="hidden"
            onChange={handleFileChange}
          />

          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
            }}
            placeholder={files.length > 0
              ? 'Describe qué hacer con las imágenes…'
              : 'Describe el examen que quieres crear…'
            }
            rows={1}
            className="flex-1 resize-none bg-transparent text-sm text-gray-800 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500 outline-none max-h-32 overflow-y-auto"
            style={{ fieldSizing: 'content' }}
          />

          <button
            onClick={() => sendMessage()}
            disabled={!canSend}
            className="shrink-0 w-8 h-8 flex items-center justify-center rounded-xl bg-profesor-600 hover:bg-profesor-700 active:scale-95 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </div>
        <p className="text-center text-[10px] text-gray-400 mt-1.5">
          Enter para enviar · Shift+Enter para nueva línea · Arrastra imágenes o PDFs al chat
        </p>
      </div>
    </div>
  );
}
