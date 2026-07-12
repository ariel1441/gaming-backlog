import { Compass } from "lucide-react";
import { Link } from "react-router-dom";
import { AppPage } from "../components/layout";
import { Button, EmptyState } from "../components/ui";

export default function NotFoundPage() {
  return (
    <AppPage width="standard" className="py-12">
      <EmptyState
        icon={Compass}
        title="Page not found"
        description="This address may be outdated or mistyped. Return to your backlog or explore the catalog."
        action={
          <div className="flex flex-wrap justify-center gap-3">
            <Button as={Link} to="/" variant="primary">
              Back to backlog
            </Button>
            <Button as={Link} to="/discover" variant="secondary">
              Explore games
            </Button>
          </div>
        }
      />
    </AppPage>
  );
}
