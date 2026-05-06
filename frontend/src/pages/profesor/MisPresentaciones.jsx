/**
 * MisPresentaciones — Galería de presentaciones del docente.
 *
 * Lista todas las presentaciones generadas (clase, repaso, boletín),
 * agrupadas por tipo, con thumbnails clickeables y acciones rápidas:
 *  - Descargar
 *  - Abrir editor (si Presenton lo expone)
 *  - Eliminar
 *  - "+" para crear una nueva (lleva al wizard)
 *
 * Diseñada para ser amable con profesores mayores: tarjetas grandes,
 * un solo click por acción, copy claro.
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api';
import toast from 'react-hot-toast';
import {
  Download, Plus, Presentation, RefreshCw, Trash2,
  Sparkles, Calendar, GraduationCap, Loader2, Image,
  ExternalLink, ArrowRight,
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import EmptyState from '../../components/EmptyState';
import ConfirmDialog from '../../components/ConfirmDialog';

// ── Subtipo → metadata visual ─────────────────────────────────────────
const SUBTYPE_META = {
  clase:           { label: 'Clase',        emoji: '📘', color: 'profesor' },
  repaso_examen:   { label: 'Repaso',       emoji: '🎯', color: 'amber'    },
  boletin_periodo: { label: 'Boletín',      emoji: '📊', color: 'emerald'  },
  default:         { label: 'Presentación', emoji: '✨', color: 'profesor' },
};

const COLOR_CLASSES = {
  profesor: { bg: 'bg-profesor-50', text: 'text-profesor-700', border: 'border-profesor-200' },
  amber:    { bg: 'bg-amber-50',    text: 'text-amber-700',    border: 'border-amber-200'    },
  emerald:  { bg: 'bg-emerald-50',  text: 'text-emerald-700',  border: 'border-emerald-200'  },
};

// ── Card de una presentación ──────────────────────────────────────────
function PresentationCard({ pres, onDelete }) {
  const meta = SUBTYPE_META[pres.subtipo] || SUBTYPE_META.default;
  const colors = COLOR_CLASSES[meta.color] || COLOR_CLASSES.profesor;
  const thumb = pres.thumbnails?.[0];
  const created = pres.created_at ? new Date(pres.created_at) : null;
  const [openingEditor, setOpeningEditor] = useState(false);

  const handleOpenEditor = async () => {
    if (!pres.edit_url) return;
    setOpeningEditor(true);
    try {
      const res = await api.get('/presentaciones/presenton-token');
      const token = res.data.token;
      document.cookie = `presenton_session=${token}; path=/; SameSite=Lax; max-age=86400`;
    } catch {
      // Si falla la obtención del token, el usuario verá el login de Presenton
    } finally {
      setOpeningEditor(false);
    }
    window.open(pres.edit_url, '_blank', 'noopener,noreferrer');
  };

  return (
    <article className="
      group bg-white rounded-2xl border border-surface-border overflow-hidden
      shadow-card hover:shadow-card-md hover:-translate-y-0.5 transition-all duration-200
    ">
      {/* Thumbnail */}
      <div className={`aspect-video ${colors.bg} flex items-center justify-center relative overflow-hidden`}>
        {thumb ? (
          <img
            src={thumb}
            alt={pres.titulo}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="flex flex-col items-center gap-2 text-gray-400">
            <Presentation className={`w-12 h-12 ${colors.text} opacity-60`} />
            <span className="text-xs font-medium">{pres.num_slides || '?'} diapositivas</span>
          </div>
        )}
        {/* Badge de tipo */}
        <span className={`
          absolute top-3 left-3 inline-flex items-center gap-1
          px-2.5 py-1 rounded-full text-xs font-semibold
          bg-white/90 backdrop-blur-sm ${colors.text} border ${colors.border}
        `}>
          <span>{meta.emoji}</span>
          {meta.label}
        </span>
      </div>

      {/* Body */}
      <div className="p-4">
        <h3 className="font-bold text-gray-900 line-clamp-2 leading-tight mb-2" title={pres.titulo}>
          {pres.titulo}
        </h3>

        <div className="flex items-center gap-3 text-xs text-gray-500 mb-3">
          {created && (
            <span className="inline-flex items-center gap-1" title={format(created, 'PPpp', { locale: es })}>
              <Calendar className="w-3 h-3" />
              {formatDistanceToNow(created, { locale: es, addSuffix: true })}
            </span>
          )}
          {pres.num_slides > 0 && (
            <span className="inline-flex items-center gap-1">
              <Image className="w-3 h-3" />
              {pres.num_slides} slides
            </span>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          {pres.pptx_url && (
            <a
              href={pres.pptx_url}
              download
              target="_blank"
              rel="noopener noreferrer"
              className="
                flex-1 inline-flex items-center justify-center gap-1.5
                bg-profesor-600 hover:bg-profesor-700 text-white
                font-semibold text-xs rounded-lg py-2 px-3 transition-colors
              "
            >
              <Download className="w-3.5 h-3.5" />
              Descargar
            </a>
          )}
          {pres.edit_url && (
            <button
              type="button"
              onClick={handleOpenEditor}
              disabled={openingEditor}
              title="Abrir editor de Presenton"
              className="inline-flex items-center justify-center gap-1.5 border border-gray-300 hover:bg-gray-50 text-gray-600 rounded-lg p-2 transition-colors disabled:opacity-60"
            >
              {openingEditor
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <ExternalLink className="w-3.5 h-3.5" />}
            </button>
          )}
          <button
            type="button"
            onClick={() => onDelete(pres)}
            title="Eliminar"
            className="inline-flex items-center justify-center border border-gray-300 hover:bg-red-50 hover:border-red-300 hover:text-red-600 text-gray-500 rounded-lg p-2 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </article>
  );
}

