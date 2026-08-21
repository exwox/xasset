import { redirect } from "next/navigation";
import { getSession } from "@/server/auth";
import { LoginForm } from "./login-form";

export default async function LoginPage() { if (await getSession()) redirect("/"); return <LoginForm />; }
