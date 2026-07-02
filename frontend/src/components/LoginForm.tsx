"use client";

import { useState, type FormEvent } from "react";
import { login, signup } from "@/lib/auth";

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
    <main className="flex min-h-screen items-center justify-center px-6">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-[32px] border border-[var(--stroke)] bg-white/80 p-8 shadow-[var(--shadow)] backdrop-blur"
      >
        <p className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--gray-text)]">
          Kanban Studio
        </p>
        <h1 className="mt-3 font-display text-2xl font-semibold text-[var(--navy-dark)]">
          {isSignup ? "Create an account" : "Sign in"}
        </h1>
        <div className="mt-6 space-y-3">
          <input
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder="Username"
            aria-label="Username"
            className="w-full rounded-xl border border-[var(--stroke)] bg-white px-3 py-2 text-sm text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]"
            required
          />
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder={isSignup ? "Password (min 8 characters)" : "Password"}
            aria-label="Password"
            minLength={isSignup ? 8 : undefined}
            className="w-full rounded-xl border border-[var(--stroke)] bg-white px-3 py-2 text-sm text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]"
            required
          />
        </div>
        {error ? (
          <p role="alert" className="mt-3 text-sm text-red-600">
            {error}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={isSubmitting}
          className="mt-6 w-full rounded-full bg-[var(--secondary-purple)] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:brightness-110 disabled:opacity-60"
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