// ── Página principal ─────────────────────────────────────────────────
export default function MisPresentaciones() {
  const [items, setItems]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter]   = useState('all'); // all | clase | repaso_examen | boletin_periodo
  const [confirm, setConfirm] = useState(null);   // presentación a eliminar

  const fetchItems = async () => {
    try {
      setLoading(true);
      const { data } = await api.get('/presentaciones/mias', { params: { limit: 100 } });
      // El backend ya expone `subtipo` directamente en el schema PresentacionOut
      setItems(data || []);
    } catch (err) {
      toast.error('No pudimos cargar tus presentaciones');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchItems(); }, []);

  const handleDelete = async () => {
    if (!confirm) return;
    try {
      await api.delete(`/presentaciones/${confirm.id}`);
      toast.success('Presentación eliminada');
      setItems((prev) => prev.filter((x) => x.id !== confirm.id));
    } catch {
      toast.error('No pudimos eliminar');
    } finally {
      setConfirm(null);
    }
  };

  const filtered = filter === 'all' ? items : items.filter((p) => p.subtipo === filter);

  // ── Conteos por tipo ──────────────────────────────────────────────
  const counts = items.reduce((acc, p) => {
    acc[p.subtipo] = (acc[p.subtipo] || 0) + 1;
    return acc;
  }, {});

  const FILTER_TABS = [
    { id: 'all',             label: 'Todas',     count: items.length },
    { id: 'clase',           label: 'Clases',    count: counts.clase || 0 },
    { id: 'repaso_examen',   label: 'Repasos',   count: counts.repaso_examen || 0 },
    { id: 'boletin_periodo', label: 'Boletines', count: counts.boletin_periodo || 0 },
  ];

  // ── RENDER ──────────────────────────────────────────────────────
  return (
    <div className="max-w-6xl mx-auto pb-12">

      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <Presentation className="w-7 h-7 text-profesor-600" />
            Mis Presentaciones
          </h1>
          <p className="page-subtitle mt-1">
            Todas las diapositivas que has generado, listas para descargar o reusar.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={fetchItems}
            disabled={loading}
            title="Actualizar"
            className="btn-md bg-white text-gray-700 border border-gray-300 hover:bg-gray-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <Link
            to="/profesor/presentacion"
            className="
              inline-flex items-center gap-2 font-semibold text-sm rounded-lg
              px-4 py-2.5 shadow-sm hover:shadow-md transition-all
              bg-gradient-to-r from-profesor-600 to-profesor-700 text-white
              hover:from-profesor-700 hover:to-profesor-800 active:scale-[0.98]
            "
          >
            <Plus className="w-4 h-4" />
            Nueva presentación
          </Link>
        </div>
      </div>

      {/* Filter tabs */}
      {!loading && items.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1 mb-5">
          {FILTER_TABS.map((tab) => {
            const active = filter === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setFilter(tab.id)}
                className={`
                  shrink-0 inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm
                  font-medium transition-colors
                  ${active
                    ? 'bg-profesor-100 text-profesor-700 ring-1 ring-profesor-200'
                    : 'bg-white text-gray-600 hover:bg-gray-50 border border-gray-200'}
                `}
              >
                {tab.label}
                <span className={`text-xs font-semibold ${active ? 'text-profesor-600' : 'text-gray-400'}`}>
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-white rounded-2xl border border-surface-border overflow-hidden">
              <div className="aspect-video skeleton rounded-none" />
              <div className="p-4 space-y-3">
                <div className="skeleton h-4 w-3/4" />
                <div className="skeleton h-3 w-1/2" />
                <div className="skeleton h-9 w-full" />
              </div>
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="card-elevated text-center py-12 px-6">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-profesor-50 mb-4">
            <Sparkles className="w-8 h-8 text-profesor-600" />
          </div>
          <h2 className="text-lg font-bold text-gray-900 mb-2">
            Aún no has creado presentaciones
          </h2>
          <p className="text-sm text-gray-500 mb-6 max-w-md mx-auto">
            Crea slides para tus clases, repasos de examen o reuniones de padres.
            Te ayudamos a hacerlas en 3 pasos.
          </p>
          <Link
            to="/profesor/presentacion"
            className="
              inline-flex items-center gap-2 font-semibold text-sm rounded-lg
              px-5 py-3 shadow-sm hover:shadow-md transition-all
              bg-gradient-to-r from-profesor-600 to-profesor-700 text-white
              hover:from-profesor-700 hover:to-profesor-800 active:scale-[0.98]
            "
          >
            <Sparkles className="w-4 h-4" />
            Crear mi primera presentación
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      ) : filtered.length === 0 ? (
        <div className="card-flat text-center py-10">
          <p className="text-sm text-gray-500">
            No hay presentaciones en esta categoría.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map((pres) => (
            <PresentationCard
              key={pres.id}
              pres={pres}
              onDelete={(p) => setConfirm(p)}
            />
          ))}
        </div>
      )}

      {/* Confirm delete */}
      <ConfirmDialog
        open={!!confirm}
        title="¿Eliminar presentación?"
        message={confirm ? `Esta acción borrará "${confirm.titulo}" y no se puede deshacer.` : ''}
        confirmText="Sí, eliminar"
        variant="danger"
        onConfirm={handleDelete}
        onClose={() => setConfirm(null)}
      />
    </div>
  );
}
