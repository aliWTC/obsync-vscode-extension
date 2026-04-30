export interface ITodoItem {
  id: string;
  title: string;
  done: boolean;
  priority: "low" | "medium" | "high";
}

export function getOpenTodos(): ITodoItem[] {
  const todos: ITodoItem[] = [
    { id: "T-101", title: "Add vault setup prompt", done: true, priority: "medium" },
    { id: "T-102", title: "Fix line stats mismatch", done: true, priority: "high" },
    { id: "T-103", title: "Add note tags", done: false, priority: "low" },
    { id: "T-104", title: "Add duplicate filename strategy", done: false, priority: "high" },
    { id: "T-105", title: "Improve sidebar ", done: false, priority: "medium" }
  ];
  return todos.filter((todo) => !todo.done);
}

export function buildTodoSummary(openTodos: ITodoItem[]): string {
  if (openTodos.length === 0) {
    return "all-clear";
  }
  return openTodos.map((todo) => `${todo.id}:${todo.priority}`).join("|");
}

export function groupTodosByPriority(
  openTodos: ITodoItem[],
): Record<ITodoItem["priority"], number> {
  return openTodos.reduce(
    (acc, todo) => {
      acc[todo.priority] += 1;
      return acc;
    },
    { low: 0, medium: 0, high: 0 } as Record<ITodoItem["priority"], number>,
  );
}
