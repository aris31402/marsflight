'use client';

import React, { useState, useEffect } from 'react';
import SeatMap, { SeatData } from './SeatMap';
import { supabase } from './supabaseClient';
import { X, ShieldAlert, Sparkles, AlertCircle, Sun, Moon, BookOpen, Users, Rocket } from 'lucide-react';

export default function Home() {
  const STATUS_MAX_LENGTH = 25;
  const CYCLE_LENGTH_MS = 14 * 24 * 60 * 60 * 1000;
  // Anchor point for cycle timing. There's no backend job running the
  // capture-and-reset yet, so this only drives the visual countdown for now —
  // wiring it to an actual scheduled reset is a separate, later step.
  const CYCLE_ANCHOR = new Date('2026-01-01T00:00:00Z').getTime();
  // Placeholder until the Pioneer Club is actually populated by a scheduled
  // job. Wire this up to a real count once that exists.
  const PIONEER_COUNT = 0;
  const PIONEER_TARGET = 100;

  const [isDark, setIsDark] = useState(false);
  const [seats, setSeats] = useState<SeatData[]>([]);
  const [selectedSeat, setSelectedSeat] = useState<SeatData | null>(null);
  const [isRulesOpen, setIsRulesOpen] = useState(false);
  const [onlineCount, setOnlineCount] = useState(1);

  const [nameInput, setNameInput] = useState('');
  const [bidInput, setBidInput] = useState('');
  const [identifierInput, setIdentifierInput] = useState('');
  const [statusInput, setStatusInput] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [bidTouched, setBidTouched] = useState(false);
  const [cycleTimeLeft, setCycleTimeLeft] = useState(0);

  const fetchSeats = async () => {
    const { data, error } = await supabase
      .from('seats')
      .select('*')
      .order('bid_amount', { ascending: false });

    if (error) {
      console.error('Error fetching seats:', error);
      return;
    }

    if (data) {
      const formatted: SeatData[] = data.map((s: any, index: number) => ({
        id: index + 1,
        section: index < 2 ? 'Cockpit' : index < 18 ? 'First Class' : 'Economy',
        bidAmount: Number(s.bid_amount),
        claimerName: s.claimer_name || undefined,
        identifier: s.identifier || undefined,
        statusText: index < 18 ? s.status_text || undefined : undefined,
        clicks: s.clicks || 0,
        dbId: s.id,
      }));
      setSeats(formatted);
    }
  };

  useEffect(() => {
    fetchSeats();

    const channel = supabase
      .channel('public:seats')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'seats' }, () => {
        fetchSeats();
      })
      .subscribe();

    const presenceChannel = supabase.channel('online-users');
    presenceChannel
      .on('presence', { event: 'sync' }, () => {
        const state = presenceChannel.presenceState();
        setOnlineCount(Object.keys(state).length || 1);
      })
      .subscribe(async (status: string) => {
        if (status === 'SUBSCRIBED') {
          await presenceChannel.track({ online_at: new Date().toISOString() });
        }
      });

    return () => {
      supabase.removeChannel(channel);
      supabase.removeChannel(presenceChannel);
    };
  }, []);

  // Ticks once a second toward the end of the current 14-day cycle. This is
  // purely visual for now — the actual top-5 capture and board reset needs a
  // scheduled backend job to run even when nobody has the page open; that's
  // a separate piece of work still to be wired up.
  useEffect(() => {
    const tick = () => {
      const elapsed = (Date.now() - CYCLE_ANCHOR) % CYCLE_LENGTH_MS;
      setCycleTimeLeft(CYCLE_LENGTH_MS - elapsed);
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cycleDays = Math.floor(cycleTimeLeft / (24 * 60 * 60 * 1000));
  const cycleHours = Math.floor((cycleTimeLeft % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
  const cycleMinutes = Math.floor((cycleTimeLeft % (60 * 60 * 1000)) / (60 * 1000));
  const cycleSeconds = Math.floor((cycleTimeLeft % (60 * 1000)) / 1000);
  const pad = (n: number) => String(n).padStart(2, '0');

  const sortedSeats = [...seats].sort((a, b) => b.bidAmount - a.bidAmount);

  const handleSeatClick = (seat: SeatData) => {
    setSelectedSeat(seat);
    setNameInput('');
    setIdentifierInput('');
    setStatusInput('');
    setBidTouched(false);

    const minRequiredBid = seat.bidAmount > 0 ? seat.bidAmount + 1 : 1;
    setBidInput(String(minRequiredBid));
    setErrorMessage('');
  };

  // If the name currently typed in the modal already owns a different seat,
  // this is an upgrade — the amount owed is only the difference in price,
  // not the full price of the seat being claimed. Recomputed live as the
  // person types their name, since we don't know who they are until then.
  const trimmedModalName = nameInput.trim().toLowerCase();
  const matchedOwnSeat = selectedSeat && trimmedModalName
    ? seats.find(
        (s) => s.claimerName && s.claimerName.toLowerCase() === trimmedModalName && (s as any).dbId !== (selectedSeat as any).dbId
      )
    : undefined;

  const modalMinRequired = selectedSeat
    ? matchedOwnSeat
      ? Math.round((selectedSeat.bidAmount > 0 ? selectedSeat.bidAmount : 1) - matchedOwnSeat.bidAmount + 1)
      : selectedSeat.bidAmount > 0
        ? Math.round(selectedSeat.bidAmount + 1)
        : 1
    : 1;

  // Keep the bid input in sync with the correct minimum as the name changes,
  // but only while the person hasn't manually typed their own amount.
  useEffect(() => {
    if (!selectedSeat || bidTouched) return;
    setBidInput(String(modalMinRequired));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nameInput, selectedSeat]);

  const handleBidSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSeat) return;
    // Guard: block a second submit while the first is still in flight.
    // Without this, a fast double-click (or a slow network) fires this
    // handler twice before local state refreshes, and each call thinks
    // it's the "first" claim — writing two rows with identical values.
    if (isSubmitting) return;
    setIsSubmitting(true);

    try {
      const trimmedName = nameInput.trim();
      if (!trimmedName) {
        setErrorMessage('Please enter your name or company.');
        return;
      }

      if (!identifierInput.trim()) {
        setErrorMessage('Please provide a website URL or @handle.');
        return;
      }

      const newBid = Number(bidInput);
      if (isNaN(newBid) || !Number.isInteger(newBid) || newBid < 1) {
        setErrorMessage('Please enter a whole dollar amount (no cents). The minimum starting amount is $1.');
        return;
      }

      const MIN_GAP = 1;

      // Pull the whole board fresh from the database (not the possibly-stale
      // local `seats` state) so every check below — who already owns a seat,
      // which seats are free, which prices are taken — reflects what's
      // actually saved right now, not a snapshot from before this click.
      const { data: freshRows, error: freshError } = await supabase
        .from('seats')
        .select('id, bid_amount, claimer_name');

      if (freshError) {
        setErrorMessage('Database error: ' + freshError.message);
        return;
      }

      const freshSeats = freshRows || [];

      const existingUserRow = freshSeats.find(
        (s: any) => s.claimer_name && s.claimer_name.toLowerCase() === trimmedName.toLowerCase()
      );
      const existingUserSeat = existingUserRow
        ? { dbId: existingUserRow.id as number, bidAmount: Number(existingUserRow.bid_amount) }
        : null;

      // Is the selected seat the SAME row this user already owns?
      const isSameSeat = !!existingUserSeat && existingUserSeat.dbId === (selectedSeat as any).dbId;
      // Is this user upgrading FROM a seat they already hold TO a different seat?
      const isUpgrade = !!existingUserSeat && !isSameSeat;

      let finalEffectiveBid = newBid;

      if (isUpgrade) {
        // Upgrade rule: the person pays only the difference (plus the $1
        // minimum step) — NOT the target seat's full price. Their new total
        // on record becomes old total + what they just paid.
        const targetBasePrice = selectedSeat.bidAmount > 0 ? selectedSeat.bidAmount : 1;
        const minUpgradePrice = targetBasePrice - existingUserSeat!.bidAmount + MIN_GAP;

        if (newBid < minUpgradePrice) {
          setErrorMessage(
            `Upgrade amount must cover the price difference plus $1. Minimum amount required: $${minUpgradePrice}.`
          );
          return;
        }
        finalEffectiveBid = existingUserSeat!.bidAmount + newBid;
      } else if (!isSameSeat && selectedSeat.bidAmount > 0 && newBid <= selectedSeat.bidAmount) {
        const minAcceptableBid = selectedSeat.bidAmount + MIN_GAP;
        if (newBid < minAcceptableBid) {
          setErrorMessage(
            `Amount must surpass the current holder by at least $1. Minimum amount to claim this seat: $${minAcceptableBid}.`
          );
          return;
        }
      }

      finalEffectiveBid = Math.round(finalEffectiveBid);

      // Work out which single row this submission will write into.
      // - Upgrade: the user's own existing row (their seat just gets a higher total).
      // - New claimer taking an occupied seat: any free row (never the occupant's row).
      // - Otherwise: the seat that was clicked (it's genuinely unclaimed, or it's theirs).
      let writeTargetDbId: number;
      if (isUpgrade) {
        writeTargetDbId = existingUserSeat!.dbId;
      } else if (!isSameSeat && selectedSeat.bidAmount > 0) {
        const emptyRow = freshSeats.find((s: any) => !s.claimer_name);
        if (!emptyRow) {
          setErrorMessage('No seats are currently available.');
          return;
        }
        writeTargetDbId = emptyRow.id;
      } else {
        writeTargetDbId = (selectedSeat as any).dbId;
      }

      // Keep every price tag unique across the WHOLE board: reject if the
      // final amount lands within $1 of any OTHER claimed seat's current
      // price, so two cards never show the same (or a near-identical) amount.
      const conflictingSeat = freshSeats.find(
        (s: any) =>
          s.id !== writeTargetDbId &&
          s.claimer_name &&
          Math.abs(Number(s.bid_amount) - finalEffectiveBid) < MIN_GAP
      );

      if (conflictingSeat) {
        const suggested = Number(conflictingSeat.bid_amount) + MIN_GAP;
        setErrorMessage(
          `That amount is too close to an existing seat's price ($${Number(conflictingSeat.bid_amount)}). Every seat must differ by at least $1 — try $${suggested} or higher.`
        );
        return;
      }

      const { error } = await supabase
        .from('seats')
        .update({
          bid_amount: finalEffectiveBid,
          claimer_name: trimmedName,
          identifier: identifierInput.trim(),
          status_text: selectedSeat.section !== 'Economy' ? statusInput.trim().slice(0, STATUS_MAX_LENGTH) : null,
        })
        .eq('id', writeTargetDbId);

      if (error) {
        setErrorMessage('Database error: ' + error.message);
        return;
      }

      setSelectedSeat(null);
      fetchSeats();
    } catch (err) {
      console.error('Submission error:', err);
      setErrorMessage('An unexpected error occurred.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className={`min-h-screen transition-colors duration-300 flex flex-col justify-between ${isDark ? 'bg-zinc-950 text-zinc-100' : 'bg-[#FDFBF7] text-[#9333EA]'}`}>
      <div>
        {/* Top Navigation Bar */}
        <div className={`w-full border-b px-6 py-4 flex items-center justify-between ${isDark ? 'border-zinc-800 bg-zinc-900/50' : 'border-purple-500/15 bg-white/70'}`}>
          <div className="flex items-center gap-2.5 font-mono font-bold tracking-wider text-[#9333EA]">
            <img src="/logo.jpg" alt="Logo" className="w-7 h-7 rounded-full object-cover border border-orange-500/50" />
            <span>MARSFLIGHT</span>
          </div>

          <div className="flex items-center gap-3">
            <div className={`hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-mono border ${isDark ? 'bg-zinc-900 border-zinc-800 text-emerald-400' : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 font-bold'}`}>
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>{onlineCount}{onlineCount === 1 ? '' : 's'} Online</span>
            </div>

            <button
              onClick={() => setIsRulesOpen(true)}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-mono border transition-all ${
                isDark
                  ? 'bg-zinc-800 border-zinc-700 text-amber-400 hover:bg-zinc-700'
                  : 'bg-purple-500/10 border-purple-500/30 text-[#9333EA] hover:bg-purple-500/20'
              }`}
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>Rules</span>
            </button>

            <button
              onClick={() => setIsDark(!isDark)}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-mono border transition-all ${
                isDark
                  ? 'bg-zinc-800 border-zinc-700 text-amber-400 hover:bg-zinc-700'
                  : 'bg-purple-500/10 border-purple-500/30 text-[#9333EA] hover:bg-purple-500/20'
              }`}
            >
              {isDark ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
              <span>{isDark ? 'Light' : 'Dark'}</span>
            </button>
          </div>
        </div>

        {/* Hero Section */}
        <div className={`relative overflow-hidden border-b py-12 sm:py-16 px-4 text-center ${isDark ? 'border-zinc-800 bg-gradient-to-b from-zinc-900 to-zinc-950' : 'border-purple-500/15 bg-gradient-to-b from-purple-50/60 to-[#FDFBF7]'}`}>
          <div className="max-w-3xl mx-auto space-y-4 relative z-10">
            <div className="space-y-5">
              {/* Headline — rocket sits to the left (in place of the old
                  logo), sized up; no logo image here anymore. */}
              <div className="flex items-center justify-center gap-2 sm:gap-3">
                <Rocket className="w-9 h-9 sm:w-12 sm:h-12 text-orange-500 animate-bounce shrink-0" />
                <h1 className={`text-xl sm:text-3xl lg:text-4xl font-black uppercase tracking-tighter leading-tight ${isDark ? 'text-purple-400' : 'text-[#FFA500]'}`}>
                  Board Before Elon Does
                </h1>
              </div>

              {/* Countdown to the current cycle's end — the centerpiece of
                  the hero, sized a touch smaller than before. */}
              <div>
                <p className={`text-[10px] sm:text-xs uppercase tracking-widest font-mono mb-3 ${isDark ? 'text-zinc-500' : 'text-[#00CF00]/50'}`}>
                  Next Pioneer Club induction in
                </p>
                <div className="flex items-center justify-center gap-2 sm:gap-2.5 lg:gap-3">
                  {[
                    { label: 'days', value: cycleDays },
                    { label: 'hrs', value: cycleHours },
                    { label: 'min', value: cycleMinutes },
                    { label: 'sec', value: cycleSeconds },
                  ].map((unit) => (
                    <div
                      key={unit.label}
                      className={`rounded-2xl px-3.5 py-2 sm:px-4 sm:py-2.5 lg:px-5 lg:py-3.5 min-w-[58px] sm:min-w-[70px] lg:min-w-[86px] border shadow-sm ${isDark ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-purple-500/20'}`}
                    >
                      <p className="text-lg sm:text-xl lg:text-3xl font-black font-mono leading-none text-orange-600">
                        {pad(unit.value)}
                      </p>
                      <p className={`text-[9px] sm:text-[10px] lg:text-xs font-mono uppercase mt-1 tracking-wide ${isDark ? 'text-zinc-500' : 'text-[#9333EA]/50'}`}>
                        {unit.label}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Clear, simple explanation of the idea + what the countdown means */}
              <p className={`text-[10px] sm:text-[11px] lg:text-sm max-w-md mx-auto leading-relaxed ${isDark ? 'text-zinc-400' : 'text-[#9333EA]/70'}`}>
                Marsflight has 100 seats. Claim any open seat, outbid someone else's, or upgrade to a better one —
                prices only ever go up. Every 14 days, whoever holds the top 5 seats gets permanently locked into
                the Pioneer Club, then every seat resets to open so a new round can begin.
              </p>
            </div>
          </div>
        </div>

        {/* Pioneer Club strip */}
        <div className={`border-b py-6 px-4 ${isDark ? 'border-zinc-800 bg-zinc-950' : 'border-purple-500/15 bg-white/50'}`}>
          <div className="max-w-3xl mx-auto flex flex-col items-center gap-2 text-center">
            <div className="flex items-center gap-2">
              <Users className={`w-4 h-4 ${isDark ? 'text-amber-400' : 'text-orange-500'}`} />
              <span className={`text-xs sm:text-sm font-bold font-mono tracking-wide ${isDark ? 'text-zinc-100' : 'text-[#9333EA]'}`}>
                Pioneer Club
              </span>
              <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${isDark ? 'bg-zinc-900 border-zinc-700 text-zinc-300' : 'bg-purple-500/10 border-purple-500/30 text-[#9333EA]'}`}>
                {PIONEER_COUNT} / {PIONEER_TARGET}
              </span>
            </div>
            <p className={`text-[11px] sm:text-xs max-w-md ${isDark ? 'text-zinc-500' : 'text-[#9333EA]/60'}`}>

            </p>
          </div>
        </div>

        {/* Seat Map Container */}
        <div className="py-12 px-4">
          <SeatMap seats={sortedSeats} onSelectSeat={handleSeatClick} isDark={isDark} onRefresh={fetchSeats} />
        </div>
      </div>

      {/* Footer Disclaimer */}
      <footer className={`w-full border-t py-6 px-4 text-center text-xs font-mono ${isDark ? 'border-zinc-800 bg-zinc-950 text-zinc-500' : 'border-purple-500/15 bg-[#FDFBF7] text-[#9333EA]/60'}`}>
        <p className="max-w-xl mx-auto">
          Marsflight is a virtual ranking experience and parody platform. No actual spacecraft boarding passes or physical flights to Mars are provided.
        </p>
      </footer>

      {/* Rules Modal */}
      {isRulesOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className={`border rounded-3xl w-full max-w-lg p-6 sm:p-8 relative space-y-6 shadow-2xl ${isDark ? 'bg-zinc-900 border-zinc-800 text-zinc-100' : 'bg-white border-purple-500/30 text-[#9333EA]'}`}>
            <button
              onClick={() => setIsRulesOpen(false)}
              className={`absolute top-5 right-5 p-1.5 rounded-full transition-colors ${isDark ? 'bg-zinc-800 text-zinc-400 hover:text-zinc-100' : 'bg-purple-500/10 text-[#9333EA] hover:bg-purple-500/20'}`}
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-2.5">
              <BookOpen className="w-6 h-6 text-orange-500" />
              <h2 className="text-2xl font-bold tracking-tight">Marsflight Rules</h2>
            </div>

            <ul className="space-y-3 text-xs sm:text-sm font-medium">
              <li className="flex items-start gap-2">
                <span className="text-orange-500 font-bold">•</span>
                <span><strong>Starting Price:</strong> Launch pad begins at a minimum of $1.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-orange-500 font-bold">•</span>
                <span><strong>Outbidding:</strong> To claim an occupied seat, you must beat the current holder by at least $1.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-orange-500 font-bold">•</span>
                <span><strong>Easy Upgrades:</strong> If you are already on the board and want a higher seat, you only pay the price difference plus $1 instead of starting over.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-orange-500 font-bold">•</span>
                <span><strong>Automatic Ranking:</strong> All 100 seats sort themselves automatically based on total contributions from highest to lowest.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-orange-500 font-bold">•</span>
                <span><strong>Unique Pricing:</strong> Every seat's price must differ from every other seat's by at least $1 — no two seats ever show the same amount.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-orange-500 font-bold">•</span>
                <span><strong>Pioneer Club:</strong> Every 14 days, the top 5 seats on the board at that moment are permanently inducted into the Pioneer Club — featured forever, separate from the live board.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-orange-500 font-bold">•</span>
                <span><strong>Fresh Cycle:</strong> Right after each induction, every seat resets to unclaimed and $0, and the next 14-day cycle begins — giving everyone a fresh shot at the front of the ship.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-orange-500 font-bold">•</span>
                <span><strong>Limited Spots:</strong> The Pioneer Club holds a maximum of 100 seats total. Once it's full, no more seats are added.</span>
              </li>
            </ul>

            <button
              onClick={() => setIsRulesOpen(false)}
              className="w-full py-3 rounded-xl bg-orange-600 text-white font-bold hover:bg-orange-500 transition-all text-sm font-mono tracking-wide"
            >
              Got It, Let's Fly 🚀
            </button>
          </div>
        </div>
      )}

      {/* Claim Modal */}
      {selectedSeat && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className={`border rounded-3xl w-full max-w-md p-6 sm:p-8 relative space-y-6 shadow-2xl ${isDark ? 'bg-zinc-900 border-zinc-800 text-zinc-100' : 'bg-white border-purple-500/30 text-[#9333EA]'}`}>
            <button
              onClick={() => setSelectedSeat(null)}
              className={`absolute top-5 right-5 p-1.5 rounded-full transition-colors ${isDark ? 'bg-zinc-800 text-zinc-400 hover:text-zinc-100' : 'bg-purple-500/10 text-[#9333EA] hover:bg-purple-500/20'}`}
            >
              <X className="w-4 h-4" />
            </button>

            <div>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-orange-500/10 text-orange-600 text-xs font-mono mb-2 font-bold">
                <Sparkles className="w-3 h-3" /> {selectedSeat.section} Section
              </div>
              <h2 className="text-2xl font-bold tracking-tight">Claim Seat #{selectedSeat.id}</h2>
              <p className={`text-xs mt-0.5 ${isDark ? 'text-zinc-400' : 'text-[#9333EA]/80'}`}>
                {matchedOwnSeat
                  ? `You already hold a seat at $${matchedOwnSeat.bidAmount}. Upgrading here only costs the difference — minimum extra amount: $${modalMinRequired}.`
                  : selectedSeat.bidAmount > 0
                    ? `Current holder: ${selectedSeat.claimerName}. Minimum amount to claim this seat: $${modalMinRequired}`
                    : 'First ever amount starts at $1.'}
              </p>
            </div>

            {errorMessage && (
              <div className="flex items-center gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-500 text-xs">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            <form onSubmit={handleBidSubmit} className="space-y-4">
              <div>
                <label className={`block text-xs font-medium mb-1.5 ${isDark ? 'text-zinc-400' : 'text-[#9333EA]/80'}`}>Seat Fare ($ USD)</label>
                <input
                  type="number"
                  step="1"
                  min="3"
                  inputMode="numeric"
                  required
                  value={bidInput}
                  onChange={(e) => {
                    setBidInput(e.target.value);
                    setBidTouched(true);
                  }}
                  className={`w-full border rounded-xl px-4 py-2.5 font-mono text-lg focus:outline-none focus:border-orange-500 ${isDark ? 'bg-zinc-950 border-zinc-800 text-zinc-100' : 'bg-[#FDFBF7] border-purple-500/30 text-[#9333EA]'}`}
                />
              </div>

              <div>
                <label className={`block text-xs font-medium mb-1.5 ${isDark ? 'text-zinc-400' : 'text-[#9333EA]/80'}`}>Your Name / Startup / Company <span className="text-orange-500">*</span></label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Acme Corp"
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  className={`w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-orange-500 ${isDark ? 'bg-zinc-950 border-zinc-800 text-zinc-100' : 'bg-[#FDFBF7] border-purple-500/30 text-[#9333EA]'}`}
                />
              </div>

              <div>
                <label className={`block text-xs font-medium mb-1.5 ${isDark ? 'text-zinc-400' : 'text-[#9333EA]/80'}`}>
                  Your Website URL or @handle <span className="text-orange-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. site.com or @username"
                  value={identifierInput}
                  onChange={(e) => setIdentifierInput(e.target.value)}
                  className={`w-full border rounded-xl px-4 py-2.5 text-sm font-mono focus:outline-none focus:border-orange-500 ${isDark ? 'bg-zinc-950 border-zinc-800 text-zinc-100' : 'bg-[#FDFBF7] border-purple-500/30 text-[#9333EA]'}`}
                />
              </div>

              {selectedSeat.section !== 'Economy' && (
                <div>
                  <label className="block text-xs font-medium text-orange-600 mb-1.5 flex items-center gap-1 font-bold">
                    <Sparkles className="w-3 h-3" /> {selectedSeat.section} Public Status Message
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Building the future of rockets 🚀"
                    value={statusInput}
                    maxLength={STATUS_MAX_LENGTH}
                    onChange={(e) => setStatusInput(e.target.value.slice(0, STATUS_MAX_LENGTH))}
                    className={`w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-orange-500 ${isDark ? 'bg-zinc-950 border-zinc-800 text-zinc-100' : 'bg-[#FDFBF7] border-purple-500/30 text-[#9333EA]'}`}
                  />
                  <p className={`text-[11px] mt-1 text-right font-mono ${isDark ? 'text-zinc-500' : 'text-[#9333EA]/50'}`}>
                    {statusInput.length}/{STATUS_MAX_LENGTH}
                  </p>
                </div>
              )}

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-3.5 rounded-xl bg-orange-600 text-white font-bold hover:bg-orange-500 transition-all shadow-lg shadow-orange-600/20 mt-2 text-sm tracking-wide disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isSubmitting ? 'Launching...' : 'Confirm & Launch Rank'}
              </button>

              <p className={`text-[11px] text-center italic font-mono pt-1 ${isDark ? 'text-zinc-500' : 'text-[#9333EA]/60'}`}>
                * Virtual novelty ranking experience—not an actual ticket for space travel.
              </p>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}