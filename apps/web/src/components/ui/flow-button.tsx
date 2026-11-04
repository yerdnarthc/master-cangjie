"use client";

import { forwardRef, useState, type MouseEventHandler } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowRight, Check, LoaderCircle } from "lucide-react";
import { cn } from "cn";
import { buttonVariants } from "@/components/ui/button";

export type FlowButtonPhase = "idle" | "loading" | "success";

type FlowButtonProps = {
  phase: FlowButtonPhase;
  label: string;
  loadingLabel: string;
  successLabel: string;
  disabled?: boolean;
  onClick: MouseEventHandler<HTMLButtonElement>;
};

const FlowButton = forwardRef<HTMLButtonElement, FlowButtonProps>(function FlowButton(
  { phase, label, loadingLabel, successLabel, disabled = false, onClick },
  ref,
) {
  const prefersReducedMotion = useReducedMotion() === true;
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const isInteractive = phase === "idle" && !disabled;
  const isActive = isInteractive && (hovered || focused);
  const currentLabel = phase === "loading" ? loadingLabel : phase === "success" ? successLabel : label;

  return (
    <motion.button
      ref={ref}
      type="button"
      className={cn(
        buttonVariants({ variant: "outline", size: "lg" }),
        "quiz-flow-button",
        `quiz-flow-button--${phase}`,
        isActive && "is-active",
      )}
      whileHover={isInteractive && !prefersReducedMotion ? { scale: 1.015 } : undefined}
      whileTap={isInteractive && !prefersReducedMotion ? { scale: 0.97 } : undefined}
      transition={{ scale: { type: "spring", stiffness: 520, damping: 34, mass: 0.45 } }}
      onHoverStart={() => setHovered(true)}
      onHoverEnd={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      disabled={disabled}
      aria-disabled={phase !== "idle" || undefined}
      aria-busy={phase === "loading" || undefined}
      aria-label={currentLabel}
      onClick={(event) => {
        if (!isInteractive) {
          event.preventDefault();
          return;
        }
        onClick(event);
      }}
    >
      <span className="quiz-flow-button__content">
        <span className="quiz-flow-button__leading" aria-hidden="true">
          <AnimatePresence initial={false} mode="wait">
            {phase !== "idle" ? (
              <motion.span
                key={phase}
                className="quiz-flow-button__state-icon"
                initial={{ opacity: prefersReducedMotion ? 1 : 0, x: prefersReducedMotion ? 0 : -4, scale: prefersReducedMotion ? 1 : 0.82 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: prefersReducedMotion ? 1 : 0, x: prefersReducedMotion ? 0 : 3, scale: prefersReducedMotion ? 1 : 0.88 }}
                transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
              >
                {phase === "loading" ? (
                  <motion.span
                    animate={prefersReducedMotion ? { rotate: 0 } : { rotate: 360 }}
                    transition={prefersReducedMotion ? undefined : { repeat: Infinity, duration: 0.9, ease: "linear" }}
                    className="inline-flex"
                  >
                    <LoaderCircle size={18} />
                  </motion.span>
                ) : (
                  <Check size={18} />
                )}
              </motion.span>
            ) : isActive ? (
              <motion.span
                key="leading-arrow"
                className="quiz-flow-button__state-icon"
                initial={{ opacity: prefersReducedMotion ? 1 : 0, x: prefersReducedMotion ? 0 : 5 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: prefersReducedMotion ? 1 : 0, x: prefersReducedMotion ? 0 : -4 }}
                transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
              >
                <ArrowRight size={18} />
              </motion.span>
            ) : null}
          </AnimatePresence>
        </span>

        <AnimatePresence initial={false} mode="wait">
          <motion.span
            key={currentLabel}
            className="quiz-flow-button__label"
            initial={{ opacity: prefersReducedMotion ? 1 : 0, y: prefersReducedMotion ? 0 : 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: prefersReducedMotion ? 1 : 0, y: prefersReducedMotion ? 0 : -3 }}
            transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
            aria-live="polite"
            aria-atomic="true"
          >
            {currentLabel}
          </motion.span>
        </AnimatePresence>

        <span className="quiz-flow-button__trailing" aria-hidden="true">
          <AnimatePresence initial={false}>
            {phase === "idle" && !isActive && (
              <motion.span
                key="trailing-arrow"
                className="quiz-flow-button__state-icon"
                initial={{ opacity: prefersReducedMotion ? 1 : 0, x: prefersReducedMotion ? 0 : -4 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: prefersReducedMotion ? 1 : 0, x: prefersReducedMotion ? 0 : 5 }}
                transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
              >
                <ArrowRight size={18} />
              </motion.span>
            )}
          </AnimatePresence>
        </span>
      </span>
    </motion.button>
  );
});

export default FlowButton;
