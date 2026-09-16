import Image from "next/image";

interface VulcanLogoProps {
  size?: number;
  className?: string;
  priority?: boolean;
}

export function VulcanLogo({ size = 32, className = "", priority = true }: VulcanLogoProps) {
  const height = Math.round(size * (1024 / 985));
  return (
    <Image
      src="/vulcan-logo.png"
      alt="Vulcan Logo"
      width={size}
      height={height}
      priority={priority}
      className={`vulcan-logo ${className}`.trim()}
      style={{
        width: size,
        height: "auto",
        aspectRatio: "985 / 1024",
        objectFit: "contain",
        display: "inline-block",
        verticalAlign: "middle",
      }}
    />
  );
}
