"use client";

import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/lib/hooks/useAuth";
import { useMember } from "@/lib/hooks/useMember";
import { useTeeTimes, formatTeeTime } from "@/lib/hooks/useTeeTimes";
import { bookingWindowDays, pricing, memberTypeLabels } from "@/types/member";
import type { MemberType, TeeTime } from "@/types/member";
import {
  Calendar,
  Clock,
  Users,
  X,
  Check,
  ChevronLeft,
  ChevronRight,
  ShoppingCart,
  AlertCircle,
  Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ViewMode = "book" | "my-times";

export default function TeeTimesPage() {
  const { profile, loading: authLoading } = useAuth();
  const { memberInfo, fetchMemberInfo } = useMember();
  const {
    teeTimes,
    fetchMyTeeTimes,
    getAvailableSlots,
    bookTeeTime,
    cancelTeeTime,
    loading,
  } = useTeeTimes();

  const [viewMode, setViewMode] = useState<ViewMode>("book");
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [availableSlots, setAvailableSlots] = useState<string[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [numPlayers, setNumPlayers] = useState(1);
  const [playerNames, setPlayerNames] = useState<string[]>(["", "", ""]);
  const [cartRequested, setCartRequested] = useState(true);
  const [notes, setNotes] = useState("");
  const [bookingError, setBookingError] = useState<string | null>(null);
  const [bookingSuccess, setBookingSuccess] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  // Get member type for booking window
  const memberType = (memberInfo?.member_type || "general_public") as MemberType;
  const maxDaysAhead = bookingWindowDays[memberType];

  // Generate available dates
  const availableDates = useCallback(() => {
    const dates: string[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let i = 1; i <= maxDaysAhead; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() + i);
      dates.push(date.toISOString().split("T")[0]);
    }
    return dates;
  }, [maxDaysAhead]);

  useEffect(() => {
    fetchMemberInfo();
    fetchMyTeeTimes();
  }, [fetchMemberInfo, fetchMyTeeTimes]);

  // Set default date
  useEffect(() => {
    const dates = availableDates();
    if (dates.length > 0 && !selectedDate) {
      setSelectedDate(dates[0]); // eslint-disable-line react-hooks/set-state-in-effect
    }
  }, [availableDates, selectedDate]);

  // Fetch available slots when date changes
  useEffect(() => {
    if (selectedDate) {
      getAvailableSlots(selectedDate).then(setAvailableSlots);
    }
  }, [selectedDate, getAvailableSlots]);

  const handleBook = async () => {
    if (!selectedSlot) return;

    setBookingError(null);
    const result = await bookTeeTime(
      selectedDate,
      selectedSlot,
      numPlayers,
      playerNames.slice(0, numPlayers - 1),
      cartRequested,
      notes
    );

    if (!result.success) {
      setBookingError(result.error);
    } else {
      setBookingSuccess(true);
      setSelectedSlot(null);
      setNumPlayers(1);
      setPlayerNames(["", "", ""]);
      setNotes("");
      // Refresh available slots
      getAvailableSlots(selectedDate).then(setAvailableSlots);

      setTimeout(() => setBookingSuccess(false), 3000);
    }
  };

  const handleCancel = async (id: string) => {
    setCancellingId(id);
    await cancelTeeTime(id);
    setCancellingId(null);
  };

  // Separate upcoming and past tee times
  const nowMs = new Date().getTime();
  const today = new Date().toISOString().split("T")[0];
  const upcomingTimes = teeTimes.filter(
    (t) => t.tee_date >= today && t.status === "confirmed"
  );
  const pastTimes = teeTimes.filter(
    (t) => t.tee_date < today || t.status === "cancelled"
  );

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-green-50/50 to-background dark:from-green-950/20 pb-24">
      {/* Header */}
      <div className="bg-gradient-to-br from-green-700 to-emerald-800 text-white px-4 pt-6 pb-6">
        <div className="max-w-lg mx-auto">
          <h1 className="text-xl font-bold">Tee Times</h1>
          <p className="text-green-100 text-sm mt-1">
            Book up to {maxDaysAhead} days ahead ({memberTypeLabels[memberType]})
          </p>
        </div>
      </div>

      {/* View Toggle */}
      <div className="px-4 -mt-3">
        <div className="max-w-lg mx-auto">
          <div className="bg-card rounded-xl border border-border p-1 flex">
            <button
              onClick={() => setViewMode("book")}
              className={cn(
                "flex-1 py-2 text-sm font-medium rounded-lg transition-colors",
                viewMode === "book"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              Book Tee Time
            </button>
            <button
              onClick={() => setViewMode("my-times")}
              className={cn(
                "flex-1 py-2 text-sm font-medium rounded-lg transition-colors",
                viewMode === "my-times"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              My Tee Times
            </button>
          </div>
        </div>
      </div>

      <div className="px-4 mt-4 max-w-lg mx-auto">
        {viewMode === "book" ? (
          <div className="space-y-4">
            {/* Date Selection */}
            <div className="bg-card rounded-xl border border-border p-4">
              <h2 className="font-semibold mb-3 flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                Select Date
              </h2>
              <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1">
                {availableDates().map((date) => {
                  const d = new Date(date + "T12:00:00");
                  const isSelected = date === selectedDate;
                  const isWeekend = d.getDay() === 0 || d.getDay() === 6;

                  return (
                    <button
                      key={date}
                      onClick={() => {
                        setSelectedDate(date);
                        setSelectedSlot(null);
                      }}
                      className={cn(
                        "flex flex-col items-center min-w-[60px] p-2 rounded-lg border transition-colors",
                        isSelected
                          ? "border-primary bg-primary/10"
                          : "border-input hover:border-primary/50",
                        isWeekend && "bg-amber-50 dark:bg-amber-950/20"
                      )}
                    >
                      <span className="text-xs text-muted-foreground">
                        {d.toLocaleDateString("en-US", { weekday: "short" })}
                      </span>
                      <span className="text-lg font-bold">{d.getDate()}</span>
                      <span className="text-xs text-muted-foreground">
                        {d.toLocaleDateString("en-US", { month: "short" })}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Time Selection */}
            <div className="bg-card rounded-xl border border-border p-4">
              <h2 className="font-semibold mb-3 flex items-center gap-2">
                <Clock className="w-4 h-4" />
                Select Time
              </h2>

              {loading ? (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mx-auto" />
                </div>
              ) : availableSlots.length > 0 ? (
                <div className="grid grid-cols-4 gap-2 max-h-48 overflow-y-auto">
                  {availableSlots.map((slot) => (
                    <button
                      key={slot}
                      onClick={() => setSelectedSlot(slot)}
                      className={cn(
                        "py-2 px-1 text-sm rounded-lg border transition-colors",
                        selectedSlot === slot
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-input hover:border-primary/50"
                      )}
                    >
                      {formatTeeTime(slot)}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-center text-muted-foreground py-4">
                  No available times for this date
                </p>
              )}
            </div>

            {/* Booking Form */}
            {selectedSlot && (
              <div className="bg-card rounded-xl border border-border p-4 space-y-4">
                <h2 className="font-semibold">Booking Details</h2>

                {/* Number of Players */}
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Number of Players
                  </label>
                  <div className="flex gap-2">
                    {[1, 2, 3, 4].map((n) => (
                      <button
                        key={n}
                        onClick={() => setNumPlayers(n)}
                        className={cn(
                          "flex-1 py-2 rounded-lg border transition-colors flex items-center justify-center gap-1",
                          numPlayers === n
                            ? "border-primary bg-primary/10"
                            : "border-input hover:border-primary/50"
                        )}
                      >
                        <Users className="w-4 h-4" />
                        {n}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Additional Player Names */}
                {numPlayers > 1 && (
                  <div>
                    <label className="block text-sm font-medium mb-2">
                      Additional Players (optional)
                    </label>
                    {Array.from({ length: numPlayers - 1 }).map((_, i) => (
                      <input
                        key={i}
                        type="text"
                        value={playerNames[i]}
                        onChange={(e) => {
                          const newNames = [...playerNames];
                          newNames[i] = e.target.value;
                          setPlayerNames(newNames);
                        }}
                        placeholder={`Player ${i + 2} name`}
                        className="w-full px-4 py-2 mb-2 bg-background border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                    ))}
                  </div>
                )}

                {/* Cart Request */}
                <label className="flex items-center gap-3 p-3 rounded-lg border border-input cursor-pointer hover:bg-muted/50">
                  <input
                    type="checkbox"
                    checked={cartRequested}
                    onChange={(e) => setCartRequested(e.target.checked)}
                    className="w-4 h-4 rounded border-input"
                  />
                  <div className="flex items-center gap-2">
                    <ShoppingCart className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm">Cart requested</span>
                  </div>
                </label>

                {/* Notes */}
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Special Notes
                  </label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Any special requests..."
                    rows={2}
                    className="w-full px-4 py-2 bg-background border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                  />
                </div>

                {/* Error/Success Messages */}
                {bookingError && (
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    <span>{bookingError}</span>
                  </div>
                )}

                {bookingSuccess && (
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-green-500/10 text-green-600 text-sm">
                    <Check className="w-4 h-4 flex-shrink-0" />
                    <span>Tee time booked successfully!</span>
                  </div>
                )}

                {/* Book Button */}
                <Button
                  onClick={handleBook}
                  className="w-full"
                  size="lg"
                  disabled={loading}
                >
                  Confirm Booking
                </Button>
              </div>
            )}

            {/* Pricing Info */}
            <div className="bg-card rounded-xl border border-border p-4">
              <h2 className="font-semibold mb-3 flex items-center gap-2">
                <Info className="w-4 h-4" />
                Pricing (Pay at Pro Shop)
              </h2>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>Active Duty</span>
                  <span>
                    ${pricing.weekday.active_duty} / ${pricing.weekend.active_duty}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>DoD/Veterans/Seniors</span>
                  <span>
                    ${pricing.weekday.veteran} / ${pricing.weekend.veteran}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>General Public</span>
                  <span>
                    ${pricing.weekday.general_public} / ${pricing.weekend.general_public}
                  </span>
                </div>
                <div className="flex justify-between text-muted-foreground pt-2 border-t">
                  <span>Cart (per rider)</span>
                  <span>
                    ${pricing.cart.min}-${pricing.cart.max}
                  </span>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Upcoming Tee Times */}
            <div className="bg-card rounded-xl border border-border p-4">
              <h2 className="font-semibold mb-3">Upcoming</h2>
              {upcomingTimes.length > 0 ? (
                <div className="space-y-3">
                  {upcomingTimes.map((teeTime) => {
                    const teeDate = new Date(teeTime.tee_date + "T" + teeTime.tee_time);
                    const hoursUntil = (teeDate.getTime() - nowMs) / (1000 * 60 * 60);
                    const canCancel = hoursUntil >= 24;

                    return (
                      <div
                        key={teeTime.id}
                        className="p-4 bg-muted/50 rounded-lg"
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="font-medium">
                              {new Date(teeTime.tee_date + "T12:00:00").toLocaleDateString(
                                "en-US",
                                {
                                  weekday: "long",
                                  month: "long",
                                  day: "numeric",
                                }
                              )}
                            </p>
                            <p className="text-lg font-bold text-primary">
                              {formatTeeTime(teeTime.tee_time)}
                            </p>
                            <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <Users className="w-4 h-4" />
                                {teeTime.num_players} player
                                {teeTime.num_players > 1 ? "s" : ""}
                              </span>
                              {teeTime.cart_requested && (
                                <span className="flex items-center gap-1">
                                  <ShoppingCart className="w-4 h-4" />
                                  Cart
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-2">
                            <span className="text-xs px-2 py-1 rounded-full bg-green-500/10 text-green-600 font-medium">
                              Confirmed
                            </span>
                            {canCancel ? (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleCancel(teeTime.id)}
                                disabled={cancellingId === teeTime.id}
                                className="text-destructive hover:text-destructive"
                              >
                                {cancellingId === teeTime.id ? (
                                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current" />
                                ) : (
                                  <>
                                    <X className="w-4 h-4 mr-1" />
                                    Cancel
                                  </>
                                )}
                              </Button>
                            ) : (
                              <p className="text-xs text-muted-foreground">
                                Cannot cancel &lt;24hrs
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-center text-muted-foreground py-4">
                  No upcoming tee times
                </p>
              )}
            </div>

            {/* Past Tee Times */}
            {pastTimes.length > 0 && (
              <div className="bg-card rounded-xl border border-border p-4">
                <h2 className="font-semibold mb-3">Past Rounds</h2>
                <div className="space-y-2">
                  {pastTimes.slice(0, 10).map((teeTime) => (
                    <div
                      key={teeTime.id}
                      className="flex items-center justify-between py-2 border-b border-border last:border-0"
                    >
                      <div>
                        <p className="text-sm">
                          {new Date(teeTime.tee_date + "T12:00:00").toLocaleDateString(
                            "en-US",
                            {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            }
                          )}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatTeeTime(teeTime.tee_time)}
                        </p>
                      </div>
                      <span
                        className={cn(
                          "text-xs px-2 py-1 rounded-full font-medium",
                          teeTime.status === "cancelled"
                            ? "bg-gray-500/10 text-gray-600"
                            : "bg-green-500/10 text-green-600"
                        )}
                      >
                        {teeTime.status === "cancelled" ? "Cancelled" : "Played"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
