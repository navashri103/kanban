export const fetchSession = async (): Promise<boolean> => {
  try {
    const response = await fetch("/api/session", { credentials: "include" });
    if (!response.ok) {
      return false;
    }
    const data = await response.json();
    return Boolean(data.authenticated);
  } catch {
    return false;
  }
};

export const login = async (
  username: string,
  password: string
): Promise<boolean> => {
  const response = await fetch("/api/login", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  return response.ok;
};

export const signup = async (
  username: string,
  password: string
): Promise<boolean> => {
  const response = await fetch("/api/signup", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  return response.ok;
};

export const logout = async (): Promise<void> => {
  await fetch("/api/logout", { method: "POST", credentials: "include" });
};
