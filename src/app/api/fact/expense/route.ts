import { NextResponse } from "next/server";
import { validateFactUser } from "@/lib/fact-auth";
import { createAdminClient } from "@/lib/supabase/admin";

// Helper: get user's cash_register_id
async function getUserRegister(adminClient: ReturnType<typeof createAdminClient>, tenantId: string, userId: string) {
  const { data } = await adminClient
    .from("fact_user_assignments")
    .select("cash_register_id")
    .eq("tenant_id", tenantId)
    .eq("user_id", userId)
    .eq("is_active", true)
    .single();
  return data?.cash_register_id || null;
}

// Helper: get monthly expense balance
async function getMonthlyBalance(adminClient: ReturnType<typeof createAdminClient>, cashRegisterId: string) {
  // Get capital
  const { data: register } = await adminClient
    .from("cash_registers")
    .select("petty_cash_amount")
    .eq("id", cashRegisterId)
    .single();

  const capital = Number(register?.petty_cash_amount) || 0;

  // Get total expenses this month (Peru timezone)
  const peruToday = new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });
  const monthStart = `${peruToday.slice(0, 7)}-01T05:00:00Z`;

  const { data: monthExpenses } = await adminClient
    .from("expense_fund_movements")
    .select("amount")
    .eq("cash_register_id", cashRegisterId)
    .eq("type", "expense")
    .gte("created_at", monthStart);

  const totalExpenses = (monthExpenses || []).reduce((sum, e) => sum + Number(e.amount), 0);
  return { capital, balance: capital - totalExpenses };
}

// ---------------------------------------------------------------------------
// POST — Register a new expense
// ---------------------------------------------------------------------------
export async function POST(request: Request) {
  try {
    const ctx = await validateFactUser(request);
    const body = await request.json();
    const { amount, reason, receipt_number, description } = body;

    if (!amount || typeof amount !== "number" || amount <= 0) {
      return NextResponse.json(
        { success: false, error: "Monto invalido" },
        { status: 400 },
      );
    }

    if (!reason || typeof reason !== "string" || reason.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: "Motivo requerido" },
        { status: 400 },
      );
    }

    const adminClient = createAdminClient();
    const cashRegisterId = await getUserRegister(adminClient, ctx.tenantId, ctx.userId);

    if (!cashRegisterId) {
      return NextResponse.json(
        { success: false, error: "Usuario sin caja asignada" },
        { status: 400 },
      );
    }

    // Validate balance
    const { balance } = await getMonthlyBalance(adminClient, cashRegisterId);
    if (amount > balance) {
      return NextResponse.json(
        { success: false, error: `Saldo insuficiente (disponible: S/ ${Math.max(0, balance).toFixed(2)})` },
        { status: 400 },
      );
    }

    // Insert with authorized_by = creating user
    const { data: inserted, error: insertError } = await adminClient
      .from("expense_fund_movements")
      .insert({
        tenant_id: ctx.tenantId,
        cash_register_id: cashRegisterId,
        type: "expense",
        amount,
        reason: reason.trim(),
        receipt_number: receipt_number || null,
        description: description || null,
        created_by: ctx.userId,
        authorized_by: ctx.userId,
        authorized_name: ctx.userName,
      })
      .select("id")
      .single();

    if (insertError) {
      return NextResponse.json(
        { success: false, error: insertError.message },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true, id: inserted.id });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error interno";
    return NextResponse.json(
      { success: false, error: message },
      { status: 401 },
    );
  }
}

// ---------------------------------------------------------------------------
// GET — List today's expenses + balance for the user's cash register
// ---------------------------------------------------------------------------
export async function GET(request: Request) {
  try {
    const ctx = await validateFactUser(request);
    const adminClient = createAdminClient();
    const cashRegisterId = await getUserRegister(adminClient, ctx.tenantId, ctx.userId);

    if (!cashRegisterId) {
      return NextResponse.json(
        { success: false, error: "Usuario sin caja asignada" },
        { status: 400 },
      );
    }

    // Today at 00:00 Peru time (UTC-5) = today at 05:00 UTC
    const peruToday = new Date().toLocaleDateString("en-CA", {
      timeZone: "America/Lima",
    });
    const todayStartUtc = `${peruToday}T05:00:00Z`;

    const [{ data: expenses, error }, balanceInfo] = await Promise.all([
      adminClient
        .from("expense_fund_movements")
        .select("id, amount, reason, receipt_number, description, authorized_name, created_at")
        .eq("cash_register_id", cashRegisterId)
        .eq("type", "expense")
        .gte("created_at", todayStartUtc)
        .order("created_at", { ascending: false }),
      getMonthlyBalance(adminClient, cashRegisterId),
    ]);

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      data: expenses || [],
      balance: balanceInfo.balance,
      capital: balanceInfo.capital,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error interno";
    return NextResponse.json(
      { success: false, error: message },
      { status: 401 },
    );
  }
}
