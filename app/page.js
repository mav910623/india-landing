// Redirect bare "/" to the default locale (en)
import { redirect } from "next/navigation";

export default function RootRedirectPage() {
  redirect("/en");
}
