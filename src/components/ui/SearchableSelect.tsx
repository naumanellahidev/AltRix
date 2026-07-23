import { useState, useRef, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Search, Check, ChevronDown, User } from "lucide-react";

export interface SearchableOption {
  id: string;
  label: string;
  sublabel?: string;
}

interface SearchableSelectProps {
  options: SearchableOption[];
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  className?: string;
}

export function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = "Search name or code...",
  className = ""
}: SearchableSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  // Close popover when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectedOption = options.find(o => o.id === value);
  const filteredOptions = options.filter(o => {
    if (!searchQuery || !searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase().trim();
    const labelMatch = o.label ? o.label.toLowerCase().includes(q) : false;
    const subMatch = o.sublabel ? o.sublabel.toLowerCase().includes(q) : false;
    const idMatch = o.id ? o.id.toLowerCase().includes(q) : false;
    return labelMatch || subMatch || idMatch;
  });

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-3 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md shadow-sm text-slate-900 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800/80 transition-colors"
      >
        <span className="truncate font-medium">
          {selectedOption ? (
            <span className="flex items-center gap-2">
              <span className="font-semibold text-blue-700 dark:text-blue-400">{selectedOption.label}</span>
              {selectedOption.sublabel && <span className="text-xs text-slate-400 font-mono">({selectedOption.sublabel})</span>}
            </span>
          ) : (
            <span className="text-slate-400">{placeholder}</span>
          )}
        </span>
        <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </button>

      {isOpen && (
        <div className="absolute z-50 mt-1 w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg shadow-xl p-2 space-y-2 animate-in fade-in-50 zoom-in-95">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
            <Input
              autoFocus
              placeholder="Type to filter names or code..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pl-8 text-xs h-9 bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 focus-visible:ring-blue-500"
            />
          </div>
          <div className="max-h-56 overflow-y-auto space-y-1 pr-1">
            {filteredOptions.length === 0 ? (
              <div className="p-3 text-center text-xs text-slate-400">
                <p>No matching names found</p>
              </div>
            ) : (
              filteredOptions.map(o => (
                <div
                  key={o.id}
                  onClick={() => {
                    onChange(o.id);
                    setIsOpen(false);
                    setSearchQuery("");
                  }}
                  className={`flex items-center justify-between px-3 py-2 text-xs rounded-md cursor-pointer transition-colors ${
                    o.id === value
                      ? "bg-blue-50 dark:bg-blue-950/80 text-blue-700 dark:text-blue-300 font-bold border border-blue-200/60"
                      : "text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                  }`}
                >
                  <div className="truncate">
                    <p className="font-semibold text-slate-900 dark:text-slate-100 truncate">{o.label}</p>
                    {o.sublabel && <p className="text-[10px] text-slate-500 font-mono truncate">{o.sublabel}</p>}
                  </div>
                  {o.id === value && <Check className="h-4 w-4 text-blue-600 flex-shrink-0 ml-2" />}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
