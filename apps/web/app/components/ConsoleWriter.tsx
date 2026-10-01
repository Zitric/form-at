import { Body } from "@form-at/ui";
import Typewriter from "typewriter-effect";

type ConsoleWriterProps = {
  children: string;
  /** Type the text out character-by-character. When false, render statically. */
  isFirstLoading?: boolean;
  speed?: number;
  /** Shrink the text and its margins on short phone screens (t-body-fit and
   *  the --fit-* margins in global.css, below 640px wide), so what follows
   *  still fits above the bottom chrome. The home manifesto; detail pages scroll and don't
   *  need it. */
  fitToHeight?: boolean;
};

export const ConsoleWriter = ({
  children,
  isFirstLoading = true,
  speed = 18,
  fitToHeight = false,
}: ConsoleWriterProps) => {
  // Swapped whole rather than overridden: cn's twMerge doesn't know t-body
  // and t-body-fit conflict, so passing both would leave stylesheet order to
  // decide.
  const textClass = fitToHeight ? "t-body-fit sm:t-body-md" : "t-body sm:t-body-md";
  const marginClass = fitToHeight ? "my-(--fit-gap-sm) sm:my-4" : "my-4";
  return (
    <div
      className={`flex pl-4 py-2 ${marginClass} bg-black/5 hover:bg-black/10 transition-colors group`}
    >
      <span className="hidden sm:flex lg:flex text-gold mr-2 t-body sm:t-body-md">
        root@format:
      </span>

      {isFirstLoading ? (
        // Reserve the final text box up-front with an invisible spacer rendering
        // the full text. The typewriter overlays into the same space, so the
        // page doesn't reflow line-by-line as characters are typed (CLS = 0).
        <div className={`relative flex-1 ${textClass}`}>
          <span className="invisible" aria-hidden="true">
            {children}
          </span>
          <div className="absolute inset-0">
            <Typewriter
              options={{
                delay: speed,
                cursor: "▒",
                autoStart: true,
                loop: false,
              }}
              onInit={(typewriter) => {
                typewriter.typeString(children).start();
              }}
            />
          </div>
        </div>
      ) : // Same element Body renders (a <p>), with the fit class in its place.
      fitToHeight ? (
        <p className={textClass}>{children}</p>
      ) : (
        <Body>{children}</Body>
      )}
    </div>
  );
};
