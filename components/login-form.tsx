"use client";

import { useActionState } from "react";
import { signInAction } from "@/components/auth-actions";

const initialState = "";

export function LoginForm() {
  const [error, formAction, isPending] = useActionState(signInAction, initialState);

  return (
    <form action={formAction} className="login-form">
      <input autoComplete="username" name="username" placeholder="Username" required />
      <input
        autoComplete="current-password"
        name="password"
        placeholder="Password"
        required
        type="password"
      />
      {error ? <p className="error-text">{error}</p> : null}
      <button className="primary-button wide" disabled={isPending} type="submit">
        {isPending ? "Signing in..." : "Sign in"}
      </button>
    </form>
  );
}
