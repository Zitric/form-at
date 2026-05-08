import Typewriter from "typewriter-effect";
import { Body } from "~/components/Text";

type ConsoleWriterProps = {
  children: string;
  isFirstLoading?: boolean;
  speed?: number;
};

export const ConsoleWriter = ({
  children,
  isFirstLoading = true,
  speed = 18,
}: ConsoleWriterProps) => {
  return (
    <div className="flex   pl-4 py-2 my-4 bg-black/5 hover:bg-black/10 transition-colors group">
      {/* El prompt de la consola */}
      <span className="hidden sm:flex lg:flex text-gold mr-2">root@format:</span>

      <Body>
        <Typewriter
          options={{
            delay: speed,
            cursor: "▒",
            autoStart: isFirstLoading,
            loop: false,
          }}
          onInit={(typewriter) => {
            typewriter.typeString(children).start();
          }}
        />
      </Body>
    </div>
  );
};
