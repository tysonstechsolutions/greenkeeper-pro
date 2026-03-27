"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { cn } from "@/lib/utils";

interface BeforeAfterSliderProps {
  /** URL of the "before" photo */
  beforePhotoUrl: string;
  /** URL of the "after" photo */
  afterPhotoUrl: string;
  /** Label for the before photo */
  beforeLabel?: string;
  /** Label for the after photo */
  afterLabel?: string;
  /** Aspect ratio (default 4/3) */
  aspectRatio?: string;
  /** Custom class name */
  className?: string;
}

export function BeforeAfterSlider({
  beforePhotoUrl,
  afterPhotoUrl,
  beforeLabel = "Before",
  afterLabel = "After",
  aspectRatio = "4/3",
  className,
}: BeforeAfterSliderProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [sliderPosition, setSliderPosition] = useState(50);
  const [isDragging, setIsDragging] = useState(false);
  const [imagesLoaded, setImagesLoaded] = useState({ before: false, after: false });
  const [containerWidth, setContainerWidth] = useState<number | null>(null);

  // Track container width for before-image sizing
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      setContainerWidth(entry.contentRect.width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  /**
   * Calculate slider position from mouse/touch event
   */
  const calculatePosition = useCallback((clientX: number) => {
    if (!containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    const percentage = (x / rect.width) * 100;

    // Clamp between 2% and 98% for visual appeal
    setSliderPosition(Math.max(2, Math.min(98, percentage)));
  }, []);

  /**
   * Handle mouse/touch start
   */
  const handleDragStart = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    setIsDragging(true);

    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    calculatePosition(clientX);
  }, [calculatePosition]);

  /**
   * Handle mouse/touch move
   */
  const handleDragMove = useCallback((e: MouseEvent | TouchEvent) => {
    if (!isDragging) return;

    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    calculatePosition(clientX);
  }, [isDragging, calculatePosition]);

  /**
   * Handle mouse/touch end
   */
  const handleDragEnd = useCallback(() => {
    setIsDragging(false);
  }, []);

  /**
   * Add global event listeners for drag
   */
  useEffect(() => {
    if (isDragging) {
      window.addEventListener("mousemove", handleDragMove);
      window.addEventListener("mouseup", handleDragEnd);
      window.addEventListener("touchmove", handleDragMove);
      window.addEventListener("touchend", handleDragEnd);
    }

    return () => {
      window.removeEventListener("mousemove", handleDragMove);
      window.removeEventListener("mouseup", handleDragEnd);
      window.removeEventListener("touchmove", handleDragMove);
      window.removeEventListener("touchend", handleDragEnd);
    };
  }, [isDragging, handleDragMove, handleDragEnd]);

  /**
   * Handle keyboard navigation
   */
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 10 : 2;

    switch (e.key) {
      case "ArrowLeft":
        e.preventDefault();
        setSliderPosition((prev) => Math.max(2, prev - step));
        break;
      case "ArrowRight":
        e.preventDefault();
        setSliderPosition((prev) => Math.min(98, prev + step));
        break;
      case "Home":
        e.preventDefault();
        setSliderPosition(2);
        break;
      case "End":
        e.preventDefault();
        setSliderPosition(98);
        break;
    }
  }, []);

  const allLoaded = imagesLoaded.before && imagesLoaded.after;

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative select-none overflow-hidden rounded-lg bg-muted cursor-col-resize",
        className
      )}
      style={{ aspectRatio }}
      onMouseDown={handleDragStart}
      onTouchStart={handleDragStart}
      role="slider"
      aria-label="Before and after comparison slider"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(sliderPosition)}
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      {/* After image (full width, behind) */}
      <div className="absolute inset-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={afterPhotoUrl}
          alt={afterLabel}
          className="w-full h-full object-cover"
          onLoad={() => setImagesLoaded((prev) => ({ ...prev, after: true }))}
          draggable={false}
        />
      </div>

      {/* Before image (clipped by slider position) */}
      <div
        className="absolute inset-0 overflow-hidden"
        style={{ width: `${sliderPosition}%` }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={beforePhotoUrl}
          alt={beforeLabel}
          className="h-full object-cover"
          style={{
            width: containerWidth != null ? `${containerWidth}px` : "100vw",
            maxWidth: "none",
          }}
          onLoad={() => setImagesLoaded((prev) => ({ ...prev, before: true }))}
          draggable={false}
        />
      </div>

      {/* Slider handle */}
      <div
        className="absolute top-0 bottom-0 w-1 bg-white shadow-lg transition-opacity"
        style={{
          left: `${sliderPosition}%`,
          transform: "translateX(-50%)",
          opacity: allLoaded ? 1 : 0,
        }}
      >
        {/* Handle knob */}
        <div
          className={cn(
            "absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2",
            "w-10 h-10 rounded-full bg-white shadow-lg",
            "flex items-center justify-center",
            "border-2 border-white",
            isDragging && "scale-110"
          )}
          style={{ transition: isDragging ? "none" : "transform 0.1s" }}
        >
          {/* Arrows */}
          <div className="flex items-center gap-0.5 text-gray-600">
            <svg
              width="8"
              height="12"
              viewBox="0 0 8 12"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M7 1L2 6L7 11"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
            <svg
              width="8"
              height="12"
              viewBox="0 0 8 12"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M1 1L6 6L1 11"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </div>
        </div>
      </div>

      {/* Labels */}
      {allLoaded && (
        <>
          {/* Before label */}
          <div
            className="absolute top-3 left-3 px-2 py-1 rounded text-sm font-medium text-white bg-black/50 backdrop-blur-sm pointer-events-none"
            style={{
              opacity: sliderPosition > 15 ? 1 : 0,
              transition: "opacity 0.2s",
            }}
          >
            {beforeLabel}
          </div>

          {/* After label */}
          <div
            className="absolute top-3 right-3 px-2 py-1 rounded text-sm font-medium text-white bg-black/50 backdrop-blur-sm pointer-events-none"
            style={{
              opacity: sliderPosition < 85 ? 1 : 0,
              transition: "opacity 0.2s",
            }}
          >
            {afterLabel}
          </div>
        </>
      )}

      {/* Loading state */}
      {!allLoaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-muted">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      )}
    </div>
  );
}

/**
 * Modal wrapper for the before/after slider
 */
interface BeforeAfterModalProps extends BeforeAfterSliderProps {
  isOpen: boolean;
  onClose: () => void;
}

export function BeforeAfterModal({
  isOpen,
  onClose,
  ...sliderProps
}: BeforeAfterModalProps) {
  // Close on escape
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    if (isOpen) {
      window.addEventListener("keydown", handleEscape);
    }

    return () => window.removeEventListener("keydown", handleEscape);
  }, [isOpen, onClose]);

  // Prevent body scroll when modal is open
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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Content */}
      <div className="relative w-full max-w-4xl mx-4">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute -top-12 right-0 text-white/80 hover:text-white p-2 transition-colors"
          aria-label="Close comparison"
        >
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>

        {/* Slider */}
        <BeforeAfterSlider {...sliderProps} className="shadow-2xl" />

        {/* Instructions */}
        <p className="text-center text-white/60 text-sm mt-4">
          Drag the slider or use arrow keys to compare
        </p>
      </div>
    </div>
  );
}
