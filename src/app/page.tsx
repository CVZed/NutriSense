import { redirect } from "next/navigation";

// Root "/" redirects to the chat tab (primary entry point)
export default function RootPage() {
  redirect("/chat");
}
