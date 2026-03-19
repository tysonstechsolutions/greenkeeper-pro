"use client";

import { useState, useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface SwipeAction {
  icon: ReactNode;
  label: string;
  color: string;
  onAction: () => void;
}

interface SwipeableRowProps {
  children: ReactNode;
  leftAction?: SwipeAction;
  rightAction?: SwipeAction;
  className?: string;
  threshold?: number;
  disabled?: boolean;
}

/**
 * Swipeable row component for mobile touch interactions
 * Supports left and right swipe actions
 */
export function SwipeableRow({
  children,
  leftAction,
  rightAction,
  className,
  threshold = 80,
  disabled = false,
}: SwipeableRowProps) {
  const [translateX, setTranslateX] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const startX = useRef(0);
  const startY = useRef(0);
  const isHorizontalSwipe = useRef<boolean | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (disabled || isAnimating) return;

    startX.current = e.touches[0].clientX;
    startY.current = e.touches[0].clientY;
    isHorizontalSwipe.current = null;
    setIsSwiping(true);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isSwiping || disabled || isAnimating) return;

    const currentX = e.touches[0].clientX;
    const currentY = e.touches[0].clientY;
    const deltaX = currentX - startX.current;
    const deltaY = currentY - startY.current;

    // Determine swipe direction on first significant movement
    if (isHorizontalSwipe.current === null && (Math.abs(deltaX) > 10 || Math.abs(deltaY) > 10)) {
      isHorizontalSwipe.current = Math.abs(deltaX) > Math.abs(deltaY);
    }

    // Only handle horizontal swipes
    if (!isHorizontalSwipe.current) return;

    // Check if swipe direction is allowed
    const canSwipeLeft = rightAction && deltaX < 0;
    const canSwipeRight = leftAction && deltaX > 0;

    if (!canSwipeLeft && !canSwipeRight) {
      return;
    }

    // Apply resistance
    const maxSwipe = threshold * 1.5;
    let newTranslate = deltaX;

    if (Math.abs(newTranslate) > threshold) {
      const overflow = Math.abs(newTranslate) - threshold;
      newTranslate = (newTranslate > 0 ? 1 : -1) * (threshold + overflow * 0.3);
    }

    newTranslate = Math.max(-maxSwipe, Math.min(maxSwipe, newTranslate));
    setTranslateX(newTranslate);

    // Prevent scrolling during swipe
    e.preventDefault();
  };

  const handleTouchEnd = () => {
    if (!isSwiping || disabled) return;

    setIsSwiping(false);

    // Check if threshold is reached
    if (Math.abs(translateX) >= threshold) {
      setIsAnimating(true);

      // Trigger action
      if (translateX > 0 && leftAction) {
        setTranslateX(threshold);
        setTimeout(() => {
          leftAction.onAction();
          setTranslateX(0);
          setIsAnimating(false);
        }, 200);
      } else if (translateX < 0 && rightAction) {
        setTranslateX(-threshold);
        setTimeout(() => {
          rightAction.onAction();
          setTranslateX(0);
          setIsAnimating(false);
        }, 200);
      }
    } else {
      setTranslateX(0);
    }
  };

  const leftProgress = leftAction ? Math.min(Math.max(translateX / threshold, 0), 1) : 0;
  const rightProgress = rightAction ? Math.min(Math.max(-translateX / threshold, 0), 1) : 0;

  return (
    <div className={cn("relative overflow-hidden", className)}>
      {/* Left action background */}
      {leftAction && (
        <div
          className="absolute inset-y-0 left-0 flex items-center justify-start pl-4 transition-opacity"
          style={{
            backgroundColor: leftAction.color,
            width: Math.max(translateX, 0),
            opacity: leftProgress,
          }}
        >
          <div
            className="flex items-center gap-2 text-white"
            style={{
              transform: `scale(${0.5 + leftProgress * 0.5})`,
              opacity: leftProgress,
            }}
          >
            {leftAction.icon}
            {leftProgress >= 1 && (
              <span className="text-sm font-medium">{leftAction.label}</span>
            )}
          </div>
        </div>
      )}

      {/* Right action background */}
      {rightAction && (
        <div
          className="absolute inset-y-0 right-0 flex items-center justify-end pr-4 transition-opacity"
          style={{
            backgroundColor: rightAction.color,
            width: Math.max(-translateX, 0),
            opacity: rightProgress,
          }}
        >
          <div
            className="flex items-center gap-2 text-white"
            style={{
              transform: `scale(${0.5 + rightProgress * 0.5})`,
              opacity: rightProgress,
            }}
          >
            {rightProgress >= 1 && (
              <span className="text-sm font-medium">{rightAction.label}</span>
            )}
            {rightAction.icon}
          </div>
        </div>
      )}

      {/* Content */}
      <div
        className="relative bg-background"
        style={{
          transform: `translateX(${translateX}px)`,
          transition: isSwiping ? "none" : "transform 0.2s ease-out",
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {children}
      </div>
    </div>
  );
}
