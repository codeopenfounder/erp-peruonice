"use client";

import { useMemo } from "react";
import { CalendarDays } from "lucide-react";

interface SchedulePreviewProps {
  timeRanges: { start_time: string; end_time: string }[];
  intervalMinutes: number;
  capacity: number;
  daysOfWeek: number[];
}

const DAY_LABELS: Record<number, string> = {
  0: "Dom",
  1: "Lun",
  2: "Mar",
  3: "Mié",
  4: "Jue",
  5: "Vie",
  6: "Sáb",
};

const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

interface SlotEntry {
  time: string;
  blockIndex: number; // which time range block this belongs to
}

function generateSlots(
  ranges: { start_time: string; end_time: string }[],
  intervalMinutes: number
): SlotEntry[] {
  const slots: SlotEntry[] = [];

  for (let blockIdx = 0; blockIdx < ranges.length; blockIdx++) {
    const range = ranges[blockIdx];
    const [startH, startM] = range.start_time.split(":").map(Number);
    const [endH, endM] = range.end_time.split(":").map(Number);

    if (isNaN(startH) || isNaN(startM) || isNaN(endH) || isNaN(endM)) continue;

    const startTotal = startH * 60 + startM;
    const endTotal = endH * 60 + endM;

    if (endTotal <= startTotal || intervalMinutes <= 0) continue;

    for (let t = startTotal; t + intervalMinutes <= endTotal; t += intervalMinutes) {
      const h = Math.floor(t / 60);
      const m = t % 60;
      slots.push({
        time: `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`,
        blockIndex: blockIdx,
      });
    }
  }

  return slots;
}

const BLOCK_COLORS = [
  { dot: "bg-primary", bg: "bg-primary/8", label: "text-primary" },
  { dot: "bg-blue-500", bg: "bg-blue-500/8", label: "text-blue-500" },
  { dot: "bg-emerald-500", bg: "bg-emerald-500/8", label: "text-emerald-500" },
];

export function SchedulePreview({
  timeRanges,
  intervalMinutes,
  capacity,
  daysOfWeek,
}: SchedulePreviewProps) {
  const activeDays = useMemo(
    () => DAY_ORDER.filter((d) => daysOfWeek.includes(d)),
    [daysOfWeek]
  );

  const slots = useMemo(
    () => generateSlots(timeRanges, intervalMinutes),
    [timeRanges, intervalMinutes]
  );

  if (activeDays.length === 0 || slots.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed py-12 text-center">
        <CalendarDays className="size-10 text-muted-foreground/40" />
        <div>
          <p className="text-sm font-medium text-muted-foreground">
            Sin turnos para previsualizar
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground/70">
            Seleccione días y rangos horarios para ver la vista previa
          </p>
        </div>
      </div>
    );
  }

  // Group slots by block to insert visual separators
  const blocks: { label: string; slots: SlotEntry[] }[] = [];
  let currentBlock = -1;
  for (const slot of slots) {
    if (slot.blockIndex !== currentBlock) {
      currentBlock = slot.blockIndex;
      const range = timeRanges[slot.blockIndex];
      const label = range
        ? `${range.start_time.slice(0, 5)} – ${range.end_time.slice(0, 5)}`
        : "";
      blocks.push({ label, slots: [] });
    }
    blocks[blocks.length - 1].slots.push(slot);
  }

  return (
    <div className="space-y-3">
      {/* Header stats */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex size-7 items-center justify-center rounded-lg bg-primary/10">
            <CalendarDays className="size-3.5 text-primary" />
          </div>
          <p className="text-sm font-medium text-foreground">Vista previa</p>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span>{slots.length} turnos</span>
          <span className="text-muted-foreground/40">•</span>
          <span>{activeDays.length} días</span>
          <span className="text-muted-foreground/40">•</span>
          <span>{capacity} cap.</span>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border">
        <div className="max-h-[28rem] overflow-y-auto">
          <table className="w-full border-collapse text-xs">
            {/* Sticky header */}
            <thead className="sticky top-0 z-10">
              <tr className="bg-muted/80 backdrop-blur-sm">
                <th className="w-16 border-b px-3 py-2.5 text-left font-semibold text-muted-foreground">
                  Hora
                </th>
                {activeDays.map((day) => (
                  <th
                    key={day}
                    className="border-b px-2 py-2.5 text-center font-semibold text-foreground"
                  >
                    {DAY_LABELS[day]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {blocks.map((block, blockIdx) => {
                const color = BLOCK_COLORS[blockIdx % BLOCK_COLORS.length];
                return (
                  <BlockRows
                    key={blockIdx}
                    block={block}
                    blockIdx={blockIdx}
                    totalBlocks={blocks.length}
                    color={color}
                    activeDays={activeDays}
                  />
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Block legend */}
      {blocks.length > 1 && (
        <div className="flex flex-wrap items-center gap-3 px-1">
          {blocks.map((block, idx) => {
            const color = BLOCK_COLORS[idx % BLOCK_COLORS.length];
            return (
              <div key={idx} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className={`inline-block size-2 rounded-full ${color.dot}`} />
                {block.label}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function BlockRows({
  block,
  blockIdx,
  totalBlocks,
  color,
  activeDays,
}: {
  block: { label: string; slots: SlotEntry[] };
  blockIdx: number;
  totalBlocks: number;
  color: { dot: string; bg: string; label: string };
  activeDays: number[];
}) {
  return (
    <>
      {/* Block separator */}
      {blockIdx > 0 && (
        <tr>
          <td
            colSpan={activeDays.length + 1}
            className="border-b border-dashed bg-muted/30 px-3 py-1.5"
          >
            <div className="flex items-center gap-2">
              <span className={`inline-block size-1.5 rounded-full ${color.dot}`} />
              <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                {block.label}
              </span>
            </div>
          </td>
        </tr>
      )}
      {/* Slot rows */}
      {block.slots.map((slot, slotIdx) => (
        <tr
          key={slot.time}
          className={`transition-colors duration-100 hover:bg-muted/40 ${
            slotIdx === block.slots.length - 1 && blockIdx < totalBlocks - 1
              ? ""
              : ""
          }`}
        >
          <td className="border-b border-muted/50 px-3 py-1.5 font-mono text-muted-foreground">
            {slot.time}
          </td>
          {activeDays.map((day) => (
            <td
              key={day}
              className="border-b border-muted/50 px-2 py-1.5 text-center"
            >
              <span
                className={`inline-flex size-5 items-center justify-center rounded-md ${color.bg} transition-colors duration-150 hover:opacity-80`}
              >
                <span className={`size-1.5 rounded-full ${color.dot}`} />
              </span>
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
