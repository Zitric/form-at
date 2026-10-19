import { Button } from "@form-at/ui";
import { useStore } from "~/store";
import type { ShareTarget } from "~/utils/shareTarget";

// [ share ] for a page that isn't a set (a DJ, an event): in the installed
// app there's no address bar to copy the link from. `target` is a function so
// the URL is built on the tap, on the client, from the page's own origin.
// Sets use ShareSetButton, which also records the share_click.
export function ShareButton({ target }: { target: () => ShareTarget }) {
  const openShareModal = useStore((s) => s.openShareModal);

  return (
    <Button variant="secondary" onClick={() => openShareModal(target())}>
      share
    </Button>
  );
}
