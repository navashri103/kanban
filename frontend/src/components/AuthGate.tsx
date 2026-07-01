"use client";

import { useEffect, useState } from "react";
import { fetchSession } from "@/lib/auth";
import { LoginForm } from "@/components/LoginForm";
import { KanbanBoard } from "@/components/KanbanBoard";

type AuthState = "loading" | "authenticated" | "unauthenticated";
type Mode = "signin" | "signup";

export const AuthGate = () => {
  const [authState, setAuthState] = useState<AuthState>("loading");
  const [mode, setMode] = useState<Mode>("signin");

  useEffect(() => {
    fetchSession().then((authenticated) =>
      setAuthState(authenticated ? "authenticated" : "unauthenticated")
    );
  }, []);

  if (authState === "loading") {
    return null;
  }

  if (authState === "unauthenticated") {
    return (
      <LoginForm
        mode={mode}
        onSuccess={() => setAuthState("authenticated")}
        onToggleMode={() =>
          setMode((current) => (current === "signin" ? "signup" : "signin"))
        }
      />
    );
  }

  return (
    <KanbanBoard
      onLogout={() => {
        setMode("signin");
        setAuthState("unauthenticated");
      }}
    />
  );
};
