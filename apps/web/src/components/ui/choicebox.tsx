"use client";

import { useRef, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { useThemeContext, usePal, tokens, motion, interactiveBase, type ChoiceboxTheme } from "@/components/ui/choicebox-utils/kit-theme";

export type ChoiceboxOption = {
  id: string;
  title: string;
  description?: string;
  meta?: ReactNode;
  className?: string;
  disabled?: boolean;
};

type ChoiceboxProps = {
  options: ChoiceboxOption[];
  value: string | string[];
  onChange: (value: string | string[]) => void;
  multiple?: boolean;
  theme?: ChoiceboxTheme;
  disabled?: boolean;
  className?: string;
  labelledBy?: string;
  describedBy?: string;
  name?: string;
};

export default function Choicebox({ options, value, onChange, multiple = false, theme: themeOverride, disabled = false, className, labelledBy, describedBy, name }: ChoiceboxProps) {
  const contextTheme = useThemeContext();
  const theme = themeOverride ?? contextTheme;
  const pal = usePal(theme);
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const selectedValues = Array.isArray(value) ? value : [];
  const isSelected = (id: string) => multiple ? selectedValues.includes(id) : value === id;

  function pick(id: string) {
    if (!multiple) {
      onChange(id);
      return;
    }
    const next = new Set(selectedValues);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange([...next]);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (!["ArrowDown", "ArrowRight", "ArrowUp", "ArrowLeft", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const enabled = options.map((option, optionIndex) => ({ option, optionIndex })).filter(({ option }) => !disabled && !option.disabled);
    if (!enabled.length) return;
    let nextIndex = index;
    if (event.key === "Home") nextIndex = enabled[0].optionIndex;
    else if (event.key === "End") nextIndex = enabled[enabled.length - 1].optionIndex;
    else {
      const current = enabled.findIndex((item) => item.optionIndex === index);
      const delta = event.key === "ArrowDown" || event.key === "ArrowRight" ? 1 : -1;
      nextIndex = enabled[(current + delta + enabled.length) % enabled.length].optionIndex;
    }
    refs.current[nextIndex]?.focus();
    if (!multiple) pick(options[nextIndex].id);
  }

  const groupStyle: CSSProperties = { display: "flex", flexDirection: "column", gap: 8 };
  return (
    <div role={multiple ? "group" : "radiogroup"} aria-labelledby={labelledBy} aria-describedby={describedBy} className={className} style={groupStyle}>
      {options.map((option, index) => {
        const selected = isSelected(option.id);
        const optionDisabled = disabled || Boolean(option.disabled);
        const useCustomStyles = Boolean(option.className);
        const style: CSSProperties = {
          ...interactiveBase,
          display: "flex",
          alignItems: "flex-start",
          gap: 12,
          padding: "12px 14px",
          borderRadius: tokens.radius.md,
          transition: `all ${motion.normal} ${motion.easeInOut}`,
          ...(useCustomStyles ? {} : {
            background: selected ? pal.accentBg : pal.bgSubtle,
            border: `1px solid ${selected ? pal.accent : pal.border}`,
          }),
          ...(optionDisabled ? { cursor: "not-allowed", opacity: 0.65 } : {}),
        };
        return (
          <button
            key={option.id}
            ref={(node) => { refs.current[index] = node; }}
            type="button"
            role={multiple ? "checkbox" : "radio"}
            aria-checked={selected}
            aria-disabled={optionDisabled || undefined}
            tabIndex={optionDisabled ? -1 : multiple || selected || (!options.some((item) => isSelected(item.id)) && index === 0) ? 0 : -1}
            name={name}
            disabled={optionDisabled}
            className={option.className}
            onClick={() => pick(option.id)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            style={style}
          >
            <span className="choicebox-indicator" aria-hidden="true" style={{
              width: 16,
              height: 16,
              borderRadius: multiple ? 5 : "50%",
              flexShrink: 0,
              marginTop: 1,
              border: `1.5px solid ${selected ? pal.accent : pal.textMuted}`,
              background: selected ? pal.accent : "transparent",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: `all ${motion.normal} ${motion.easeInOut}`,
            }}>
              {selected && (multiple ? (
                <svg width="9" height="9" viewBox="0 0 10 10" fill="none">
                  <path d="M1.5 5.5 4 8 8.5 2.5" stroke="var(--primary-foreground)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : <span className="choicebox-radio-dot" />)}
            </span>
            <span className="quiz-choice-text" style={{ flex: 1, minWidth: 0 }}>
              <span style={{ ...tokens.type.sm, fontWeight: tokens.weight.medium, color: pal.text, display: "block" }}>{option.title}</span>
              {option.description && <span style={{ ...tokens.type.xs, color: pal.textSecondary, display: "block", marginTop: 2, lineHeight: 1.5 }}>{option.description}</span>}
            </span>
            {option.meta && <span className="choicebox-meta" style={{ ...tokens.type.xs, color: pal.textTertiary, fontFamily: tokens.font.mono, flexShrink: 0 }}>{option.meta}</span>}
          </button>
        );
      })}
    </div>
  );
}
