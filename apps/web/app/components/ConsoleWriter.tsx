import Typewriter from "typewriter-effect";
import { Body } from "~/components/Text";

type ConsoleWriterProps = {
  children: string;
  /** Type the text out character-by-character. When false, render statically. */
  isFirstLoading?: boolean;
  speed?: number;
};

export const ConsoleWriter = ({
  children,
  isFirstLoading = true,
  speed = 18,
}: ConsoleWriterProps) => {
  return (
    <div className="flex pl-4 py-2 my-4 bg-black/5 hover:bg-black/10 transition-colors group">
      <span className="hidden sm:flex lg:flex text-gold mr-2 t-body sm:t-body-md">
        root@format:
      </span>

      {isFirstLoading ? (
        // Reserve the final text box up-front with an invisible spacer rendering
        // the full text. The typewriter overlays into the same space, so the
        // page doesn't reflow line-by-line as characters are typed (CLS = 0).
        <div className="relative flex-1 t-body sm:t-body-md">
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
      ) : (
        <Body>{children}</Body>
      )}
    </div>
  );
};
