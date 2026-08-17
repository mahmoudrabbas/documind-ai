"use client";

import React, { useState } from "react";

interface IdCellProps {
  value: string;
  prefixLength?: number;
  suffixLength?: number;
}

const CopyIcon = ({ className }: { className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
    <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
  </svg>
);

const CheckIcon = ({ className }: { className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

export const IdCell: React.FC<IdCellProps> = ({
  value,
  prefixLength = 12,
  suffixLength = 6,
}) => {
  const [copied, setCopied] = useState(false);

  const formatId = (str: string) => {
    if (!str) return "";
    if (str.length <= prefixLength + suffixLength + 4) return str;
    return `${str.slice(0, prefixLength)}...${str.slice(-suffixLength)}`;
  };

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy: ", err);
    }
  };

  return (
    <div className="flex items-center gap-2 group max-w-fit">
      <span
        title={value}
        className="font-mono text-xs font-medium text-on-surface-variant bg-surface-container hover:bg-secondary-container/10 border border-outline-variant hover:border-secondary-container px-2.5 py-1 rounded-md tracking-tight transition-colors duration-150 select-all cursor-pointer"
      >
        {formatId(value)}
      </span>
      <button
        onClick={handleCopy}
        type="button"
        title={copied ? "Copied!" : "Copy full ID"}
        className={`p-1.5 rounded-md border transition-all duration-150 focus:outline-none cursor-pointer ${
          copied
            ? "bg-success-container border-success/20 text-success scale-105"
            : "bg-surface-container-lowest border-outline-variant text-outline opacity-0 group-hover:opacity-100 hover:text-on-surface hover:bg-surface-container-low"
        }`}
      >
        {copied ? (
          <CheckIcon className="w-3.5 h-3.5" />
        ) : (
          <CopyIcon className="w-3.5 h-3.5" />
        )}
      </button>
    </div>
  );
};
