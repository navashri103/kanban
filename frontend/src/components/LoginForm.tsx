"use client";

import { useState, type FormEvent } from "react";
import { login, signup } from "@/lib/auth";
import { KanbanIcon } from "@/components/icons";

type LoginFormProps = {
  mode: "signin" | "signup";
  onSuccess: () => void;
  onToggleMode: () => void;
};

export const LoginForm = ({ mode, onSuccess, onToggleMode }: LoginFormProps) => {
  const isSignup = mode === "signup";
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    const success = isSignup
      ? await signup(username, password)
      : await login(username, password);
    setIsSubmitting(false);
    if (success) {
      onSuccess();
    } else {
      setError(
        isSignup
          ? "That username is already taken."
          : "Invalid username or password."
      );
    }
  };

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-6">
      <div className="pointer-events-none absolute left-0 top-0 h-[460px] w-[460px] -translate-x-1/3 -translate-y-1/3 rounded-full bg-[radial-gradient(circle,_rgba(32,157,215,0.28)_0%,_rgba(32,157,215,0.05)_55%,_transparent_70%)]" />
      <div className="pointer-events-none absolute bottom-0 right-0 h-[520px] w-[520px] translate-x-1/4 translate-y-1/4 rounded-full bg-[radial-gradient(circle,_rgba(117,57,145,0.2)_0%,_rgba(117,57,145,0.05)_55%,_transparent_75%)]" />

      <form
        onSubmit={handleSubmit}
        className="relative w-full max-w-sm rounded-[28px] border border-[var(--stroke)] bg-white/80 p-8 shadow-[var(--shadow)] backdrop-blur-xl"
      >
        <span
          className="flex h-12 w-12 items-center justify-center rounded-2xl text-white shadow-[var(--shadow-soft)]"
          style={{ background: "var(--brand-gradient)" }}
        >
          <KanbanIcon className="h-6 w-6" />
        </span>
        <h1 className="mt-5 font-display text-2xl font-semibold text-[var(--navy-dark)]">
          {isSignup ? "Create your account" : "Welcome back"}
        </h1>
        <p className="mt-1.5 text-sm text-[var(--gray-text)]">
          {isSignup
            ? "Set up your board in a few seconds."
            : "Sign in to pick up where you left off."}
        </p>

        <div className="mt-6 space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--gray-text)]">
              Username
            </span>
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="yourname"
              aria-label="Username"
              autoComplete="username"
              className="w-full rounded-xl border border-[var(--stroke)] bg-white px-3.5 py-2.5 text-sm text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)] focus:ring-2 focus:ring-[var(--primary-blue)]/20"
              required
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--gray-text)]">
              Password
            </span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder={isSignup ? "At least 8 characters" : "Your password"}
              aria-label="Password"
              autoComplete={isSignup ? "new-password" : "current-password"}
              minLength={isSignup ? 8 : undefined}
              className="w-full rounded-xl border border-[var(--stroke)] bg-white px-3.5 py-2.5 text-sm text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)] focus:ring-2 focus:ring-[var(--primary-blue)]/20"
              required
            />
          </label>
        </div>

        {error ? (
          <p role="alert" className="mt-4 text-sm text-red-600">
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={isSubmitting}
          className="mt-6 w-full rounded-full px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-white shadow-[var(--shadow-soft)] transition hover:brightness-110 disabled:opacity-60"
          style={{ background: "var(--brand-gradient)" }}
        >
          {isSubmitting
            ? isSignup
              ? "Signing up..."
              : "Signing in..."
            : isSignup
              ? "Sign up"
              : "Sign in"}
        </button>
        <button
          type="button"
          onClick={onToggleMode}
          className="mt-4 w-full text-center text-xs font-semibold text-[var(--primary-blue)] hover:underline"
        >
          {isSignup
            ? "Already have an account? Sign in"
            : "Need an account? Sign up"}
        </button>
      </form>
    </main>
  );
};
