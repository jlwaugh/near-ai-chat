import { Button } from "@/components/button/Button";
import { Card } from "@/components/card/Card";
import useClickOutside from "@/hooks/useClickOutside";
import { X } from "@phosphor-icons/react";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

type ModalProps = {
  className?: string;
  children: React.ReactNode;
  clickOutsideToClose?: boolean;
  isOpen: boolean;
  onClose: () => void;
};

export const Modal = ({
  className,
  children,
  clickOutsideToClose = false,
  isOpen,
  onClose
}: ModalProps) => {
  const modalRef = clickOutsideToClose
    ? // biome-ignore lint/correctness/useHookAtTopLevel: click outside only when enabled
      useClickOutside(onClose)
    : // biome-ignore lint/correctness/useHookAtTopLevel: use plain ref when disabled
      useRef<HTMLDivElement>(null);

  // Stop site overflow when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }

    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  // Tab focus
  useEffect(() => {
    if (!isOpen || !modalRef.current) return;

    const focusableElements = modalRef.current.querySelectorAll(
      'a, button, input, textarea, select, details, [tabindex]:not([tabindex="-1"])'
    ) as NodeListOf<HTMLElement>;

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    if (firstElement) firstElement.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Tab") {
        if (e.shiftKey) {
          // Shift + Tab moves focus backward
          if (document.activeElement === firstElement) {
            e.preventDefault();
            lastElement.focus();
          }
        } else {
          // Tab moves forward
          if (document.activeElement === lastElement) {
            e.preventDefault();
            firstElement.focus();
          }
        }
      }
      if (e.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-white dark:bg-black text-black dark:text-white">
      <div className="relative z-50 flex flex-col items-center w-full max-w-3xl p-6">
        <Button
          aria-label="Close Modal"
          shape="square"
          className="mb-4 h-8 w-8 rounded-full border border-neutral-700 hover:bg-neutral-800"
          onClick={onClose}
          variant="ghost"
        >
          <X size={16} />
        </Button>

        <Card
          className={cn(
            "relative w-full max-w-4xl max-h-[calc(100vh-7rem)] overflow-y-auto",
            className
          )}
          ref={modalRef}
          tabIndex={-1}
        >
          {children}
        </Card>
      </div>
    </div>
  );
};
