/**
 * GenerarPresentacion — Wizard de 3 pasos pensado para profesores mayores.
 *
 *  Paso 1: ¿De qué se trata? (input grande con ejemplo)
 *  Paso 2: ¿Cómo la quieres? (slides + plantilla con tarjetas grandes)
 *  Paso 3: Vista previa + descargar
 *
 * Principios UX:
 *  - Una sola pregunta visible por paso
 *  - Botones-tarjeta grandes (mínimo 120px alto), nunca dropdowns
 *  - Lenguaje cotidiano, sin jerga
 *  - Tooltip explicativo en cada elemento
 *  - Estado de carga con barra de progreso explícita
 *  - Botón persistente "Necesito ayuda"
 */
import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import api from '../../api';
import toast from 'react-hot-toast';
import { openPresentonEditorWithSession } from '../../utils/presenton';
import PageGuide from '../../components/GuidedTour';
import {
  ArrowLeft, ArrowRight, BookOpen, Check, Download,
  GraduationCap, HelpCircle, Loader2, Palette, Presentation,
  RefreshCw, Sparkles, Wand2, FileQuestion, X,
} from 'lucide-react';

/* ════════════════════ HELPERS ════════════════════ */

const GRADO_OPTIONS = [
  'Preescolar', '1°', '2°', '3°', '4°', '5°',
  '6°', '7°', '8°', '9°', '10°', '11°',
];

const TAMANOS = [
  { id: 5,  label: 'Corta',     desc: '5 diapositivas',  hint: 'Para introducciones rápidas' },
  { id: 8,  label: 'Estándar',  desc: '8 diapositivas',  hint: 'La mayoría de las clases' },
  { id: 12, label: 'Completa',  desc: '12 diapositivas', hint: 'Para temas extensos' },
];

const PLANTILLAS = [
  { id: 'general', label: 'Sencilla',  desc: 'Limpia y clara',         emoji: '📘' },
  { id: 'classic', label: 'Clásica',   desc: 'Formal, blanco y negro',  emoji: '📜' },
  { id: 'modern',  label: 'Moderna',   desc: 'Colorida, con imágenes',  emoji: '🎨' },
];

/* ════════════════════ STEP INDICATOR ════════════════════ */

