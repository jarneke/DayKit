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
        background_color: "#f6f3ef",
        theme_color: "#f6f3ef",
        icons: [
            {
                src: "/apple-icon",
                sizes: "180x180",
                type: "image/png",
            },
        ],
    };
}
