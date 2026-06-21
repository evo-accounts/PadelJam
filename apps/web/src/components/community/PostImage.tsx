'use client';
import { useEffect, useState } from 'react';
import { postImageUrl } from '@/lib/community-images';

export function PostImage({ path }: { path: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let on = true;
    postImageUrl(path).then((u) => {
      if (on) setUrl(u);
    });
    return () => {
      on = false;
    };
  }, [path]);
  if (!url) return <div className="h-48 w-full rounded-md bg-muted" />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt="" className="max-h-96 w-full rounded-md object-cover" />;
}
