export const formatUsd = (value: number | string): string =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(Number(value));

export const formatCompactUsd = (value: number): string =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);

export const formatTokenAmount = (value: string): string =>
  new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 6,
  }).format(Number(value));

export const formatDateTime = (value: string): { date: string; time: string } => {
  const date = new Date(value);

  return {
    date: date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    }),
    time: date.toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
    }),
  };
};

export const formatRelativeTime = (value: string): string => {
  const elapsedSeconds = Math.round((new Date(value).getTime() - Date.now()) / 1_000);
  const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

  if (Math.abs(elapsedSeconds) < 60) return formatter.format(elapsedSeconds, "second");

  const elapsedMinutes = Math.round(elapsedSeconds / 60);
  if (Math.abs(elapsedMinutes) < 60) return formatter.format(elapsedMinutes, "minute");

  const elapsedHours = Math.round(elapsedMinutes / 60);
  if (Math.abs(elapsedHours) < 24) return formatter.format(elapsedHours, "hour");

  return formatter.format(Math.round(elapsedHours / 24), "day");
};

export const shortenIdentifier = (value: string): string =>
  value.length <= 16 ? value : `${value.slice(0, 7)}…${value.slice(-5)}`;
