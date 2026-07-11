"use client";

import { useAuth } from "@/providers/auth-provider";

export function TopNavBar() {
  const { user } = useAuth();
  
  return (
    <header className="sticky top-0 z-40 flex h-16 w-full items-center justify-between border-b border-outline-variant bg-surface-bright/80 px-lg shadow-sm backdrop-blur-md">
      <div className="flex items-center gap-lg">
        <div className="relative w-96 hidden md:block">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[20px] text-on-surface-variant">
            search
          </span>
          <input
            className="w-full rounded-full border-none bg-surface-container-low py-2 pl-10 pr-4 text-label-md focus:ring-2 focus:ring-primary/20 outline-none transition-shadow"
            placeholder="Search knowledge base..."
            type="text"
          />
        </div>
      </div>
      <div className="flex items-center gap-md">
        <div className="mr-md flex items-center gap-xs">
          <button className="relative rounded-full p-2 text-on-surface-variant hover:bg-surface-container-high transition-colors">
            <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>
              notifications
            </span>
            <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-error" />
          </button>
        </div>
        
        {/* User Profile */}
        <div className="flex items-center gap-3 border-l border-outline-variant pl-md">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary-container text-on-secondary-container font-bold shadow-sm">
            {user?.name?.charAt(0).toUpperCase() || "A"}
          </div>
          <div className="hidden sm:block">
            <p className="text-label-md font-bold text-on-surface">{user?.name || "Admin User"}</p>
            <p className="text-label-sm text-on-surface-variant">{user?.role === "COMPANY_ADMIN" ? "Company Admin" : "User"}</p>
          </div>
          <span className="material-symbols-outlined text-on-surface-variant">expand_more</span>
        </div>
      </div>
    </header>
  );
}
