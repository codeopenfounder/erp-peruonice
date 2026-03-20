"use client";

import * as React from "react";
import { motion, AnimatePresence } from "motion/react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface MultiStepFormStep {
  title: string;
  description?: string;
}

export interface MultiStepFormProps {
  steps: MultiStepFormStep[];
  currentStep: number;
  onStepChange?: (step: number) => void;
  children: React.ReactNode;
  className?: string;
}

export function MultiStepForm({
  steps,
  currentStep,
  onStepChange,
  children,
  className,
}: MultiStepFormProps) {
  const [direction, setDirection] = React.useState(0);
  const prevStep = React.useRef(currentStep);

  React.useEffect(() => {
    setDirection(currentStep > prevStep.current ? 1 : -1);
    prevStep.current = currentStep;
  }, [currentStep]);

  return (
    <div className={cn("w-full", className)}>
      {/* Mobile compact indicator */}
      <div className="mb-6 block md:hidden">
        <p className="text-sm text-muted-foreground">
          Paso {currentStep + 1} de {steps.length}
        </p>
        <p className="text-base font-semibold text-foreground">
          {steps[currentStep]?.title}
        </p>
        {steps[currentStep]?.description && (
          <p className="text-xs text-muted-foreground">
            {steps[currentStep].description}
          </p>
        )}
      </div>

      {/* Desktop step indicator */}
      <div className="mb-8 hidden md:block">
        <div className="flex items-center justify-between">
          {steps.map((step, index) => (
            <React.Fragment key={index}>
              <div className="flex flex-col items-center gap-2">
                <button
                  type="button"
                  onClick={() => onStepChange?.(index)}
                  disabled={!onStepChange}
                  className={cn(
                    "flex h-10 w-10 items-center justify-center rounded-full border-2 text-sm font-semibold transition-colors",
                    index < currentStep &&
                      "border-primary/20 bg-primary/20 text-primary",
                    index === currentStep &&
                      "border-primary bg-primary text-primary-foreground",
                    index > currentStep &&
                      "border-border bg-secondary text-muted-foreground",
                    onStepChange && "cursor-pointer hover:opacity-80"
                  )}
                >
                  {index < currentStep ? (
                    <Check className="h-5 w-5" />
                  ) : (
                    index + 1
                  )}
                </button>
                <div className="text-center">
                  <p
                    className={cn(
                      "text-xs font-medium",
                      index === currentStep
                        ? "text-foreground"
                        : "text-muted-foreground"
                    )}
                  >
                    {step.title}
                  </p>
                  {step.description && (
                    <p className="text-xs text-muted-foreground">
                      {step.description}
                    </p>
                  )}
                </div>
              </div>
              {index < steps.length - 1 && (
                <div
                  className={cn(
                    "mx-2 mb-8 h-0.5 flex-1",
                    index < currentStep ? "bg-primary/40" : "bg-border"
                  )}
                />
              )}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Step content with animation */}
      <div className="relative overflow-hidden">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={currentStep}
            initial={{ x: direction * 60, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: direction * -60, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
          >
            {children}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
