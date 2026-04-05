"use client";

import * as React from "react";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "motion/react";
import { Mail, Lock, Loader2, ArrowRight } from "lucide-react";
import { toast } from "sonner";

import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function LoginPage() {
  return (
    <Suspense>
      <LoginContent />
    </Suspense>
  );
}

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const errorFromParams = searchParams.get("error");

  // Login page always light mode
  React.useEffect(() => {
    document.documentElement.classList.remove("dark");
    return () => {
      // Restore theme when leaving login
      try {
        const stored = JSON.parse(localStorage.getItem("poi-theme") || "{}");
        const theme = stored?.state?.theme;
        if (theme === "dark") document.documentElement.classList.add("dark");
        else if (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches) {
          document.documentElement.classList.add("dark");
        }
      } catch {}
    };
  }, []);

  // Show toast for specific error codes on mount
  React.useEffect(() => {
    if (errorFromParams) {
      toast.error(errorFromParams);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsLoading(true);

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        toast.error(error.message);
        return;
      }

      router.push("/dashboard");
      router.refresh();
    } catch {
      toast.error("Ocurrió un error inesperado. Intenta de nuevo.");
    } finally {
      setIsLoading(false);
    }
  }

  /* ── Animation variants ─────────────────────────────── */
  const easeOut = [0.25, 0.46, 0.45, 0.94] as const;

  const cardVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.4, ease: easeOut },
    },
  };

  const stagger = (i: number) => ({
    hidden: { opacity: 0, y: 12 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.35,
        delay: 0.15 + i * 0.05,
        ease: easeOut,
      },
    },
  });

  return (
    <motion.div
      variants={cardVariants}
      initial="hidden"
      animate="visible"
      className="relative w-full max-w-md px-4"
    >
      {/* Card */}
      <div className="relative rounded-2xl border border-[#DC2626]/10 bg-[#0B1120]/60 p-8 shadow-2xl shadow-black/40 backdrop-blur-xl sm:p-10">
        {/* Subtle top-edge glow line */}
        <div className="pointer-events-none absolute inset-x-0 -top-px mx-auto h-px w-3/4 bg-gradient-to-r from-transparent via-[#DC2626]/40 to-transparent" />

        {/* ── Header ────────────────────────────────── */}
        <motion.div
          variants={stagger(0)}
          initial="hidden"
          animate="visible"
          className="mb-8 text-center"
        >
          <img src="/poi-logo.png" alt="Perú On Ice" className="mx-auto h-16 w-auto mb-3" />
          <h1
            className="text-3xl font-bold tracking-[0.15em] text-white"
            style={{
              textShadow:
                "0 0 20px rgba(220,38,38,0.35), 0 0 60px rgba(220,38,38,0.12)",
            }}
          >
            Perú On Ice
          </h1>
          <p className="mt-2 text-sm tracking-widest text-slate-400">
            Sistema Administrativo
          </p>
        </motion.div>

        {/* ── Error from URL ────────────────────────── */}
        {errorFromParams && (
          <motion.div
            variants={stagger(0)}
            initial="hidden"
            animate="visible"
            className="mb-6 rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-center text-sm text-red-300"
          >
            {errorFromParams}
          </motion.div>
        )}

        {/* ── Form ──────────────────────────────────── */}
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Email */}
          <motion.div
            variants={stagger(1)}
            initial="hidden"
            animate="visible"
            className="space-y-2"
          >
            <Label
              htmlFor="email"
              className="text-sm font-medium text-slate-300"
            >
              Correo corporativo
            </Label>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <Input
                id="email"
                type="email"
                placeholder="nombre@empresa.com"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isLoading}
                className="h-11 border-white/10 bg-white/5 pl-10 text-white placeholder:text-slate-500 focus-visible:border-[#DC2626]/40 focus-visible:ring-[#DC2626]/20"
              />
            </div>
          </motion.div>

          {/* Password */}
          <motion.div
            variants={stagger(2)}
            initial="hidden"
            animate="visible"
            className="space-y-2"
          >
            <Label
              htmlFor="password"
              className="text-sm font-medium text-slate-300"
            >
              Contraseña
            </Label>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isLoading}
                className="h-11 border-white/10 bg-white/5 pl-10 text-white placeholder:text-slate-500 focus-visible:border-[#DC2626]/40 focus-visible:ring-[#DC2626]/20"
              />
            </div>

            <div className="flex justify-end">
              <a
                href="/forgot-password"
                className="text-xs text-slate-400 transition-colors hover:text-[#DC2626]"
              >
                Olvidaste tu password?
              </a>
            </div>
          </motion.div>

          {/* Submit */}
          <motion.div
            variants={stagger(3)}
            initial="hidden"
            animate="visible"
            className="pt-2"
          >
            <Button
              type="submit"
              disabled={isLoading}
              className="group h-11 w-full bg-[#DC2626] font-semibold text-white transition-all duration-200 hover:bg-[#EF4444] hover:shadow-[0_0_24px_rgba(220,38,38,0.35)] active:scale-[0.98]"
              style={{
                transform: "scale(1)",
                transition: "transform 200ms ease, box-shadow 200ms ease",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.transform =
                  "scale(1.02)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.transform =
                  "scale(1)";
              }}
            >
              {isLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <ArrowRight className="mr-2 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              )}
              {isLoading ? "Iniciando sesión..." : "Iniciar sesión"}
            </Button>
          </motion.div>
        </form>

        {/* ── Footer ────────────────────────────────── */}
        <motion.p
          variants={stagger(4)}
          initial="hidden"
          animate="visible"
          className="mt-8 text-center text-xs text-slate-500"
        >
          erp.peruonice.com
        </motion.p>
      </div>
    </motion.div>
  );
}
