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
          background: "#F3EFE6",
          color: "#1B1B19",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 22,
          fontFamily: "Georgia, serif",
          fontWeight: 600,
          letterSpacing: "-0.02em",
          borderRadius: 6,
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
