import { auth } from "../auth";
import { redirect } from "next/navigation";

export type SessionUser = {
  userId: string;
  displayName: string;
  email: string;
  fullName: string | null;
};

export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await auth();
  const user = session?.user;
  if (!user?.id || !user.email) return null;
  return {
    userId: user.id,
    displayName: user.name || user.email,
    email: user.email,
    fullName: user.name || null,
  };
}

export async function requireSessionUser(returnTo: string): Promise<SessionUser> {
  const user = await getSessionUser();
  if (user) return user;
  redirect(sessionSignInPath(returnTo));
}

export function sessionSignInPath(returnTo: string): string {
  return `/api/auth/signin?callbackUrl=${encodeURIComponent(safeRelativeReturnPath(returnTo))}`;
}

export function sessionSignOutPath(returnTo = "/"): string {
  return `/api/auth/signout?callbackUrl=${encodeURIComponent(safeRelativeReturnPath(returnTo))}`;
}

function safeRelativeReturnPath(value: string) {
  if (!value.startsWith("/") || value.startsWith("//")) return "/";
  try {
    const url = new URL(value, "https://app.local");
    return url.origin === "https://app.local" ? `${url.pathname}${url.search}${url.hash}` : "/";
  } catch {
    return "/";
  }
}
