import { useState, type ReactNode } from "react";
import { MEDIA, type StillId } from "../lib/media";

/** A still from public/media. Until the file exists (or if it ever 404s) the
    frame stays a quiet olive panel instead of a broken image. With `caption`
    (or the entry's own caption) it renders as a figure. */
export function Still({
  id,
  className = "",
  priority = false,
  caption,
  captioned = false,
}: {
  id: StillId;
  className?: string;
  priority?: boolean;
  caption?: ReactNode;
  captioned?: boolean;
}) {
  const m = MEDIA.stills[id] as { src: string; alt: string; caption?: string };
  const [missing, setMissing] = useState(false);
  const box = (
    <div className={`still ${missing ? "still--pending" : ""} ${className}`.trim()}>
      {!missing && (
        <img
          src={m.src}
          alt={m.alt}
          loading={priority ? "eager" : "lazy"}
          decoding="async"
          fetchPriority={priority ? "high" : "auto"}
          onError={() => setMissing(true)}
        />
      )}
    </div>
  );
  const cap = caption ?? (captioned ? m.caption : undefined);
  if (!cap) return box;
  return (
    <figure className="figure">
      {box}
      <figcaption className="still-cap">{cap}</figcaption>
    </figure>
  );
}
