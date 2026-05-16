import { ReactNode } from "react";
import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";

export interface Column<T> {
  key: keyof T | string;
  header: string;
  render?: (item: T) => ReactNode;
  sortable?: boolean;
  width?: string;
  mobileLabel?: string;
}

export interface ResponsiveTableProps<T> {
  data: T[];
  columns: Column<T>[];
  keyExtractor: (item: T) => string | number;
  isLoading?: boolean;
  emptyMessage?: string;
  onSort?: (key: string, direction: "asc" | "desc") => void;
  sortKey?: string;
  sortDirection?: "asc" | "desc";
  className?: string;
}

function getCellValue<T>(item: T, key: keyof T | string): ReactNode {
  const keys = String(key).split(".");
  let value: unknown = item;
  for (const k of keys) {
    if (value && typeof value === "object" && k in value) {
      value = (value as Record<string, unknown>)[k];
    } else {
      return null;
    }
  }
  if (value === null || value === undefined) return null;
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

function SortIcon({
  column,
  sortKey,
  sortDirection,
}: {
  column: Column<unknown>;
  sortKey?: string;
  sortDirection?: "asc" | "desc";
}) {
  if (!column.sortable) return null;

  const isActive = sortKey === String(column.key);

  if (!isActive) {
    return (
      <ArrowUpDown
        className="ml-2 h-4 w-4 text-muted-foreground opacity-50"
        data-testid={`sort-icon-inactive-${String(column.key)}`}
      />
    );
  }

  if (sortDirection === "asc") {
    return (
      <ArrowUp
        className="ml-2 h-4 w-4 text-primary"
        data-testid={`sort-icon-asc-${String(column.key)}`}
      />
    );
  }

  return (
    <ArrowDown
      className="ml-2 h-4 w-4 text-primary"
      data-testid={`sort-icon-desc-${String(column.key)}`}
    />
  );
}

function LoadingSkeleton<T>({ columns }: { columns: Column<T>[] }) {
  return (
    <>
      {/* Desktop skeleton */}
      <div className="hidden md:block" data-testid="skeleton-table">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((column) => (
                <TableHead
                  key={String(column.key)}
                  style={{ width: column.width }}
                >
                  <Skeleton className="h-4 w-24" />
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: 5 }).map((_, rowIndex) => (
              <TableRow key={rowIndex} data-testid={`skeleton-row-${rowIndex}`}>
                {columns.map((column) => (
                  <TableCell key={String(column.key)}>
                    <Skeleton className="h-4 w-full max-w-[200px]" />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Mobile skeleton */}
      <div className="md:hidden space-y-3" data-testid="skeleton-cards">
        {Array.from({ length: 3 }).map((_, index) => (
          <Card
            key={index}
            className="bg-card border-border"
            data-testid={`skeleton-card-${index}`}
          >
            <CardContent className="p-4 space-y-3">
              {columns.slice(0, 4).map((column) => (
                <div
                  key={String(column.key)}
                  className="flex justify-between items-center"
                >
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="h-4 w-24" />
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div
      className="flex flex-col items-center justify-center py-12 text-center"
      data-testid="empty-state"
    >
      <div className="text-muted-foreground text-lg">{message}</div>
    </div>
  );
}

export function ResponsiveTable<T>({
  data,
  columns,
  keyExtractor,
  isLoading = false,
  emptyMessage = "No data available",
  onSort,
  sortKey,
  sortDirection,
  className,
}: ResponsiveTableProps<T>) {
  const handleSort = (column: Column<T>) => {
    if (!column.sortable || !onSort) return;

    const key = String(column.key);
    const newDirection =
      sortKey === key && sortDirection === "asc" ? "desc" : "asc";
    onSort(key, newDirection);
  };

  if (isLoading) {
    return (
      <div className={cn("w-full", className)} data-testid="responsive-table-loading">
        <LoadingSkeleton columns={columns} />
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className={cn("w-full", className)} data-testid="responsive-table-empty">
        <EmptyState message={emptyMessage} />
      </div>
    );
  }

  return (
    <div className={cn("w-full", className)} data-testid="responsive-table">
      {/* Desktop Table View */}
      <div className="hidden md:block" data-testid="table-desktop">
        <ScrollArea className="w-full">
          <Table>
            <TableHeader>
              <TableRow className="border-border hover:bg-muted/30">
                {columns.map((column) => (
                  <TableHead
                    key={String(column.key)}
                    style={{ width: column.width }}
                    className={cn(
                      "text-muted-foreground font-semibold",
                      column.sortable && "cursor-pointer select-none hover:text-foreground"
                    )}
                    onClick={() => handleSort(column)}
                    data-testid={`table-header-${String(column.key)}`}
                  >
                    <div className="flex items-center">
                      {column.header}
                      <SortIcon
                        column={column as Column<unknown>}
                        sortKey={sortKey}
                        sortDirection={sortDirection}
                      />
                    </div>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((item) => {
                const rowKey = keyExtractor(item);
                return (
                  <TableRow
                    key={rowKey}
                    className="border-border hover:bg-muted/50 transition-colors"
                    data-testid={`table-row-${rowKey}`}
                  >
                    {columns.map((column) => (
                      <TableCell
                        key={String(column.key)}
                        className="text-foreground"
                        data-testid={`table-cell-${rowKey}-${String(column.key)}`}
                      >
                        {column.render
                          ? column.render(item)
                          : getCellValue(item, column.key)}
                      </TableCell>
                    ))}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      </div>

      {/* Mobile Card View */}
      <div className="md:hidden space-y-3" data-testid="table-mobile">
        {data.map((item) => {
          const cardKey = keyExtractor(item);
          return (
            <Card
              key={cardKey}
              className="bg-card border-border shadow-sm"
              data-testid={`card-${cardKey}`}
            >
              <CardContent className="p-4 space-y-2">
                {columns.map((column) => {
                  const label = column.mobileLabel || column.header;
                  const value = column.render
                    ? column.render(item)
                    : getCellValue(item, column.key);

                  return (
                    <div
                      key={String(column.key)}
                      className="flex justify-between items-start gap-4"
                      data-testid={`card-field-${cardKey}-${String(column.key)}`}
                    >
                      <span className="text-sm text-muted-foreground font-medium shrink-0">
                        {label}
                      </span>
                      <span className="text-sm text-foreground text-right break-words">
                        {value}
                      </span>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

export default ResponsiveTable;
