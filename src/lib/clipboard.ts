import { toast } from "../components/Toast";

/** Copies a link, falling back to a hidden textarea when the Clipboard API is missing or refused. */
export async function copyLink(url: string): Promise<void> {
  try {
    if (!navigator.clipboard?.writeText) throw new Error("Clipboard API unavailable");
    await navigator.clipboard.writeText(url);
    toast("Link copied", "ok");
    return;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = url;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch {
      ok = false;
    }
    ta.remove();
    if (ok) toast("Link copied", "ok");
    else toast(`Couldn't copy. The link is ${url}`, "danger", 9000);
  }
}
