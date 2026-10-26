import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
    return {
        id: "/",
        name: "Daykit",
        short_name: "Daykit",
        description: "Jouw dagelijkse tools op één plek.",
        lang: "nl",
        start_url: "/",
        scope: "/",
        display: "standalone",
        background_color: "#080d1b",
        theme_color: "#080d1b",
        icons: [
            {
                src: "/apple-icon",
                sizes: "180x180",
                type: "image/png",
            },
        ],
    };
}