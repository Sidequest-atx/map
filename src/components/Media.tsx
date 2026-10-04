import { useState, type ReactNode } from "react";
import { useReducedMotion } from "motion/react";
import { MEDIA, stillClip, type StillId } from "../lib/media";

/** A still from public/media. Until the file exists (or if it ever 404s) the
    frame stays a quiet olive panel instead of a broken image. With `caption`
    (or the entry's own caption) it renders as a figure. A slot with a
    published Runway clip plays it as a silent loop over its poster; reduced
    motion keeps the poster. */
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
  const clip = stillClip(id);
  const reduced = useReducedMotion();
  const [missing, setMissing] = useState(false);
  const [clipFailed, setClipFailed] = useState(false);
  const playing = clip && !clipFailed && !reduced;
  const box = (
    <div className={`still ${missing ? "still--pending" : ""} ${className}`.trim()}>
      {!missing && (
        <img
          src={clip && !clipFailed ? clip.poster : m.src}
          alt={(clip && !clipFailed && clip.alt) || m.alt}
          loading={priority ? "eager" : "lazy"}
          decoding="async"
          fetchPriority={priority ? "high" : "auto"}
          onError={() => (clip && !clipFailed ? setClipFailed(true) : setMissing(true))}
        />
      )}
      {playing && (
        <video autoPlay muted loop playsInline preload="metadata" poster={clip.poster} aria-hidden onError={() => setClipFailed(true)}>
          <source src={clip.webm} type="video/webm" />
          <source src={clip.mp4} type="video/mp4" />
        </video>
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
