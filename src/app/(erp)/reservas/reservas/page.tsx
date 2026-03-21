"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek } from "date-fns";
import { es } from "date-fns/locale/es";
import {
  CalendarCheck,
  CalendarDays,
  Activity,
  Trophy,
} from "lucide-react";
import { toast } from "sonner";
import { AnimatePresence, motion } from "motion/react";

import { PageHeader } from "@/components/ui/page-header";
import { KpiCard } from "@/components/kpi/kpi-card";
import { KpiGrid } from "@/components/kpi/kpi-grid";
import { DataTable } from "@/components/ui/data-table";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ViewToggle, type ViewMode } from "@/components/reservas/view-toggle";
import { SlotDetailSheet } from "@/components/reservas/slot-detail-sheet";
import { CalendarMonthView } from "@/components/reservas/calendar-month-view";
import { CalendarWeekView } from "@/components/reservas/calendar-week-view";
import { CalendarDayView } from "@/components/reservas/calendar-day-view";
import { getReservationColumns } from "@/components/reservas/reservation-columns";
import {
  useReservations,
  useReservationsByDateRange,
  useReservationKPIs,
  useCancelReservation,
} from "@/hooks/queries/use-reservations";
import { useProducts } from "@/hooks/queries/use-products";
import { useSchedulesByProduct } from "@/hooks/queries/use-schedules";
import { usePermissions } from "@/hooks/use-permissions";
import type { ReservationFilters } from "@/types/reservation";

const PAGE_SIZE = 20;

