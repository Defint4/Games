import type { Metadata } from "next";
import AdminApp from "@/admin/AdminApp";

export const metadata: Metadata = {
  title: "Le bureau",
  robots: { index: false, follow: false },
};

/* Le panneau d'administration : visible du seul compte admin, vérifié par le serveur. */
export default function Page() {
  return <AdminApp />;
}
