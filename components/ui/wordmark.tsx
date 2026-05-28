type WordmarkProps = {
  size?: number;
  light?: boolean;
};

export function Wordmark({ size = 22, light = false }: WordmarkProps) {
  return (
    <div style={{ fontSize: size }} className="inline-flex items-baseline select-none">
      <span
        style={{
          fontWeight: 600,
          letterSpacing: "-0.035em",
          color: light ? "#FAFAF7" : "#1A1A1A",
          position: "relative",
        }}
      >
        onbehalf
        <span
          aria-hidden
          style={{
            position: "absolute",
            left: "52.5%",
            bottom: "-0.16em",
            width: "0.18em",
            height: "0.18em",
            borderRadius: 999,
            background: "var(--accent)",
          }}
        />
      </span>
    </div>
  );
}
