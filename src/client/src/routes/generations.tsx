import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/generations')({
  component: RouteComponent
});

function RouteComponent() {
  return <div>Hello generations</div>;
}
