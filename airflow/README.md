# Airflow scheduler for the fuel prices

Apache Airflow 3 running in Docker on this PC. At **08:05, 11:05, 15:05 and 18:05 Tbilisi** it starts
the GitHub Action `update-prices.yml` (same as pressing "Run workflow") and waits for it to finish.
The GitHub Action still does the actual work; Airflow is the clock. GitHub's own schedule in the
workflow stays on as a backup for when this PC is off.

## Files

```
docker-compose.yaml   the containers (Postgres + Airflow's api-server, scheduler, dag-processor, triggerer)
.env                  this machine's secrets and UI login (git-ignored; template: .env.example)
dags/fuel_prices.py   the DAG: trigger_workflow → wait_for_run
logs/                 task logs (git-ignored), also visible in the UI
config/airflow.cfg    generated on first start (git-ignored); settings in docker-compose.yaml win
```

## Everyday commands (run in this folder)

```
docker compose up -d          start (containers restart by themselves while Docker Desktop runs)
docker compose ps             are all parts "healthy"?
docker compose logs -f airflow-scheduler
docker compose down           stop (keeps the database: run history, variables, users)
docker compose down -v        stop AND delete the database (start over)
docker compose run --rm airflow-cli airflow dags list
```

UI: http://localhost:8080, user and password in `.env`.

## One-time setup

1. GitHub → Settings → Developer settings → Fine-grained tokens → Generate new token.
   Repository access: only `lukatcheishvili/fuel_prices`. Permissions: **Actions: Read and write**.
2. Airflow UI → Admin → Variables → add `github_token` = the token.
3. Dags → `fuel_prices` → switch it on (unpause). Use the ▶ button for a test run.
4. Docker Desktop → Settings → General → "Start Docker Desktop when you sign in to your computer",
   so Airflow comes back by itself after a restart.

## Key ideas

- **DAG**: a workflow as Python code: its tasks, their order, and its schedule.
- **DAG run**: one execution of the DAG for one scheduled time. **Task instance**: one task in one run.
- **Scheduler** creates DAG runs when they are due and starts tasks; **dag-processor** parses `dags/`
  (new or edited files show up within about a minute); **api-server** is the UI and REST API.
- **catchup=False**: after the PC was off, run once for the latest missed time, not for every one.
- **Sensor** (`wait_for_run`): a task that waits for a condition, checking every 30 s.
- **XCom**: how a task's return value (the GitHub run ID) is passed to the next task.
- **Variable**: a stored setting, read with `Variable.get(...)`; names containing "token" are masked.