function StepIndicator({ step, total }) {
  return (
    <div className="flex items-center justify-center gap-3 mb-8" aria-label="Progreso">
      {Array.from({ length: total }, (_, i) => i + 1).map((n) => {
        const done = n < step;
        const active = n === step;
        return (
          <div key={n} className="flex items-center gap-3">
            <div
              className={`
                flex items-center justify-center w-10 h-10 rounded-full font-bold text-sm
                transition-all duration-200
                ${done ? 'bg-emerald-500 text-white' : ''}
                ${active ? 'bg-profesor-600 text-white ring-4 ring-profesor-100 scale-110' : ''}
                ${!done && !active ? 'bg-gray-100 text-gray-400 border-2 border-gray-200' : ''}
              `}
            >
              {done ? <Check className="w-5 h-5" /> : n}
            </div>
            {n < total && (
              <div className={`w-10 h-1 rounded-full ${done ? 'bg-emerald-400' : 'bg-gray-200'}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ════════════════════ TOOLTIP ════════════════════ */

function HelpTip({ children }) {
  return (
    <span className="group relative inline-flex items-center align-middle ml-1">
      <HelpCircle className="w-4 h-4 text-gray-400 cursor-help" />
      <span className="
        invisible group-hover:visible group-focus-within:visible
        opacity-0 group-hover:opacity-100 group-focus-within:opacity-100
        transition-opacity duration-150
        absolute left-1/2 -translate-x-1/2 bottom-full mb-2
        bg-gray-900 text-white text-xs rounded-lg px-3 py-2
        whitespace-normal w-64 z-20 pointer-events-none shadow-lg
      ">
        {children}
      </span>
    </span>
  );
}

/* ════════════════════ BIG CHOICE CARD ════════════════════ */

function BigCard({ icon: Icon, emoji, label, desc, hint, selected, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`
        flex flex-col items-start text-left p-5 rounded-2xl border-2 transition-all duration-150
        min-h-[140px] w-full
        ${selected
          ? 'border-profesor-500 bg-profesor-50 shadow-md ring-2 ring-profesor-100'
          : 'border-gray-200 bg-white hover:border-profesor-300 hover:bg-profesor-50/40 hover:-translate-y-0.5 hover:shadow-md'}
      `}
    >
      <div className="flex items-center gap-3 mb-2">
        {Icon && (
          <div className={`p-2 rounded-xl ${selected ? 'bg-profesor-100 text-profesor-700' : 'bg-gray-100 text-gray-500'}`}>
            <Icon className="w-6 h-6" />
          </div>
        )}
        {emoji && <span className="text-3xl">{emoji}</span>}
        <span className={`font-bold text-lg ${selected ? 'text-profesor-700' : 'text-gray-900'}`}>
          {label}
        </span>
      </div>
      <p className="text-sm text-gray-600">{desc}</p>
      {hint && <p className="text-xs text-gray-400 mt-2">{hint}</p>}
    </button>
  );
}

/* ════════════════════ MAIN COMPONENT ════════════════════ */

export default function GenerarPresentacion() {
  const navigate = useNavigate();
  const { materiaId } = useParams();

  const [step, setStep] = useState(1);

  // Paso 1
  const [titulo, setTitulo] = useState('');
  const [grado, setGrado] = useState('');
  const [contenido, setContenido] = useState('');
  const [materias, setMaterias] = useState([]);
  const [selectedMateriaId, setSelectedMateriaId] = useState(materiaId || '');
  const [dbaLineamiento, setDbaLineamiento] = useState('');
  const [metodologia, setMetodologia] = useState('');
  const [orientacion, setOrientacion] = useState('');
  const [enfoque, setEnfoque] = useState('');

  // Paso 2
  const [numSlides, setNumSlides] = useState(8);
  const [plantilla, setPlantilla] = useState('general');

  // Paso 3 (resultado)
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState(null);
  const [creatingQuiz, setCreatingQuiz] = useState(false);
  const [quizModalOpen, setQuizModalOpen] = useState(false);
  const [quizMateriaId, setQuizMateriaId] = useState(selectedMateriaId || '');

  const canAdvanceStep1 = titulo.trim().length >= 3;

  useEffect(() => {
    if (materiaId) {
      setSelectedMateriaId(materiaId);
      return;
    }
    api.get('/materias/mis-materias')
      .then((res) => setMaterias(res.data || []))
      .catch(() => setMaterias([]));
  }, [materiaId]);

  // ── Generar ─────────────────────────────────────────────────
  const handleGenerate = async () => {
    setLoading(true);
    setProgress(5);
    setResult(null);

    // Progreso falso pero útil — Presenton tarda 30-90s
    const tick = setInterval(() => {
      setProgress((p) => (p < 90 ? p + Math.max(1, Math.round((95 - p) / 25)) : p));
    }, 1200);

    try {
      const { data } = await api.post('/presentaciones/clase', {
        titulo: titulo.trim(),
        contenido: contenido.trim(),
        grado: grado || null,
        dba_lineamiento: dbaLineamiento.trim() || null,
        metodologia: metodologia.trim() || null,
        orientacion: orientacion.trim() || null,
        enfoque: enfoque.trim() || null,
        num_slides: numSlides,
        plantilla,
        materia_id: selectedMateriaId || null,
      });
      setResult(data);
      setProgress(100);
      toast.success('¡Presentación lista! 🎉');
    } catch (err) {
      const detail = err?.response?.data?.detail;
      const msg =
        (typeof detail === 'string' && detail.trim())
          ? detail
          : err?.response?.status === 502
            ? 'No hay conexión con el servicio de presentaciones (Presenton). Verifica backend y contenedor Presenton.'
            : 'No pudimos generar la presentación.';
      toast.error(msg);
      setStep(2); // volver al paso anterior para reintentar
    } finally {
      clearInterval(tick);
      setLoading(false);
    }
  };

  const handleRetry = () => {
    setResult(null);
    setStep(2);
  };

  const handleOpenEditor = async () => {
    if (!result?.edit_url) return;
    try {
      await openPresentonEditorWithSession(result);
    } catch {
      toast.error('No se pudo abrir el editor de Presenton');
    }
  };

  const handleCreateQuiz = async (materiaParaQuiz = result?.materia_id || selectedMateriaId) => {
    if (!result?.id) return;
    if (!materiaParaQuiz) {
      setQuizMateriaId('');
      setQuizModalOpen(true);
      return;
    }
    setCreatingQuiz(true);
    try {
      await api.post(`/presentaciones/${result.id}/quiz`, {
        materia_id: materiaParaQuiz,
        num_preguntas: 5,
      });
      toast.success('Quiz guardado en Mis Exámenes');
      setQuizModalOpen(false);
      navigate(`/profesor/examenes/${materiaParaQuiz}`);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'No pudimos generar el quiz');
    } finally {
      setCreatingQuiz(false);
    }
  };

  // ── Avance al paso 3 dispara la generación ──
  const goToStep3 = () => {
    setStep(3);
    handleGenerate();
  };

  // ════════════════════ RENDER ════════════════════
  return (
    <div className="max-w-3xl mx-auto pb-12">

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <Link
          to={materiaId ? `/profesor/materia/${materiaId}` : '/profesor/herramientas'}
          className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Volver
        </Link>
        <PageGuide
          storageKey="guide-profesor-generar-presentacion"
          steps={[
            { title: 'Empieza por el tema', body: 'Escribe de que trata la clase. Con una frase clara ya es suficiente para que la IA arranque.', selector: '[data-guide="presentacion-tema"]' },
            { title: 'Indica el grado', body: 'Marca el grado y las palabras, ejemplos e imagenes saldran al nivel justo para tus estudiantes.', selector: '[data-guide="presentacion-grado"]' },
            { title: 'Suma tu material (opcional)', body: 'Pega apuntes, DBA u orientaciones si quieres que las diapositivas sigan tu plan de clase.', selector: '[data-guide="presentacion-contexto"]' },
            { title: 'Cuantas diapositivas', body: 'Elige el numero que necesitas: si pides 12, recibes 12.', selector: '[data-guide="presentacion-cantidad"]' },
            { title: 'Escoge el estilo', body: 'Elige una plantilla. La moderna trae mas imagenes y una composicion mas visual.', selector: '[data-guide="presentacion-estilo"]' },
            { title: 'Crear y ajustar', body: 'Toca Crear presentacion. Al terminar podras descargar el PPTX o abrir el editor para retocar texto e imagenes.', selector: '[data-guide="presentacion-crear"]' },
          ]}
        />
      </div>

      {/* Title */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-profesor-100 mb-3">
          <Presentation className="w-7 h-7 text-profesor-600" />
        </div>
        <h1 className="page-title">Crear Presentación</h1>
        <p className="page-subtitle mt-2">
          Te ayudamos a hacer las diapositivas en {step < 3 ? `${step}/3 pasos` : '3 pasos'}
        </p>
      </div>

      <StepIndicator step={step} total={3} />

      {/* ═══════════ PASO 1 ═══════════ */}
      {step === 1 && (
        <div className="card-elevated animate-fade-up">
          <h2 className="text-xl font-bold text-gray-900 mb-1">
            ¿De qué se trata tu clase?
          </h2>
          <p className="text-sm text-gray-500 mb-6">
            Cuéntanos en pocas palabras. Si quieres, agregas notas para que las usemos.
          </p>

          {/* Tema */}
          <div className="mb-5">
            <label className="input-label text-base">
              Tema de la clase
              <HelpTip>
                Una frase corta que diga el tema. Ejemplo: "La fotosíntesis" o
                "Suma y resta de fracciones".
              </HelpTip>
            </label>
            <input
              data-guide="presentacion-tema"
              type="text"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Ejemplo: La fotosíntesis"
              autoFocus
              className="input-field text-base py-3"
              maxLength={300}
            />
            <p className="input-hint">Mínimo 3 caracteres.</p>
          </div>

          {/* Grado */}
          <div className="mb-5">
            <label className="input-label text-base">
              ¿Para qué grado?
              <HelpTip>
                Esto nos ayuda a usar palabras y ejemplos del nivel correcto.
                Si no estás seguro, déjalo en blanco.
              </HelpTip>
            </label>
            <div data-guide="presentacion-grado" className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setGrado('')}
                className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors
                  ${grado === '' ? 'bg-profesor-600 text-white border-profesor-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
              >
                Sin especificar
              </button>
              {GRADO_OPTIONS.map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => setGrado(g)}
                  className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors
                    ${grado === g ? 'bg-profesor-600 text-white border-profesor-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>

          {/* Notas (opcional) */}
          <div data-guide="presentacion-contexto" className="mb-2">
            <label className="input-label text-base">
              Tus notas o material (opcional)
              <HelpTip>
                Si tienes apuntes, definiciones o ejemplos, pégalos aquí. Los
                usaremos para que las diapositivas tengan tu contenido.
              </HelpTip>
            </label>
            <textarea
              value={contenido}
              onChange={(e) => setContenido(e.target.value)}
              rows={4}
              placeholder="Pega aquí tus apuntes (no es obligatorio)…"
              className="input-field text-sm py-3"
              maxLength={8000}
            />
            <p className="input-hint">{contenido.length} / 8000 caracteres</p>
          </div>

          {!materiaId && materias.length > 0 && (
            <div className="mb-5">
              <label className="input-label text-base">Materia relacionada (opcional)</label>
              <select className="input-field" value={selectedMateriaId} onChange={(e) => setSelectedMateriaId(e.target.value)}>
                <option value="">Sin materia</option>
                {materias.map((m) => (
                  <option key={m.id} value={m.id}>{m.nombre}</option>
                ))}
              </select>
              <p className="input-hint">Si eliges materia, usaremos sus DBA, plan curricular y documentos cargados.</p>
            </div>
          )}

          <div data-guide="presentacion-contexto" className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-2">
            <div>
              <label className="input-label text-base">DBA, estandar o lineamiento (opcional)</label>
              <textarea className="input-field text-sm resize-none" rows={3} value={dbaLineamiento}
                onChange={(e) => setDbaLineamiento(e.target.value)}
                placeholder="Ej: DBA, competencia, estandar o ley que debe tener en cuenta." />
            </div>
            <div>
              <label className="input-label text-base">Metodologia (opcional)</label>
              <textarea className="input-field text-sm resize-none" rows={3} value={metodologia}
                onChange={(e) => setMetodologia(e.target.value)}
                placeholder="Ej: aprendizaje basado en proyectos, clase invertida, trabajo colaborativo." />
            </div>
            <div>
              <label className="input-label text-base">Orientacion pedagogica (opcional)</label>
              <textarea className="input-field text-sm resize-none" rows={3} value={orientacion}
                onChange={(e) => setOrientacion(e.target.value)}
                placeholder="Ej: explicacion paso a paso, inclusion, trabajo en grupo." />
            </div>
            <div>
              <label className="input-label text-base">Enfoque de clase (opcional)</label>
              <textarea className="input-field text-sm resize-none" rows={3} value={enfoque}
                onChange={(e) => setEnfoque(e.target.value)}
                placeholder="Ej: introduccion, repaso, taller guiado, cierre evaluativo." />
            </div>
          </div>

          {/* Footer */}
          <div className="flex justify-end mt-8">
            <button
              type="button"
              onClick={() => setStep(2)}
              disabled={!canAdvanceStep1}
              className="btn-md bg-profesor-600 text-white hover:bg-profesor-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm hover:shadow-md focus-visible:ring-profesor-500 active:scale-[0.98]"
            >
              Continuar
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* ═══════════ PASO 2 ═══════════ */}
      {step === 2 && (
        <div className="card-elevated animate-fade-up space-y-8">
          <div>
            <h2 className="text-xl font-bold text-gray-900 mb-1">
              ¿Cómo la quieres?
            </h2>
            <p className="text-sm text-gray-500">
              Elige el tamaño y el estilo. Puedes cambiarlos después.
            </p>
          </div>

          {/* Tamaño */}
          <div>
            <h3 className="text-base font-semibold text-gray-700 mb-3 flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-gray-400" />
              ¿Cuántas diapositivas?
            </h3>
            <div data-guide="presentacion-cantidad" className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {TAMANOS.map((t) => (
                <BigCard
                  key={t.id}
                  emoji={t.id === 5 ? '⚡' : t.id === 8 ? '📚' : '📖'}
                  label={t.label}
                  desc={t.desc}
                  hint={t.hint}
                  selected={numSlides === t.id}
                  onClick={() => setNumSlides(t.id)}
                />
              ))}
            </div>
          </div>

          {/* Plantilla */}
          <div>
            <h3 className="text-base font-semibold text-gray-700 mb-3 flex items-center gap-2">
              <Palette className="w-4 h-4 text-gray-400" />
              ¿Qué estilo prefieres?
            </h3>
            <div data-guide="presentacion-estilo" className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {PLANTILLAS.map((p) => (
                <BigCard
                  key={p.id}
                  emoji={p.emoji}
                  label={p.label}
                  desc={p.desc}
                  selected={plantilla === p.id}
                  onClick={() => setPlantilla(p.id)}
                />
              ))}
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between pt-4 border-t border-gray-100">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="btn-md bg-white text-gray-700 border border-gray-300 hover:bg-gray-50"
            >
              <ArrowLeft className="w-4 h-4" />
              Atrás
            </button>
            <button
              type="button"
              onClick={goToStep3}
              data-guide="presentacion-crear"
              className="btn-md bg-profesor-600 text-white hover:bg-profesor-700 shadow-sm hover:shadow-md focus-visible:ring-profesor-500 active:scale-[0.98]"
            >
              <Wand2 className="w-4 h-4" />
              Crear presentación
            </button>
          </div>
        </div>
      )}

      {/* ═══════════ PASO 3 ═══════════ */}
      {step === 3 && (
        <div className="card-elevated animate-fade-up">
          {loading && (
            <div className="py-10 text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-profesor-100 mb-4">
                <Sparkles className="w-8 h-8 text-profesor-600 animate-pulse" />
              </div>
              <h2 className="text-xl font-bold text-gray-900 mb-2">
                Estamos creando tu presentación…
              </h2>
              <p className="text-sm text-gray-500 mb-6">
                Esto puede tardar entre 30 y 90 segundos. ¡Vale la pena la espera!
              </p>

              <div className="max-w-md mx-auto">
                <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-profesor-500 to-profesor-700 transition-all duration-500 ease-out"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <p className="text-xs text-gray-400 mt-2">{progress}%</p>
              </div>

              <p className="text-xs text-gray-400 mt-6 italic">
                💡 Tip: mientras tanto, prepara un café ☕
              </p>
            </div>
          )}

          {!loading && result && (
            <div data-guide="presentacion-resultado">
              <div className="flex items-center gap-3 mb-6">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-emerald-100">
                  <Check className="w-6 h-6 text-emerald-600" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900">¡Listo!</h2>
                  <p className="text-sm text-gray-500">
                    Tu presentación con {result.num_slides} diapositivas está lista.
                  </p>
                </div>
              </div>

              {/* Thumbnails */}
              {result.thumbnails && result.thumbnails.length > 0 && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                  {result.thumbnails.slice(0, 8).map((thumb, i) => (
                    <div
                      key={i}
                      className="aspect-video bg-gray-100 rounded-lg overflow-hidden border border-gray-200"
                    >
                      <img
                        src={thumb}
                        alt={`Diapositiva ${i + 1}`}
                        className="w-full h-full object-contain p-2"
                        loading="lazy"
                      />
                    </div>
                  ))}
                </div>
              )}

              {!result.thumbnails?.length && (
                <div className="bg-gray-50 border border-gray-200 rounded-xl p-6 text-center mb-6">
                  <Presentation className="w-12 h-12 text-gray-400 mx-auto mb-2" />
                  <p className="text-sm text-gray-600">
                    Tu presentación está lista para descargar.
                  </p>
                </div>
              )}

              {/* Action buttons */}
              <div className="flex flex-col sm:flex-row gap-3">
                {result.pptx_url && (
                  <a
                    href={result.pptx_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    download
                    className="
                      flex-1 inline-flex items-center justify-center gap-2
                      bg-gradient-to-r from-profesor-600 to-profesor-700
                      text-white font-semibold text-base rounded-xl py-4
                      shadow-md shadow-profesor-500/30 hover:shadow-lg
                      active:scale-[0.98] transition-all
                    "
                  >
                    <Download className="w-5 h-5" />
                    Descargar Presentación
                  </a>
                )}
                {result.edit_url && (
                  <button
                    type="button"
                    onClick={handleOpenEditor}
                    className="btn-md bg-white text-gray-700 border border-gray-300 hover:bg-gray-50"
                  >
                    <GraduationCap className="w-4 h-4" />
                    Editar manualmente
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => handleCreateQuiz()}
                  disabled={creatingQuiz}
                  className="btn-md bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100"
                >
                  {creatingQuiz ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileQuestion className="w-4 h-4" />}
                  Generar quiz
                </button>
                <button
                  type="button"
                  onClick={handleRetry}
                  className="btn-md bg-white text-gray-700 border border-gray-300 hover:bg-gray-50"
                >
                  <RefreshCw className="w-4 h-4" />
                  Hazla otra vez
                </button>
              </div>

              <p className="text-xs text-gray-400 text-center mt-6">
                Tu presentacion quedo guardada en la seccion <strong>Presentaciones</strong>.
              </p>
            </div>
          )}
        </div>
      )}

      {quizModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-xl border border-gray-200 p-5">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <h2 className="text-lg font-bold text-gray-900">Guardar quiz en una materia</h2>
                <p className="text-sm text-gray-500 mt-1">
                  El quiz quedará en Mis Exámenes para asignarlo o editarlo.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setQuizModalOpen(false)}
                className="rounded-lg p-2 text-gray-500 hover:bg-gray-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Materia</label>
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
              <button type="button" className="btn-secondary" onClick={() => setQuizModalOpen(false)}>
                Cancelar
              </button>
              <button
                type="button"
                className="btn-primary inline-flex items-center justify-center gap-2"
                disabled={!quizMateriaId || creatingQuiz}
                onClick={() => handleCreateQuiz(quizMateriaId)}
              >
                {creatingQuiz && <Loader2 className="w-4 h-4 animate-spin" />}
                Generar quiz
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
