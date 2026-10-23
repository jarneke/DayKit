import { ImageResponse } from "next/og";

export const size = {
  width: 180,
  height: 180,
};

export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#7654c4",
      }}
    >
      <svg width="108" height="108" viewBox="0 0 108 108">
        <rect x="4" y="4" width="44" height="44" rx="13" fill="#ffffff" />
        <rect x="60" y="4" width="44" height="44" rx="13" fill="#ddcef9" />
        <rect x="4" y="60" width="44" height="44" rx="13" fill="#ddcef9" />
        <rect x="60" y="60" width="44" height="44" rx="13" fill="#ffffff" />
      </svg>
    </div>,
    size,
  );
}
