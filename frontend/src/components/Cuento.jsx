import { useState, useCallback } from 'react';
import { BookOpen, Star, Users, Download, Printer, Palette, ImageIcon, RefreshCw } from 'lucide-react';

/**
 * Educational Story (Cuento) display component.
 * Props:
 *   cuento: { texto, moraleja, personajes, imagen_url, image_prompt }
 *   titulo: string
 */
export default function Cuento({ cuento, titulo }) {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  if (!cuento) return <p className="text-gray-400 text-sm">Sin cuento disponible</p>;

  const texto = cuento.texto || '';
  const moraleja = cuento.moraleja || '';
  const personajes = cuento.personajes || [];
  const rawImagenUrl = cuento.imagen_url || '';
  const paragraphs = texto.split('\n\n').filter(p => p.trim());

  // Auto-migrate old image.pollinations.ai URLs → gen.pollinations.ai
  const POLLINATIONS_KEY = 'sk_E6l6TqFX76iKPEZ6qzXLd8lrDBk88wKo';
  const migrateUrl = (url) => {
    if (!url) return '';
    // Fix old domain
    let u = url.replace('https://image.pollinations.ai/prompt/', 'https://gen.pollinations.ai/image/');
    // Append key if missing
    if (!u.includes('key=')) u += `&key=${POLLINATIONS_KEY}`;
    return u;
  };
  const imagenUrl = migrateUrl(rawImagenUrl);

  // Append a cache-bust param on retries so the browser actually re-fetches
  const effectiveUrl = imagenUrl
    ? (retryCount > 0 ? `${imagenUrl}&_r=${retryCount}` : imagenUrl)
    : '';

  const retryImage = useCallback(() => {
    setImageError(false);
    setImageLoaded(false);
    setRetryCount(c => c + 1);
  }, []);

  /* ── Print entire cuento ── */
  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>${titulo || 'Cuento'}</title>
        <style>
          body { font-family: Georgia, serif; max-width: 700px; margin: 40px auto; padding: 20px; line-height: 1.8; color: #333; }
          h1 { text-align: center; color: #4F46E5; font-size: 28px; margin-bottom: 30px; }
          p { text-indent: 2em; margin: 12px 0; font-size: 16px; }
          .moraleja { margin-top: 30px; padding: 20px; background: #FEF3C7; border-left: 4px solid #F59E0B; border-radius: 8px; font-style: italic; }
          .moraleja strong { color: #92400E; }
          .image-container { text-align: center; margin: 20px 0; }
          .image-container img { max-width: 100%; height: auto; border-radius: 12px; }
          .personajes { text-align: center; margin: 15px 0; font-size: 14px; color: #6B7280; }
          @media print { body { margin: 20px; } }
        </style>
      </head>
      <body>
        <h1>${titulo || 'Cuento'}</h1>
        ${personajes.length > 0 ? `<p class="personajes">Personajes: ${personajes.join(', ')}</p>` : ''}
        ${effectiveUrl ? `<div class="image-container"><img src="${effectiveUrl}" alt="Ilustración del cuento" /></div>` : ''}
        ${paragraphs.map(p => `<p>${p}</p>`).join('')}
        <div class="moraleja">
          <strong>✨ Moraleja:</strong> ${moraleja}
        </div>
      </body>
      </html>
    `);
    printWindow.document.close();
    setTimeout(() => printWindow.print(), 800);
  };

  /* ── Print ONLY the coloring-page image ── */
  const handlePrintColoringPage = () => {
    if (!effectiveUrl) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Página para Colorear - ${titulo || 'Cuento'}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          html, body { width: 100%; height: 100%; }
          body { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 10mm; }
          h2 { font-family: 'Comic Sans MS', 'Segoe UI', sans-serif; font-size: 22px; text-align: center; margin-bottom: 12px; color: #4F46E5; }
          img { max-width: 100%; max-height: calc(100vh - 60px); object-fit: contain; border-radius: 12px; }
          @media print {
            body { padding: 5mm; }
            h2 { font-size: 20px; margin-bottom: 8px; }
          }
        </style>
      </head>
      <body>
        <h2>🎨 ${titulo || 'Página para colorear'}</h2>
        <img src="${effectiveUrl}" alt="Página para colorear" />
      </body>
      </html>
    `);
    printWindow.document.close();
    // Wait a bit longer so the image loads before printing
    const img = new Image();
    img.onload = () => setTimeout(() => printWindow.print(), 300);
    img.onerror = () => setTimeout(() => printWindow.print(), 1000);
    img.src = effectiveUrl;
  };

  return (
    <div className="space-y-4">
      {/* Story header */}
      <div className="text-center">
        <div className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-violet-100 to-pink-100 rounded-full mb-3">
          <BookOpen className="w-4 h-4 text-violet-600" />
          <span className="text-sm font-semibold text-violet-700">Cuento Educativo</span>
        </div>
        {titulo && (
          <h3 className="text-xl font-bold text-gray-900 mt-2">{titulo}</h3>
        )}
      </div>

      {/* Characters */}
      {personajes.length > 0 && (
        <div className="flex items-center justify-center gap-2 flex-wrap">
          <Users className="w-4 h-4 text-gray-400" />
          <span className="text-xs text-gray-500">Personajes:</span>
          {personajes.map((p, i) => (
            <span key={i} className="px-2 py-0.5 bg-violet-50 text-violet-700 rounded-full text-xs font-medium border border-violet-200">
              {p}
            </span>
          ))}
        </div>
      )}

      {/* Illustration */}
      {imagenUrl && (
        <div className="relative rounded-2xl overflow-hidden bg-gradient-to-b from-gray-50 to-gray-100 border border-gray-200">
          {!imageLoaded && !imageError && (
            <div className="flex items-center justify-center py-16">
              <div className="text-center space-y-3">
                <div className="animate-pulse">
                  <ImageIcon className="w-12 h-12 text-gray-300 mx-auto" />
                </div>
                <p className="text-sm text-gray-400">Generando ilustración…</p>
              </div>
            </div>
          )}
          {imageError && (
            <div className="flex items-center justify-center py-12">
              <div className="text-center space-y-3">
                <Palette className="w-10 h-10 text-gray-300 mx-auto" />
                <p className="text-sm text-gray-400">La ilustración no pudo cargarse</p>
                <button
                  onClick={retryImage}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-violet-100 text-violet-700 rounded-lg text-xs font-medium hover:bg-violet-200 transition"
                >
                  <RefreshCw className="w-3.5 h-3.5" /> Reintentar
                </button>
              </div>
            </div>
          )}
          <img
            key={retryCount}
            src={effectiveUrl}
            alt="Ilustración del cuento"
            crossOrigin="anonymous"
            className={`w-full max-h-96 object-contain transition-opacity duration-500 ${imageLoaded ? 'opacity-100' : 'opacity-0 absolute'}`}
            onLoad={() => setImageLoaded(true)}
            onError={() => setImageError(true)}
          />
          {imageLoaded && (
            <div className="absolute bottom-2 right-2">
              <span className="px-2 py-1 bg-black/40 text-white text-[10px] rounded-lg backdrop-blur-sm flex items-center gap-1">
                <Palette className="w-3 h-3" /> IA · Pollinations
              </span>
            </div>
          )}
        </div>
      )}

      {/* Story text */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
        <div className="prose prose-sm max-w-none">
          {paragraphs.map((paragraph, i) => (
            <p key={i} className="text-gray-700 leading-relaxed mb-4 first-letter:text-2xl first-letter:font-bold first-letter:text-violet-600 first-letter:mr-1">
              {paragraph}
            </p>
          ))}
        </div>
      </div>

      {/* Moral / Lesson */}
      {moraleja && (
        <div className="relative p-5 bg-gradient-to-r from-amber-50 to-yellow-50 border-2 border-amber-200 rounded-2xl">
          <div className="absolute -top-3 left-4">
            <span className="inline-flex items-center gap-1 px-3 py-1 bg-amber-400 text-amber-900 rounded-full text-xs font-bold shadow-sm">
              <Star className="w-3 h-3" /> Moraleja
            </span>
          </div>
          <p className="text-sm text-amber-900 font-medium italic mt-1 leading-relaxed">
            "{moraleja}"
          </p>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 justify-center flex-wrap">
        <button
          onClick={handlePrint}
          className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-200 transition"
        >
          <Printer className="w-4 h-4" /> Imprimir cuento
        </button>
        {imagenUrl && (
          <button
            onClick={handlePrintColoringPage}
            className="flex items-center gap-2 px-4 py-2 bg-pink-100 text-pink-700 rounded-xl text-sm font-medium hover:bg-pink-200 transition"
          >
            <Palette className="w-4 h-4" /> Imprimir para colorear
          </button>
        )}
        {imagenUrl && imageLoaded && (
          <a
            href={effectiveUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-4 py-2 bg-violet-100 text-violet-700 rounded-xl text-sm font-medium hover:bg-violet-200 transition"
          >
            <Download className="w-4 h-4" /> Descargar ilustración
          </a>
        )}
      </div>
    </div>
  );
}
