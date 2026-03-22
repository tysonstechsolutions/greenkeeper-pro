// Member-specific types for GreenKeeper Pro

export type MemberType =
  | "active_duty"
  | "retired_reserve"
  | "veteran"
  | "dod_civilian"
  | "general_public";

export type PreferredTee = "blue" | "white" | "gold" | "red";

export type TeeTimeStatus = "confirmed" | "cancelled";

export type CommunityPostType = "official" | "poll" | "discussion" | "photo";

export interface MemberRegistration {
  id: string;
  user_id: string;
  member_type: MemberType;
  handicap: number | null;
  preferred_tee: PreferredTee;
  wants_updates: boolean;
  created_at: string;
  updated_at: string;
}

export interface TeeTime {
  id: string;
  user_id: string;
  tee_date: string;
  tee_time: string; // e.g., "07:30"
  num_players: number;
  player_names: string[]; // Additional player names
  cart_requested: boolean;
  notes: string | null;
  status: TeeTimeStatus;
  created_at: string;
  cancelled_at: string | null;
  // Joined data
  booker?: {
    full_name: string;
    avatar_url: string | null;
  };
}

export interface CommunityPost {
  id: string;
  author_id: string;
  post_type: CommunityPostType;
  content: string;
  photo_url: string | null;
  is_official: boolean;
  is_pinned: boolean;
  likes_count: number;
  comments_count: number;
  created_at: string;
  updated_at: string;
  // Poll fields
  poll_question: string | null;
  poll_options: string[] | null;
  poll_votes: Record<string, number> | null; // option -> vote count
  poll_ends_at: string | null;
  // Joined data
  author?: {
    full_name: string;
    avatar_url: string | null;
    role: string;
  };
  member_info?: {
    member_type: MemberType;
  };
  user_has_liked?: boolean;
  user_vote?: string | null;
}

export interface CommunityComment {
  id: string;
  post_id: string;
  author_id: string;
  content: string;
  created_at: string;
  // Joined data
  author?: {
    full_name: string;
    avatar_url: string | null;
  };
}

export interface CommunityLike {
  post_id: string;
  user_id: string;
  created_at: string;
}

export interface PollVote {
  post_id: string;
  user_id: string;
  option: string;
  created_at: string;
}

// Round feedback with detailed ratings
export interface RoundRating {
  id: string;
  user_id: string;
  round_date: string;
  overall_rating: number; // 1-5
  greens_rating: number | null;
  fairways_rating: number | null;
  bunkers_rating: number | null;
  tees_rating: number | null;
  pace_rating: number | null;
  setup_rating: number | null;
  cleanliness_rating: number | null;
  value_rating: number | null;
  favorite_hole: number | null;
  comments: string | null;
  would_recommend: boolean | null;
  created_at: string;
}

// Member type labels
export const memberTypeLabels: Record<MemberType, string> = {
  active_duty: "Active Duty",
  retired_reserve: "Retired/Reserve",
  veteran: "Veteran",
  dod_civilian: "DoD Civilian",
  general_public: "General Public",
};

// Tee labels
export const teeLabels: Record<PreferredTee, string> = {
  blue: "Blue Tees",
  white: "White Tees",
  gold: "Gold Tees",
  red: "Red Tees",
};

// Booking window by member type (days in advance)
export const bookingWindowDays: Record<MemberType, number> = {
  active_duty: 7,
  retired_reserve: 6,
  veteran: 5,
  dod_civilian: 5,
  general_public: 5,
};

// Pricing (for display only)
export const pricing = {
  weekday: {
    active_duty: 25,
    retired_reserve: 29,
    veteran: 29,
    dod_civilian: 29,
    general_public: 34,
  },
  weekend: {
    active_duty: 31,
    retired_reserve: 35,
    veteran: 35,
    dod_civilian: 35,
    general_public: 40,
  },
  cart: {
    min: 15,
    max: 17,
  },
};
