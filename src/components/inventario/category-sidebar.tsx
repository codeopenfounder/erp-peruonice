"use client";

import { useState } from "react";
import { ChevronRight, FolderOpen, Plus, Tag, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { CategoryWithTags } from "@/types/product";

interface CategorySidebarProps {
  categories: CategoryWithTags[];
  isLoading: boolean;
  selectedCategoryId: string | null;
  selectedTagId: string | null;
  onSelectCategory: (id: string | null) => void;
  onSelectTag: (id: string | null) => void;
  onCreateCategory: () => void;
  onCreateTag: (categoryId: string) => void;
  onDeleteCategory: (categoryId: string, categoryName: string) => void;
  onDeleteTag: (tagId: string, tagName: string) => void;
  pendingDeleteCategoryIds?: Set<string>;
  pendingDeleteTagIds?: Set<string>;
}

export function CategorySidebar({
  categories,
  isLoading,
  selectedCategoryId,
  selectedTagId,
  onSelectCategory,
  onSelectTag,
  onCreateCategory,
  onCreateTag,
  onDeleteCategory,
  onDeleteTag,
  pendingDeleteCategoryIds,
  pendingDeleteTagIds,
}: CategorySidebarProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-2 p-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <span className="text-sm font-medium text-foreground">Categorías</span>
        <Button variant="ghost" size="icon" className="size-7" onClick={onCreateCategory}>
          <Plus className="size-4" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        <button
          onClick={() => { onSelectCategory(null); onSelectTag(null); }}
          className={cn(
            "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors",
            !selectedCategoryId && !selectedTagId
              ? "bg-primary/10 text-primary"
              : "text-muted-foreground hover:bg-secondary/50"
          )}
        >
          <FolderOpen className="size-4" />
          Todas
        </button>

        {categories.map((cat) => (
          <CategoryNode
            key={cat.id}
            category={cat}
            level={0}
            expanded={expanded}
            selectedCategoryId={selectedCategoryId}
            selectedTagId={selectedTagId}
            onToggle={toggle}
            onSelectCategory={onSelectCategory}
            onSelectTag={onSelectTag}
            onCreateTag={onCreateTag}
            onDeleteCategory={onDeleteCategory}
            onDeleteTag={onDeleteTag}
            pendingDeleteCategoryIds={pendingDeleteCategoryIds}
            pendingDeleteTagIds={pendingDeleteTagIds}
          />
        ))}
      </div>
    </div>
  );
}

function CategoryNode({
  category,
  level,
  expanded,
  selectedCategoryId,
  selectedTagId,
  onToggle,
  onSelectCategory,
  onSelectTag,
  onCreateTag,
  onDeleteCategory,
  onDeleteTag,
  pendingDeleteCategoryIds,
  pendingDeleteTagIds,
}: {
  category: CategoryWithTags;
  level: number;
  expanded: Set<string>;
  selectedCategoryId: string | null;
  selectedTagId: string | null;
  onToggle: (id: string) => void;
  onSelectCategory: (id: string | null) => void;
  onSelectTag: (id: string | null) => void;
  onCreateTag: (categoryId: string) => void;
  onDeleteCategory: (categoryId: string, categoryName: string) => void;
  onDeleteTag: (tagId: string, tagName: string) => void;
  pendingDeleteCategoryIds?: Set<string>;
  pendingDeleteTagIds?: Set<string>;
}) {
  const isExpanded = expanded.has(category.id);
  const isSelected = selectedCategoryId === category.id && !selectedTagId;
  const hasTags = category.tags.length > 0;
  const hasChildren = category.children.length > 0;
  const canExpand = hasTags || hasChildren;
  const isPendingDelete = pendingDeleteCategoryIds?.has(category.id);

  return (
    <div
      style={{ paddingLeft: `${level * 12}px` }}
      className={cn(isPendingDelete && "opacity-50 animate-pulse")}
    >
      <div className="group flex items-center">
        <button
          onClick={() => canExpand && onToggle(category.id)}
          className={cn("flex size-6 items-center justify-center", !canExpand && "invisible")}
        >
          <ChevronRight
            className={cn(
              "size-3.5 text-muted-foreground transition-transform",
              isExpanded && "rotate-90"
            )}
          />
        </button>
        <button
          onClick={() => { onSelectCategory(category.id); onSelectTag(null); }}
          className={cn(
            "flex flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors",
            isSelected ? "bg-primary/10 text-primary" : "text-foreground hover:bg-secondary/50"
          )}
        >
          <span className="truncate">{category.name}</span>
          <span className="ml-auto text-xs text-muted-foreground">{category.product_count}</span>
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onDeleteCategory(category.id, category.name); }}
          className="invisible size-6 flex items-center justify-center group-hover:visible"
          disabled={isPendingDelete}
        >
          <Trash2 className="size-3 text-muted-foreground hover:text-destructive" />
        </button>
        <button
          onClick={() => onCreateTag(category.id)}
          className="invisible size-6 flex items-center justify-center group-hover:visible"
        >
          <Plus className="size-3 text-muted-foreground" />
        </button>
      </div>

      {isExpanded && (
        <>
          {category.tags.map((tag) => {
            const isTagPendingDelete = pendingDeleteTagIds?.has(tag.id);
            return (
              <div
                key={tag.id}
                className={cn(
                  "group/tag flex items-center",
                  isTagPendingDelete && "opacity-50 animate-pulse"
                )}
                style={{ paddingLeft: `${(level + 1) * 12 + 24}px` }}
              >
                <button
                  onClick={() => { onSelectCategory(category.id); onSelectTag(tag.id); }}
                  className={cn(
                    "flex flex-1 items-center gap-2 rounded-lg px-2 py-1 text-xs transition-colors",
                    selectedTagId === tag.id
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-secondary/50"
                  )}
                >
                  <Tag className="size-3" />
                  <span
                    className="truncate"
                    style={{ color: tag.color || undefined }}
                  >
                    {tag.name}
                  </span>
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); onDeleteTag(tag.id, tag.name); }}
                  className="invisible size-4 flex items-center justify-center group-hover/tag:visible ml-auto mr-1"
                  disabled={isTagPendingDelete}
                >
                  <Trash2 className="size-3 text-muted-foreground hover:text-destructive" />
                </button>
              </div>
            );
          })}
          {category.children.map((child) => (
            <CategoryNode
              key={child.id}
              category={child}
              level={level + 1}
              expanded={expanded}
              selectedCategoryId={selectedCategoryId}
              selectedTagId={selectedTagId}
              onToggle={onToggle}
              onSelectCategory={onSelectCategory}
              onSelectTag={onSelectTag}
              onCreateTag={onCreateTag}
              onDeleteCategory={onDeleteCategory}
              onDeleteTag={onDeleteTag}
              pendingDeleteCategoryIds={pendingDeleteCategoryIds}
              pendingDeleteTagIds={pendingDeleteTagIds}
            />
          ))}
        </>
      )}
    </div>
  );
}
