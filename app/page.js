// app/page.js
import { redirect } from "next/navigation";

const DEFAULT_LOCALE = "en"; // change to "hi" or "ta" if you prefer

export default function RootRedirect() {
  redirect(`/${DEFAULT_LOCALE}/login`);
}
