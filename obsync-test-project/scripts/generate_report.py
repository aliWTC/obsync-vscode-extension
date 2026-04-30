from datetime import datetime


def build_report(project_name: str, tracked_files: int) -> str:
    timestamp = datetime.utcnow().isoformat() + "Z"
    return f"{project_name}: tracked_files={tracked_files}, generated_at={timestamp}"


if __name__ == "__main__":
    print(build_report("obsync-test-project", 7))
