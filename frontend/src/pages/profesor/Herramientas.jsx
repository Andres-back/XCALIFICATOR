import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import katex from 'katex';
import api from '../../api';
import toast from 'react-hot-toast';
import {
  Wrench, Plus, Wand2, Loader2, Edit3, Trash2, Send,
  FileText, Grid3X3, Search, Eye, EyeOff, X, BookOpen,
  CheckCircle, Clock, AlertCircle, Link2, BookMarked,
  Palette, Download, Printer, Save, Presentation, Sparkles, ArrowRight,
  Camera, ExternalLink, Play, Upload, FileQuestion,
} from 'lucide-react';
import Crucigrama from '../../components/Crucigrama';
import SopaLetras from '../../components/SopaLetras';
import Emparejar from '../../components/Emparejar';
import Cuento from '../../components/Cuento';
import ParaColorear from '../../components/ParaColorear';
import EmptyState from '../../components/EmptyState';
import ConfirmDialog from '../../components/ConfirmDialog';
import MathText, { normalizeLatexFormula, normalizePlainMathText } from '../../components/MathText';
import { AdvancedAccordion, PresetButton, WizardSteps } from './GenerationAssistant';
import { openPresentonEditorWithSession } from '../../utils/presenton';
import PageGuide from '../../components/GuidedTour';

const TIPOS = [
  { value: 'examen', label: 'Examen', icon: FileText, color: 'blue' },
  { value: 'crucigrama', label: 'Crucigrama', icon: Grid3X3, color: 'purple' },
  { value: 'sopa_letras', label: 'Sopa de Letras', icon: Search, color: 'emerald' },
  { value: 'emparejar', label: 'Emparejar', icon: Link2, color: 'amber' },
  { value: 'cuento', label: 'Cuento', icon: BookMarked, color: 'rose' },
  { value: 'para_colorear', label: 'Para Colorear', icon: Palette, color: 'teal' },
];

const TIPO_COLORS = {
  blue:    { bg: 'bg-blue-50 dark:bg-blue-900/30',    text: 'text-blue-600 dark:text-blue-400' },
  purple:  { bg: 'bg-purple-50 dark:bg-purple-900/30', text: 'text-purple-600 dark:text-purple-400' },
  emerald: { bg: 'bg-emerald-50 dark:bg-emerald-900/30', text: 'text-emerald-600 dark:text-emerald-400' },
  amber:   { bg: 'bg-amber-50 dark:bg-amber-900/30',  text: 'text-amber-600 dark:text-amber-400' },
  rose:    { bg: 'bg-rose-50 dark:bg-rose-900/30',    text: 'text-rose-600 dark:text-rose-400' },
  teal:    { bg: 'bg-teal-50 dark:bg-teal-900/30',    text: 'text-teal-600 dark:text-teal-400' },
};

