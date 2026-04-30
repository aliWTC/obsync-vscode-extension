from datetime import datetime


def summarize_health(passed: int, failed: int) -> str:
    return f"passed={passed},failed={failed},checked_at={datetime.utcnow().isoformat()}Z"


if __name__ == "__main__":
    print(summarize_health(4, 0))
