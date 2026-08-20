import type { ReactNode } from "react";

export type Column<T> = {
  key: string;
  header: string;
  width?: string;
  align?: "left" | "right" | "center";
  render: (row: T) => ReactNode;
};

export function DataTable<T>({
  columns,
  rows,
  empty = "표시할 내용이 없습니다.",
  rowKey,
}: {
  columns: Column<T>[];
  rows: T[];
  empty?: string;
  rowKey: (row: T, index: number) => string;
}) {
  return (
    <div className="overflow-hidden rounded-10 border border-line">
      <table className="w-full border-collapse">
        <thead>
          <tr className="bg-surface">
            {columns.map((c) => (
              <th
                key={c.key}
                style={{ width: c.width }}
                className={`border-b border-line px-4 py-3 text-11 font-medium text-muted ${
                  c.align === "right"
                    ? "text-right"
                    : c.align === "center"
                      ? "text-center"
                      : "text-left"
                }`}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                className="px-4 py-12 text-center text-13 text-muted"
              >
                {empty}
              </td>
            </tr>
          ) : (
            rows.map((row, i) => (
              <tr key={rowKey(row, i)} className="border-b border-line-soft last:border-b-0">
                {columns.map((c) => (
                  <td
                    key={c.key}
                    className={`px-4 py-3.5 text-13 text-ink ${
                      c.align === "right"
                        ? "text-right"
                        : c.align === "center"
                          ? "text-center"
                          : "text-left"
                    }`}
                  >
                    {c.render(row)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