const ESTADO_BADGES = {
  borrador: { label: 'Borrador', color: 'bg-gray-100 text-gray-700 dark:bg-gray-700/60 dark:text-gray-300', icon: Edit3 },
  generado: { label: 'Generado', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300', icon: CheckCircle },
  listo:    { label: 'Listo',    color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300', icon: CheckCircle },
  asignado: { label: 'Asignado', color: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300', icon: Send },
};

const TIPOS_PREGUNTA = [
  { key: 'seleccion_multiple', label: 'Selección Múltiple', desc: 'Preguntas con opciones A, B, C, D' },
  { key: 'verdadero_falso', label: 'Verdadero / Falso', desc: 'Evalúa si un enunciado es correcto' },
  { key: 'respuesta_corta', label: 'Respuesta Corta', desc: 'Respuesta breve de pocas palabras' },
  { key: 'desarrollo', label: 'Desarrollo / Ensayo', desc: 'Respuesta abierta y elaborada' },
];

const DEFAULT_EXAM_DISTRIBUTION = { seleccion_multiple: 6, respuesta_corta: 2, desarrollo: 2 };
const DEFAULT_QUIZ_DISTRIBUTION = { seleccion_multiple: 4, respuesta_corta: 1 };

const GRADOS_COLOMBIA = [
  { group: 'Preescolar', options: [{ value: 'preescolar', label: 'Preescolar (Transición)' }] },
  { group: 'Primaria', options: [
    { value: 'primaria_1', label: '1° Primaria' },
    { value: 'primaria_2', label: '2° Primaria' },
    { value: 'primaria_3', label: '3° Primaria' },
    { value: 'primaria_4', label: '4° Primaria' },
    { value: 'primaria_5', label: '5° Primaria' },
  ]},
  { group: 'Secundaria', options: [
    { value: 'secundaria_6', label: '6° (Sexto)' },
    { value: 'secundaria_7', label: '7° (Séptimo)' },
    { value: 'secundaria_8', label: '8° (Octavo)' },
    { value: 'secundaria_9', label: '9° (Noveno)' },
    { value: 'secundaria_10', label: '10° (Décimo)' },
    { value: 'secundaria_11', label: '11° (Undécimo)' },
  ]},
];

const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const stripOptionPrefixes = (value) => String(value ?? '')
  .replace(/^(\s*[A-Ha-h]\)\s*)+/, '')
  .trim();

const DIRECT_VISION_TOOL_TYPES = new Set(['crucigrama', 'sopa_letras', 'emparejar', 'unir_columnas']);

const hashString = (value) => {
  let hash = 2166136261;
  const text = String(value ?? '');
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

const seededRandom = (seed) => {
  let state = seed >>> 0;
  return () => {
    state += 0x6D2B79F5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const stableShuffle = (items, seedSource) => {
  const result = [...items];
  const rand = seededRandom(hashString(seedSource));
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  if (result.length > 1 && result.every((item, idx) => item.__sourceIndex === idx)) {
    result.push(result.shift());
  }
  return result;
};

const renderMathForPrint = (value) => {
  if (value == null) return '';

  let text = normalizePlainMathText(value);
  const placeholders = [];
  const hold = (html) => {
    const idx = placeholders.length;
    placeholders.push(html);
    return `@@MATH_${idx}@@`;
  };

  const renderFormula = (formula, displayMode) => {
    const normalizedFormula = normalizeLatexFormula(formula).trim();
    const render = (candidate) => katex.renderToString(candidate, {
      displayMode,
      throwOnError: false,
      strict: 'ignore',
      trust: false,
    });

    try {
      let html = render(normalizedFormula);

      // Retry once after collapsing repeated slash prefixes in malformed TeX.
      if (html.includes('katex-error')) {
        const repaired = normalizeLatexFormula(
          normalizedFormula
            .replace(/\\{2,}\s*(?=[a-zA-Z]+)/g, '\\')
            .replace(/\\{2,}(?=[()\[\]])/g, '\\')
        ).trim();

        if (repaired && repaired !== normalizedFormula) {
          html = render(repaired);
        }
      }

      if (html.includes('katex-error')) {
        throw new Error('KaTeX parse error');
      }

      return html;
    } catch {
      const delim = displayMode ? '$$' : '$';
      return `<span class="math-fallback">${escapeHtml(`${delim}${normalizedFormula}${delim}`)}</span>`;
    }
  };

  const isMixedProseAndMatrix = (formula) => {
    const normalizedFormula = normalizeLatexFormula(formula);
    if (!/\\begin\{[a-zA-Z]+matrix\}/.test(normalizedFormula)) return false;
    if (/\\text\s*\{/.test(normalizedFormula)) return false;
    return /[¿¡]|[áéíóúñ]/i.test(normalizedFormula)
      || /\b(?:si|cual|cuál|resultado|propiedad|siempre|verdadero|falso|matriz)\b/i.test(normalizedFormula);
  };

  text = text.replace(/\$\$([\s\S]+?)\$\$/g, (_, f) => hold(renderFormula(f, true)));
  text = text.replace(/\\\[([\s\S]+?)\\\]/g, (_, f) => hold(renderFormula(f, true)));
  text = text.replace(/(?<!\$)\$(?!\$)([^$\n]+?)\$(?!\$)/g, (_, f) => {
    if (isMixedProseAndMatrix(f)) {
      return normalizeLatexFormula(f);
    }
    return hold(renderFormula(f, false));
  });
  text = text.replace(/\\\((.+?)\\\)/g, (_, f) => {
    if (isMixedProseAndMatrix(f)) {
      return normalizeLatexFormula(f);
    }
    return hold(renderFormula(f, false));
  });

  // Render bare matrix environments even when the model omitted $...$ delimiters.
  text = text.replace(/(?:\\\s*)+begin\{([a-zA-Z]+matrix)\}([\s\S]*?)(?:\\\s*)+end\{\1\}/g, (_, env, body) => {
    return hold(renderFormula(`\\begin{${env}}${body}\\end{${env}}`, false));
  });

  text = escapeHtml(text)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br/>');

  return text.replace(/@@MATH_(\d+)@@/g, (_, idx) => placeholders[Number(idx)] || '');
};

const PRES_SUBTIPO_LABEL = { clase: 'Clase', repaso_examen: 'Repaso', boletin_periodo: 'Boletín' };
const PRES_SUBTIPO_COLOR = {
  clase:           'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  repaso_examen:   'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  boletin_periodo: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
};

function PresentationCard({ pres, onDelete, onOpenEditor, openingId, onGenerateQuiz, creatingQuizId }) {
  const isOpening = openingId === pres.id;
  const isCreatingQuiz = creatingQuizId === pres.id;
  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl overflow-hidden hover:shadow-md transition-shadow flex flex-col">
      {pres.thumbnail_url ? (
        <img src={pres.thumbnail_url} alt={pres.titulo} className="w-full h-32 object-contain p-2" />
      ) : (
        <div className="w-full h-32 bg-gradient-to-br from-profesor-100 to-profesor-200 dark:from-profesor-900/30 dark:to-profesor-800/30 flex items-center justify-center">
          <Presentation className="w-10 h-10 text-profesor-400" />
        </div>
      )}
      <div className="p-4 flex flex-col flex-1">
        <div className="flex items-start justify-between gap-2 mb-1">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 text-sm line-clamp-2 flex-1">{pres.titulo}</h3>
          {pres.subtipo && (
            <span className={`shrink-0 px-2 py-0.5 rounded-full text-xs font-medium ${PRES_SUBTIPO_COLOR[pres.subtipo] || 'bg-gray-100 text-gray-600'}`}>
              {PRES_SUBTIPO_LABEL[pres.subtipo] || pres.subtipo}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 text-xs text-gray-400 mb-3 mt-1">
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {formatDistanceToNow(new Date(pres.created_at), { addSuffix: true, locale: es })}
          </span>
          {pres.num_slides && <span>{pres.num_slides} diapositivas</span>}
        </div>
        <div className="grid grid-cols-2 gap-2 mt-auto">
          {pres.pptx_url && (
            <a href={pres.pptx_url} download className="btn-secondary text-xs flex items-center gap-1 flex-1 justify-center">
              <Download className="w-3 h-3" /> PPTX
            </a>
          )}
          <button
            type="button"
            onClick={() => onGenerateQuiz(pres)}
            disabled={isCreatingQuiz}
            className="btn-secondary text-xs flex items-center gap-1 flex-1 justify-center text-emerald-700 border-emerald-200 hover:bg-emerald-50"
            title="Generar quiz desde esta presentación"
          >
            {isCreatingQuiz ? <Loader2 className="w-3 h-3 animate-spin" /> : <FileQuestion className="w-3 h-3" />}
            Quiz
          </button>
          {pres.edit_url && (
            <button
              onClick={() => onOpenEditor(pres)}
              disabled={isOpening}
              className="btn-secondary text-xs flex items-center gap-1 flex-1 justify-center"
            >
              {isOpening ? <Loader2 className="w-3 h-3 animate-spin" /> : <ExternalLink className="w-3 h-3" />}
              Editar manualmente
            </button>
          )}
          <button onClick={() => onDelete(pres)} className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ProfesorHerramientas() {
  const navigate = useNavigate();
  const [herramientas, setHerramientas] = useState([]);
  const [materias, setMaterias] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [showGenerate, setShowGenerate] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [uploadedFileName, setUploadedFileName] = useState(null);
  const fileRefGen = useRef(null);
  const [showAssign, setShowAssign] = useState(null);
  const [preview, setPreview] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [filter, setFilter] = useState('all');
  const [editModal, setEditModal] = useState(null);
  const [editForm, setEditForm] = useState({ titulo: '', contenido_json: null });
  const [saving, setSaving] = useState(false);
  const [toolFlags, setToolFlags] = useState([]);
  const [genStep, setGenStep] = useState(1);
  const [examPreset, setExamPreset] = useState('rapido');
  const [genForm, setGenForm] = useState({
    tipo: 'examen',
    titulo: '',
    tema: '',
    nivel: 'intermedio',
    grado: '',
    materia_id: '',
    contenido_base: '',
    distribucion: DEFAULT_EXAM_DISTRIBUTION,
    // Sopa de letras
    num_palabras: 8,
    palabras_obligatorias: [],
    nueva_palabra: '',
    // Crucigrama
    num_horizontales: 5,
    num_verticales: 5,
    palabras_obligatorias_cruc: [],
    nueva_palabra_cruc: '',
    // Emparejar
    num_pares: 6,
    // Cuento
    moraleja_tema: '',
    // Vision settings (graded by vision model)
    vision_friendly: true,
    vision_prefijo: 'R',
    vision_hoja_respuestas: true,
    vision_lineas_abiertas: 3,
  });

  const [assignForm, setAssignForm] = useState({
    materia_id: '',
    activo_online: true,
  });

  // ── Tabs ────────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState('evaluaciones');

  // ── Presentations state ─────────────────────────────────────────────────
  const [presentaciones, setPresentaciones] = useState([]);
  const [loadingPres, setLoadingPres] = useState(false);
  const [deletePres, setDeletePres] = useState(null);
  const [openingEditor, setOpeningEditor] = useState(null);
  const [creatingQuizId, setCreatingQuizId] = useState(null);
  const [quizPres, setQuizPres] = useState(null);
  const [quizMateriaId, setQuizMateriaId] = useState('');
  const [filterPres, setFilterPres] = useState('all');
  const [improvingPrompt, setImprovingPrompt] = useState(false);

  const fetchData = async () => {
    try {
      const [hRes, mRes, flagsRes] = await Promise.all([
        api.get('/herramientas/'),
        api.get('/materias/mis-materias'),
        api.get('/herramientas/config/flags').catch(() => ({ data: [] })),
      ]);
      setHerramientas((hRes.data || []).filter((item) => item.tipo !== 'presentacion'));
      setMaterias(mRes.data);
      setToolFlags(Array.isArray(flagsRes.data) ? flagsRes.data : []);
    } catch {
      toast.error('Error cargando datos');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  // ── Presentations functions ──────────────────────────────────────────────
  const fetchPresentaciones = async () => {
    setLoadingPres(true);
    try {
      const res = await api.get('/presentaciones/mias?limit=100');
      setPresentaciones(res.data || []);
    } catch {
      toast.error('Error cargando presentaciones');
    } finally {
      setLoadingPres(false);
    }
  };

  const handleDeletePres = async (id) => {
    try {
      await api.delete(`/presentaciones/${id}`);
      toast.success('Presentación eliminada');
      setDeletePres(null);
      fetchPresentaciones();
    } catch {
      toast.error('Error eliminando');
      setDeletePres(null);
    }
  };

  const openPresEditor = async (pres) => {
    setOpeningEditor(pres.id);
    try {
      await openPresentonEditorWithSession(pres);
    } catch {
      toast.error('No se pudo abrir el editor');
    } finally {
      setOpeningEditor(null);
    }
  };

  const createQuizFromPresentation = async (pres, materiaId = pres.materia_id) => {
    if (!materiaId) {
      setQuizPres(pres);
      setQuizMateriaId('');
      return;
    }
    setCreatingQuizId(pres.id);
    try {
      await api.post(`/presentaciones/${pres.id}/quiz`, {
        materia_id: materiaId,
        num_preguntas: 5,
      });
      toast.success('Quiz guardado en Mis Exámenes');
      setQuizPres(null);
      setQuizMateriaId('');
      navigate(`/profesor/examenes/${materiaId}`);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'No pudimos generar el quiz');
    } finally {
      setCreatingQuizId(null);
    }
  };

  useEffect(() => {
    if (activeTab === 'presentaciones') fetchPresentaciones();
  }, [activeTab]);

  const filteredPres = filterPres === 'all'
    ? presentaciones
    : presentaciones.filter(p => p.subtipo === filterPres);

  const enabledToolTypes = toolFlags
    .filter((f) => f.enabled !== false)
    .map((f) => f.tipo);

  const availableTipos = toolFlags.length > 0
    ? TIPOS.filter((t) => enabledToolTypes.includes(t.value))
    : TIPOS;

  const disabledTools = toolFlags.filter((f) => f.enabled === false);

  useEffect(() => {
    if (toolFlags.length === 0) return;
    if (enabledToolTypes.includes(genForm.tipo)) return;
    if (enabledToolTypes.length === 0) return;
    setGenForm((prev) => ({ ...prev, tipo: enabledToolTypes[0] }));
  }, [toolFlags, genForm.tipo]);

  const selectGeneratorType = (tipo) => {
    setGenStep(1);
    setGenForm((prev) => ({
      ...prev,
      tipo,
      distribucion: tipo === 'examen' ? DEFAULT_EXAM_DISTRIBUTION : prev.distribucion,
      num_palabras: tipo === 'sopa_letras' ? 8 : prev.num_palabras,
      num_horizontales: tipo === 'crucigrama' ? 5 : prev.num_horizontales,
      num_verticales: tipo === 'crucigrama' ? 5 : prev.num_verticales,
    }));
    if (tipo === 'examen') setExamPreset('rapido');
  };

  const applyExamPreset = (preset) => {
    setExamPreset(preset);
    setGenForm((prev) => ({
      ...prev,
      distribucion: preset === 'quiz' ? DEFAULT_QUIZ_DISTRIBUTION : DEFAULT_EXAM_DISTRIBUTION,
    }));
  };

  const handleFileExtractGen = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setExtracting(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await api.post('/generate/extract-content', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setGenForm(p => ({ ...p, contenido_base: res.data.text }));
      setUploadedFileName(file.name);
      if (res.data.truncated) toast('Texto extraído (truncado a 6000 caracteres)', { icon: 'ℹ️' });
      else toast.success(`Texto extraído de "${file.name}"`);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error extrayendo texto del archivo');
    } finally {
      setExtracting(false);
      e.target.value = '';
    }
  };

  const handleImprovePrompt = async () => {
    if (!genForm.tema.trim()) {
      toast.error('Escribe algo primero para que la IA lo mejore');
      return;
    }
    setImprovingPrompt(true);
    try {
      const res = await api.post('/generate/improve-prompt', { text: genForm.tema, tipo: genForm.tipo });
      setGenForm(p => ({ ...p, tema: res.data.improved_text }));
      toast.success('¡Texto mejorado con IA!');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error al mejorar el texto');
    } finally {
      setImprovingPrompt(false);
    }
  };

  const handleGenerate = async (e) => {
    e.preventDefault();

    if (toolFlags.length > 0 && !enabledToolTypes.includes(genForm.tipo)) {
      toast.error('Este tipo de herramienta está deshabilitado por administración');
      return;
    }
    if (toolFlags.length > 0 && enabledToolTypes.length === 0) {
      toast.error('No hay herramientas habilitadas en este momento');
      return;
    }

    setGenerating(true);
    try {
      const directVisionTool = DIRECT_VISION_TOOL_TYPES.has(genForm.tipo);
      const payload = {
        tipo: genForm.tipo,
        titulo: genForm.titulo,
        tema: genForm.tema,
        nivel: genForm.nivel,
        grado: genForm.grado || '',
        materia_id: genForm.materia_id || null,
        contenido_base: genForm.contenido_base || '',
        vision_friendly: !!genForm.vision_friendly,
        vision_prefijo: (genForm.vision_prefijo || 'R').trim().toUpperCase().slice(0, 4),
        vision_hoja_respuestas: directVisionTool ? false : !!genForm.vision_hoja_respuestas,
        vision_lineas_abiertas: directVisionTool ? 3 : (parseInt(genForm.vision_lineas_abiertas, 10) || 3),
      };

      if (genForm.tipo === 'examen') {
        payload.distribucion = genForm.distribucion;
      } else if (genForm.tipo === 'sopa_letras') {
        payload.num_palabras = genForm.num_palabras;
        payload.palabras_obligatorias = genForm.palabras_obligatorias.length > 0
          ? genForm.palabras_obligatorias : null;
      } else if (genForm.tipo === 'crucigrama') {
        payload.num_horizontales = genForm.num_horizontales;
        payload.num_verticales = genForm.num_verticales;
        payload.palabras_obligatorias = genForm.palabras_obligatorias_cruc.length > 0
          ? genForm.palabras_obligatorias_cruc : null;
      } else if (genForm.tipo === 'emparejar') {
        payload.num_pares = genForm.num_pares;
      } else if (genForm.tipo === 'cuento') {
        payload.moraleja_tema = genForm.moraleja_tema || '';
      }

      await api.post('/herramientas/generate', payload);
      toast.success('¡Herramienta generada con IA!');
      setShowGenerate(false);
      setGenForm({
        tipo: 'examen', titulo: '', tema: '', nivel: 'intermedio', grado: '', materia_id: '', contenido_base: '',
        distribucion: DEFAULT_EXAM_DISTRIBUTION, num_palabras: 8, palabras_obligatorias: [], nueva_palabra: '',
        num_horizontales: 5, num_verticales: 5, palabras_obligatorias_cruc: [], nueva_palabra_cruc: '',
        num_pares: 6, moraleja_tema: '',
        vision_friendly: true, vision_prefijo: 'R', vision_hoja_respuestas: true, vision_lineas_abiertas: 3,
      });
      setUploadedFileName(null);
      setGenStep(1);
      setExamPreset('rapido');
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error generando');
    } finally {
      setGenerating(false);
    }
  };

  const handleAssign = async (herramientaId) => {
    if (!assignForm.materia_id) {
      toast.error('Selecciona una materia');
      return;
    }

    if (toolFlags.length > 0) {
      const herramienta = herramientas.find((item) => item.id === herramientaId);
      const flag = herramienta ? toolFlags.find((f) => f.tipo === herramienta.tipo) : null;
      if (flag && flag.enabled === false) {
        toast.error('Esta herramienta fue deshabilitada por administración');
        return;
      }
    }

    try {
      await api.post(`/herramientas/${herramientaId}/assign`, {
        materia_id: assignForm.materia_id,
        activo_online: assignForm.activo_online,
      });
      toast.success('Herramienta asignada exitosamente');
      setAssignForm(p => ({ ...p, materia_id: '' }));
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error asignando');
    }
  };

  const handleDelete = async (id) => {
    try {
      await api.delete(`/herramientas/${id}`);
      toast.success('Herramienta eliminada');
      setDeleteConfirm(null);
      fetchData();
    } catch {
      toast.error('Error eliminando');
      setDeleteConfirm(null);
    }
  };

  const openEdit = (h) => {
    setEditForm({ titulo: h.titulo, contenido_json: JSON.parse(JSON.stringify(h.contenido_json || {})) });
    setEditModal(h);
  };

  const handleSaveEdit = async () => {
    if (!editModal) return;
    setSaving(true);
    try {
      await api.put(`/herramientas/${editModal.id}`, {
        titulo: editForm.titulo,
        contenido_json: editForm.contenido_json,
      });
      toast.success('Herramienta actualizada');
      setEditModal(null);
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error guardando');
    } finally {
      setSaving(false);
    }
  };

  /* ─── Unified Print Function (iframe, no popup) ─── */
  const handlePrintHerramienta = (h) => {
    const c = h.contenido_json || {};
    const visionCfg = h.config_json?.vision || h.config_json?.ocr || c.metadata?.vision || c.metadata?.ocr || {};
    const directVisionTool = DIRECT_VISION_TOOL_TYPES.has(h.tipo);
    const ocrEnabled = !directVisionTool && visionCfg.enabled !== false;
    const ocr = visionCfg;
    const ocrPrefix = (ocr.prefijo || 'R').toString().trim().toUpperCase() || 'R';
    const ocrAnswerSheet = ocr.hoja_respuestas !== false;
    const ocrLongLines = Number(ocr.lineas_abiertas || 3);
    let body = '';
    let extraCss = '';

    if (h.tipo === 'examen' && c.preguntas) {
      const preguntas = Array.isArray(c.preguntas) ? c.preguntas : [];
      const answerRows = [];

      body = preguntas.map((p, idx) => {
        const numero = p.numero || idx + 1;
        const texto = p.enunciado || p.pregunta || p.texto || `Pregunta ${numero}`;
        const tipo = p.tipo || '';
        const options = Array.isArray(p.opciones) ? p.opciones : [];

        if (ocrEnabled) {
          const tipoHint = (tipo === 'seleccion_multiple' || tipo === 'verdadero_falso')
            ? 'A/B/C/D o V/F'
            : 'Texto';
          answerRows.push(`<tr><td>${numero}</td><td>${tipoHint}</td><td>${ocrPrefix}${numero}: ____________________________</td></tr>`);
        }

        let responseFields = '';
        if (ocrEnabled) {
          const lineCount = tipo === 'desarrollo'
            ? Math.max(2, ocrLongLines)
            : (tipo === 'respuesta_corta' ? 2 : 1);
          responseFields = `<div class="resp-wrap">${Array.from({ length: lineCount }).map((_, lineIdx) => {
            const label = lineIdx === 0 ? `${ocrPrefix}${numero}:` : '&nbsp;';
            return `<div class="resp-line"><span class="resp-label">${label}</span><span class="resp-fill"></span></div>`;
          }).join('')}</div>`;
        }

        return `<div class="q"><p class="qn"><span class="q-no">${numero}.</span> ${renderMathForPrint(texto)}</p>` +
          (options.length ? `<div class="opts">${options.map((o, optIdx) => {
            const letter = String.fromCharCode(65 + optIdx);
            const optionText = stripOptionPrefixes(o);
            return `<p class="opt"><span class="opt-l">${letter})</span> ${renderMathForPrint(optionText)}</p>`;
          }).join('')}</div>` : '') +
          responseFields +
          `</div>`;
      }).join('');

      if (ocrEnabled && ocrAnswerSheet && answerRows.length) {
        body += `<div class="ocr-sheet"><h3>Hoja de Respuestas OCR</h3><p>Escribe una sola respuesta por renglón usando el prefijo ${ocrPrefix}.</p>
          <table class="ocr-table"><thead><tr><th>#</th><th>Formato</th><th>Respuesta</th></tr></thead><tbody>${answerRows.join('')}</tbody></table></div>`;
      }
    } else if (h.tipo === 'crucigrama' && c.crucigrama) {
      const grid = c.crucigrama.grid || [];
      const pH = c.crucigrama.pistas_horizontal || [];
      const pV = c.crucigrama.pistas_vertical || [];
      const nm = {};
      for (const p of pH) { if (typeof p === 'object' && p.numero != null) nm[`${p.fila},${p.columna}`] = p.numero; }
      for (const p of pV) { if (typeof p === 'object' && p.numero != null && !nm[`${p.fila},${p.columna}`]) nm[`${p.fila},${p.columna}`] = p.numero; }
      let mR = Infinity, xR = -1, mC = Infinity, xC = -1;
      for (let r = 0; r < grid.length; r++) for (let k = 0; k < (grid[r]?.length || 0); k++) {
        if (grid[r][k] && grid[r][k].trim()) { mR = Math.min(mR, r); xR = Math.max(xR, r); mC = Math.min(mC, k); xC = Math.max(xC, k); }
      }
      if (xR >= mR) {
        const trs = [];
        for (let r = mR; r <= xR; r++) {
          const tds = [];
          for (let k = mC; k <= xC; k++) {
            const l = grid[r]?.[k]?.trim() || '';
            if (!l) tds.push('<td class="blk"></td>');
            else { const n = nm[`${r},${k}`]; tds.push(`<td class="cell">${n ? `<span class="num">${n}</span>` : ''}</td>`); }
          }
          trs.push('<tr>' + tds.join('') + '</tr>');
        }
        const colCount = xC - mC + 1;
        const cellSize = Math.max(23, Math.min(38, Math.floor(620 / Math.max(colCount, 1))));
        body = `<div class="cruz-wrap"><table class="cruz">${trs.join('')}</table></div>
        <div class="clue-grid">
            ${pH.length ? `<div class="clue-card"><h3>\u2192 Horizontales</h3>${pH.map((p) => {
              const num = typeof p === 'object' ? (p.numero ?? '') : '';
              const clue = typeof p === 'object' ? p.pista : p;
              return `<p><span class="n">${escapeHtml(String(num))}.</span> ${renderMathForPrint(clue)}</p>`;
            }).join('')}</div>` : ''}
            ${pV.length ? `<div class="clue-card"><h3>\u2193 Verticales</h3>${pV.map((p) => {
              const num = typeof p === 'object' ? (p.numero ?? '') : '';
              const clue = typeof p === 'object' ? p.pista : p;
              return `<p><span class="n">${escapeHtml(String(num))}.</span> ${renderMathForPrint(clue)}</p>`;
            }).join('')}</div>` : ''}
        </div>`;
        extraCss = `.cruz-wrap{display:flex;justify-content:center;background:#e7e7ea;border:1px solid #8bd6df;border-radius:10px;padding:12px;margin:0 auto 16px;max-width:100%;overflow:hidden}
          .cruz{border-collapse:separate;border-spacing:0;margin:0 auto}
          .cruz td{width:${cellSize}px;height:${cellSize}px;text-align:center;vertical-align:middle;position:relative;font-size:14px;padding:0}
          .cruz .blk{background:transparent;border:1px solid transparent}
          .cruz .cell{background:#e7e7e7;border:1px solid #3f3f46;box-shadow:inset 0 0 0 3px #88d4db}
          .cruz .num{position:absolute;top:2px;left:3px;font-size:9px;font-weight:700;color:#111827;line-height:1}
          .clue-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px;margin-top:14px}
          .clue-card{border:1px solid #bae6fd;border-radius:8px;padding:10px;background:#fff}
          .clue-card h3{font-size:13px;margin-bottom:8px;color:#0f766e;border-bottom:2px solid #99e2e7;padding-bottom:4px}
          .clue-card p{font-size:11px;margin:5px 0;line-height:1.45}
          .clue-card .n{font-weight:700;color:#0f766e;margin-right:2px}
          @media print{.clue-grid{gap:12px}.clue-card{break-inside:avoid}}`;
      }
    } else if (h.tipo === 'sopa_letras' && c.sopa_letras) {
      const grid = c.sopa_letras.grid || [];
      const palabras = c.sopa_letras.palabras || [];
      const colCount = grid[0]?.length || 1;
      const cellSize = Math.max(18, Math.min(28, Math.floor(620 / Math.max(colCount, 1))));
      body = `<table class="sopag">${grid.map(row =>
        '<tr>' + row.map(cell => `<td>${escapeHtml(String(cell || '').toUpperCase())}</td>`).join('') + '</tr>'
      ).join('')}</table>
      <div class="words"><h3>Palabras a encontrar</h3><div class="word-list">${palabras.map(w =>
        `<span class="word">${escapeHtml(String(typeof w === 'object' ? w.palabra : w))}</span>`
      ).join('')}</div></div>`;
      extraCss = `.sopag{border-collapse:collapse;margin:0 auto 16px}
        .sopag td{width:${cellSize}px;height:${cellSize}px;text-align:center;font-size:12px;font-weight:700;border:1px solid #C7D2FE;color:#1E1B4B;background:#F8FAFC}
        .words{text-align:center;margin-top:12px}
        .words h3{font-size:13px;color:#4338CA;margin-bottom:8px}
        .word-list{display:flex;flex-wrap:wrap;justify-content:center;gap:8px}
        .word{color:#4338CA;padding:2px 8px;font-size:10px;font-weight:700;text-transform:uppercase}`;
    } else if (h.tipo === 'emparejar' && c.emparejar) {
      const paresRaw = c.emparejar.pares || c.emparejar || [];
      const pares = paresRaw.map((p, i) => ({ ...p, id: p.id ?? i + 1, __sourceIndex: i }));
      const derecha = stableShuffle(
        pares.map((p, i) => ({
          id: p.id,
          derecha: p.derecha || p.definicion || p.columna_b || '',
          __sourceIndex: i,
        })),
        `${h.id || h.titulo || ''}:${pares.map((p) => p.derecha || p.definicion || p.columna_b || '').join('|')}`
      );
      const instrucciones = c.emparejar.instrucciones || 'Une cada elemento de la izquierda con su correspondiente de la derecha.';
      body = `<div class="match-instructions">${renderMathForPrint(instrucciones)}</div>
        <div class="match-board">
          <div class="match-col">
            <h3>Columna A</h3>
            ${pares.map((p, i) => `<div class="match-card"><span class="badge">${i + 1}</span><span>${renderMathForPrint(p.izquierda || p.concepto || p.columna_a || '')}</span></div>`).join('')}
          </div>
          <div class="match-gap" aria-hidden="true"></div>
          <div class="match-col">
            <h3>Columna B</h3>
            ${derecha.map((p, i) => `<div class="match-card"><span class="badge">${String.fromCharCode(65 + i)}</span><span>${renderMathForPrint(p.derecha)}</span></div>`).join('')}
          </div>
        </div>`;
      extraCss = `.match-instructions{font-size:12px;line-height:1.5;color:#92400E;background:#FFFBEB;border:1px solid #FDE68A;border-radius:8px;padding:10px;margin-bottom:14px}
        .match-board{display:grid;grid-template-columns:minmax(0,1fr) 74px minmax(0,1fr);gap:0;align-items:start;position:relative}
        .match-col{display:flex;flex-direction:column;gap:8px}
        .match-col h3{font-size:12px;text-transform:uppercase;letter-spacing:.02em;color:#6B7280;margin:0 0 2px 4px}
        .match-gap{min-height:100%;border-left:1px dashed #CBD5E1;border-right:1px dashed #CBD5E1;margin:22px 16px 0}
        .match-card{min-height:42px;display:flex;align-items:center;gap:8px;border:1.5px solid #D1D5DB;border-radius:8px;background:#fff;padding:8px 10px;font-size:11px;line-height:1.35;break-inside:avoid}
        .match-card .badge{width:24px;height:24px;border-radius:999px;display:inline-flex;align-items:center;justify-content:center;flex:none;background:#D1D5DB;color:#4B5563;font-size:11px;font-weight:700}
        @media print{.match-card{min-height:38px}.match-board{grid-template-columns:minmax(0,1fr) 64px minmax(0,1fr)}}`;
    } else if (h.tipo === 'cuento' && c.cuento) {
      body = `<div class="story">${c.cuento.texto ? `<div class="story-text">${renderMathForPrint(c.cuento.texto)}</div>` : ''}
        ${c.cuento.moraleja ? `<div class="moraleja"><strong>Moraleja:</strong> ${renderMathForPrint(c.cuento.moraleja)}</div>` : ''}
        ${c.cuento.imagen_url ? `<img src="${c.cuento.imagen_url}" class="story-img" />` : ''}</div>`;
    } else if (h.tipo === 'para_colorear' && c.para_colorear) {
      body = `<div class="coloring">${c.para_colorear.imagen_url ? `<img src="${c.para_colorear.imagen_url}" class="color-img" />` : ''}
        ${c.para_colorear.descripcion ? `<p class="desc">${renderMathForPrint(c.para_colorear.descripcion)}</p>` : ''}</div>`;
    }

    const html = `<!DOCTYPE html><html><head><title>${escapeHtml(h.titulo)}</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css">
<style>
  @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700&display=swap');
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Poppins',sans-serif;max-width:800px;margin:20px auto;padding:16px;color:#333}
  h1{text-align:center;font-size:20px;color:#4338CA;margin-bottom:4px;font-weight:700}
  .sub{text-align:center;font-size:11px;color:#888;margin-bottom:20px}
  .q{margin:10px 0;padding:10px 12px;border:1px solid #E5E7EB;border-radius:8px}
  .qn{font-size:13px;font-weight:600;color:#1E1B4B}
  .q-no{margin-right:4px}
  .opts{margin:6px 0 0 16px}
  .opt{font-size:12px;color:#555;margin:2px 0}
  .opt-l{font-weight:700;color:#4338CA;margin-right:4px}
  .katex{font-size:1.02em}
  .katex-display{margin:.45em 0}
  .math-fallback{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;color:#DC2626}
  .resp-wrap{margin-top:8px;display:flex;flex-direction:column;gap:6px}
  .resp-line{display:flex;align-items:center;gap:8px}
  .resp-label{font-size:11px;color:#312E81;font-weight:700;min-width:42px}
  .resp-fill{display:inline-block;flex:1;height:18px;border-bottom:1.4px solid #94A3B8}
  .ocr-sheet{margin-top:16px;padding:12px;border:1px solid #C7D2FE;border-radius:8px;background:#EEF2FF}
  .ocr-sheet h3{font-size:13px;color:#312E81;margin-bottom:4px}
  .ocr-sheet p{font-size:11px;color:#4F46E5;margin-bottom:8px}
  .ocr-table{width:100%;border-collapse:collapse;background:white}
  .ocr-table th,.ocr-table td{font-size:11px;padding:6px;border:1px solid #C7D2FE;text-align:left}
  .ocr-table th{background:#E0E7FF;color:#312E81}
  .ocr-mini{margin-top:12px;padding:10px;border:1px dashed #A5B4FC;border-radius:8px;background:#EEF2FF}
  .ocr-mini h3{font-size:12px;color:#312E81;margin-bottom:4px}
  .ocr-mini p{font-size:10px;color:#4F46E5;margin-bottom:6px}
  .sopag{border-collapse:collapse;margin:0 auto 16px}
  .sopag td{width:28px;height:28px;text-align:center;font-size:13px;font-weight:600;border:1px solid #C7D2FE;color:#1E1B4B}
  .words{text-align:center;margin-top:12px}
  .words h3{font-size:13px;color:#4338CA;margin-bottom:8px}
  .word-list{display:flex;flex-wrap:wrap;justify-content:center;gap:8px}
  .word{background:#EEF2FF;color:#4338CA;padding:4px 10px;border-radius:20px;font-size:11px;font-weight:600}
  .match{width:100%;border-collapse:collapse;font-size:12px}
  .match th{background:#EEF2FF;color:#4338CA;padding:8px;text-align:left;font-weight:600}
  .match td{padding:6px 8px;border-bottom:1px solid #E5E7EB}
  .story-text{font-size:13px;line-height:1.7;color:#333;margin-bottom:14px}
  .moraleja{background:#FEF3C7;padding:10px 14px;border-radius:10px;font-size:12px;color:#92400E;margin:12px 0}
  .story-img,.color-img{max-width:100%;border-radius:10px;margin:12px auto;display:block}
  .desc{text-align:center;font-size:11px;color:#666;margin-top:8px}
  ${extraCss}
  @media print{body{margin:8px;padding:8px}}
</style></head><body>
  <h1>${renderMathForPrint(h.titulo)}</h1>
  <p class="sub">${escapeHtml((h.tipo || '').replace('_', ' '))} \u00b7 ${escapeHtml(new Date(h.created_at).toLocaleDateString('es-CO'))}</p>
  ${body}
</body></html>`;

    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:900px;height:700px';
    document.body.appendChild(iframe);
    const iDoc = iframe.contentDocument || iframe.contentWindow.document;
    iDoc.open();
    iDoc.write(html);
    iDoc.close();
    setTimeout(() => {
      try { iframe.contentWindow.focus(); iframe.contentWindow.print(); } catch (e) { /* silent */ }
      setTimeout(() => { try { document.body.removeChild(iframe); } catch {} }, 3000);
    }, 600);
  };

  /* ─── Unified Download Function ─── */
  const handleDownloadHerramienta = (h) => {
    const c = h.contenido_json || {};
    // For image-based tools, open image directly
    if (h.tipo === 'para_colorear' && c.para_colorear?.imagen_url) {
      window.open(c.para_colorear.imagen_url, '_blank');
      return;
    }
    if (h.tipo === 'cuento' && c.cuento?.imagen_url_colorear) {
      window.open(c.cuento.imagen_url_colorear, '_blank');
      return;
    }
    // For others, trigger print (which allows "Save as PDF")
    handlePrintHerramienta(h);
  };

  const filtered = filter === 'all'
    ? herramientas
    : herramientas.filter(h => h.tipo === filter);

  if (loading) return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><div className="skeleton h-7 w-40 rounded-lg" /><div className="skeleton h-4 w-80 rounded mt-2" /></div>
        <div className="skeleton h-9 w-36 rounded-lg" />
      </div>
      <div className="skeleton h-14 w-full rounded-xl" />
      <div className="skeleton h-20 w-full rounded-2xl" />
      <div className="flex gap-2">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton h-8 w-20 rounded-lg" />)}</div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="skeleton w-10 h-10 rounded-xl" />
                <div className="space-y-1.5"><div className="skeleton h-4 w-28 rounded" /><div className="skeleton h-3 w-16 rounded" /></div>
              </div>
              <div className="skeleton h-5 w-16 rounded-full" />
            </div>
            <div className="skeleton h-3 w-full rounded" />
            <div className="skeleton h-3 w-24 rounded" />
            <div className="flex gap-2 flex-wrap">
              <div className="skeleton h-7 w-16 rounded-lg" />
              <div className="skeleton h-7 w-20 rounded-lg" />
              <div className="skeleton h-7 w-14 rounded-lg" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 rounded-2xl border border-profesor-100 dark:border-profesor-900/40 bg-gradient-to-br from-profesor-50 via-white to-cyan-50 dark:from-profesor-950/40 dark:via-gray-900 dark:to-cyan-950/20 p-5 shadow-card">
        <div>
          <h1 className="text-3xl font-bold text-profesor-gradient">Herramientas</h1>
          <p className="text-base text-gray-500 dark:text-gray-400 mt-1.5 leading-relaxed">
            {activeTab === 'evaluaciones'
              ? 'Genera exámenes, crucigramas, sopas de letras y actividades con IA. Asígnalos a tus materias cuando estén listos.'
              : 'Crea presentaciones para tus clases en 3 pasos. La IA genera las diapositivas desde tu tema y contenido.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-3 w-full sm:w-auto">
          <PageGuide
            storageKey="guide-profesor-herramientas"
            steps={[
              { title: 'Crea una actividad', body: 'Toca aqui para crear un examen, crucigrama, sopa de letras, emparejar, cuento o pagina para colorear con ayuda de la IA.', selector: '[data-guide="generar-herramienta"]' },
              { title: 'Dos secciones distintas', body: 'Estas pestanas separan tus actividades evaluables de tus presentaciones. Recuerda: una presentacion no se asigna como examen.', selector: '[data-guide="tabs-herramientas"]' },
              { title: 'Encuentra lo que buscas', body: 'Si ya tienes muchos recursos, filtra por tipo para ver solo crucigramas, sopas, cuentos u otra clase.', selector: '[data-guide="filtros-herramientas"]' },
              { title: 'Cada tarjeta hace mucho', body: 'En cada recurso puedes ver, editar, imprimir, descargar, asignarlo a una materia o eliminarlo.', selector: '[data-guide="lista-herramientas"]' },
            ]}
          />
        {activeTab === 'evaluaciones' ? (
          <button data-guide="generar-herramienta" onClick={() => setShowGenerate(true)}
            disabled={toolFlags.length > 0 && availableTipos.length === 0}
            className={`btn-primary flex items-center gap-2.5 shrink-0 text-base px-5 py-3 ${(toolFlags.length > 0 && availableTipos.length === 0) ? 'opacity-60 cursor-not-allowed' : ''}`}>
            <Wand2 className="w-5 h-5" /> Generar con IA
          </button>
        ) : (
          <Link data-guide="crear-presentacion" to="/profesor/presentacion" className="btn-primary flex items-center gap-2.5 shrink-0 text-base px-5 py-3">
            <Plus className="w-5 h-5" /> Nueva presentación
          </Link>
        )}
        </div>
      </div>

      {/* Tabs */}
      <div data-guide="tabs-herramientas" className="flex gap-1 p-1.5 bg-gray-100 dark:bg-gray-800 rounded-2xl w-fit">
        <button
          onClick={() => setActiveTab('evaluaciones')}
          className={`flex items-center gap-2.5 px-5 py-2.5 rounded-xl text-base font-semibold transition-all ${
            activeTab === 'evaluaciones'
              ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm'
              : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
          }`}
        >
          <Wrench className="w-5 h-5" />
          Evaluaciones y Actividades
          {herramientas.length > 0 && (
            <span className={`px-2 py-0.5 text-sm rounded-full font-bold ${
              activeTab === 'evaluaciones'
                ? 'bg-profesor-100 text-profesor-700 dark:bg-profesor-900/50 dark:text-profesor-300'
                : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
            }`}>{herramientas.length}</span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('presentaciones')}
          className={`flex items-center gap-2.5 px-5 py-2.5 rounded-xl text-base font-semibold transition-all ${
            activeTab === 'presentaciones'
              ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm'
              : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
          }`}
        >
          <Presentation className="w-5 h-5" />
          Presentaciones
          {presentaciones.length > 0 && (
            <span className={`px-2 py-0.5 text-sm rounded-full font-bold ${
              activeTab === 'presentaciones'
                ? 'bg-profesor-100 text-profesor-700 dark:bg-profesor-900/50 dark:text-profesor-300'
                : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
            }`}>{presentaciones.length}</span>
          )}
        </button>
      </div>

      {/* ═══ EVALUACIONES TAB ═══════════════════════════════════════════════ */}
      {activeTab === 'evaluaciones' && (<>

      {/* Crear evaluaciones con IA */}
      <div>
        <p className="text-sm font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-4">Crear evaluaciones con IA</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Link
            to="/profesor/crear-examen-chat"
            className="group flex gap-4 p-6 bg-gradient-to-br from-indigo-50 to-white dark:from-indigo-950/60 dark:to-gray-800/80 border border-indigo-100 dark:border-indigo-800/50 rounded-2xl hover:border-indigo-300 dark:hover:border-indigo-600 hover:shadow-md dark:hover:shadow-indigo-900/20 transition-all"
          >
            <div className="w-14 h-14 rounded-2xl bg-indigo-600 dark:bg-indigo-500 flex items-center justify-center shrink-0 group-hover:bg-indigo-700 dark:group-hover:bg-indigo-400 transition-colors shadow-sm shadow-indigo-200 dark:shadow-indigo-900/40">
              <Sparkles className="w-7 h-7 text-white" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-1.5">
                <p className="text-base font-bold text-gray-900 dark:text-gray-100 group-hover:text-indigo-700 dark:group-hover:text-indigo-300 transition-colors">Diseñar con chat IA</p>
                <ArrowRight className="w-4 h-4 text-gray-400 group-hover:text-indigo-500 group-hover:translate-x-0.5 transition-all" />
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
                Conversa con la IA paso a paso. Sube imágenes o PDFs de tu libro como contexto para crear el examen ideal.
              </p>
            </div>
          </Link>

          <Link
            to="/profesor/evaluacion-rapida"
            className="group flex gap-4 p-6 bg-gradient-to-br from-amber-50 to-white dark:from-amber-950/60 dark:to-gray-800/80 border border-amber-100 dark:border-amber-800/50 rounded-2xl hover:border-amber-300 dark:hover:border-amber-600 hover:shadow-md dark:hover:shadow-amber-900/20 transition-all"
          >
            <div className="w-14 h-14 rounded-2xl bg-amber-500 dark:bg-amber-600 flex items-center justify-center shrink-0 group-hover:bg-amber-600 dark:group-hover:bg-amber-500 transition-colors shadow-sm shadow-amber-200 dark:shadow-amber-900/40">
              <Camera className="w-7 h-7 text-white" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-1.5">
                <p className="text-base font-bold text-gray-900 dark:text-gray-100 group-hover:text-amber-700 dark:group-hover:text-amber-300 transition-colors">Digitalización rápida</p>
                <ArrowRight className="w-4 h-4 text-gray-400 group-hover:text-amber-500 group-hover:translate-x-0.5 transition-all" />
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
                Fotografía tu examen escrito (1–3 fotos). La IA extrae las preguntas al instante y las deja listas para revisar.
              </p>
            </div>
          </Link>
        </div>
      </div>

      {disabledTools.length > 0 && (
        <div className="flex items-start gap-3 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50 rounded-xl">
          <AlertCircle className="w-5 h-5 text-amber-500 dark:text-amber-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm text-amber-800 dark:text-amber-200 font-medium">Herramientas deshabilitadas por administración</p>
            <p className="text-xs text-amber-700 dark:text-amber-300 mt-0.5">
              {disabledTools.map((t) => t.label).join(', ')}
            </p>
          </div>
        </div>
      )}

      {/* Filter tabs */}
      {herramientas.length > 0 && (
        <div data-guide="filtros-herramientas" className="flex gap-2 overflow-x-auto pb-1">
          <button onClick={() => setFilter('all')}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors shrink-0 ${
              filter === 'all'
                ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/40 dark:text-primary-300'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
            }`}>
            Todas ({herramientas.length})
          </button>
          {TIPOS.map(t => {
            const count = herramientas.filter(h => h.tipo === t.value).length;
            if (count === 0) return null;
            const Icon = t.icon;
            return (
              <button key={t.value} onClick={() => setFilter(t.value)}
                className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors flex items-center gap-1.5 shrink-0 ${
                  filter === t.value
                    ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/40 dark:text-primary-300'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                }`}>
                <Icon className="w-4 h-4" />
                {t.label} ({count})
              </button>
            );
          })}
        </div>
      )}

      {/* Tools list */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={Wrench}
          title={filter !== 'all' ? 'Sin herramientas de este tipo' : 'No has generado herramientas aún'}
          description="Genera exámenes, crucigramas, sopas de letras, actividades de emparejar, cuentos y páginas para colorear con IA."
          action={
            <button
              onClick={() => setShowGenerate(true)}
              disabled={toolFlags.length > 0 && availableTipos.length === 0}
              className={`btn-primary flex items-center gap-2 ${(toolFlags.length > 0 && availableTipos.length === 0) ? 'opacity-60 cursor-not-allowed' : ''}`}
            >
              <Wand2 className="w-4 h-4" /> Generar primera herramienta
            </button>
          }
        />
      ) : (
        <div data-guide="lista-herramientas" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map(h => {
            const tipo = TIPOS.find(t => t.value === h.tipo) || TIPOS[0];
            const estado = ESTADO_BADGES[h.estado] || ESTADO_BADGES.borrador;
            const Icon = tipo.icon;
            const EstadoIcon = estado.icon;
            const disabledByAdmin = toolFlags.some((f) => f.tipo === h.tipo && f.enabled === false);

            return (
              <div key={h.id} className={`bg-white dark:bg-gray-800/60 rounded-2xl border-2 ${TIPO_COLORS[tipo.color] ? 'border-' + tipo.color + '-100 dark:border-' + tipo.color + '-900/30' : 'border-gray-200 dark:border-gray-700/60'} p-5 hover:shadow-lg dark:hover:shadow-gray-900/40 transition-all`}>
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className={`w-12 h-12 rounded-2xl ${TIPO_COLORS[tipo.color]?.bg || 'bg-gray-50 dark:bg-gray-700'} flex items-center justify-center shrink-0`}>
                      <Icon className={`w-6 h-6 ${TIPO_COLORS[tipo.color]?.text || 'text-gray-600 dark:text-gray-300'}`} />
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-bold text-gray-900 dark:text-gray-100 truncate text-base leading-tight">{h.titulo}</h3>
                      <p className="text-sm text-gray-400 dark:text-gray-500 capitalize font-medium mt-0.5">{tipo.label}</p>
                    </div>
                  </div>
                  <span className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-sm font-semibold shrink-0 ${estado.color}`}>
                    <EstadoIcon className="w-3.5 h-3.5" />
                    {estado.label}
                  </span>
                </div>

                {h.tema && (
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-3 line-clamp-2 leading-relaxed">📚 {h.tema}</p>
                )}

                {disabledByAdmin && (
                  <div className="mb-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400">
                    <AlertCircle className="w-4 h-4" /> Deshabilitado por administración
                  </div>
                )}

                <div className="flex items-center gap-2 text-sm text-gray-400 dark:text-gray-500 mb-4 font-medium">
                  <Clock className="w-4 h-4" />
                  {new Date(h.created_at).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })}
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-2">
                  <button onClick={() => { setShowAssign(h.id); setAssignForm({ materia_id: '', activo_online: true }); }}
                    disabled={disabledByAdmin}
                    className={`flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl text-sm font-bold transition-all active:scale-95 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/40 ${disabledByAdmin ? 'opacity-60 cursor-not-allowed' : ''}`}>
                    <Send className="w-5 h-5" />
                    Asignar
                  </button>
                  <button onClick={() => setPreview(preview === h.id ? null : h.id)}
                    className="flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl text-sm font-bold transition-all active:scale-95 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/40">
                    {preview === h.id ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    {preview === h.id ? 'Ocultar' : 'Ver'}
                  </button>
                  <button onClick={() => openEdit(h)}
                    className="flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl text-sm font-bold transition-all active:scale-95 bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-400 hover:bg-orange-100 dark:hover:bg-orange-900/40">
                    <Edit3 className="w-5 h-5" />
                    Editar
                  </button>
                  <button onClick={() => handlePrintHerramienta(h)}
                    className="flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl text-sm font-bold transition-all active:scale-95 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700">
                    <Printer className="w-5 h-5" />
                    Imprimir
                  </button>
                  {h.contenido_json && (
                    <button onClick={() => handleDownloadHerramienta(h)}
                      className="flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl text-sm font-bold transition-all active:scale-95 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/40">
                      <Download className="w-5 h-5" />
                      Descargar
                    </button>
                  )}
                  {h.estado !== 'asignado' && (
                    <button onClick={() => setDeleteConfirm(h.id)}
                      className="flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl text-sm font-bold transition-all active:scale-95 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40">
                      <Trash2 className="w-5 h-5" />
                      Eliminar
                    </button>
                  )}
                </div>

                {/* Preview panel */}
                {preview === h.id && h.contenido_json && (
                  <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700">
                    {h.tipo === 'crucigrama' && h.contenido_json.crucigrama && (
                      <div className="overflow-x-auto">
                        <Crucigrama crucigrama={h.contenido_json.crucigrama} />
                      </div>
                    )}
                    {h.tipo === 'sopa_letras' && h.contenido_json.sopa_letras && (
                      <div className="overflow-x-auto">
                        <SopaLetras grid={h.contenido_json.sopa_letras.grid} palabras={h.contenido_json.sopa_letras.palabras} />
                      </div>
                    )}
                    {h.tipo === 'emparejar' && h.contenido_json.emparejar && (
                      <div className="overflow-x-auto">
                        <Emparejar emparejar={h.contenido_json.emparejar} />
                      </div>
                    )}
                    {h.tipo === 'cuento' && h.contenido_json.cuento && (
                      <div className="overflow-y-auto max-h-[500px]">
                        <Cuento cuento={h.contenido_json.cuento} titulo={h.contenido_json.titulo || h.titulo} />
                      </div>
                    )}
                    {h.tipo === 'para_colorear' && h.contenido_json.para_colorear && (
                      <div className="overflow-y-auto max-h-[500px]">
                        <ParaColorear data={h.contenido_json.para_colorear} titulo={h.contenido_json.titulo || h.titulo} />
                      </div>
                    )}
                    {h.tipo === 'examen' && h.contenido_json.preguntas && (
                      <div className="space-y-2 max-h-60 overflow-y-auto">
                        {h.contenido_json.preguntas.map((p, i) => (
                          <div key={i} className="p-2 bg-gray-50 dark:bg-gray-700/50 rounded-lg text-xs">
                            <MathText
                              className="font-medium text-gray-700 dark:text-gray-200"
                              text={`${p.numero || i + 1}. ${p.enunciado || p.pregunta || p.texto || 'Sin enunciado'}`}
                            />
                            {p.opciones && (
                              <div className="mt-1 space-y-0.5 ml-3">
                                {p.opciones.map((o, j) => (
                                  <div key={j} className="text-gray-500 dark:text-gray-400">
                                    <MathText text={`${String.fromCharCode(65 + j)}) ${stripOptionPrefixes(o)}`} />
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      </>)} {/* ═══ fin EVALUACIONES TAB ════════════════════════════════════ */}

      {/* ═══ PRESENTACIONES TAB ═════════════════════════════════════════════ */}
      {activeTab === 'presentaciones' && (
        <div className="space-y-5">
          {/* Filter tabs */}
          <div data-guide="filtros-presentaciones" className="flex gap-2 flex-wrap">
            {[
              { key: 'all',             label: 'Todas' },
              { key: 'clase',           label: 'Clases' },
              { key: 'repaso_examen',   label: 'Repasos' },
              { key: 'boletin_periodo', label: 'Boletines' },
            ].map(f => (
              <button key={f.key} onClick={() => setFilterPres(f.key)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  filterPres === f.key ? 'bg-profesor-100 text-profesor-700 dark:bg-profesor-900/40 dark:text-profesor-300' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                }`}>
                {f.label}
                {f.key === 'all' && presentaciones.length > 0 && ` (${presentaciones.length})`}
              </button>
            ))}
          </div>

          {/* Grid */}
          {loadingPres ? (
            <div data-guide="lista-presentaciones" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                  <div className="skeleton h-32 w-full" />
                  <div className="p-4 space-y-2">
                    <div className="skeleton h-4 w-3/4 rounded" />
                    <div className="skeleton h-3 w-1/2 rounded" />
                    <div className="flex gap-2 mt-3">
                      <div className="skeleton h-7 flex-1 rounded-lg" />
                      <div className="skeleton h-7 flex-1 rounded-lg" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : filteredPres.length === 0 ? (
            <EmptyState
              icon={Presentation}
              title={filterPres !== 'all' ? 'Sin presentaciones de este tipo' : 'No has creado presentaciones aún'}
              description="Genera presentaciones con IA para tus clases en 3 pasos. Puedes descargarlas en PPTX o editarlas en Presenton."
              action={
                <Link to="/profesor/presentacion" className="btn-primary flex items-center gap-2">
                  <Plus className="w-4 h-4" /> Crear primera presentación
                </Link>
              }
            />
          ) : (
            <div data-guide="lista-presentaciones" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredPres.map(pres => (
                <PresentationCard
                  key={pres.id}
                  pres={pres}
                  onDelete={setDeletePres}
                  onOpenEditor={openPresEditor}
                  openingId={openingEditor}
                  onGenerateQuiz={createQuizFromPresentation}
                  creatingQuizId={creatingQuizId}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {quizPres && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md border border-gray-100 dark:border-gray-800 p-5">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Guardar quiz en una materia</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  El quiz quedará en Mis Exámenes para asignarlo o editarlo.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setQuizPres(null)}
                className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Materia</label>
            <select
              className="input-field"
              value={quizMateriaId}
              onChange={(e) => setQuizMateriaId(e.target.value)}
            >
              <option value="">Selecciona una materia</option>
              {materias.map((materia) => (
                <option key={materia.id} value={materia.id}>{materia.nombre}</option>
              ))}
            </select>
            <div className="flex flex-col sm:flex-row justify-end gap-2 mt-5">
              <button type="button" className="btn-secondary" onClick={() => setQuizPres(null)}>
                Cancelar
              </button>
              <button
                type="button"
                className="btn-primary inline-flex items-center justify-center gap-2"
                disabled={!quizMateriaId || creatingQuizId === quizPres.id}
                onClick={() => createQuizFromPresentation(quizPres, quizMateriaId)}
              >
                {creatingQuizId === quizPres.id && <Loader2 className="w-4 h-4 animate-spin" />}
                Generar quiz
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Generate Modal */}
      {showGenerate && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto animate-scale-in border border-gray-100 dark:border-gray-800">
            <div className="p-6">
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-primary-50 dark:bg-primary-900/30">
                    <Wand2 className="w-5 h-5 text-primary-600 dark:text-primary-400" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Generar Herramienta con IA</h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Configura los detalles y genera automáticamente</p>
                  </div>
                </div>
                <button onClick={() => setShowGenerate(false)} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleGenerate} className="space-y-5">
                <WizardSteps step={genStep} steps={['Contenido', 'Ajustes', 'Generar']} />
                {/* Type selector */}
                <div className={genStep === 1 ? '' : 'hidden'}>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">¿Qué quieres crear?</label>
                  {availableTipos.length === 0 ? (
                    <div className="p-4 rounded-xl border border-red-200 bg-red-50 text-sm text-red-700 font-medium">
                      No hay tipos de herramienta habilitados por administración.
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {availableTipos.map(t => {
                        const Icon = t.icon;
                        const tc = TIPO_COLORS[t.color] || { bg: 'bg-gray-50', text: 'text-gray-600' };
                        return (
                          <button key={t.value} type="button"
                            onClick={() => selectGeneratorType(t.value)}
                            className={`flex flex-col items-center gap-2.5 p-4 rounded-2xl border-2 transition-all active:scale-95 ${
                              genForm.tipo === t.value
                                ? `${tc.bg} border-current ${tc.text} shadow-sm`
                                : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                            }`}>
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${genForm.tipo === t.value ? tc.bg : 'bg-white dark:bg-gray-700'}`}>
                              <Icon className={`w-5 h-5 ${genForm.tipo === t.value ? tc.text : 'text-gray-500 dark:text-gray-400'}`} />
                            </div>
                            <span className="text-sm font-bold">{t.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Title */}
                <div className={genStep === 1 ? '' : 'hidden'}>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Título de la herramienta</label>
                  <input type="text" className="input-field" required
                    value={genForm.titulo}
                    onChange={e => setGenForm(p => ({ ...p, titulo: e.target.value }))}
                    placeholder="Ej: Evaluación de fracciones — 4° grado" />
                </div>

                {/* Tema — label changes for para_colorear */}
                <div className={genStep === 1 ? '' : 'hidden'}>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                      {genForm.tipo === 'para_colorear' ? 'Descripción del dibujo' : 'Tema / Contenido'}
                    </label>
                    {genForm.tipo !== 'para_colorear' && (
                      <button
                        type="button"
                        onClick={handleImprovePrompt}
                        disabled={improvingPrompt || !genForm.tema.trim()}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-50 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 hover:bg-violet-100 dark:hover:bg-violet-900/50 text-sm font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed border border-violet-200 dark:border-violet-800/50"
                      >
                        {improvingPrompt
                          ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Mejorando...</>
                          : <><Sparkles className="w-3.5 h-3.5" /> Mejorar con IA</>
                        }
                      </button>
                    )}
                  </div>
                  <textarea className="input-field h-24" required
                    value={genForm.tema}
                    onChange={e => setGenForm(p => ({ ...p, tema: e.target.value }))}
                    placeholder={genForm.tipo === 'para_colorear'
                      ? 'Describe qué dibujo quieres generar. Ej: un dinosaurio en un bosque, una mariposa con flores...'
                      : 'Describe el tema o contenido a evaluar. Ej: fracciones, suma y resta para 3er grado...'} />
                  {genForm.tipo !== 'para_colorear' && (
                    <p className="text-xs text-gray-400 mt-1">💡 Escribe algo corto y presiona <strong>Mejorar con IA</strong> para que la IA lo expanda automáticamente</p>
                  )}
                </div>

                {/* Level + Grade — hidden for para_colorear */}
                <div className={genStep === 1 ? 'flex justify-end' : 'hidden'}>
                  <button type="button" onClick={() => setGenStep(2)}
                    disabled={!genForm.titulo.trim() || !genForm.tema.trim() || availableTipos.length === 0}
                    className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed">
                    Continuar
                  </button>
                </div>

                {genForm.tipo !== 'para_colorear' && (
                <div className={`grid grid-cols-1 sm:grid-cols-2 gap-4 ${genStep === 2 ? '' : 'hidden'}`}>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nivel de dificultad</label>
                    <select className="input-field" value={genForm.nivel}
                      onChange={e => setGenForm(p => ({ ...p, nivel: e.target.value }))}>
                      <option value="basico">Básico</option>
                      <option value="intermedio">Intermedio</option>
                      <option value="avanzado">Avanzado</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Grado escolar</label>
                    <select className="input-field" value={genForm.grado}
                      onChange={e => setGenForm(p => ({ ...p, grado: e.target.value }))}>
                      <option value="">Seleccionar grado...</option>
                      {GRADOS_COLOMBIA.map(g => (
                        <optgroup key={g.group} label={g.group}>
                          {g.options.map(o => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </div>
                </div>
                )}

                {/* Materia para DBA — siempre visible en step 2 */}
                <div className={genStep === 2 ? '' : 'hidden'}>
                  <div className="p-3 bg-green-50 dark:bg-green-900/20 border border-green-100 dark:border-green-800/30 rounded-xl flex items-start gap-2 mb-3">
                    <BookOpen className="w-4 h-4 text-green-600 dark:text-green-400 shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-green-700 dark:text-green-300">Contexto curricular (DBA / RAG)</p>
                      <p className="text-xs text-green-600 dark:text-green-400 mt-0.5">
                        Selecciona una materia para que la generación use automáticamente su DBA y plan de estudios.
                      </p>
                    </div>
                  </div>
                  <select className="input-field" value={genForm.materia_id}
                    onChange={e => setGenForm(p => ({ ...p, materia_id: e.target.value }))}>
                    <option value="">Sin materia (sin contexto DBA)</option>
                    {materias.map(m => (
                      <option key={m.id} value={m.id}>{m.nombre}</option>
                    ))}
                  </select>
                </div>

                {/* Contenido base — hidden for para_colorear and cuento */}
                {!['para_colorear', 'cuento'].includes(genForm.tipo) && (
                <div className={genStep === 2 ? '' : 'hidden'}>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Contenido base adicional (opcional)</label>
                    <div className="flex items-center gap-2">
                      {uploadedFileName && (
                        <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/30 px-2 py-0.5 rounded-full">
                          <FileText className="w-3 h-3" /> {uploadedFileName}
                          <button type="button" onClick={() => { setUploadedFileName(null); setGenForm(p => ({...p, contenido_base: ''})); }}
                            className="ml-1 hover:text-red-500"><X className="w-3 h-3" /></button>
                        </span>
                      )}
                      <input ref={fileRefGen} type="file" className="hidden"
                        accept=".pdf,.docx,.doc,.jpg,.jpeg,.png"
                        onChange={handleFileExtractGen} />
                      <button type="button" onClick={() => fileRefGen.current?.click()} disabled={extracting}
                        className="btn-secondary text-xs flex items-center gap-1 py-1 px-2">
                        {extracting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
                        {extracting ? 'Extrayendo...' : 'PDF / Word / Imagen'}
                      </button>
                    </div>
                  </div>
                  <textarea className="input-field h-20"
                    value={genForm.contenido_base}
                    onChange={e => setGenForm(p => ({ ...p, contenido_base: e.target.value }))}
                    placeholder="Pega texto aquí, o sube un archivo para extraerlo automáticamente..." />
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Se combina con el DBA de la materia seleccionada.</p>
                </div>
                )}

                {/* OCR configuration */}
                {genForm.tipo === 'examen' && (
                  <div className={`space-y-3 p-4 bg-slate-50 dark:bg-gray-800/60 border border-slate-200 dark:border-gray-700 rounded-xl ${genStep === 2 ? '' : 'hidden'}`}>
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-800 dark:text-gray-100">Plantilla OCR</p>
                        <p className="text-xs text-slate-500 dark:text-gray-400">Estructura de respuestas estandarizada para facilitar lectura y calificación automática.</p>
                      </div>
                      <label className="inline-flex items-center gap-2 text-xs text-slate-700 dark:text-gray-300 font-medium">
                        <input
                          type="checkbox"
                          checked={genForm.vision_friendly}
                          onChange={e => setGenForm(p => ({ ...p, vision_friendly: e.target.checked }))}
                          className="rounded border-gray-300 dark:border-gray-600 text-primary-600 w-4 h-4"
                        />
                        Optimizar para Visión
                      </label>
                    </div>

                    {genForm.vision_friendly && (
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Prefijo de respuesta</label>
                          <input
                            type="text"
                            maxLength={4}
                            className="input-field"
                            value={genForm.vision_prefijo}
                            onChange={e => setGenForm(p => ({ ...p, vision_prefijo: e.target.value.toUpperCase() }))}
                            placeholder="R"
                          />
                          <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1">Ejemplo: R1: A</p>
                        </div>

                        <div>
                          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Líneas abiertas</label>
                          <input
                            type="number"
                            min={1}
                            max={8}
                            className="input-field"
                            value={genForm.vision_lineas_abiertas}
                            onChange={e => setGenForm(p => ({ ...p, vision_lineas_abiertas: parseInt(e.target.value, 10) || 3 }))}
                          />
                          <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1">Para respuestas cortas/desarrollo</p>
                        </div>

                        <label className="flex items-center gap-2 p-3 bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-700 rounded-lg text-xs text-slate-700 dark:text-gray-300 font-medium">
                          <input
                            type="checkbox"
                            checked={genForm.vision_hoja_respuestas}
                            onChange={e => setGenForm(p => ({ ...p, vision_hoja_respuestas: e.target.checked }))}
                            className="rounded border-gray-300 dark:border-gray-600 text-primary-600 w-4 h-4"
                          />
                          Incluir hoja de respuestas
                        </label>
                      </div>
                    )}
                  </div>
                )}

                {/* ===== EXAMEN: Question distribution ===== */}
                {genForm.tipo === 'examen' && (
                  <div className={genStep === 2 ? '' : 'hidden'}>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Distribución de preguntas</label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                      <PresetButton
                        selected={examPreset === 'rapido'}
                        title="Examen rapido"
                        description="Default recomendado para evaluacion completa."
                        meta="10 preguntas: 6 seleccion multiple, 2 respuesta corta, 2 desarrollo"
                        onClick={() => applyExamPreset('rapido')}
                      />
                      <PresetButton
                        selected={examPreset === 'quiz'}
                        title="Quiz corto"
                        description="Chequeo breve para clase o tarea."
                        meta="5 preguntas: 4 seleccion multiple, 1 respuesta corta"
                        onClick={() => applyExamPreset('quiz')}
                      />
                    </div>
                    <AdvancedAccordion title="Personalizar distribucion">
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                      Total: <span className="font-bold text-primary-600 dark:text-primary-400">
                        {Object.values(genForm.distribucion).reduce((a, b) => a + b, 0)}
                      </span> preguntas
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {TIPOS_PREGUNTA.map(t => (
                        <div key={t.key}
                          className={`flex items-center justify-between rounded-xl p-3 border transition-colors ${
                            (genForm.distribucion[t.key] || 0) > 0
                              ? 'bg-primary-50 border-primary-200 dark:bg-primary-900/20 dark:border-primary-800/50'
                              : 'bg-gray-50 border-gray-200 dark:bg-gray-800/50 dark:border-gray-700'
                          }`}>
                          <div className="min-w-0">
                            <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{t.label}</span>
                            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{t.desc}</p>
                          </div>
                          <input type="number" min="0" max="20"
                            className="w-14 px-2 py-1.5 border border-gray-300 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100 rounded-lg text-center text-sm font-medium focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none ml-3 shrink-0"
                            value={genForm.distribucion[t.key] || ''}
                            onChange={e => setGenForm(p => ({
                              ...p,
                              distribucion: { ...p.distribucion, [t.key]: parseInt(e.target.value) || 0 }
                            }))} />
                        </div>
                      ))}
                    </div>
                    </AdvancedAccordion>
                  </div>
                )}

                {/* ===== SOPA DE LETRAS: Customization ===== */}
                {genForm.tipo === 'sopa_letras' && (
                  <div className={`space-y-4 ${genStep === 2 ? '' : 'hidden'}`}>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Cantidad de palabras</label>
                      <div className="flex items-center gap-3">
                        <input type="range" min="4" max="15" value={genForm.num_palabras}
                          onChange={e => setGenForm(p => ({ ...p, num_palabras: parseInt(e.target.value) }))}
                          className="flex-1 accent-emerald-500" />
                        <span className="text-lg font-bold text-emerald-600 dark:text-emerald-400 w-8 text-center">{genForm.num_palabras}</span>
                      </div>
                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">La IA generará {genForm.num_palabras} palabras relacionadas con el tema</p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Palabras obligatorias <span className="text-gray-400 dark:text-gray-500 font-normal">(opcional)</span>
                      </label>
                      <p className="text-xs text-gray-400 dark:text-gray-500 mb-2">Estas palabras aparecerán sí o sí en la sopa. El resto las genera la IA.</p>
                      <div className="flex gap-2 mb-2">
                        <input type="text" className="input-field flex-1"
                          value={genForm.nueva_palabra}
                          onChange={e => setGenForm(p => ({ ...p, nueva_palabra: e.target.value.toUpperCase() }))}
                          onKeyDown={e => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              const w = genForm.nueva_palabra.trim();
                              if (w && !genForm.palabras_obligatorias.includes(w)) {
                                setGenForm(p => ({
                                  ...p,
                                  palabras_obligatorias: [...p.palabras_obligatorias, w],
                                  nueva_palabra: '',
                                }));
                              }
                            }
                          }}
                          placeholder="Escribe y presiona Enter o +" />
                        <button type="button"
                          onClick={() => {
                            const w = genForm.nueva_palabra.trim();
                            if (w && !genForm.palabras_obligatorias.includes(w)) {
                              setGenForm(p => ({
                                ...p,
                                palabras_obligatorias: [...p.palabras_obligatorias, w],
                                nueva_palabra: '',
                              }));
                            }
                          }}
                          className="px-3 py-2 bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 rounded-lg hover:bg-emerald-200 dark:hover:bg-emerald-900/60 transition font-bold">
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>
                      {genForm.palabras_obligatorias.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {genForm.palabras_obligatorias.map((w, i) => (
                            <span key={i} className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-800 rounded-full text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                              {w}
                              <button type="button" onClick={() => setGenForm(p => ({
                                ...p,
                                palabras_obligatorias: p.palabras_obligatorias.filter((_, j) => j !== i),
                              }))} className="hover:text-red-500 transition">
                                <X className="w-3 h-3" />
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* ===== CRUCIGRAMA: Customization ===== */}
                {genForm.tipo === 'crucigrama' && (
                  <div className={`space-y-4 ${genStep === 2 ? '' : 'hidden'}`}>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Palabras horizontales</label>
                        <div className="flex items-center gap-2">
                          <button type="button"
                            onClick={() => setGenForm(p => ({ ...p, num_horizontales: Math.max(1, p.num_horizontales - 1) }))}
                            className="w-8 h-8 flex items-center justify-center bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 rounded-lg hover:bg-purple-200 dark:hover:bg-purple-900/60 font-bold">−</button>
                          <span className="text-lg font-bold text-purple-600 dark:text-purple-400 w-8 text-center">{genForm.num_horizontales}</span>
                          <button type="button"
                            onClick={() => setGenForm(p => ({ ...p, num_horizontales: Math.min(12, p.num_horizontales + 1) }))}
                            className="w-8 h-8 flex items-center justify-center bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 rounded-lg hover:bg-purple-200 dark:hover:bg-purple-900/60 font-bold">+</button>
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Palabras verticales</label>
                        <div className="flex items-center gap-2">
                          <button type="button"
                            onClick={() => setGenForm(p => ({ ...p, num_verticales: Math.max(1, p.num_verticales - 1) }))}
                            className="w-8 h-8 flex items-center justify-center bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 rounded-lg hover:bg-purple-200 dark:hover:bg-purple-900/60 font-bold">−</button>
                          <span className="text-lg font-bold text-purple-600 dark:text-purple-400 w-8 text-center">{genForm.num_verticales}</span>
                          <button type="button"
                            onClick={() => setGenForm(p => ({ ...p, num_verticales: Math.min(12, p.num_verticales + 1) }))}
                            className="w-8 h-8 flex items-center justify-center bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 rounded-lg hover:bg-purple-200 dark:hover:bg-purple-900/60 font-bold">+</button>
                        </div>
                      </div>
                    </div>
                    <p className="text-xs text-gray-400 dark:text-gray-500">
                      Total: <span className="font-bold text-purple-600 dark:text-purple-400">{genForm.num_horizontales + genForm.num_verticales}</span> palabras en el crucigrama
                    </p>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Palabras obligatorias <span className="text-gray-400 dark:text-gray-500 font-normal">(opcional)</span>
                      </label>
                      <p className="text-xs text-gray-400 dark:text-gray-500 mb-2">Estas palabras aparecerán sí o sí en el crucigrama. El resto las genera la IA.</p>
                      <div className="flex gap-2 mb-2">
                        <input type="text" className="input-field flex-1"
                          value={genForm.nueva_palabra_cruc}
                          onChange={e => setGenForm(p => ({ ...p, nueva_palabra_cruc: e.target.value.toUpperCase() }))}
                          onKeyDown={e => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              const w = genForm.nueva_palabra_cruc.trim();
                              if (w && !genForm.palabras_obligatorias_cruc.includes(w)) {
                                setGenForm(p => ({
                                  ...p,
                                  palabras_obligatorias_cruc: [...p.palabras_obligatorias_cruc, w],
                                  nueva_palabra_cruc: '',
                                }));
                              }
                            }
                          }}
                          placeholder="Escribe y presiona Enter o +" />
                        <button type="button"
                          onClick={() => {
                            const w = genForm.nueva_palabra_cruc.trim();
                            if (w && !genForm.palabras_obligatorias_cruc.includes(w)) {
                              setGenForm(p => ({
                                ...p,
                                palabras_obligatorias_cruc: [...p.palabras_obligatorias_cruc, w],
                                nueva_palabra_cruc: '',
                              }));
                            }
                          }}
                          className="px-3 py-2 bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 rounded-lg hover:bg-purple-200 dark:hover:bg-purple-900/60 transition font-bold">
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>
                      {genForm.palabras_obligatorias_cruc.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {genForm.palabras_obligatorias_cruc.map((w, i) => (
                            <span key={i} className="inline-flex items-center gap-1 px-2.5 py-1 bg-purple-50 dark:bg-purple-900/30 border border-purple-200 dark:border-purple-800 rounded-full text-xs font-semibold text-purple-700 dark:text-purple-300">
                              {w}
                              <button type="button" onClick={() => setGenForm(p => ({
                                ...p,
                                palabras_obligatorias_cruc: p.palabras_obligatorias_cruc.filter((_, j) => j !== i),
                              }))} className="hover:text-red-500 transition">
                                <X className="w-3 h-3" />
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* ===== EMPAREJAR: Customization ===== */}
                {genForm.tipo === 'emparejar' && (
                  <div className={`space-y-4 ${genStep === 2 ? '' : 'hidden'}`}>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Cantidad de pares</label>
                      <div className="flex items-center gap-3">
                        <input type="range" min="3" max="12" value={genForm.num_pares}
                          onChange={e => setGenForm(p => ({ ...p, num_pares: parseInt(e.target.value) }))}
                          className="flex-1 accent-amber-500" />
                        <span className="text-lg font-bold text-amber-600 dark:text-amber-400 w-8 text-center">{genForm.num_pares}</span>
                      </div>
                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">La IA generará {genForm.num_pares} pares de conceptos para emparejar</p>
                    </div>
                    <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50 rounded-xl">
                      <p className="text-xs text-amber-700 dark:text-amber-300">
                        <span className="font-semibold">🔗 Actividad de emparejar:</span> Se generan 2 columnas con conceptos desordenados.
                        El estudiante debe conectar cada elemento de la columna A con su correspondiente en la columna B.
                      </p>
                    </div>
                  </div>
                )}

                {/* ===== CUENTO: Customization ===== */}
                {genForm.tipo === 'cuento' && (
                  <div className={`space-y-4 ${genStep === 2 ? '' : 'hidden'}`}>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Enfoque de la moraleja <span className="text-gray-400 dark:text-gray-500 font-normal">(opcional)</span>
                      </label>
                      <input type="text" className="input-field"
                        value={genForm.moraleja_tema}
                        onChange={e => setGenForm(p => ({ ...p, moraleja_tema: e.target.value }))}
                        placeholder="Ej: respeto, trabajo en equipo, honestidad, cuidado del medio ambiente..." />
                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Si lo dejas vacío, la IA elegirá una moraleja acorde al tema</p>
                    </div>
                    <div className="p-3 bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800/50 rounded-xl">
                      <p className="text-xs text-rose-700 dark:text-rose-300">
                        <span className="font-semibold">📖 Generador de cuentos:</span> Se genera un cuento educativo con moraleja, personajes y
                        una ilustración generada por IA cuando el proveedor interno de imágenes esté configurado.
                      </p>
                    </div>
                  </div>
                )}

                {/* ===== PARA COLOREAR: Customization ===== */}
                {genForm.tipo === 'para_colorear' && (
                  <div className={`space-y-4 ${genStep === 2 ? '' : 'hidden'}`}>
                    <div className="p-3 bg-teal-50 dark:bg-teal-900/20 border border-teal-200 dark:border-teal-800/50 rounded-xl">
                      <p className="text-xs text-teal-700 dark:text-teal-300">
                        <span className="font-semibold">🎨 Para Colorear:</span> Se genera una imagen en blanco y negro con contornos gruesos,
                        ideal para que los alumnos la impriman y coloreen. La descripción se toma del campo Tema/Contenido para evitar duplicados.
                      </p>
                      <p className="text-xs text-teal-700 dark:text-teal-300 mt-2">
                        Si necesitas letras o vocales, escríbelo explícitamente en Tema (ej: "vocales A E I O U con dibujos infantiles").
                      </p>
                    </div>
                  </div>
                )}

                <div className={genStep === 2 ? 'flex items-center justify-between pt-2' : 'hidden'}>
                  <button type="button" onClick={() => setGenStep(1)} className="btn-secondary">Atras</button>
                  <button type="button" onClick={() => setGenStep(3)} className="btn-primary">Revisar</button>
                </div>

                <div className={genStep === 3 ? 'rounded-xl border border-primary-100 dark:border-primary-800/50 bg-primary-50 dark:bg-primary-900/20 p-4 text-sm text-primary-800 dark:text-primary-200' : 'hidden'}>
                  <p className="font-semibold">{genForm.titulo || 'Herramienta sin título'}</p>
                  <p className="mt-1 capitalize">{genForm.tipo.replace('_', ' ')} sobre {genForm.tema || 'tema pendiente'}</p>
                  {genForm.tipo === 'examen' && (
                    <p className="mt-1 text-xs">
                      {Object.values(genForm.distribucion).reduce((a, b) => a + b, 0)} preguntas.
                    </p>
                  )}
                  {genForm.tipo === 'sopa_letras' && <p className="mt-1 text-xs">{genForm.num_palabras} palabras.</p>}
                  {genForm.tipo === 'crucigrama' && <p className="mt-1 text-xs">{genForm.num_horizontales}+{genForm.num_verticales} palabras.</p>}
                </div>

                <div className={`flex gap-3 pt-2 ${genStep === 3 ? '' : 'hidden'}`}>
                  <button type="button" onClick={() => setShowGenerate(false)}
                    className="btn-secondary flex-1">Cancelar</button>
                  <button type="submit" disabled={
                    generating ||
                    !genForm.tema.trim() ||
                    (toolFlags.length > 0 && availableTipos.length === 0) ||
                    (toolFlags.length > 0 && !enabledToolTypes.includes(genForm.tipo)) ||
                    (genForm.tipo === 'examen' && Object.values(genForm.distribucion).reduce((a, b) => a + b, 0) === 0)
                  }
                    className="btn-primary flex-1 flex items-center justify-center gap-2">
                    {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
                    {generating ? 'Generando...' : 'Generar con IA'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Assign Modal */}
      {showAssign && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-sm animate-scale-in border border-gray-100 dark:border-gray-800">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-green-50 dark:bg-green-900/30">
                    <Send className="w-5 h-5 text-green-600 dark:text-green-400" />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Asignar a Materia</h3>
                </div>
                <button onClick={() => setShowAssign(null)} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Materia</label>
                  <select className="input-field" value={assignForm.materia_id}
                    onChange={e => setAssignForm(p => ({ ...p, materia_id: e.target.value }))}>
                    <option value="">Seleccionar materia...</option>
                    {materias.map(m => (
                      <option key={m.id} value={m.id}>{m.nombre}</option>
                    ))}
                  </select>
                </div>

                <label className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800/60 rounded-xl cursor-pointer">
                  <input type="checkbox" checked={assignForm.activo_online}
                    onChange={e => setAssignForm(p => ({ ...p, activo_online: e.target.checked }))}
                    className="rounded border-gray-300 dark:border-gray-600 text-primary-600 w-4 h-4" />
                  <span className="text-sm text-gray-700 dark:text-gray-300">Activar para resolución online</span>
                </label>

                <div className="flex gap-3">
                  <button onClick={() => setShowAssign(null)} className="btn-secondary flex-1">Cancelar</button>
                  <button onClick={() => handleAssign(showAssign)}
                    className="btn-primary flex-1 flex items-center justify-center gap-2">
                    <Send className="w-4 h-4" /> Asignar
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto animate-scale-in border border-gray-100 dark:border-gray-800">
            <div className="p-6">
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-900/30">
                    <Edit3 className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Editar Herramienta</h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400 capitalize">{editModal.tipo?.replace('_', ' ')}</p>
                  </div>
                </div>
                <button onClick={() => setEditModal(null)} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Título</label>
                  <input type="text" className="input-field"
                    value={editForm.titulo}
                    onChange={e => setEditForm(p => ({ ...p, titulo: e.target.value }))} />
                </div>

                {/* Exam questions editor */}
                {editModal.tipo === 'examen' && editForm.contenido_json?.preguntas && (
                  <div className="space-y-3">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Preguntas</label>
                    {editForm.contenido_json.preguntas.map((q, i) => (
                      <div key={i} className="p-3 bg-gray-50 dark:bg-gray-800/60 rounded-xl space-y-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 shrink-0">{q.numero || i + 1}.</span>
                          <input type="text" className="input-field text-xs flex-1"
                            value={q.enunciado || q.pregunta || q.texto || ''}
                            onChange={e => {
                              const preg = [...editForm.contenido_json.preguntas];
                              preg[i] = { ...preg[i], enunciado: e.target.value, pregunta: e.target.value };
                              setEditForm(p => ({ ...p, contenido_json: { ...p.contenido_json, preguntas: preg } }));
                            }} />
                        </div>
                        {q.opciones && q.opciones.map((o, j) => (
                          <input key={j} type="text" className="input-field text-xs ml-5"
                            value={o}
                            onChange={e => {
                              const preg = [...editForm.contenido_json.preguntas];
                              const opts = [...preg[i].opciones];
                              opts[j] = e.target.value;
                              preg[i] = { ...preg[i], opciones: opts };
                              setEditForm(p => ({ ...p, contenido_json: { ...p.contenido_json, preguntas: preg } }));
                            }} />
                        ))}
                      </div>
                    ))}
                  </div>
                )}

                {/* Cuento text editor */}
                {editModal.tipo === 'cuento' && editForm.contenido_json?.cuento && (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Contenido</label>
                      <textarea className="input-field h-40 text-xs"
                        value={editForm.contenido_json.cuento.texto || ''}
                        onChange={e => setEditForm(p => ({
                          ...p,
                          contenido_json: { ...p.contenido_json, cuento: { ...p.contenido_json.cuento, texto: e.target.value } }
                        }))} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Moraleja</label>
                      <input type="text" className="input-field text-xs"
                        value={editForm.contenido_json.cuento.moraleja || ''}
                        onChange={e => setEditForm(p => ({
                          ...p,
                          contenido_json: { ...p.contenido_json, cuento: { ...p.contenido_json.cuento, moraleja: e.target.value } }
                        }))} />
                    </div>
                  </div>
                )}

                {/* Emparejar editor */}
                {editModal.tipo === 'emparejar' && editForm.contenido_json?.emparejar && (
                  <div className="space-y-3">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Pares</label>
                    {(editForm.contenido_json.emparejar.pares || editForm.contenido_json.emparejar || []).map((p, i) => (
                      <div key={i} className="flex gap-2">
                        <input type="text" className="input-field text-xs flex-1"
                          value={p.izquierda || p.concepto || p.columna_a || ''}
                          placeholder="Columna A"
                          onChange={e => {
                            const pares = [...(editForm.contenido_json.emparejar.pares || editForm.contenido_json.emparejar)];
                            pares[i] = { ...pares[i], izquierda: e.target.value, concepto: e.target.value, columna_a: e.target.value };
                            const emp = editForm.contenido_json.emparejar.pares ? { ...editForm.contenido_json.emparejar, pares } : pares;
                            setEditForm(pr => ({ ...pr, contenido_json: { ...pr.contenido_json, emparejar: emp } }));
                          }} />
                        <input type="text" className="input-field text-xs flex-1"
                          value={p.derecha || p.definicion || p.columna_b || ''}
                          placeholder="Columna B"
                          onChange={e => {
                            const pares = [...(editForm.contenido_json.emparejar.pares || editForm.contenido_json.emparejar)];
                            pares[i] = { ...pares[i], derecha: e.target.value, definicion: e.target.value, columna_b: e.target.value };
                            const emp = editForm.contenido_json.emparejar.pares ? { ...editForm.contenido_json.emparejar, pares } : pares;
                            setEditForm(pr => ({ ...pr, contenido_json: { ...pr.contenido_json, emparejar: emp } }));
                          }} />
                      </div>
                    ))}
                  </div>
                )}

                {/* Crucigrama — clue editor */}
                {editModal.tipo === 'crucigrama' && editForm.contenido_json?.crucigrama && (
                  <div className="space-y-3">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Pistas</label>
                    {(editForm.contenido_json.crucigrama.pistas_horizontal || []).map((p, i) => (
                      <div key={`h${i}`} className="flex gap-2 items-center">
                        <span className="text-xs font-bold text-purple-600 dark:text-purple-400 shrink-0">{p.numero}→</span>
                        <input type="text" className="input-field text-xs flex-1"
                          value={p.pista || ''}
                          onChange={e => {
                            const h = [...editForm.contenido_json.crucigrama.pistas_horizontal];
                            h[i] = { ...h[i], pista: e.target.value };
                            setEditForm(pr => ({
                              ...pr,
                              contenido_json: { ...pr.contenido_json, crucigrama: { ...pr.contenido_json.crucigrama, pistas_horizontal: h } }
                            }));
                          }} />
                        <span className="text-[10px] text-gray-400 shrink-0">{p.respuesta}</span>
                      </div>
                    ))}
                    {(editForm.contenido_json.crucigrama.pistas_vertical || []).map((p, i) => (
                      <div key={`v${i}`} className="flex gap-2 items-center">
                        <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 shrink-0">{p.numero}↓</span>
                        <input type="text" className="input-field text-xs flex-1"
                          value={p.pista || ''}
                          onChange={e => {
                            const v = [...editForm.contenido_json.crucigrama.pistas_vertical];
                            v[i] = { ...v[i], pista: e.target.value };
                            setEditForm(pr => ({
                              ...pr,
                              contenido_json: { ...pr.contenido_json, crucigrama: { ...pr.contenido_json.crucigrama, pistas_vertical: v } }
                            }));
                          }} />
                        <span className="text-[10px] text-gray-400 shrink-0">{p.respuesta}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Sopa de letras — word list editor */}
                {editModal.tipo === 'sopa_letras' && editForm.contenido_json?.sopa_letras && (
                  <div className="space-y-3">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Palabras</label>
                    <div className="flex flex-wrap gap-2">
                      {(editForm.contenido_json.sopa_letras.palabras || []).map((w, i) => (
                        <span key={i} className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-800 rounded-full text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                          {typeof w === 'object' ? w.palabra : w}
                        </span>
                      ))}
                    </div>
                    <p className="text-[10px] text-gray-400 dark:text-gray-500">La grilla se regenerará automáticamente al modificar las palabras. Para cambiarlas, genera una nueva herramienta.</p>
                  </div>
                )}

                <div className="flex gap-3 pt-2">
                  <button onClick={() => setEditModal(null)} className="btn-secondary flex-1">Cancelar</button>
                  <button onClick={handleSaveEdit} disabled={saving}
                    className="btn-primary flex-1 flex items-center justify-center gap-2">
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    {saving ? 'Guardando...' : 'Guardar cambios'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        onConfirm={() => handleDelete(deleteConfirm)}
        title="¿Eliminar herramienta?"
        message="Se eliminará permanentemente esta herramienta generada."
        confirmText="Eliminar"
        variant="danger"
      />

      <ConfirmDialog
        open={!!deletePres}
        onClose={() => setDeletePres(null)}
        onConfirm={() => handleDeletePres(deletePres?.id)}
        title="¿Eliminar presentación?"
        message={`Se eliminará permanentemente "${deletePres?.titulo}".`}
        confirmText="Eliminar"
        variant="danger"
      />
    </div>
  );
}
