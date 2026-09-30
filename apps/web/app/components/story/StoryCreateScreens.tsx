import { BracketLabel, Button } from "@form-at/ui";
import { useEffect, useMemo, useRef } from "react";

import { recordingFailureMessage } from "~/utils/storyVideo/createFlow";
import { EXCERPT_SECONDS } from "~/utils/storyVideo/layout";
import { StoryRecordingError, recordStory } from "~/utils/storyVideo/recorder";
import { type StoryFrameInput, prepareStoryFrame } from "~/utils/storyVideo/renderer";

// The screens after the picker: recording, share, download fallback, failure.
// Imported only by StoryVideoFlow, so they ship in its lazy chunk with the
// renderer and recorder.

// Every status is two lines: what's happening, larger and white; then what
// to do about it, small and grey.
const statusClass = "text-sm text-white tracking-widest tabular-nums";
const noteClass = "text-xs text-grey/60 tracking-widest leading-relaxed";

type RecordingProps = {
  context: AudioContext;
  input: StoryFrameInput & { excerpt: { audio: AudioBuffer } };
  fileName: string;
  progress: number;
  onProgress: (progress: number) => void;
  onRecorded: (file: File, canShare: boolean) => void;
  onFailed: (message: string) => void;
  onCancel: () => void;
};

/**
 * Records on mount and aborts on unmount, so [ cancel ], closing the picker
 * and leaving this screen for any reason all stop the recording the same way.
 * The canvas being drawn is the one on screen: the visitor watches the video
 * build.
 */
export function RecordingScreen(props: RecordingProps) {
  const { progress, onCancel } = props;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Callbacks change identity every render; the recording must not restart.
  const latest = useRef(props);
  latest.current = props;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { context, input, fileName } = latest.current;
    const abort = new AbortController();
    (async () => {
      try {
        const { file } = await recordStory({
          context,
          canvas,
          frame: prepareStoryFrame(input),
          excerpt: input.excerpt,
          fileName,
          // The visitor hears the excerpt being recorded.
          monitor: true,
          signal: abort.signal,
          onProgress: (p) => latest.current.onProgress(p),
        });
        // Asked of the real file: a check against a dummy file isn't reliable.
        const canShare =
          typeof navigator.canShare === "function" && navigator.canShare({ files: [file] });
        latest.current.onRecorded(file, canShare);
      } catch (e) {
        if (abort.signal.aborted) return; // cancelled or closed: nothing to report
        latest.current.onFailed(
          recordingFailureMessage(e instanceof StoryRecordingError ? e.failure : "error"),
        );
      }
    })();
    return () => abort.abort();
  }, []);

  const seconds = Math.min(EXCERPT_SECONDS, Math.floor(progress * EXCERPT_SECONDS));
  return (
    <div className="flex flex-col items-center gap-4">
      <canvas
        ref={canvasRef}
        aria-label="The story video, being recorded"
        className="block h-[52vh] w-auto max-w-full border border-grey/20"
      />
      <div className="w-full">
        <div className="h-0.5 w-full bg-grey/20">
          <div className="h-full bg-gold" style={{ width: `${progress * 100}%` }} />
        </div>
        <p className={`${statusClass} mt-3 text-center`}>
          recording… {seconds}s / {EXCERPT_SECONDS}s
        </p>
        <p className={`${noteClass} mt-1 text-center`}>keep the screen on</p>
      </div>
      <Button variant="secondary" onClick={onCancel}>
        cancel
      </Button>
    </div>
  );
}

/** An object URL for `file`, revoked when the file changes or the screen goes. */
function useObjectUrl(file: File): string {
  const url = useMemo(() => URL.createObjectURL(file), [file]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  return url;
}

type FileScreenProps = {
  file: File;
  windowLabel: string;
  linkCopied: boolean;
  onCopyLink: () => void;
  onBack: () => void;
};

function LinkNote({ linkCopied, onCopyLink }: Pick<FileScreenProps, "linkCopied" | "onCopyLink">) {
  if (linkCopied) {
    return (
      <p className={`${noteClass} mt-1`}>
        the set link is on your clipboard — add it as a link sticker.
      </p>
    );
  }
  // The link is copied in the create tap, but the browser can still refuse
  // the write (no clipboard permission, page not focused); this is a fresh tap
  // to try again.
  return (
    <Button variant="secondary" className="self-start" onClick={onCopyLink}>
      copy_link
    </Button>
  );
}

export function ShareScreen({
  file,
  windowLabel,
  linkCopied,
  onCopyLink,
  onBack,
  onShare,
  sharing,
}: FileScreenProps & { onShare: () => void; sharing: boolean }) {
  const url = useObjectUrl(file);
  return (
    <div className="flex flex-col gap-4">
      <video
        src={url}
        autoPlay
        muted
        loop
        playsInline
        aria-label="Your story video"
        className="block mx-auto h-[45vh] w-auto max-w-full border border-grey/20"
      />
      <div>
        <p className={statusClass}>
          your story is ready — <span className="whitespace-nowrap">{windowLabel}</span>
        </p>
        <LinkNote linkCopied={linkCopied} onCopyLink={onCopyLink} />
      </div>
      <Button variant="primary" onClick={onShare} disabled={sharing}>
        share
      </Button>
      <Button variant="secondary" className="self-start" onClick={onBack}>
        pick_again
      </Button>
    </div>
  );
}

export function FallbackScreen({
  file,
  windowLabel,
  linkCopied,
  onCopyLink,
  onBack,
}: FileScreenProps) {
  const url = useObjectUrl(file);
  return (
    <div className="flex flex-col gap-4">
      <video
        src={url}
        autoPlay
        muted
        loop
        playsInline
        aria-label="Your story video"
        className="block mx-auto h-[40vh] w-auto max-w-full border border-grey/20"
      />
      <div>
        <p className={statusClass}>
          your story is ready — <span className="whitespace-nowrap">{windowLabel}</span>
        </p>
        <p className={`${noteClass} mt-1`}>
          this browser can't hand it to instagram directly. save it, then in instagram:{" "}
          <span className="text-white">+ → story</span> and pick it from your gallery.
        </p>
      </div>
      <a href={url} download={file.name} className="self-start text-sm text-grey tracking-widest">
        <BracketLabel>download</BracketLabel>
      </a>
      <LinkNote linkCopied={linkCopied} onCopyLink={onCopyLink} />
      <Button variant="secondary" className="self-start" onClick={onBack}>
        pick_again
      </Button>
    </div>
  );
}

export function FailedScreen({ message, onBack }: { message: string; onBack: () => void }) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-grey leading-relaxed">{message}</p>
      <Button variant="secondary" className="self-start" onClick={onBack}>
        back
      </Button>
    </div>
  );
}
