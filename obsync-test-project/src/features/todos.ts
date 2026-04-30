export interface ITodo {
  id: string;
  title: string;
  done: boolean;
  priority: "low" | "medium" | "high";
}

export function getAllTodos(): ITodo[] {
  return [
    { id: "T-1", title: "Set vault path", done: true, priority: "medium" },
    { id: "T-2", title: "Run first sync", done: false, priority: "high" },
    { id: "T-3", title: "Validate index note", done: false, priority: "medium" },
    { id: "T-4", title: "Enable function sync", done: false, priority: "high" },
    { id: "T-5", title: "Capture mixed-language notes", done: false, priority: "low" },
  ];
}

export function getOpenTodos(): ITodo[] {
  const todos = getAllTodos();
  return todos.filter((todo) => !todo.done);
}

export function summarizeTodos(todos: ITodo[]): string {
  if (todos.length === 0) {
    return "all-clear";
  }
  return todos.map((todo) => `${todo.id}:${todo.priority}`).join(", ");
}

export function groupTodosByPriority(
  todos: ITodo[],
): Record<ITodo["priority"], number> {
  return todos.reduce(
    (acc, todo) => {
      acc[todo.priority] += 1;
      return acc;
    },
    { low: 0, medium: 0, high: 0 } as Record<ITodo["priority"], number>,
  );
}
