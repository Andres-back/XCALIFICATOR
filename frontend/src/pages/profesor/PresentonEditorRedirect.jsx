import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AlertTriangle, Loader2 } from 'lucide-react';
import api from '../../api';

export default function PresentonEditorRedirect() {
  const { presentacionId } = useParams();
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    const openEditor = async () => {
      try {
        const { data } = await api.post(`/presentaciones/${presentacionId}/editor-ticket`);
        if (!data?.open_url) {
          throw new Error('Presentacion sin URL de apertura');
        }
        window.location.replace(data.open_url);
      } catch (err) {
        if (!active) return;
        const detail = err?.response?.data?.detail;
        setError(typeof detail === 'string' ? detail : 'No se pudo abrir el editor de Presenton.');
      }
    };

    openEditor();
    return () => {
      active = false;
    };
  }, [presentacionId]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="max-w-md w-full rounded-2xl border border-red-200 bg-white p-6 text-center shadow-sm">
          <AlertTriangle className="w-10 h-10 text-red-500 mx-auto mb-3" />
          <h1 className="text-lg font-semibold text-gray-900 mb-2">No se pudo abrir Presenton</h1>
          <p className="text-sm text-gray-600 mb-5">{error}</p>
          <Link to="/profesor/herramientas" className="btn-md bg-profesor-600 text-white hover:bg-profesor-700">
            Volver a herramientas
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="text-center">
        <Loader2 className="w-9 h-9 text-profesor-600 animate-spin mx-auto mb-3" />
        <p className="text-sm font-medium text-gray-700">Abriendo editor de Presenton...</p>
      </div>
    </div>
  );
}
