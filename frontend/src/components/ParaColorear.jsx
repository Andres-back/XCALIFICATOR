import { Download, Printer, Palette } from 'lucide-react';

export default function ParaColorear({ data, titulo }) {
  const imagen = data?.imagen_url;
  const descripcion = data?.descripcion || '';

  const handlePrint = () => {
    const w = window.open('', '_blank', 'width=900,height=700');
    if (!w) return;
    w.document.write(`<!DOCTYPE html><html><head><title>${titulo || 'Para Colorear'}</title>
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700&display=swap');
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Poppins', sans-serif; text-align: center; padding: 20px; }
        h1 { font-size: 22px; font-weight: 700; margin-bottom: 8px; }
        .desc { font-size: 13px; color: #666; margin-bottom: 16px; }
        img { max-width: 100%; max-height: 85vh; border: 2px solid #e5e7eb; border-radius: 12px; }
        @media print {
          body { padding: 0; }
          img { border: 1px solid #ccc; max-height: 90vh; }
        }
      </style>
    </head><body>
      <h1>${titulo || 'Para Colorear'}</h1>
      ${descripcion ? `<p class="desc">${descripcion}</p>` : ''}
      <img src="${imagen}" alt="Para colorear" />
      <script>
        const img = document.querySelector('img');
        img.onload = () => { window.print(); };
        img.onerror = () => { window.print(); };
        setTimeout(() => window.print(), 5000);
      </script>
    </body></html>`);
    w.document.close();
  };

  const handleDownload = async () => {
    if (!imagen) return;
    try {
      const res = await fetch(imagen);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${(titulo || 'para-colorear').replace(/\s+/g, '_')}.png`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      window.open(imagen, '_blank');
    }
  };

  if (!imagen) {
    return (
      <div className="text-center py-8 text-gray-400">
        <Palette className="w-10 h-10 mx-auto mb-2 opacity-50" />
        <p className="text-sm">No se encontró imagen para colorear</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {descripcion && (
        <p className="text-sm text-gray-500 italic text-center">{descripcion}</p>
      )}
      <div className="flex justify-center">
        <img
          src={imagen}
          alt={titulo || 'Para colorear'}
          className="max-w-full max-h-[500px] rounded-xl border border-gray-200 shadow-sm"
          loading="lazy"
        />
      </div>
      <div className="flex justify-center gap-2 pt-2">
        <button onClick={handleDownload}
          className="btn-secondary text-xs flex items-center gap-1.5">
          <Download className="w-3.5 h-3.5" /> Descargar
        </button>
        <button onClick={handlePrint}
          className="btn-secondary text-xs flex items-center gap-1.5">
          <Printer className="w-3.5 h-3.5" /> Imprimir
        </button>
      </div>
    </div>
  );
}
