import { Link, createFileRoute } from "@tanstack/react-router";
import { PageLayout } from "~/components/PageLayout";

export const Route = createFileRoute("/$")({
  component: NotFound,
});

function NotFound() {
  return (
    <PageLayout>
      <div className="flex-1 flex flex-col justify-center">
        <p className="text-xs text-grey mb-4">
          <span className="text-gold mr-2">›</span>status: [ 404 ]
        </p>
        <h1 className="text-5xl sm:text-7xl font-bold leading-none tracking-tighter mb-6">
          SIGNAL_LOST
        </h1>
        <p className="text-sm text-grey mb-10 border-l border-white/10 pl-4 max-w-sm">
          transmission not found — this frequency doesn't exist
        </p>
        <Link
          to="/"
          className="inline-flex items-center gap-4 self-start border border-white/20 px-5 py-3 text-sm text-white/60 hover:border-gold hover:text-gold transition-colors"
        >
          <span className="text-gold">›</span>
          return_to_base
        </Link>
      </div>
    </PageLayout>
  );
}
