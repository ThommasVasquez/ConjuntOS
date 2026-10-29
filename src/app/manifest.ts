import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ConjuntOS®",
    short_name: "ConjuntOS®",
    description: "Plataforma de gestión residencial inteligente para copropiedades modernas.",
    start_url: "/inicio",
    scope: "/",
    display: "standalone",
    background_color: "#08090d",
    theme_color: "#08090d",
    icons: [
      {
        src: "/icons/icon-192-dark.png",
        sizes: "192x192",
        type: "image/png",
        // @ts-expect-error — `media` not in MetadataRoute.Manifest type yet but valid in W3C spec
        media: "(prefers-color-scheme: dark)",
      },
      {
        src: "/icons/icon-512-dark.png",
        sizes: "512x512",
        type: "image/png",
        // @ts-expect-error — `media` not in MetadataRoute.Manifest type yet but valid in W3C spec
        media: "(prefers-color-scheme: dark)",
      },
      {
        src: "/icons/icon-192-light.png",
        sizes: "192x192",
        type: "image/png",
        // @ts-expect-error — `media` not in MetadataRoute.Manifest type yet but valid in W3C spec
        media: "(prefers-color-scheme: light)",
      },
      {
        src: "/icons/icon-512-light.png",
        sizes: "512x512",
        type: "image/png",
        // @ts-expect-error — `media` not in MetadataRoute.Manifest type yet but valid in W3C spec
        media: "(prefers-color-scheme: light)",
      },
      {
        src: "/icons/icon-512-dark.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
