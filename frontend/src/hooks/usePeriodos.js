import { useState, useEffect } from 'react';
import api from '../api';
import toast from 'react-hot-toast';

export function usePeriodos() {
  const [periodos, setPeriodos] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/periodos/')
      .then(res => setPeriodos(res.data))
      .catch(() => toast.error('Error cargando períodos'))
      .finally(() => setLoading(false));
  }, []);

  const sorted = [...periodos].sort((a, b) => a.numero - b.numero);

  return { periodos: sorted, loading };
}
