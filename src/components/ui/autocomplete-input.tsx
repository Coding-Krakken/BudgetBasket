"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";

interface Suggestion {
  id: string;
  name: string;
  category?: { name: string } | null;
  brand?: { name: string } | null;
}

interface AutocompleteInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  id?: string;
  "aria-label"?: string;
  "aria-describedby"?: string;
}

export function AutocompleteInput({
  value,
  onChange,
  placeholder,
  className,
  id,
  "aria-label": ariaLabel,
  "aria-describedby": ariaDescribedBy,
}: AutocompleteInputProps) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [open, setOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Get the word being typed on the current cursor line
  const getCurrentToken = (): string => {
    const el = textareaRef.current;
    if (!el) return "";
    const pos = el.selectionStart ?? 0;
    const beforeCursor = el.value.slice(0, pos);
    // Current item is whatever comes after the last comma or newline
    const parts = beforeCursor.split(/[,\n]/);
    return (parts[parts.length - 1] ?? "").trimStart();
  };

  const fetchSuggestions = useCallback(async (token: string) => {
    if (token.length < 2) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    try {
      const res = await fetch(`/api/products/search?q=${encodeURIComponent(token)}&limit=5`);
      const data = await res.json();
      if (data.success && Array.isArray(data.data) && data.data.length > 0) {
        setSuggestions(data.data);
        setActiveIndex(-1);
        setOpen(true);
      } else {
        setSuggestions([]);
        setOpen(false);
      }
    } catch {
      setSuggestions([]);
      setOpen(false);
    }
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChange(e.target.value);
    const token = getCurrentToken();
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchSuggestions(token), 200);
  };

  const applySuggestion = (name: string) => {
    const el = textareaRef.current;
    if (!el) return;
    const pos = el.selectionStart ?? 0;
    const beforeCursor = value.slice(0, pos);
    const afterCursor = value.slice(pos);

    // Replace the current token with the suggestion
    const lastSep = Math.max(beforeCursor.lastIndexOf(","), beforeCursor.lastIndexOf("\n"));
    const prefix = lastSep >= 0 ? beforeCursor.slice(0, lastSep + 1) : "";
    const leadingSpace = lastSep >= 0 ? " " : "";
    const newValue = prefix + leadingSpace + name + (afterCursor.startsWith("\n") ? "" : "\n") + afterCursor.trimStart();

    onChange(newValue);
    setOpen(false);
    setSuggestions([]);
    setActiveIndex(-1);

    // Restore focus and move cursor to end of inserted text
    setTimeout(() => {
      if (el) {
        const newPos = (prefix + leadingSpace + name + "\n").length;
        el.setSelectionRange(newPos, newPos);
        el.focus();
      }
    }, 0);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!open || suggestions.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex(i => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex(i => Math.max(i - 1, -1));
    } else if (e.key === "Enter" && activeIndex >= 0) {
      e.preventDefault();
      applySuggestion(suggestions[activeIndex]!.name);
    } else if (e.key === "Escape") {
      setOpen(false);
      setActiveIndex(-1);
    }
  };

  // Scroll active item into view
  useEffect(() => {
    if (activeIndex >= 0 && listRef.current) {
      const item = listRef.current.children[activeIndex] as HTMLElement | undefined;
      item?.scrollIntoView({ block: "nearest" });
    }
  }, [activeIndex]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        textareaRef.current &&
        !textareaRef.current.contains(e.target as Node) &&
        listRef.current &&
        !listRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div className="relative">
      <textarea
        ref={textareaRef}
        id={id}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        aria-label={ariaLabel}
        aria-describedby={ariaDescribedBy}
        aria-autocomplete="list"
        aria-expanded={open}
        aria-activedescendant={activeIndex >= 0 ? `suggestion-${activeIndex}` : undefined}
        role="combobox"
        className={cn(
          "flex min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-none",
          className
        )}
      />

      {open && suggestions.length > 0 && (
        <ul
          ref={listRef}
          role="listbox"
          aria-label="Product suggestions"
          className="absolute z-50 left-0 right-0 mt-1 rounded-md border bg-popover shadow-md max-h-52 overflow-y-auto"
        >
          {suggestions.map((s, i) => (
            <li
              key={s.id}
              id={`suggestion-${i}`}
              role="option"
              aria-selected={i === activeIndex}
              onMouseDown={() => applySuggestion(s.name)}
              className={cn(
                "flex items-center justify-between px-3 py-2 text-sm cursor-pointer select-none",
                i === activeIndex
                  ? "bg-primary/10 text-primary"
                  : "hover:bg-muted"
              )}
            >
              <span className="font-medium">{s.name}</span>
              {(s.brand?.name || s.category?.name) && (
                <span className="text-xs text-muted-foreground ml-2">
                  {s.brand?.name ?? s.category?.name}
                </span>
              )}
            </li>
          ))}
          <li className="px-3 py-1.5 text-[10px] text-muted-foreground border-t">
            ↑↓ navigate · Enter to select · Esc to close
          </li>
        </ul>
      )}
    </div>
  );
}
