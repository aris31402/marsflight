'use client';

import React from 'react';
import { Crown, Sparkles, ExternalLink, MousePointer } from 'lucide-react';
import { supabase } from './supabaseClient';

export interface SeatData {
  id: number;
  section: 'Cockpit' | 'First Class' | 'Economy';
  bidAmount: number;
  claimerName?: string;
  identifier?: string;
  statusText?: string;
  clicks?: number;
  dbId?: number;
}

interface SeatMapProps {
  seats: SeatData[];
  onSelectSeat: (seat: SeatData) => void;
  onRefresh: () => void;
}

const STATUS_DISPLAY_LIMIT = 25;

export default function SeatMap({ seats, onSelectSeat, onRefresh }: SeatMapProps) {
  const cockpitSeats = seats.filter((s) => s.section === 'Cockpit');
  const firstClassSeats = seats.filter((s) => s.section === 'First Class');
  const economySeats = seats.filter((s) => s.section === 'Economy');

  const handleExternalVisit = async (seat: SeatData, e: React.MouseEvent) => {
    if (!seat.claimerName || !seat.identifier) return;
    e.stopPropagation();

    try {
      if (seat.dbId) {
        await supabase
          .from('seats')
          .update({ clicks: (seat.clicks || 0) + 1 })
          .eq('id', seat.dbId);
        onRefresh();
      }
    } catch (err) {
      console.error('Error updating clicks:', err);
    }

    const isHandle = seat.identifier.startsWith('@') || !seat.identifier.includes('.');
    if (isHandle) {
      const cleanHandle = seat.identifier.replace('@', '');
      window.open(`https://twitter.com/${cleanHandle}`, '_blank');
    } else {
      let url = seat.identifier;
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = 'https://' + url;
      }
      window.open(url, '_blank');
    }
  };

  const renderSeat = (seat: SeatData) => {
    const isClaimed = !!seat.claimerName;
    const isCaptain = seat.id === 1;
    const isEconomy = seat.section === 'Economy';

    let baseStyle = "relative flex flex-col items-center justify-between p-3.5 rounded-3xl border transition-all duration-300 group overflow-hidden shadow-sm bg-white ";

    if (seat.section === 'Cockpit') {
      baseStyle += isClaimed ? "border-amber-400" : "border-amber-300 border-dashed";
    } else if (seat.section === 'First Class') {
      baseStyle += isClaimed ? "border-purple-400" : "border-purple-300 border-dashed";
    } else {
      baseStyle += isClaimed ? "border-orange-200" : "border-zinc-200 border-dashed";
    }

    const isHandle = seat.identifier && (seat.identifier.startsWith('@') || !seat.identifier.includes('.'));
    const truncatedStatus = seat.statusText
      ? (seat.statusText.length > STATUS_DISPLAY_LIMIT ? seat.statusText.substring(0, STATUS_DISPLAY_LIMIT) + '...' : seat.statusText)
      : '';

    const rankPillClass = "font-mono px-1.5 py-0.5 rounded-full flex items-center gap-1 border bg-white text-blue-900 border-blue-300 font-bold";
    const claimPillClass = "font-mono font-bold px-2 py-0.5 rounded-full border transition-colors bg-white text-amber-600 border-amber-300 group-hover:bg-amber-500 group-hover:text-white";
    const pricePillClass = "font-mono font-bold px-2 py-0.5 rounded-full border bg-white text-orange-600 border-orange-300";
    const clickCounterClass = "flex items-center gap-0.5 font-mono font-bold text-zinc-700";

    return (
      <div
        key={seat.id}
        onClick={() => onSelectSeat(seat)}
        className={`${baseStyle} h-44 w-full cursor-pointer hover:-translate-y-1`}
      >
        {isEconomy ? (
          <>
            <div className="flex sm:hidden w-full flex-col gap-1">
              <div className="flex items-center gap-1">
                <span className={`text-[8px] ${rankPillClass}`}>
                  {isCaptain && <Crown className="w-2.5 h-2.5 text-orange-500" />}
                  {seat.id}
                </span>
                {isClaimed && (
                  <span className={`text-[8px] ${pricePillClass}`}>${Math.round(seat.bidAmount)}</span>
                )}
              </div>
              {isClaimed && (
                <div className="w-full flex justify-end">
                  <span className={`text-[8px] ${clickCounterClass}`}>
                    {seat.clicks || 0}
                    <MousePointer className="w-2.5 h-2.5" />
                  </span>
                </div>
              )}
            </div>

            <div className="hidden sm:flex w-full items-center justify-between gap-1">
              <span className={`text-[10px] ${rankPillClass}`}>
                {isCaptain && <Crown className="w-3 h-3 text-orange-500" />}
                {seat.id}
              </span>
              {isClaimed && (
                <div className="flex items-center gap-1.5">
                  <span className={`text-[10px] ${pricePillClass}`}>${Math.round(seat.bidAmount)}</span>
                  <span className={`text-[10px] ${clickCounterClass}`}>
                    {seat.clicks || 0}
                    <MousePointer className="w-3 h-3" />
                  </span>
                </div>
              )}
            </div>
          </>
        ) : seat.section === 'Cockpit' ? (
          <div className="flex w-full items-center justify-between gap-1">
            <div className={`text-xs ${rankPillClass}`}>
              {isCaptain && <Crown className="w-3 h-3 text-orange-500 animate-pulse" />}
              {seat.id}
            </div>
            <div className={`text-[10px] ${claimPillClass}`}>CLAIM</div>
            {isClaimed ? (
              <>
                <div className={`text-xs px-1 ${clickCounterClass}`}>
                  {seat.clicks || 0}
                  <MousePointer className="w-3.5 h-3.5" />
                </div>
                <div className={`text-xs ${pricePillClass}`}>${Math.round(seat.bidAmount)}</div>
              </>
            ) : (
              <div />
            )}
          </div>
        ) : (
          <>
            <div className="hidden sm:flex w-full items-center justify-between gap-1">
              <div className={`text-xs ${rankPillClass}`}>
                {isCaptain && <Crown className="w-3 h-3 text-orange-500 animate-pulse" />}
                {seat.id}
              </div>
              <div className={`text-[10px] ${claimPillClass}`}>CLAIM</div>
              {isClaimed ? (
                <>
                  <div className={`text-xs px-1 ${clickCounterClass}`}>
                    {seat.clicks || 0}
                    <MousePointer className="w-3.5 h-3.5" />
                  </div>
                  <div className={`text-xs ${pricePillClass}`}>${Math.round(seat.bidAmount)}</div>
                </>
              ) : (
                <div />
              )}
            </div>

            <div className="flex sm:hidden w-full items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span className={`text-[10px] ${rankPillClass}`}>
                  {isCaptain && <Crown className="w-3 h-3 text-orange-500" />}
                  {seat.id}
                </span>
                {isClaimed && (
                  <span className={`text-[10px] ${pricePillClass}`}>${Math.round(seat.bidAmount)}</span>
                )}
              </div>
              {isClaimed && (
                <span className={`text-[10px] ${clickCounterClass}`}>
                  {seat.clicks || 0}
                  <MousePointer className="w-3 h-3" />
                </span>
              )}
            </div>
          </>
        )}

        {isClaimed ? (
          <div
            onClick={(e) => handleExternalVisit(seat, e)}
            title={seat.identifier ? `Visit ${seat.identifier}` : ''}
            className="flex flex-col items-center text-center w-full my-auto cursor-pointer group/inner"
          >
            <div className="w-12 h-12 rounded-full bg-white border border-zinc-300 flex items-center justify-center overflow-hidden mb-1 shadow-xs group-hover/inner:scale-105 transition-transform relative">
              {isHandle ? (
                <img
                  src={`https://unavatar.io/twitter/${seat.identifier?.replace('@', '')}`}
                  alt={seat.claimerName}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    (e.target as HTMLElement).style.display = 'none';
                  }}
                />
              ) : seat.identifier ? (
                <img
                  src={`https://www.google.com/s2/favicons?domain=${seat.identifier.replace(/https?:\/\//, '')}&sz=64`}
                  alt="favicon"
                  className="w-6 h-6 object-contain"
                />
              ) : (
                <span className="text-sm font-bold text-zinc-800">
                  {seat.claimerName?.charAt(0).toUpperCase()}
                </span>
              )}
              <div className="absolute inset-0 bg-black/30 opacity-0 group-hover/inner:opacity-100 flex items-center justify-center transition-opacity">
                <ExternalLink className="w-3.5 h-3.5 text-white" />
              </div>
            </div>

            <span className="text-sm font-bold truncate max-w-[90%] tracking-tight group-hover/inner:underline text-zinc-900">
              {seat.claimerName}
            </span>

            {!isEconomy && seat.statusText && (
              <span className="text-[10px] text-zinc-800 truncate max-w-[95%] mt-1 bg-amber-200/70 px-3 py-0.5 rounded-full border border-amber-400/50 font-medium">
                {truncatedStatus}
              </span>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center my-auto text-zinc-400 group-hover:text-orange-500 transition-colors">
            <Sparkles className="w-4 h-4 mb-1 opacity-40 group-hover:opacity-100 transition-opacity" />
            <span className="text-xs font-medium uppercase tracking-wider">Available</span>
          </div>
        )}

        {isEconomy ? (
          <div className={`text-[9px] ${claimPillClass}`}>CLAIM</div>
        ) : seat.section === 'First Class' ? (
          <>
            <div className={`sm:hidden text-[9px] ${claimPillClass}`}>CLAIM</div>
            <div className="hidden sm:block w-full h-1" />
          </>
        ) : (
          <div className="w-full h-1" />
        )}
      </div>
    );
  };

  const renderRowPairs = (list: SeatData[], itemsPerSide: number) => {
    const rows = [];
    for (let i = 0; i < list.length; i += itemsPerSide * 2) {
      const leftSide = list.slice(i, i + itemsPerSide);
      const rightSide = list.slice(i + itemsPerSide, i + itemsPerSide * 2);
      rows.push({ leftSide, rightSide, rowIndex: i });
    }
    return rows;
  };

  const firstClassRows = renderRowPairs(firstClassSeats, 2);
  const economyRows = renderRowPairs(economySeats, 3);

  return (
    <div className="w-full max-w-6xl mx-auto space-y-12 px-4">
      <div className="space-y-4">
        <div className="flex items-center justify-between border-b pb-3 border-purple-950/20 text-purple-950">
          <h3 className="font-mono text-xs sm:text-sm tracking-widest uppercase flex items-center gap-2 font-bold">
            🚀 Cockpit <span className="text-[11px] opacity-60 font-normal">(Seats 1-2)</span>
          </h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-xl mx-auto">
          {cockpitSeats.map(renderSeat)}
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between border-b pb-3 border-purple-950/20 text-purple-950">
          <h3 className="font-mono text-xs sm:text-sm tracking-widest uppercase flex items-center gap-2 font-bold">
            ⭐ First Class <span className="text-[11px] opacity-60 font-normal">(Seats 3-18)</span>
          </h3>
        </div>
        <div className="space-y-3">
          {firstClassRows.map((row, idx) => (
            <div key={idx} className="grid grid-cols-1 sm:grid-cols-[1fr_40px_1fr] gap-4 items-center">
              <div className="grid grid-cols-2 gap-3">
                {row.leftSide.map(renderSeat)}
              </div>
              <div className="hidden sm:flex items-center justify-center h-full">
                <div className="w-0.5 h-full min-h-[3rem] border-r border-dashed border-purple-950/20" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                {row.rightSide.map(renderSeat)}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between border-b pb-3 border-purple-950/20 text-purple-950">
          <h3 className="font-mono text-xs sm:text-sm tracking-widest uppercase flex items-center gap-2 font-bold">
            💺 Economy <span className="text-[11px] opacity-60 font-normal">(Seats 19-100)</span>
          </h3>
        </div>
        <div className="space-y-3">
          {economyRows.map((row, idx) => (
            <div key={idx} className="grid grid-cols-1 sm:grid-cols-[1fr_40px_1fr] gap-4 items-center">
              <div className="grid grid-cols-3 gap-2.5">
                {row.leftSide.map(renderSeat)}
              </div>
              <div className="hidden sm:flex items-center justify-center h-full">
                <div className="w-0.5 h-full min-h-[3rem] border-r border-dashed border-purple-950/20" />
              </div>
              <div className="grid grid-cols-3 gap-2.5">
                {row.rightSide.map(renderSeat)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}