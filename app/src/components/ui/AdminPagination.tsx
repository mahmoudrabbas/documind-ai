"use client";

import React from "react";

interface AdminPaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

export const AdminPagination: React.FC<AdminPaginationProps> = ({
  currentPage,
  totalPages,
  onPageChange,
}) => {
  const isFirst = currentPage === 1;
  const isLast = currentPage === totalPages || totalPages === 0;

  const buttonBase =
    "px-3.5 py-1.5 text-xs font-semibold rounded-md border transition-all duration-150 active:scale-95 flex items-center justify-center";

  const getBtnStyle = (isDisabled: boolean) => {
    if (isDisabled) {
      return "bg-[#E2E8F0] text-[#94A3B8] border-[#E2E8F0] cursor-not-allowed";
    }
    return "bg-[#E0F2FE] text-[#0369A1] border-[#BAE6FD] hover:bg-[#BAE6FD] hover:text-[#0284C7] cursor-pointer";
  };

  return (
    <div className="flex items-center justify-between px-4 py-3 bg-surface-container-low border-t border-outline-variant/30 rounded-b-lg">
      <span className="text-xs text-on-surface-variant font-medium">
        Page {currentPage} of {totalPages || 1}
      </span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={isFirst}
          onClick={() => onPageChange(currentPage - 1)}
          className={`${buttonBase} ${getBtnStyle(isFirst)}`}
        >
          Previous
        </button>
        <button
          type="button"
          disabled={isLast}
          onClick={() => onPageChange(currentPage + 1)}
          className={`${buttonBase} ${getBtnStyle(isLast)}`}
        >
          Next
        </button>
      </div>
    </div>
  );
};
