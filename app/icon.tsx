import { ImageResponse } from "next/og";

// Onbehalf favicon — wordmark "O" on cream paper.
// Next.js auto-routes this as the favicon for the whole app.

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "#000000",
          color: "#FFFFFF",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 22,
          fontFamily: "system-ui, -apple-system, sans-serif",
          fontWeight: 800,
          letterSpacing: "-0.04em",
          borderRadius: 8,
        }}
      >
        O
      </div>
    ),
    {
      ...size,
    },
  );
}