export default function ReservasPage() {
  const { canEdit } = usePermissions();
  const hasEdit = canEdit("reservas.reservas");

  // --- View & navigation state ---
  const [viewMode, setViewMode] = useState<ViewMode>("month");
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(null);
  const [page, setPage] = useState(0);

  // --- Slot detail sheet state ---
  const [slotSheet, setSlotSheet] = useState<{
    open: boolean;
    productId: string;
    branchId: string;
    date: string;
    slotStart: string;
    slotEnd: string;
    capacity: number;
  }>({
    open: false,
    productId: "",
    branchId: "",
    date: "",
    slotStart: "",
    slotEnd: "",
    capacity: 0,
  });

  // Reset page when filters change
  useEffect(() => {
    setPage(0);
  }, [selectedProductId, selectedBranchId]);

  // --- Data hooks ---
  const { data: kpis, isLoading: isLoadingKPIs } = useReservationKPIs();
  const { data: productsData } = useProducts({ type: "service", page: 1, page_size: 100 });
  const cancelMutation = useCancelReservation();

  // Auto-resolve branchId from the selected service's schedule
  const { data: serviceSchedules } = useSchedulesByProduct(selectedProductId ?? "");
  useEffect(() => {
    if (serviceSchedules && serviceSchedules.length > 0) {
      setSelectedBranchId(serviceSchedules[0].branch_id);
    } else if (!selectedProductId) {
      setSelectedBranchId(null);
    }
  }, [serviceSchedules, selectedProductId]);

  // Only show services that have a schedule (is_schedulable = true)
  const services = (
    Array.isArray(productsData)
      ? productsData
      : (productsData as { data?: { id: string; name: string; is_schedulable?: boolean }[] })?.data ?? []
  ).filter((s) => (s as { is_schedulable?: boolean }).is_schedulable);

  // --- Month view date range data ---
  const monthStart = format(startOfMonth(selectedDate), "yyyy-MM-dd");
  const monthEnd = format(endOfMonth(selectedDate), "yyyy-MM-dd");
  const weekStart = format(
    startOfWeek(selectedDate, { weekStartsOn: 1 }),
    "yyyy-MM-dd"
  );
  const weekEnd = format(
    endOfWeek(selectedDate, { weekStartsOn: 1 }),
    "yyyy-MM-dd"
  );

  const dateRangeStart = viewMode === "month" ? monthStart : weekStart;
  const dateRangeEnd = viewMode === "month" ? monthEnd : weekEnd;

  const { data: daySummaries, isLoading: isLoadingSummaries } =
    useReservationsByDateRange(
      selectedProductId,
      selectedBranchId,
      dateRangeStart,
      dateRangeEnd
    );

  // --- List view data ---
  const listFilters = useMemo<ReservationFilters>(
    () => ({
      product_id: selectedProductId || undefined,
      branch_id: selectedBranchId || undefined,
      page: page + 1,
      page_size: PAGE_SIZE,
    }),
    [selectedProductId, selectedBranchId, page]
  );

  const {
    data: reservationData,
    isLoading: isLoadingList,
    isFetching: isFetchingList,
  } = useReservations(listFilters);

  // --- Handlers ---
  const handleDayClick = useCallback(
    (dateStr: string) => {
      setSelectedDate(new Date(dateStr + "T12:00:00"));
      setViewMode("day");
    },
    []
  );

  const handleSlotClick = useCallback(
    (
      date: string,
      productId: string,
      branchId: string,
      slotStart: string,
      slotEnd: string,
      capacity: number
    ) => {
      setSlotSheet({
        open: true,
        productId,
        branchId,
        date,
        slotStart,
        slotEnd,
        capacity,
      });
    },
    []
  );

  const handleDaySlotClick = useCallback(
    (slotStart: string, slotEnd: string, capacity: number) => {
      if (!selectedProductId || !selectedBranchId) return;
      setSlotSheet({
        open: true,
        productId: selectedProductId,
        branchId: selectedBranchId,
        date: format(selectedDate, "yyyy-MM-dd"),
        slotStart,
        slotEnd,
        capacity,
      });
    },
    [selectedProductId, selectedBranchId, selectedDate]
  );

  const handleCancelReservation = useCallback(
    async (id: string) => {
      try {
        const result = await cancelMutation.mutateAsync({ id });
        if (result.success) {
          toast.success("Reserva cancelada exitosamente");
        } else {
          toast.error("Error al cancelar la reserva");
        }
      } catch {
        toast.error("Error al cancelar la reserva");
      }
    },
    [cancelMutation]
  );

  const columns = useMemo(
    () =>
      getReservationColumns({
        onCancel: handleCancelReservation,
        canEdit: hasEdit,
      }),
    [handleCancelReservation, hasEdit]
  );

  const summaryList = Array.isArray(daySummaries) ? daySummaries : [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reservas"
        description="Visualiza y gestiona las reservas de clientes"
      />

      {/* KPI Cards */}
      {isLoadingKPIs ? (
        <KpiGrid>
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[100px] rounded-xl" />
          ))}
        </KpiGrid>
      ) : (
        <KpiGrid>
          <KpiCard
            title="Hoy"
            value={kpis?.today_count ?? 0}
            description="Reservas para hoy"
            icon={CalendarCheck}
            variant="primary"
          />
          <KpiCard
            title="Esta Semana"
            value={kpis?.week_count ?? 0}
            description="Reservas esta semana"
            icon={CalendarDays}
            variant="success"
          />
          <KpiCard
            title="Ocupacion"
            value={`${kpis?.avg_occupancy_percent ?? 0}%`}
            description="Ocupacion promedio hoy"
            icon={Activity}
            variant="warning"
          />
          <KpiCard
            title="Top Servicio"
            value={kpis?.top_service_name ?? "—"}
            description="Servicio mas reservado"
            icon={Trophy}
            variant="accent"
          />
        </KpiGrid>
      )}

      {/* Filters & View Toggle */}
      <div className="flex flex-wrap items-center gap-3">
        <Select
          value={selectedProductId ?? "all"}
          onValueChange={(v) => {
            setSelectedProductId(v === "all" ? null : v);
            // Branch is resolved server-side from the service's schedule
            setSelectedBranchId(null);
          }}
        >
          <SelectTrigger className="w-[260px]">
            <SelectValue placeholder="Todos los servicios" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los servicios</SelectItem>
            {services.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="ml-auto">
          <ViewToggle value={viewMode} onChange={setViewMode} />
        </div>
      </div>

      {/* Calendar / List Views */}
      <AnimatePresence mode="wait">
        {viewMode === "month" && (
          <motion.div
            key="month"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
          >
            <CalendarMonthView
              currentDate={selectedDate}
              onDateChange={setSelectedDate}
              onDayClick={handleDayClick}
              daySummaries={summaryList as import("@/types/reservation").DayScheduleSummary[]}
              isLoading={isLoadingSummaries}
            />
          </motion.div>
        )}

        {viewMode === "week" && (
          <motion.div
            key="week"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
          >
            <CalendarWeekView
              currentDate={selectedDate}
              onDateChange={setSelectedDate}
              onSlotClick={handleSlotClick}
              productId={selectedProductId}
              branchId={selectedBranchId}
            />
          </motion.div>
        )}

        {viewMode === "day" && (
          <motion.div
            key="day"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
          >
            <CalendarDayView
              date={format(selectedDate, "yyyy-MM-dd")}
              onDateChange={(d) => setSelectedDate(new Date(d + "T12:00:00"))}
              productId={selectedProductId}
              branchId={selectedBranchId}
              onSlotClick={handleDaySlotClick}
            />
          </motion.div>
        )}

        {viewMode === "list" && (
          <motion.div
            key="list"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
          >
            <DataTable
              columns={columns}
              data={(reservationData?.data ?? []) as import("@/types/reservation").Reservation[]}
              manualPagination
              pageCount={reservationData?.totalPages ?? 0}
              pageIndex={page}
              onPageChange={setPage}
              totalRows={reservationData?.total ?? 0}
              isFetching={isFetchingList}
              isLoading={isLoadingList}
              pageSize={PAGE_SIZE}
              emptyMessage="No hay reservas registradas"
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Slot Detail Sheet */}
      <SlotDetailSheet
        open={slotSheet.open}
        onOpenChange={(open) => setSlotSheet((prev) => ({ ...prev, open }))}
        productId={slotSheet.productId}
        branchId={slotSheet.branchId}
        date={slotSheet.date}
        slotStart={slotSheet.slotStart}
        slotEnd={slotSheet.slotEnd}
        capacity={slotSheet.capacity}
      />
    </div>
  );
}
