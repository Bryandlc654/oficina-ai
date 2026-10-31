"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

export function LoginForm({ nextPath }: { nextPath: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { error?: { message?: string } }
        | null;

      if (!response.ok) {
        setError(payload?.error?.message ?? "No se pudo iniciar sesión");
        return;
      }

      router.replace(nextPath);
      router.refresh();
    } catch {
      setError("No hay conexión con el servidor");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-8 space-y-4">
      <div>
        <label htmlFor="email" className="label">
          Email
        </label>
        <input
          id="email"
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="input"
          placeholder="director@empresa.com"
        />
      </div>

      <div>
        <label htmlFor="password" className="label">
          Contraseña
        </label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          required
          minLength={8}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="input"
          placeholder="••••••••"
        />
      </div>

      {error ? (
        <p className="rounded-lg border border-rose-500/25 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
          {error}
        </p>
      ) : null}

      <button type="submit" disabled={loading} className="btn-primary w-full">
        {loading ? "Verificando…" : "Acceder a la oficina"}
      </button>

      <p className="pt-2 text-center text-xs text-zinc-600">
        El acceso está limitado al administrador de la oficina.
      </p>
    </form>
  );
}
