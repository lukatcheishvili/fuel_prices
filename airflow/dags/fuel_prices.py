"""Start the GitHub Action that updates the fuel prices, then wait for it to finish.

Airflow is only the clock here: the work (reading the five price pages, refreshing the history,
committing, and the Vercel redeploy that follows) is still done by
.github/workflows/update-prices.yml. This DAG presses its "Run workflow" button through the GitHub
API at the times below and fails, visibly in the Airflow UI, if that run fails.

Needs the Airflow Variable `github_token`: a fine-grained GitHub token for the fuel_prices repo
with "Actions: Read and write" (Admin → Variables in the UI). Airflow hides the value of any
variable whose name contains "token" in the UI and logs.
"""

import pendulum
import requests

from airflow.sdk import PokeReturnValue, Variable, dag, task
from airflow.sdk.exceptions import AirflowFailException

REPO = "lukatcheishvili/fuel_prices"
WORKFLOW = "update-prices.yml"
API = f"https://api.github.com/repos/{REPO}/actions"


def github_headers():
    return {
        "Accept": "application/vnd.github+json",
        "Authorization": f"Bearer {Variable.get('github_token')}",
        "X-GitHub-Api-Version": "2022-11-28",
    }


@dag(
    # 08:05, 11:05, 15:05 and 18:05. The start_date's timezone makes the cron mean Tbilisi time.
    schedule="5 8,11,15,18 * * *",
    start_date=pendulum.datetime(2026, 10, 5, tz="Asia/Tbilisi"),
    # If the PC was off at 08:05 and is turned on at 10:00, run once for the latest missed time,
    # not once for every missed time since the start_date.
    catchup=False,
    max_active_runs=1,
    default_args={"retries": 2, "retry_delay": pendulum.duration(minutes=5)},
    tags=["fuel"],
)
def fuel_prices():
    @task
    def trigger_workflow() -> int:
        """Start the workflow on main and return the new run's ID."""
        response = requests.post(
            f"{API}/workflows/{WORKFLOW}/dispatches",
            headers=github_headers(),
            # Without return_run_details GitHub answers "204 No Content", with no run ID to follow.
            json={"ref": "main", "return_run_details": True},
            timeout=30,
        )
        response.raise_for_status()
        run = response.json()
        print(f"Started {run['html_url']}")
        return run["workflow_run_id"]

    # A sensor is a task that waits for something. "reschedule" frees its slot between checks
    # instead of sleeping in it; the task shows as "up_for_reschedule" in the UI meanwhile.
    @task.sensor(poke_interval=30, timeout=30 * 60, mode="reschedule")
    def wait_for_run(github_run_id: int) -> PokeReturnValue:
        """Check the run every 30 seconds; succeed when it succeeded, fail when it failed."""
        response = requests.get(f"{API}/runs/{github_run_id}", headers=github_headers(), timeout=30)
        response.raise_for_status()
        run = response.json()
        print(f"{run['html_url']}: {run['status']} {run['conclusion'] or ''}")
        if run["status"] != "completed":
            return PokeReturnValue(is_done=False)
        if run["conclusion"] != "success":
            # AirflowFailException fails the task without retries: checking again won't change it.
            raise AirflowFailException(f"GitHub run ended as {run['conclusion']}: {run['html_url']}")
        return PokeReturnValue(is_done=True, xcom_value=run["html_url"])

    wait_for_run(trigger_workflow())


fuel_prices()
