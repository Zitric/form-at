import { useState } from "react";
import { Modal } from "~/components/Modal";
import type { Event } from "~/data/events";
import { buildGoogleCalendarUrl, buildIcs, buildOutlookCalendarUrl } from "~/utils/ics";

const rowClass =
  "text-left text-sm text-grey hover:text-white transition-colors tracking-widest cursor-pointer py-1";

export function AddToCalendarButton({ event }: { event: Event }) {
  const [open, setOpen] = useState(false);

  const openExternal = (href: string) => {
    window.open(href, "_blank", "noopener,noreferrer");
    setOpen(false);
  };

  // The .ics route is best for Apple Calendar — on iOS Safari it triggers the
  // native "Add to Calendar" sheet directly; on desktop it downloads the file
  // and the user opens it with their default calendar app.
  const downloadIcs = () => {
    const ics = buildIcs(event);
    const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${event.id}.ics`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setOpen(false);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center justify-center w-full sm:w-auto sm:min-w-[280px] border border-gold/60 hover:border-gold px-6 py-3 text-sm text-grey hover:text-white transition-colors cursor-pointer tracking-widest"
      >
        [ add_to_calendar ]
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        ariaLabel="Add to calendar"
        title={
          <div className="text-xs text-grey tracking-widest truncate">
            › add <span className="text-white">{event.title}</span> to calendar
          </div>
        }
      >
        <div className="flex flex-col">
          <button
            type="button"
            onClick={() => openExternal(buildGoogleCalendarUrl(event))}
            className={rowClass}
          >
            [ google ]
          </button>
          <button
            type="button"
            onClick={() => openExternal(buildOutlookCalendarUrl(event))}
            className={rowClass}
          >
            [ outlook ]
          </button>
          <button type="button" onClick={downloadIcs} className={rowClass}>
            [ apple / .ics ]
          </button>
        </div>
      </Modal>
    </>
  );
}
