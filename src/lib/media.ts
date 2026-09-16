/**
 * The landing's photography. Two sources, both about this city:
 * - real: USDA NAIP 2022 orthoimagery (public domain) of the Anderson Mill /
 *   Westwood neighborhood, and the City of Austin's own sidewalk assessment
 *   drawn over it (City of Austin Open Data, dataset vchz-d9ng);
 * - rendered: path-traced close-ups of the project's street model
 *   (render/ in the repo), showing the exact defects the copy describes.
 * Files live in public/media; a missing file degrades to a quiet olive
 * panel rather than a broken image. Alt text is written as a caption.
 */
export const MEDIA = {
  hero: {
    mp4: "/media/hero.mp4",
    webm: "/media/hero.webm",
    poster: "/media/hero-poster.webp",
    alt: "Late afternoon over a Northwest Austin street, descending toward a cracked, lifted sidewalk panel.",
  },
  stills: {
    conditions: {
      src: "/media/conditions.webp",
      alt: "Aerial photo of the Anderson Mill and Westwood neighborhood with every sidewalk segment drawn in the City's own colors: green where it rates functionally acceptable, red where it rates functionally deficient. Red dominates the residential streets.",
      caption:
        "The City's own assessment of one Northwest Austin neighborhood (Anderson Mill and Westwood, assessed 2020). Green segments rate functionally acceptable, red functionally deficient, gray pending. Imagery: USDA NAIP, 2022. Assessment: City of Austin Open Data.",
    },
    aerialReal: {
      src: "/media/aerial-real.webp",
      alt: "Straight-down aerial photo of an Anderson Mill neighborhood: curving residential streets, live oak canopy, an elementary school, and the thin lines of sidewalks along some blocks and not others.",
      caption: "Anderson Mill, Northwest Austin, from above. Imagery: USDA NAIP, 2022.",
    },
    neverBuilt: {
      src: "/media/never-built.webp",
      alt: "Aerial photo of a residential street in Anderson Mill with houses, driveways and lawns on both sides and no sidewalk along either curb.",
      caption: "A residential street the City lists no sidewalk segment on, either side. Imagery: USDA NAIP, 2022. Sidewalk inventory: City of Austin Open Data.",
    },
    failing: {
      src: "/media/failing.webp",
      alt: "Aerial photo of a few residential blocks with the City's sidewalk scores drawn over them: nearly every segment is red, functionally deficient.",
      caption: "The blocks with the most functionally deficient segments in the neighborhood, by the City's own 2020 scores.",
    },
    aerial: {
      src: "/media/aerial.webp",
      alt: "A Northwest Austin street from above at golden hour: houses, live oaks, and the sidewalk running past them.",
    },
    missing: {
      src: "/media/missing.webp",
      alt: "A sidewalk that ends in dirt, with a CapMetro bus stop standing in the grass and no pavement leading to it.",
    },
    broken: {
      src: "/media/broken.webp",
      alt: "A concrete sidewalk panel cracked through and lifted at one edge, in long afternoon light.",
    },
    falls: {
      src: "/media/falls.webp",
      alt: "A live oak's roots heaving two sidewalk panels, a wooden cane lying on the lifted slab.",
    },
    precedent: {
      src: "/media/precedent.webp",
      alt: "A half-inch lip between two panels, ringed in orange inspector's paint.",
    },
    count: {
      src: "/media/count.webp",
      alt: "A freshly poured, verified-fixed sidewalk panel with a green map pin planted beside it.",
    },
    bus: {
      src: "/media/bus.webp",
      alt: "A CapMetro bus stopped at a stop that no sidewalk reaches.",
    },
  },
} as const;

export type StillId = keyof typeof MEDIA.stills;
