"use client";

import * as React from "react";
import { animate, motion, useMotionValue, useTransform } from "motion/react";
import { cn } from "@/lib/utils";
import { usePrefersReducedMotion } from "@/components/ui/tree-nav-utils/use-typewriter";

export interface TreeNavItem {
  label: string;
  href: string;
  /** Small pill after the label, e.g. "New". */
  badge?: string;
  /** Optional accessible name for links whose visible text is abbreviated. */
  ariaLabel?: string;
  /** ID of the content region controlled by this link. */
  ariaControls?: string;
  /** Optional visual treatment for the badge. */
  badgeClassName?: string;
  /** Opens in a new tab. */
  external?: boolean;
}

type LinkComponent =
  | "a"
  | React.ComponentType<React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }>;

export interface TreeNavProps {
  items: TreeNavItem[];
  /** href of the current page; the marker and background rest on this row. */
  activeHref?: string;
  /** Height of the active background and the minimum link target, in pixels. */
  rowHeight?: number;
  /** Slide the marker and background to the hovered row and spring back on leave. */
  followHover?: boolean;
  /** Element used for links, e.g. Next's Link. Defaults to a plain anchor. */
  linkComponent?: LinkComponent;
  onSelect?: (item: TreeNavItem, event: React.MouseEvent<HTMLAnchorElement>) => void;
  className?: string;
}

const ROW_H = 32;
const MARKER = 7;
/** Horizontal centre of the rail inside the 24px gutter. */
const RAIL_X = 10;
const GLIDE = { type: "spring", visualDuration: 0.22, bounce: 0 } as const;
const FADE = { duration: 0.12, ease: "easeOut" } as const;

export function TreeNav({
  items,
  activeHref,
  rowHeight = ROW_H,
  followHover = true,
  linkComponent: Link = "a",
  onSelect,
  className,
}: TreeNavProps) {
  const listRef = React.useRef<HTMLDivElement>(null);
  const rowRefs = React.useRef<(HTMLDivElement | null)[]>([]);
  const centersRef = React.useRef<number[]>([]);
  const hoveredRef = React.useRef<number | null>(null);
  const reduced = usePrefersReducedMotion();
  const activeIndex = items.findIndex((item) => item.href === activeHref);
  const reducedRef = React.useRef(reduced);
  const activeRef = React.useRef(activeIndex);
  React.useLayoutEffect(() => {
    reducedRef.current = reduced;
    activeRef.current = activeIndex;
  });

  const [end, setEnd] = React.useState(0);
  const [measured, setMeasured] = React.useState(false);
  const centerY = useMotionValue(0);
  const visibility = useMotionValue(0);
  const pillY = useTransform(centerY, (value) => value - rowHeight / 2);
  const markerY = useTransform(centerY, (value) => value - MARKER / 2);
  const accentScale = useTransform(centerY, (value) => end > 0 ? Math.min(1, value / end) : 0);

  const moveTo = React.useCallback((index: number | null, immediate = false) => {
    const centers = centersRef.current;
    if (index === null || index < 0 || index >= centers.length) {
      if (reducedRef.current) visibility.jump(0);
      else animate(visibility, 0, FADE);
      return;
    }
    const target = centers[index];
    const jump = immediate || reducedRef.current || visibility.get() < 0.05;
    if (jump) centerY.jump(target);
    else animate(centerY, target, GLIDE);
    if (reducedRef.current) visibility.jump(1);
    else animate(visibility, 1, FADE);
  }, [centerY, visibility]);

  React.useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const measure = () => {
      const next = rowRefs.current.slice(0, items.length).map((element) => element ? element.offsetTop + element.offsetHeight / 2 : 0);
      centersRef.current = next;
      setEnd(next.length > 0 ? next[next.length - 1] : 0);
      setMeasured(true);
      moveTo(hoveredRef.current ?? activeRef.current, true);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(list);
    return () => observer.disconnect();
  }, [items.length, moveTo]);

  React.useEffect(() => {
    if (hoveredRef.current === null) moveTo(activeIndex);
  }, [activeIndex, moveTo]);

  const enter = (index: number) => {
    if (!followHover) return;
    hoveredRef.current = index;
    moveTo(index);
  };
  const leave = () => {
    if (!followHover) return;
    hoveredRef.current = null;
    moveTo(activeRef.current);
  };

  return (
    <div ref={listRef} role="list" className={cn("relative flex flex-col gap-0.5 ps-6", className)} onPointerLeave={leave}>
      <span aria-hidden className="pointer-events-none absolute inset-y-0 start-0 w-5">
        <span className="absolute top-0 w-px bg-border" style={{ insetInlineStart: RAIL_X - 0.5, height: end }} />
        <span className="absolute size-1 rounded-full bg-border" style={{ insetInlineStart: RAIL_X - 2, top: end - 2 }} />
        <motion.span className="absolute top-0 w-px origin-top bg-foreground will-change-transform" style={{ insetInlineStart: RAIL_X - 0.5, height: end, scaleY: accentScale, opacity: visibility }} />
        <motion.span className="absolute top-0 rounded-[1px] bg-foreground will-change-transform" style={{ insetInlineStart: RAIL_X - MARKER / 2, width: MARKER, height: MARKER, y: markerY, rotate: 45, opacity: visibility }} />
      </span>
      <motion.span aria-hidden className="pointer-events-none absolute end-0 start-6 top-0 rounded-lg bg-foreground/5 will-change-transform" style={{ height: rowHeight, y: pillY, opacity: visibility }} />
      {items.map((item, index) => {
        const isActive = index === activeIndex;
        return (
          <div key={item.href} ref={(element) => { rowRefs.current[index] = element; }} role="listitem" className="relative" onPointerEnter={() => enter(index)}>
            <Link
              href={item.href}
              target={item.external ? "_blank" : undefined}
              rel={item.external ? "noreferrer" : undefined}
              aria-label={item.ariaLabel}
              aria-controls={item.ariaControls}
              aria-current={isActive ? "page" : undefined}
              onClick={onSelect ? (event) => onSelect(item, event) : undefined}
              onFocus={() => enter(index)}
              onBlur={leave}
              style={{ minHeight: rowHeight }}
              className={cn(
                "flex h-8 items-center gap-2 rounded-md px-3 text-[13px] leading-5 transition-[color,font-size,font-weight] duration-150 ease-out hover:text-sm hover:font-medium focus-visible:text-sm focus-visible:font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                isActive && !measured && "bg-foreground/5",
                isActive ? "font-medium text-foreground" : "font-normal text-muted-foreground hover:text-foreground",
              )}
            >
              <span className="truncate">{item.label}</span>
              {item.badge && <span aria-hidden="true" className={cn("inline-flex h-[18px] shrink-0 items-center rounded-[6px] bg-primary/10 px-[5px] text-xs font-medium leading-none text-primary", item.badgeClassName)}>{item.badge}</span>}
            </Link>
          </div>
        );
      })}
    </div>
  );
}

export default TreeNav;
