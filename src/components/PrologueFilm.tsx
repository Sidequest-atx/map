/**
 * The real Austin: licensed aerial drone footage plays the opening beats
 * (down Lady Bird Lake with the kayakers, then the downtown rise), holding
 * its last frame until scroll hands off to the sidewalk story. Video decodes
 * everywhere — including machines whose WebGL is software-rendered and would
 * otherwise only ever see the static poster.
 *
 * Footage: Pexels free license — "Drone Task Force" (lake), Yasin Caylak
 * (downtown). Credited in the site footer.
 */
import { useEffect, useRef, useState } from "react";

const CLIPS = ["pro-lake", "pro-downtown"];

/** Phones and narrow windows get the 1280-wide cut: 2.5MB instead of 10MB,
    indistinguishable at that density behind the scrim. Chosen once at mount —
    a resize mid-prologue isn't worth restarting the film for. */
function useClipSrcs() {
  const [small] = useState(() => typeof matchMedia !== "undefined" && matchMedia("(max-width: 1023px)").matches);
  return CLIPS.map((name) => `/prologue/${name}${small ? "-sm" : ""}.mp4`);
}

export function PrologueFilm() {
  const srcs = useClipSrcs();
  const [idx, setIdx] = useState(0);
  /** The opening clip owns the bandwidth until it is actually playing; only
      then does the second start buffering. It has the whole first clip to
      arrive, so the crossfade never waits on the network. */
  const [armNext, setArmNext] = useState(false);
  const v0 = useRef<HTMLVideoElement>(null);
  const v1 = useRef<HTMLVideoElement>(null);
  const refs = [v0, v1];

  useEffect(() => {
    refs[idx].current?.play().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx]);

  return (
    <div className="absolute inset-0 overflow-hidden" aria-hidden>
      {srcs.map((src, i) => (
        <video
          key={src}
          ref={refs[i]}
          src={src}
          muted
          playsInline
          preload={i === 0 || armNext ? "auto" : "none"}
          poster={i === 0 ? "/prologue/pro-poster.jpg" : undefined}
          autoPlay={i === 0}
          onPlaying={() => i === 0 && setArmNext(true)}
          onEnded={() => {
            // the last clip pauses on its final frame — the hold before descent
            if (i < CLIPS.length - 1) setIdx(i + 1);
          }}
          className="absolute inset-0 h-full w-full object-cover transition-opacity duration-700"
          style={{ opacity: i === idx ? 1 : 0 }}
        />
      ))}
    </div>
  );
}
