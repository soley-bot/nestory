import { cn } from "@/lib/utils";

type Tone = "danger" | "success" | "warning";
type VisualTone = Tone | "accent";
type SparklinePoint = { label: string; value: number };

export function BuildingThumb({
  className,
  imageUrl,
  label,
}: {
  className?: string;
  imageUrl?: string;
  label?: string;
}) {
  const thumbClassName = cn(
    "relative flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border shadow-sm",
    imageUrl ? "bg-cover bg-center" : "bg-background/50",
    className,
  );

  if (imageUrl) {
    return (
      <span
        aria-label={label ? `${label} photo` : "Property photo"}
        className={thumbClassName}
        role="img"
        style={{ backgroundImage: `url(${imageUrl})` }}
      />
    );
  }

  return <span className={thumbClassName} aria-hidden="true" />;
}

export function MiniSparkline({
  index,
  points,
  tone,
}: {
  index: number;
  points: SparklinePoint[];
  tone?: VisualTone;
}) {
  const values = points.map((point, pointIndex) =>
    point.value + (index - 1) * 1.8 + (pointIndex % 2 === 0 ? 0 : index),
  );
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(1, max - min);
  const coordinates = values
    .map((value, pointIndex) => {
      const x = 4 + pointIndex * (68 / Math.max(1, values.length - 1));
      const y = 34 - ((value - min) / range) * 24;

      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg
      aria-hidden="true"
      className="h-7 w-[58px]"
      preserveAspectRatio="none"
      viewBox="0 0 76 40"
    >
      <polyline
        fill="none"
        points={coordinates}
        stroke={toneStroke(tone)}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

export function healthTone(value: number): Tone {
  if (value < 50) {
    return "danger";
  }

  if (value < 80) {
    return "warning";
  }

  return "success";
}

export function toneBgClass(tone: VisualTone | undefined) {
  if (tone === "danger") {
    return "bg-danger";
  }

  if (tone === "warning") {
    return "bg-warning";
  }

  if (tone === "success") {
    return "bg-success";
  }

  return "bg-accent";
}

export function toneTextClass(tone: VisualTone | undefined) {
  if (tone === "danger") {
    return "text-danger";
  }

  if (tone === "warning") {
    return "text-warning";
  }

  if (tone === "success") {
    return "text-success";
  }

  return "text-accent";
}

export function toneRuleClass(tone: VisualTone | undefined) {
  if (tone === "danger") {
    return "before:bg-danger";
  }

  if (tone === "warning") {
    return "before:bg-warning";
  }

  if (tone === "success") {
    return "before:bg-success";
  }

  return "before:bg-accent";
}

export function helperBadgeClass(tone: Tone | undefined) {
  if (tone === "danger") {
    return "bg-danger-soft text-danger";
  }

  if (tone === "warning") {
    return "bg-warning-soft text-warning";
  }

  if (tone === "success") {
    return "bg-success-soft text-success";
  }

  return "bg-accent-soft text-accent";
}

export function toneStroke(tone: VisualTone | undefined) {
  if (tone === "danger") {
    return "var(--danger)";
  }

  if (tone === "warning") {
    return "var(--warning)";
  }

  if (tone === "success") {
    return "var(--success)";
  }

  return "var(--accent)";
}
