'use client';
import { Star } from 'lucide-react';
export function StarRating({ value, onChange, size = 20 }: { value: number; onChange?: (v: number) => void; size?: number }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" disabled={!onChange} onClick={() => onChange?.(n)} className={onChange ? 'cursor-pointer' : 'cursor-default'} aria-label={`${n} stars`}>
          <Star size={size} className={n <= value ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground'} />
        </button>
      ))}
    </div>
  );
}
