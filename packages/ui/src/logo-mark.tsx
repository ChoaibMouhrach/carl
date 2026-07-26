export const R_PATH =
  "M48.081 0c15.184 0 24.215 9.03 24.215 21.019 0 11.988-9.03 21.019-24.216 21.02h-7.672L78.53 78.4H51.597L22.587 50.83c-2.079-1.918-3.038-4.156-3.038-6.074 0-2.717 1.918-5.114 5.594-6.153l14.945-3.996c5.674-1.519 9.59-5.915 9.591-11.669 0-7.032-5.754-11.109-12.867-11.109H.128V0H48.08Z";

const WORDMARK_FONT =
  "var(--font-sans), Inter, 'Helvetica Neue', Arial, sans-serif";

interface LogoProps {
  size?: number | string;
  className?: string;
}

export const Logo: React.FC<LogoProps> = ({ size = 40, className }) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="-6 -5 90 90"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label="Rizon"
    >
      <path d={R_PATH} fill="currentColor" />
    </svg>
  );
};

interface LogoWithTextProps {
  size?: number | string;
  className?: string;
}

export const LogoWithText: React.FC<LogoWithTextProps> = ({
  size = 200,
  className,
}) => {
  const numericSize = typeof size === "number" ? size : Number.parseFloat(size);
  const height = Number.isNaN(numericSize)
    ? undefined
    : Math.round(numericSize * (81 / 186));

  return (
    <svg
      width={size}
      height={height}
      viewBox="0 0 186 81"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label="Rizon"
    >
      <g transform="translate(0, 5.7) scale(0.7)">
        <path d={R_PATH} fill="currentColor" />
      </g>
      <text
        x="57"
        y="62"
        fill="currentColor"
        fontFamily={WORDMARK_FONT}
        fontSize="66"
        fontWeight="600"
        letterSpacing="-2.5"
      >
        izon
      </text>
    </svg>
  );
};
