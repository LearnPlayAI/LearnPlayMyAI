import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Download, X } from 'lucide-react';

interface DrilldownModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  columns: { key: string; header: string }[];
  data: any[];
  isLoading?: boolean;
  emptyMessage?: string;
}

function downloadCSV(data: any[], filename: string, columns: { key: string; header: string }[]) {
  if (!data || data.length === 0) return;
  
  const headers = columns.map(c => c.header);
  const csvContent = [
    headers.join(','),
    ...data.map(row => columns.map(col => {
      const value = row[col.key] ?? '';
      const escaped = String(value).replace(/"/g, '""');
      return escaped.includes(',') ? `"${escaped}"` : escaped;
    }).join(','))
  ].join('\n');
  
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `${filename}_${new Date().toISOString().split('T')[0]}.csv`;
  link.click();
}

export function DrilldownModal({
  open,
  onClose,
  title,
  description,
  columns,
  data,
  isLoading = false,
  emptyMessage = 'No data available',
}: DrilldownModalProps) {
  const handleExport = () => {
    const filename = title.toLowerCase().replace(/\s+/g, '_');
    downloadCSV(data, filename, columns);
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-7xl w-[95vw] max-h-[80vh] flex flex-col bg-[var(--card-bg)] border-[var(--card-border)]">
        <DialogHeader className="flex-shrink-0">
          <div className="flex items-start justify-between pr-8">
            <div>
              <DialogTitle className="text-fg-strong">{title}</DialogTitle>
              {description && (
                <DialogDescription className="text-body-muted mt-1">
                  {description}
                </DialogDescription>
              )}
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-auto min-h-0 mt-4 min-w-0">
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-10 w-full" />
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : data.length === 0 ? (
            <div className="flex items-center justify-center py-12 text-body-muted">
              {emptyMessage}
            </div>
          ) : (
            <div className="overflow-x-auto">
            <Table className="min-w-max">
              <TableHeader>
                <TableRow>
                  {columns.map((col) => (
                    <TableHead key={col.key} className="text-fg-strong min-w-[120px]">
                      {col.header}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((row, rowIndex) => (
                  <TableRow key={rowIndex}>
                    {columns.map((col) => (
                      <TableCell key={col.key} className="text-fg-default min-w-[120px]">
                        {row[col.key] ?? '-'}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-4 mt-4 border-t border-[var(--stroke-default)] flex-shrink-0">
          <Button variant="outline" size="sm" onClick={handleExport} disabled={isLoading || data.length === 0} >
            <Download className="w-4 h-4 mr-2" />
            Export CSV
          </Button>
          <Button variant="outline" size="sm" onClick={onClose} >
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default DrilldownModal;
