import "server-only";

import { redirect } from "next/navigation";
import {
  AccountDisabledError,
  AuthenticationError,
  AuthorizationError,
  requireAdmin,
  requireUser,
} from "@/lib/auth";

export async function requirePageUser() {
  try {
    return await requireUser();
  } catch (error) {
    if (error instanceof AccountDisabledError) {
      redirect("/account-disabled");
    }

    if (error instanceof AuthenticationError) {
      redirect("/login");
    }

    throw error;
  }
}

export async function requirePageAdmin() {
  try {
    return await requireAdmin();
  } catch (error) {
    if (error instanceof AccountDisabledError) {
      redirect("/account-disabled");
    }

    if (error instanceof AuthenticationError) {
      redirect("/login");
    }

    if (error instanceof AuthorizationError) {
      redirect("/dashboard");
    }

    throw error;
  }
}
