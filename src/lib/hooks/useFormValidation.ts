"use client";

import { useCallback, useState } from "react";

/**
 * Centralizes the "validate → mark errors → focus the first bad field → keep
 * the user oriented" loop that every long form in the app needs.
 *
 * Usage:
 *   const { errors, setErrors, validate } = useFormValidation<{
 *     title: string;
 *     category: string;
 *   }>();
 *
 *   const onSubmit = () => {
 *     const ok = validate({
 *       title: data.title.trim() ? null : "Title is required",
 *       category: data.category ? null : "Category is required",
 *     });
 *     if (!ok) return;
 *     // happy path...
 *   };
 *
 *   <input id="title" aria-invalid={!!errors.title} ... />
 *
 * The hook scrolls + focuses the first key in object-insertion order whose
 * value is non-null, so order the validators most-prominent-first. The id
 * lookup is plain `document.getElementById`, so each field's id has to match
 * its validator key (or wrap a custom block in `<div id="theKey">`).
 */
export function useFormValidation<T extends Record<string, unknown>>(): {
  errors: Partial<Record<keyof T, string>>;
  setErrors: (next: Partial<Record<keyof T, string>>) => void;
  clearError: (key: keyof T) => void;
  validate: (
    validators: Partial<Record<keyof T, string | null>>,
  ) => boolean;
} {
  const [errors, setErrors] = useState<Partial<Record<keyof T, string>>>({});

  const clearError = useCallback((key: keyof T) => {
    setErrors((prev) => {
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  const validate = useCallback(
    (validators: Partial<Record<keyof T, string | null>>) => {
      const next: Partial<Record<keyof T, string>> = {};
      for (const k of Object.keys(validators) as (keyof T)[]) {
        const msg = validators[k];
        if (typeof msg === "string" && msg.length > 0) next[k] = msg;
      }
      setErrors(next);

      const firstKey = (Object.keys(validators) as (keyof T)[]).find(
        (k) => next[k],
      );
      if (firstKey) {
        // Defer focus to next frame so aria-invalid / red-border styling has
        // rendered before the screen-reader announcement fires.
        requestAnimationFrame(() => {
          const el = document.getElementById(String(firstKey)) as HTMLElement | null;
          if (!el) return;
          el.scrollIntoView({ behavior: "smooth", block: "center" });
          if (typeof (el as HTMLInputElement).focus === "function") {
            (el as HTMLInputElement).focus({ preventScroll: true });
          }
        });
      }

      return Object.keys(next).length === 0;
    },
    [],
  );

  return { errors, setErrors, clearError, validate };
}
