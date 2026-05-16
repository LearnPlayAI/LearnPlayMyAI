import { useState } from 'react';
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';

interface PaginatedListProps<T> {
  items: T[];
  total: number;
  pageSize?: number;
  onPageChange: (page: number) => void;
  currentPage: number;
  renderItem: (item: T, index: number) => React.ReactNode;
  emptyMessage?: string;
  gridClassName?: string;
  isLoading?: boolean;
  loadingComponent?: React.ReactNode;
}

export function PaginatedList<T>({
  items,
  total,
  pageSize = 20,
  onPageChange,
  currentPage,
  renderItem,
  emptyMessage = 'No items found',
  gridClassName = 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6',
  isLoading = false,
  loadingComponent,
}: PaginatedListProps<T>) {
  const totalPages = Math.ceil(total / pageSize);

  const renderPageNumbers = () => {
    const pages: React.ReactNode[] = [];
    const maxVisiblePages = 7;

    if (totalPages <= maxVisiblePages) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(
          <PaginationItem key={i}>
            <PaginationLink
              onClick={() => onPageChange(i)}
              isActive={currentPage === i}
              data-testid={`pagination-page-${i}`}
              className="cursor-pointer"
            >
              {i}
            </PaginationLink>
          </PaginationItem>
        );
      }
    } else {
      pages.push(
        <PaginationItem key={1}>
          <PaginationLink
            onClick={() => onPageChange(1)}
            isActive={currentPage === 1}
            data-testid="pagination-page-1"
            className="cursor-pointer"
          >
            1
          </PaginationLink>
        </PaginationItem>
      );

      if (currentPage > 3) {
        pages.push(
          <PaginationItem key="ellipsis-1">
            <PaginationEllipsis />
          </PaginationItem>
        );
      }

      const startPage = Math.max(2, currentPage - 1);
      const endPage = Math.min(totalPages - 1, currentPage + 1);

      for (let i = startPage; i <= endPage; i++) {
        pages.push(
          <PaginationItem key={i}>
            <PaginationLink
              onClick={() => onPageChange(i)}
              isActive={currentPage === i}
              data-testid={`pagination-page-${i}`}
              className="cursor-pointer"
            >
              {i}
            </PaginationLink>
          </PaginationItem>
        );
      }

      if (currentPage < totalPages - 2) {
        pages.push(
          <PaginationItem key="ellipsis-2">
            <PaginationEllipsis />
          </PaginationItem>
        );
      }

      pages.push(
        <PaginationItem key={totalPages}>
          <PaginationLink
            onClick={() => onPageChange(totalPages)}
            isActive={currentPage === totalPages}
            data-testid={`pagination-page-${totalPages}`}
            className="cursor-pointer"
          >
            {totalPages}
          </PaginationLink>
        </PaginationItem>
      );
    }

    return pages;
  };

  if (isLoading) {
    return loadingComponent || (
      <div className="flex items-center justify-center py-12">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center py-12 text-center rounded-lg border"
        style={{
          backgroundColor: "var(--empty-state-bg)",
          color: "var(--empty-state-fg)",
          borderColor: "var(--stroke-default)",
        }}
      >
        <p
          className="text-lg"
          style={{ color: "var(--empty-state-body)" }}
          data-testid="empty-message"
        >
          {emptyMessage}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className={gridClassName}>{items.map(renderItem)}</div>

      {totalPages > 1 && (
        <Pagination data-testid="pagination-controls">
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                onClick={() => currentPage > 1 && onPageChange(currentPage - 1)}
                className={currentPage === 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                data-testid="pagination-previous"
              />
            </PaginationItem>

            {renderPageNumbers()}

            <PaginationItem>
              <PaginationNext
                onClick={() => currentPage < totalPages && onPageChange(currentPage + 1)}
                className={
                  currentPage === totalPages ? 'pointer-events-none opacity-50' : 'cursor-pointer'
                }
                data-testid="pagination-next"
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      )}

      <div className="text-center text-sm text-muted-foreground" data-testid="pagination-info">
        Showing {(currentPage - 1) * pageSize + 1} to{' '}
        {Math.min(currentPage * pageSize, total)} of {total} results
      </div>
    </div>
  );
}
