"use client";

/**
 * useCourse Hook
 *
 * Provides the active course context for the application.
 *
 * Currently, GreenKeeper Pro is single-tenant (one course per installation),
 * so this hook returns a constant course ID. This design pattern allows for
 * easy future migration to multi-tenant architecture where users could belong
 * to multiple courses.
 *
 * When multi-course support is added, this hook will:
 * 1. Query the course_members table for the user's courses
 * 2. Store the selected course in localStorage/context
 * 3. Provide a course switcher UI
 */

import { useMemo } from "react";

// Default course ID for single-tenant mode
// This is used as a placeholder since the current schema doesn't have a courses table
// All data is implicitly associated with this single course
const DEFAULT_COURSE_ID = "00000000-0000-0000-0000-000000000001";

export interface Course {
  id: string;
  name: string;
  slug?: string;
  timezone?: string;
  location?: {
    lat: number;
    lng: number;
    address?: string;
  };
}

interface UseCourseReturn {
  activeCourse: Course | null;
  courses: Course[];
  loading: boolean;
  error: string | null;
  setActiveCourse: (courseId: string) => void;
}

export function useCourse(): UseCourseReturn {
  // In single-tenant mode, we provide a default course
  const activeCourse = useMemo<Course>(() => ({
    id: DEFAULT_COURSE_ID,
    name: "Golf Course", // This would come from course settings in multi-tenant
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  }), []);

  const courses = useMemo(() => [activeCourse], [activeCourse]);

  return {
    activeCourse,
    courses,
    loading: false,
    error: null,
    setActiveCourse: () => {
      // No-op in single-tenant mode
      // In multi-tenant, this would update localStorage and trigger refetch
    },
  };
}

// Export the default course ID for use in migrations and seed data
export const SINGLE_TENANT_COURSE_ID = DEFAULT_COURSE_ID;
