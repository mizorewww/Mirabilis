export type TaskPageListItem = {
  routeToken: string;
  title: string;
};

export type TaskPageListViewProps = {
  pages: readonly TaskPageListItem[];
};

export type TaskFilterEmptyStateProps = {
  filterName: string;
};

export function TaskPageListView({ pages }: TaskPageListViewProps) {
  return (
    <ul aria-label="Task pages">
      {pages.map((page) => (
        <li key={page.routeToken}>{page.title}</li>
      ))}
    </ul>
  );
}

export function TaskFilterEmptyState({
  filterName,
}: TaskFilterEmptyStateProps) {
  return <p role="status">{`${filterName} has no pages.`}</p>;
}
