import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Muis Bakery POS",
    short_name: "Muis POS",
    description: "Offline-ready point of sale for Muis Bakery.",
    start_url: "/sales/pos",
    scope: "/",
    display: "standalone",
    background_color: "#faf7f1",
    theme_color: "#8f2636",
    icons: [
      {
        src: "/logo.JPG",
        sizes: "512x512",
        type: "image/jpeg",
      },
    ],
  };
}
