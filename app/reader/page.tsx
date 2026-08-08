import { redirect } from "next/navigation";

export default function ReaderRedirectPage() {
  redirect("/books/the-sovereign/read");
}
