"use client";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    const form = new FormData(event.currentTarget);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: form.get("email"), password: form.get("password") }),
      });
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        if (body?.error === "CSRF_REJECTED") {
          setError(
            "Alamat aplikasi tidak sesuai konfigurasi server. Jalankan ulang run.sh dengan URL yang sedang dibuka.",
          );
        } else if (body?.error === "RATE_LIMITED") {
          setError("Terlalu banyak percobaan login. Tunggu beberapa menit, lalu coba kembali.");
        } else if (response.status === 401) {
          setError("Email atau password tidak valid.");
        } else {
          setError("Server gagal memproses login. Periksa log aplikasi dan coba kembali.");
        }
        return;
      }
      router.push("/");
      router.refresh();
    } catch {
      setError("Tidak dapat terhubung ke server. Periksa koneksi dan status aplikasi.");
    } finally {
      setLoading(false);
    }
  }
  return (
    <main className="login-page">
      <form className="login-card" onSubmit={submit}>
        <div className="brand login-brand">
          <span className="brand-mark">X</span>
          <div>
            <strong>XASSET</strong>
            <small>COMMAND CENTER</small>
          </div>
        </div>
        <div>
          <p className="eyebrow">SECURE ACCESS</p>
          <h1>Masuk ke pusat kendali aset</h1>
          <p className="login-copy">Gunakan akun perusahaan yang telah diberikan administrator.</p>
        </div>
        <label>
          Email
          <input name="email" type="email" autoComplete="username" required placeholder="nama@perusahaan.co.id" />
        </label>
        <label>
          Password
          <input name="password" type="password" autoComplete="current-password" required minLength={8} />
        </label>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button className="primary login-button" disabled={loading}>
          {loading ? "Memverifikasi..." : "Masuk"}
        </button>
        <small className="security-note">Akses dan perubahan data dicatat dalam audit log.</small>
      </form>
    </main>
  );
}
