/**
 * TestimonialCard: card de testimonio con avatar (iniciales o imagen), cita, autor.
 * Usar en landing, sección "Casos de éxito", y dashboard de admin.
 */
import { Quote, Star } from 'lucide-react';

export default function TestimonialCard({
  name,
  role,
  institution,
  avatar,
  image,
  quote,
  rating = 5,
  variant = 'default', // default | light | dark
  className = '',
}) {
  const styles = {
    default: 'bg-white dark:bg-gray-900 border border-surface-border dark:border-gray-800 shadow-card',
    light:   'bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm border border-white/40 dark:border-gray-800 shadow-card',
    dark:    'bg-gray-900 border border-gray-800 text-white',
  };

  const textMuted = variant === 'dark' ? 'text-gray-400' : 'text-gray-500 dark:text-gray-400';
  const textBody  = variant === 'dark' ? 'text-gray-100' : 'text-gray-800 dark:text-gray-100';
  const quoteClr  = variant === 'dark' ? 'text-brand-400' : 'text-brand-500 dark:text-brand-400';

  return (
    <figure className={`relative rounded-2xl p-6 ${styles[variant]} ${className}`}>
      <Quote className={`absolute top-4 right-4 w-7 h-7 ${quoteClr} opacity-25`} />

      {rating > 0 && (
        <div className="flex items-center gap-0.5 mb-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Star
              key={i}
              className={`w-4 h-4 ${i < rating ? 'fill-amber-400 text-amber-400' : 'text-gray-300'}`}
            />
          ))}
        </div>
      )}

      <blockquote className={`text-sm leading-relaxed ${textBody} italic`}>
        "{quote}"
      </blockquote>

      <figcaption className="flex items-center gap-3 mt-5 pt-5 border-t border-gray-100 dark:border-gray-800">
        {image ? (
          <img
            src={image}
            alt={name}
            className="w-10 h-10 rounded-full object-cover ring-2 ring-white dark:ring-gray-900 shadow-sm"
          />
        ) : avatar ? (
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-brand-400 to-brand-600 text-white flex items-center justify-center text-sm font-bold">
            {avatar}
          </div>
        ) : (
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-brand-400 to-brand-600 text-white flex items-center justify-center text-sm font-bold">
            {name?.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()}
          </div>
        )}
        <div>
          <p className={`text-sm font-semibold ${variant === 'dark' ? 'text-white' : 'text-gray-900 dark:text-white'}`}>
            {name}
          </p>
          <p className={`text-xs ${textMuted}`}>
            {role}{role && institution ? ' · ' : ''}{institution}
          </p>
        </div>
      </figcaption>
    </figure>
  );
}
