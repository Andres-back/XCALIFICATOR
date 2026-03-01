import { useState, useCallback } from 'react';
import { BookOpen, Star, Users, Download, Printer, Palette, ImageIcon, RefreshCw, Paintbrush, Sun } from 'lucide-react';

/**
 * Educational Story (Cuento) display component.
 * Supports dual images: full-color illustration + B&W coloring page.
 *
 * Props:
 *   cuento: { texto, moraleja, personajes, imagen_url, imagen_url_color, imagen_url_colorear, image_prompt }
 *   titulo: string
 */
export default function Cuento({ cuento, titulo }) {
  const [imageMode, setImageMode] = useState('color'); // 'color' | 'colorear'
  const [loadedColor, setLoadedColor] = useState(false);
  const [loadedBW, setLoadedBW] = useState(false);
  const [errorColor, setErrorColor] = useState(false);
  const [errorBW, setErrorBW] = useState(false);
  const [retryColor, setRetryColor] = useState(0);
  const [retryBW, setRetryBW] = useState(0);

  if (!cuento) return <p className="text-gray-400 text-sm">Sin cuento disponible</p>;

  const texto = cuento.texto || '';
  const moraleja = cuento.moraleja || '';
  const personajes = cuento.personajes || [];
  const paragraphs = texto.split('\n\n').filter(p => p.trim());

  // ── URL migration (old image.pollinations.ai → gen.pollinations.ai) ──
  const POLLINATIONS_KEY = 'sk_E6l6TqFX76iKPEZ6qzXLd8lrDBk88wKo';
  const migrateUrl = (url) => {
    if (!url) return '';
    let u = url.replace('https://image.pollinations.ai/prompt/', 'https://gen.pollinations.ai/image/');
    if (!u.includes('key=')) u += `&key=${POLLINATIONS_KEY}`;
    return u;
  };

  // Resolve URLs – new cuentos have both, old ones only have imagen_url
  const rawColor = cuento.imagen_url_color || cuento.imagen_url || '';
  const rawBW    = cuento.imagen_url_colorear || '';
  const urlColor = migrateUrl(rawColor);
  const urlBW    = migrateUrl(rawBW);

  const hasColorImage = !!urlColor;
  const hasBWImage    = !!urlBW;
  const hasDualImages = hasColorImage && hasBWImage;

  const effectiveColorUrl = urlColor ? (retryColor > 0 ? `${urlColor}&_r=${retryColor}` : urlColor) : '';
  const effectiveBWUrl    = urlBW    ? (retryBW    > 0 ? `${urlBW}&_r=${retryBW}`       : urlBW)    : '';

  const currentUrl    = imageMode === 'color' ? effectiveColorUrl : effectiveBWUrl;
  const currentLoaded = imageMode === 'color' ? loadedColor : loadedBW;

  const retryImage = useCallback(() => {
    if (imageMode === 'color') { setErrorColor(false); setLoadedColor(false); setRetryColor(c => c + 1); }
    else                       { setErrorBW(false);    setLoadedBW(false);    setRetryBW(c => c + 1); }
  }, [imageMode]);

  /* ── Print entire cuento (uses color illustration) ── */
  const handlePrint = () => {
    const imgUrl = effectiveColorUrl || effectiveBWUrl;
    const pw = window.open('', '_blank');
    if (!pw) return;
    pw.document.write(`<!DOCTYPE html><html><head><title>${titulo || 'Cuento'}</title>
<style>
  body{font-family:Georgia,serif;max-width:700px;margin:40px auto;padding:20px;line-height:1.8;color:#333}
  h1{text-align:center;color:#4F46E5;font-size:28px;margin-bottom:30px}
  p{text-indent:2em;margin:12px 0;font-size:16px}
  .moraleja{margin-top:30px;padding:20px;background:#FEF3C7;border-left:4px solid #F59E0B;border-radius:8px;font-style:italic}
  .moraleja strong{color:#92400E}
  .img-c{text-align:center;margin:20px 0}
  .img-c img{max-width:100%;height:auto;border-radius:12px}
  .personajes{text-align:center;margin:15px 0;font-size:14px;color:#6B7280}
  @media print{body{margin:20px}}
</style></head><body>
  <h1>${titulo || 'Cuento'}</h1>
  ${personajes.length ? `<p class="personajes">Personajes: ${personajes.join(', ')}</p>` : ''}
  ${imgUrl ? `<div class="img-c"><img src="${imgUrl}" alt="Ilustración" /></div>` : ''}
  ${paragraphs.map(p => `<p>${p}</p>`).join('')}
  <div class="moraleja"><strong>✨ Moraleja:</strong> ${moraleja}</div>
</body></html>`);
    pw.document.close();
    if (imgUrl) {
      const img = new Image();
      img.onload  = () => setTimeout(() => pw.print(), 300);
      img.onerror = () => setTimeout(() => pw.print(), 800);
      img.src = imgUrl;
    } else { setTimeout(() => pw.print(), 300); }
  };

  /* ── Print ONLY the coloring page (B&W image) ── */
  const handlePrintColoringPage = () => {
    const imgUrl = effectiveBWUrl || effectiveColorUrl;
    if (!imgUrl) return;
    const pw = window.open('', '_blank');
    if (!pw) return;
    pw.document.write(`<!DOCTYPE html><html><head><title>Página para Colorear - ${titulo || 'Cuento'}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  html,body{width:100%;height:100%}
  body{display:flex;flex-direction:column;align-items:center;justify-content:center;padding:10mm}
  h2{font-family:'Comic Sans MS','Segoe UI',sans-serif;font-size:22px;text-align:center;margin-bottom:12px;color:#333}
  img{max-width:100%;max-height:calc(100vh - 60px);object-fit:contain;border-radius:8px}
  @media print{body{padding:5mm}h2{font-size:20px}}
</style></head><body>
  <h2>🎨 ${titulo || 'Página para colorear'}</h2>
  <img src="${imgUrl}" alt="Página para colorear" />
</body></html>`);
    pw.document.close();
    const img = new Image();
    img.onload  = () => setTimeout(() => pw.print(), 300);
    img.onerror = () => setTimeout(() => pw.print(), 1000);
    img.src = imgUrl;
  };

  const anyImage = hasColorImage || hasBWImage;

  /* ── Render helper for a single image panel ── */
  const renderImagePanel = (url, loaded, error, setLoaded, setError, retryKey, loadingIcon, loadingText) => (
    <>
      {!loaded && !error && (
        <div className="flex items-center justify-center py-16">
          <div className="text-center space-y-3">
            <div className="animate-pulse">{loadingIcon}</div>
            <p className="text-sm text-gray-400">{loadingText}</p>
          </div>
        </div>
      )}
      {error && (
        <div className="flex items-center justify-center py-12">
          <div className="text-center space-y-3">
            <Palette className="w-10 h-10 text-gray-300 mx-auto" />
            <p className="text-sm text-gray-400">No se pudo cargar la imagen</p>
            <button onClick={retryImage}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-violet-100 text-violet-700 rounded-lg text-xs font-medium hover:bg-violet-200 transition">
              <RefreshCw className="w-3.5 h-3.5" /> Reintentar
            </button>
          </div>
        </div>
      )}
      <img
        key={retryKey}
        src={url}
        alt={imageMode === 'colorear' ? 'Página para colorear' : 'Ilustración a color'}
        crossOrigin="anonymous"
        className={`w-full max-h-[28rem] object-contain transition-opacity duration-500 ${loaded ? 'opacity-100' : 'opacity-0 absolute'}`}
        onLoad={() => setLoaded(true)}
        onError={() => setError(true)}
      />
    </>
  );

  return (
    <div className="space-y-4">
      {/* Story header */}
      <div className="text-center">
        <div className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-violet-100 to-pink-100 rounded-full mb-3">
          <BookOpen className="w-4 h-4 text-violet-600" />
          <span className="text-sm font-semibold text-violet-700">Cuento Educativo</span>
        </div>
        {titulo && <h3 className="text-xl font-bold text-gray-900 mt-2">{titulo}</h3>}
      </div>

      {/* Characters */}
      {personajes.length > 0 && (
        <div className="flex items-center justify-center gap-2 flex-wrap">
          <Users className="w-4 h-4 text-gray-400" />
          <span className="text-xs text-gray-500">Personajes:</span>
          {personajes.map((p, i) => (
            <span key={i} className="px-2 py-0.5 bg-violet-50 text-violet-700 rounded-full text-xs font-medium border border-violet-200">{p}</span>
          ))}
        </div>
      )}

      {/* Illustration with optional mode toggle */}
      {anyImage && (
        <div className="space-y-2">
          {/* Tabs: color / coloring */}
          {hasDualImages && (
            <div className="flex justify-center">
              <div className="inline-flex bg-gray-100 rounded-xl p-1 gap-1">
                <button onClick={() => setImageMode('color')}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
                    imageMode === 'color' ? 'bg-white text-violet-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                  }`}>
                  <Sun className="w-3.5 h-3.5" /> A color
                </button>
                <button onClick={() => setImageMode('colorear')}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
                    imageMode === 'colorear' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                  }`}>
                  <Paintbrush className="w-3.5 h-3.5" /> Para colorear
                </button>
              </div>
            </div>
          )}

          {/* Image container */}
          <div className="relative rounded-2xl overflow-hidden bg-gradient-to-b from-gray-50 to-gray-100 border border-gray-200">
            {/* Color panel (visible when dual + color mode, or single-image fallback) */}
            {(hasDualImages ? imageMode === 'color' : hasColorImage) &&
              renderImagePanel(
                effectiveColorUrl, loadedColor, errorColor, setLoadedColor, setErrorColor,
                `color-${retryColor}`,
                <ImageIcon className="w-12 h-12 text-gray-300 mx-auto" />,
                'Generando ilustración a color…'
              )
            }
            {/* B&W panel (only in dual mode + colorear) */}
            {hasDualImages && imageMode === 'colorear' &&
              renderImagePanel(
                effectiveBWUrl, loadedBW, errorBW, setLoadedBW, setErrorBW,
                `bw-${retryBW}`,
                <Paintbrush className="w-12 h-12 text-gray-300 mx-auto" />,
                'Generando página para colorear…'
              )
            }

            {/* Badge bottom-right */}
            {currentLoaded && (
              <div className="absolute bottom-2 right-2">
                <span className="px-2 py-1 bg-black/40 text-white text-[10px] rounded-lg backdrop-blur-sm flex items-center gap-1">
                  <Palette className="w-3 h-3" /> Pollinations
                </span>
              </div>
            )}
            {/* Badge top-left for coloring mode */}
            {currentLoaded && imageMode === 'colorear' && (
              <div className="absolute top-2 left-2">
                <span className="px-2 py-1 bg-white/80 text-gray-700 text-[10px] rounded-lg backdrop-blur-sm font-semibold flex items-center gap-1">
                  <Paintbrush className="w-3 h-3" /> Para colorear
                </span>
              </div>
            )}
          </div>
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
          <p className="text-sm text-amber-900 font-medium italic mt-1 leading-relaxed">"{moraleja}"</p>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 justify-center flex-wrap">
        <button onClick={handlePrint}
          className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-200 transition">
          <Printer className="w-4 h-4" /> Imprimir cuento
        </button>
        {anyImage && (
          <button onClick={handlePrintColoringPage}
            className="flex items-center gap-2 px-4 py-2 bg-pink-100 text-pink-700 rounded-xl text-sm font-medium hover:bg-pink-200 transition">
            <Paintbrush className="w-4 h-4" /> Imprimir para colorear
          </button>
        )}
        {currentUrl && currentLoaded && (
          <a href={currentUrl} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-2 px-4 py-2 bg-violet-100 text-violet-700 rounded-xl text-sm font-medium hover:bg-violet-200 transition">
            <Download className="w-4 h-4" /> Descargar {imageMode === 'colorear' ? 'para colorear' : 'ilustración'}
          </a>
        )}
      </div>
    </div>
  );
}
