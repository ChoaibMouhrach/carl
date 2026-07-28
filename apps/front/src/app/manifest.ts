import type { MetadataRoute } from "next";
import en from "@repo/i18n/messages/en";

export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: en.metadata.siteName,
    short_name: en.metadata.siteName,
    description: en.metadata.description,
    start_url: "/",
    display: "standalone",
    background_color: "#0a0a0a",
    theme_color: "#6d28d9",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
