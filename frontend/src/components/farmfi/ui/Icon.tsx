export function Icon({ name }: { name: string }) {
  const glyphs: Record<string, string> = {
    building: "▥",
    user: "♙",
    chart: "↗",
    cart: "▣",
    leaf: "◒",
    coin: "◎",
    check: "✓",
    shield: "◇",
    farm: "⌂",
    calendar: "□",
  };
  return <span aria-hidden="true">{glyphs[name] ?? "•"}</span>;
}
